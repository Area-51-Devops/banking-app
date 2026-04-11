'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');
const amqp    = require('amqplib');

const { logger }              = require('../shared/logger');
const { requestIdMiddleware }  = require('../shared/requestId');
const { errorMiddleware, createError } = require('../shared/errorMiddleware');

const PORT        = process.env.PORT            || 3005;
const MQ_URL      = process.env.MQ_URL          || 'amqp://rabbitmq';
const ACCOUNT_SVC = process.env.ACCOUNT_SVC_URL || 'http://account-service:3002';
const EXCHANGE = 'banking_events';

const axios = require('axios');
const accountClient = axios.create({ baseURL: ACCOUNT_SVC, timeout: 10000 });

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

  startOutboxPoller();
  isStarted = true;
}

// ── Outbox Poller ───────────────────────────────
// Publishes UNPUBLISHED outbox_events to RabbitMQ (SKIP LOCKED for safety)
function startOutboxPoller() {
  setInterval(async () => {
    if (!mqChannel) return;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [events] = await conn.execute(
        `SELECT * FROM outbox_events
           WHERE status IN ('UNPUBLISHED','FAILED') AND retry_count < 5
           ORDER BY id ASC LIMIT 10
           FOR UPDATE SKIP LOCKED`
      );
      if (events.length === 0) { await conn.rollback(); conn.release(); return; }

      const ids = events.map(e => e.id);
      await conn.execute(
        `UPDATE outbox_events SET status='PROCESSING' WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      await conn.commit();
      conn.release();

      for (const event of events) {
        const conn2 = await pool.getConnection();
        try {
          // mysql2 auto-parses JSON columns into JS objects — must re-stringify
          const payloadStr = typeof event.payload === 'string' ? event.payload : JSON.stringify(event.payload);
          mqChannel.publish(EXCHANGE, event.event_type, Buffer.from(payloadStr), { persistent: true });
          await conn2.execute(
            "UPDATE outbox_events SET status='PUBLISHED', updated_at=NOW() WHERE id=?",
            [event.id]
          );
          logger.info({ eventId: event.id, eventType: event.event_type }, 'Loan outbox event published');
        } catch (pubErr) {
          logger.error({ eventId: event.id, err: pubErr.message }, 'Failed to publish loan outbox event');
          await conn2.execute(
            "UPDATE outbox_events SET status='FAILED', retry_count=retry_count+1, updated_at=NOW() WHERE id=?",
            [event.id]
          );
        } finally { conn2.release(); }
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Loan outbox poller error');
      try { await conn.rollback(); } catch (_) {}
      conn.release();
    }
  }, 5000);
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

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'nexus_banking_secret';

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(createError(401, 'UNAUTHORIZED', 'Missing or invalid authorization header'));
    }
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    next(createError(401, 'INVALID_TOKEN', 'Token is invalid or expired'));
  }
};

const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.role === 'ADMIN') {
    next();
  } else {
    next(createError(403, 'FORBIDDEN', 'Requires admin privileges'));
  }
};

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
app.post('/loans', authMiddleware, async (req, res, next) => {
  const { userId, amount, tenureMonths = 12, interestRate = 10 } = req.body;
  // Fallback to token userId if not provided in body (safeguard)
  const actualUserId = userId || req.user.userId;
  const log = logger.child({ requestId: req.requestId, userId: actualUserId, endpoint: 'apply-loan' });
  if (!actualUserId || !amount) return next(createError(400, 'VALIDATION_ERROR', 'userId and amount are required'));

  const emi = calculateEmi(Number(amount), Number(tenureMonths), Number(interestRate));

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute(
      'INSERT INTO loans (user_id, amount, tenure_months, interest_rate, emi_amount, status) VALUES (?,?,?,?,?,?)',
      [actualUserId, amount, tenureMonths, interestRate, emi, 'PENDING']
    );
    const loanId = result.insertId;

    // Write Outbox event for notification
    await conn.execute(
      "INSERT INTO outbox_events (event_type, aggregate_id, payload, status) VALUES ('LoanApplicationReceived',?,?,'UNPUBLISHED')",
      [String(loanId), JSON.stringify({ loanId, userId: actualUserId, amount, tenureMonths, interestRate, emi })]
    );
    await conn.commit();
    log.info({ loanId }, 'Loan application created');
    res.status(201).json({ success: true, loanId, status: 'PENDING', emi });
  } catch (err) {
    await conn.rollback(); next(err);
  } finally { conn.release(); }
});

// ── Approve/Reject Loan (admin action) ─────────
app.patch('/loans/:id/status', authMiddleware, adminMiddleware, async (req, res, next) => {
  const { status } = req.body;
  const adminUserId = req.user.userId;
  const log = logger.child({ requestId: req.requestId, loanId: req.params.id, adminUserId });

  if (!['APPROVED','REJECTED'].includes(status)) {
    return next(createError(400, 'VALIDATION_ERROR', "status must be 'APPROVED' or 'REJECTED'"));
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // SKIP LOCKED to avoid multiple admins processing the same loan simultaneously
    const [rows] = await conn.execute('SELECT * FROM loans WHERE id=? FOR UPDATE SKIP LOCKED', [req.params.id]);
    if (rows.length === 0) { await conn.rollback(); return next(createError(404, 'LOAN_NOT_FOUND', 'Loan not found')); }
    
    const loan = rows[0];
    if (loan.status !== 'PENDING') {
      await conn.rollback(); 
      return next(createError(400, 'INVALID_STATE', `Loan is already ${loan.status} and cannot be modified further`));
    }

    await conn.execute("UPDATE loans SET status=?, updated_by=?, updated_at=NOW() WHERE id=?", 
      [status, adminUserId, req.params.id]
    );

    if (status === 'APPROVED') {
      // ── Disburse loan amount into user's primary savings account ──────
      // Fetch the user's first savings account
      let userAccountId;
      try {
        const accResp = await accountClient.get(`/accounts/user/${loan.user_id}`);
        const accounts = accResp.data.accounts || [];
        const savingsAcc = accounts.find(a => a.account_type === 'SAVINGS') || accounts[0];
        if (!savingsAcc) throw new Error('No account found for this user');
        userAccountId = savingsAcc.id;

        // Credit the loan amount into the user's account
        await accountClient.post(
          `/accounts/${userAccountId}/credit`,
          { amount: loan.amount },
          { headers: { 'idempotency-key': `loan-disburse:${loan.id}` } }
        );
        log.info({ loanId: loan.id, userId: loan.user_id, amount: loan.amount, accountId: userAccountId }, 'Loan amount disbursed to user account');

        // Record a LOAN_CREDIT transaction so it appears in the user's transaction history
        await conn.execute(
          `INSERT INTO transactions (from_account_id, to_account_id, amount, status, saga_state, request_id)
             VALUES (NULL, ?, ?, 'SUCCESS', 'SUCCESS', ?)`,
          [userAccountId, loan.amount, `loan-disburse:${loan.id}`]
        );
      } catch (disburseErr) {
        // Rollback the loan approval if disbursement fails
        await conn.rollback();
        log.error({ err: disburseErr.message, loanId: loan.id }, 'Disbursement failed — rolling back loan approval');
        return next(createError(500, 'DISBURSEMENT_FAILED', 'Loan approved but disbursement to account failed. Please retry.'));
      }

      await conn.execute(
        "INSERT INTO outbox_events (event_type, aggregate_id, payload, status) VALUES ('LoanApproved',?,?,'UNPUBLISHED')",
        [String(loan.id), JSON.stringify({ loanId: loan.id, userId: loan.user_id, amount: loan.amount, emi: loan.emi_amount, accountId: userAccountId })]
      );
    } else if (status === 'REJECTED') {
      await conn.execute(
        "INSERT INTO outbox_events (event_type, aggregate_id, payload, status) VALUES ('LoanRejected',?,?,'UNPUBLISHED')",
        [String(loan.id), JSON.stringify({ loanId: loan.id, userId: loan.user_id, amount: loan.amount })]
      );
    }
    await conn.commit();
    log.info({ status }, 'Loan status updated securely');
    res.json({ success: true, loanId: req.params.id, status });
  } catch (err) {
    await conn.rollback(); next(err);
  } finally { conn.release(); }
});

// ── Get All Loans (admin action, paginated) ────
app.get('/loans/all', authMiddleware, adminMiddleware, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM loans';
    let countQuery = 'SELECT COUNT(*) as total FROM loans';
    const params = [];

    // Optional status filter
    if (req.query.status && ['PENDING','APPROVED','REJECTED'].includes(req.query.status)) {
      query += ' WHERE status = ?';
      countQuery += ' WHERE status = ?';
      params.push(req.query.status);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    
    const [loans] = await pool.execute(query, [...params, String(limit), String(offset)]);
    const [countRes] = await pool.execute(countQuery, params);
    
    res.json({ 
      success: true, 
      loans,
      pagination: {
        total: countRes[0].total,
        page,
        limit,
        pages: Math.ceil(countRes[0].total / limit)
      }
    });
  } catch (err) { next(err); }
});

// ── Get Loans by User ──────────────────────────
app.get('/loans/user/:userId', authMiddleware, async (req, res, next) => {
  // Ensure users can only fetch their own loans (unless admin)
  if (req.user.role !== 'ADMIN' && String(req.user.userId) !== String(req.params.userId)) {
    return next(createError(403, 'FORBIDDEN', 'Access denied'));
  }

  try {
    const [rows] = await pool.execute('SELECT * FROM loans WHERE user_id=? ORDER BY created_at DESC', [req.params.userId]);
    res.json({ success: true, loans: rows });
  } catch (err) { next(err); }
});

app.use(errorMiddleware);

app.listen(PORT, () => logger.info({ port: PORT }, 'loan-service listening'));

init().catch(err => { logger.fatal({ err }, 'loan-service failed'); process.exit(1); });
