'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');
const amqp    = require('amqplib');

const { logger }              = require('../shared/logger');
const { requestIdMiddleware }  = require('../shared/requestId');
const { errorMiddleware, createError } = require('../shared/errorMiddleware');

const PORT     = process.env.PORT   || 3005;
const MQ_URL   = process.env.MQ_URL || 'amqp://rabbitmq';
const EXCHANGE = 'banking_events';

let pool;
let mqChannel;
let isStarted = false;

async function connectWithRetry(connectFn, name, maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const r = await connectFn(); logger.info({ service: 'loan-service' }, `${name} connected`); return r;
    } catch (err) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      logger.warn({ attempt, delay }, `${name} not ready, retrying...`);
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// EMI calculation: EMI = P * r * (1+r)^n / ((1+r)^n - 1)
function calculateEmi(principal, tenureMonths, annualInterestRate) {
  const r = annualInterestRate / 12 / 100;
  if (r === 0) return (principal / tenureMonths);
  const emi = principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1);
  return Math.round(emi * 100) / 100;
}

async function init() {
  pool = await connectWithRetry(async () => {
    const p = mysql.createPool({
      host: process.env.DB_HOST || 'mysql', user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || 'rootpassword', database: process.env.DB_NAME || 'banking_db',
      waitForConnections: true, connectionLimit: 10, queueLimit: 0
    });
    await p.execute('SELECT 1'); return p;
  }, 'MySQL');

  await connectWithRetry(async () => {
    const conn = await amqp.connect(MQ_URL);
    mqChannel   = await conn.createChannel();
    await mqChannel.assertExchange(EXCHANGE, 'topic', { durable: true });
    return conn;
  }, 'RabbitMQ');

  isStarted = true;
}

const app = express();
app.use(cors()); app.use(express.json()); app.use(requestIdMiddleware);

app.get('/health/startup',   (req, res) => res.json({ status: isStarted ? 'UP' : 'STARTING', service: 'loan-service' }));
app.get('/health/liveness',  async (req, res, next) => {
  try { await pool.execute('SELECT 1'); res.json({ status: 'UP', service: 'loan-service' }); }
  catch { next(createError(503, 'HEALTH_CHECK_FAILED', 'DB ping failed')); }
});
app.get('/health/readiness', (req, res) => res.json({ status: isStarted ? 'READY' : 'NOT_READY', service: 'loan-service' }));
app.get('/health',           (req, res) => res.json({ status: 'UP', service: 'loan-service' }));

// ── EMI Calculator ─────────────────────────────
app.post('/loans/emi', (req, res, next) => {
  const { amount, tenureMonths, interestRate } = req.body;
  if (!amount || !tenureMonths || !interestRate) {
    return next(createError(400, 'VALIDATION_ERROR', 'amount, tenureMonths, and interestRate are required'));
  }
  const emi = calculateEmi(Number(amount), Number(tenureMonths), Number(interestRate));
  const totalPayable = Math.round(emi * tenureMonths * 100) / 100;
  const totalInterest = Math.round((totalPayable - Number(amount)) * 100) / 100;

  res.json({
    success: true,
    emi,
    totalPayable,
    totalInterest,
    tenureMonths: Number(tenureMonths),
    interestRate: Number(interestRate)
  });
});

// ── Apply for Loan ─────────────────────────────
app.post('/loans', async (req, res, next) => {
  const { userId, amount, tenureMonths = 12, interestRate = 10 } = req.body;
  const log = logger.child({ requestId: req.requestId, userId, endpoint: 'apply-loan' });
  if (!userId || !amount) return next(createError(400, 'VALIDATION_ERROR', 'userId and amount are required'));

  const emi = calculateEmi(Number(amount), Number(tenureMonths), Number(interestRate));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      'INSERT INTO loans (user_id, amount, tenure_months, interest_rate, emi_amount, status) VALUES (?,?,?,?,?,?)',
      [userId, amount, tenureMonths, interestRate, emi, 'PENDING']
    );
    const loanId = result.insertId;

    // Write Outbox event for notification
    await conn.execute(
      "INSERT INTO outbox_events (event_type, aggregate_id, payload, status) VALUES ('LoanApplicationReceived',?,?,'UNPUBLISHED')",
      [String(loanId), JSON.stringify({ loanId, userId, amount, tenureMonths, interestRate, emi })]
    );
    await conn.commit();
    log.info({ loanId }, 'Loan application created');
    res.status(201).json({ success: true, loanId, status: 'PENDING', emi });
  } catch (err) {
    await conn.rollback(); next(err);
  } finally { conn.release(); }
});

// ── Approve/Reject Loan (admin action) ─────────
app.patch('/loans/:id/status', async (req, res, next) => {
  const { status } = req.body;
  const log = logger.child({ requestId: req.requestId, loanId: req.params.id });
  if (!['APPROVED','REJECTED'].includes(status)) {
    return next(createError(400, 'VALIDATION_ERROR', "status must be 'APPROVED' or 'REJECTED'"));
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT * FROM loans WHERE id=?', [req.params.id]);
    if (rows.length === 0) { await conn.rollback(); return next(createError(404, 'LOAN_NOT_FOUND', 'Loan not found')); }
    const loan = rows[0];

    await conn.execute("UPDATE loans SET status=?, updated_at=NOW() WHERE id=?", [status, req.params.id]);

    if (status === 'APPROVED') {
      await conn.execute(
        "INSERT INTO outbox_events (event_type, aggregate_id, payload, status) VALUES ('LoanApproved',?,?,'UNPUBLISHED')",
        [String(loan.id), JSON.stringify({ loanId: loan.id, userId: loan.user_id, amount: loan.amount, emi: loan.emi_amount })]
      );
    }
    await conn.commit();
    log.info({ status }, 'Loan status updated');
    res.json({ success: true, loanId: req.params.id, status });
  } catch (err) {
    await conn.rollback(); next(err);
  } finally { conn.release(); }
});

// ── Get Loans by User ──────────────────────────
app.get('/loans/user/:userId', async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM loans WHERE user_id=? ORDER BY created_at DESC', [req.params.userId]);
    res.json({ success: true, loans: rows });
  } catch (err) { next(err); }
});

app.use(errorMiddleware);

app.listen(PORT, () => logger.info({ port: PORT }, 'loan-service listening'));

init().catch(err => { logger.fatal({ err }, 'loan-service failed'); process.exit(1); });
