'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const amqp    = require('amqplib');

const { logger }              = require('../shared/logger');
const { requestIdMiddleware }  = require('../shared/requestId');
const { errorMiddleware, createError } = require('../shared/errorMiddleware');
const { createHttpClient }     = require('../shared/httpClient');

const PORT       = process.env.PORT           || 3007;
const CONFIG_SVC = process.env.CONFIG_SVC_URL || 'http://config-service:3008';
const MQ_URL     = process.env.MQ_URL         || 'amqp://rabbitmq';
const EXCHANGE   = 'banking_events';

const DEFAULT_FRAUD_THRESHOLD = 500000; // ₹5,00,000 fallback
let fraudThreshold = DEFAULT_FRAUD_THRESHOLD;
let mqChannel;
let isStarted = false;

const configClient = createHttpClient(CONFIG_SVC);

// ──────────────────────────────────────────────
// Backoff connector
// ──────────────────────────────────────────────
async function connectWithRetry(connectFn, name, maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const r = await connectFn();
      logger.info({ service: 'fraud-detection-service' }, `${name} connected`);
      return r;
    } catch (err) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      logger.warn({ attempt, delay }, `${name} not ready, retrying...`);
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function refreshFraudThreshold() {
  try {
    const { data } = await configClient.get('/config/fraudThresholdInr');
    if (data?.value !== undefined) fraudThreshold = Number(data.value);
    logger.info({ fraudThreshold }, 'Fraud threshold refreshed');
  } catch {
    logger.warn({ fallback: fraudThreshold }, 'Config-service unreachable; using cached threshold');
  }
}

// ──────────────────────────────────────────────
// MQ Consumer — TransactionFlagged
// Rule: amount >= threshold → FraudRejected, else → FraudApproved
// ──────────────────────────────────────────────
async function startConsumer(channel) {
  await channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  const q = await channel.assertQueue('fraud_flagged_events', { durable: true });
  await channel.bindQueue(q.queue, EXCHANGE, 'TransactionFlagged');

  channel.consume(q.queue, async (msg) => {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString());
      const { transactionId, amount } = event;
      const log = logger.child({ transactionId, amount });

      // Apply fraud rule
      const isFraud = Number(amount) >= fraudThreshold;
      
      if (isFraud) {
        log.info({ threshold: fraudThreshold }, 'Fraud detected. Passing to admin for manual review.');
        // We DO NOT emit FraudRejected here. We leave the transaction in FLAGGED state 
        // so the admin can review it on the dashboard.
      } else {
        const decision = 'APPROVED';
        log.info({ decision, threshold: fraudThreshold }, 'Fraud decision made');

        const decisionEvent = JSON.stringify({ transactionId, decision, amount, processedAt: new Date().toISOString() });
        channel.publish(EXCHANGE, 'FraudApproved', Buffer.from(decisionEvent), { persistent: true });
        log.info({ routingKey: 'FraudApproved' }, 'Fraud decision event emitted');
      }

      channel.ack(msg);
    } catch (err) {
      logger.error({ err: err.message }, 'Error processing flagged transaction');
      channel.nack(msg, false, true); // requeue
    }
  });
}

async function init() {
  const mqConn = await connectWithRetry(async () => {
    const conn = await amqp.connect(MQ_URL);
    mqChannel   = await conn.createChannel();
    await mqChannel.assertExchange(EXCHANGE, 'topic', { durable: true });
    return conn;
  }, 'RabbitMQ');

  await refreshFraudThreshold();
  setInterval(refreshFraudThreshold, 60000);

  await startConsumer(mqChannel);
  isStarted = true;
}

// ──────────────────────────────────────────────
// Express App (health probes only)
// ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);

app.get('/health/startup',   (req, res) => res.json({ status: isStarted ? 'UP' : 'STARTING', service: 'fraud-detection-service' }));
app.get('/health/liveness',  (req, res) => res.json({ status: 'UP',    service: 'fraud-detection-service' }));
app.get('/health/readiness', (req, res) => res.json({ status: isStarted ? 'READY' : 'NOT_READY', service: 'fraud-detection-service' }));
app.get('/health',           (req, res) => res.json({ status: 'UP',    service: 'fraud-detection-service' }));

app.use(errorMiddleware);

app.listen(PORT, () => logger.info({ port: PORT }, 'fraud-detection-service listening'));

init().catch(err => {
  logger.fatal({ err }, 'fraud-detection-service failed to initialise');
  process.exit(1);
});
