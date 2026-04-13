'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');

const { logger }              = require('../shared/logger');
const { requestIdMiddleware }  = require('../shared/requestId');
const { errorMiddleware, createError } = require('../shared/errorMiddleware');

const PORT = process.env.PORT || 3002;

let pool;
let isStarted = false;

// ──────────────────────────────────────────────
// Exponential backoff connector 12345
// ──────────────────────────────────────────────
async function connectWithRetry(maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const p = mysql.createPool({
        host:              process.env.DB_HOST || 'mysql',
        user:              process.env.DB_USER || 'root',
        password:          process.env.DB_PASS || 'rootpassword',
        database:          process.env.DB_NAME || 'banking_db',
        waitForConnections: true,
        connectionLimit:   10,
        queueLimit:        0
      });
      await p.execute('SELECT 1');
      logger.info({ service: 'account-service' }, 'MySQL connected');
      return p;
    } catch (err) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      logger.warn({ service: 'account-service', attempt, delay }, `MySQL not ready, retrying in ${delay}ms`);
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function init() {
  pool = await connectWithRetry();
  isStarted = true;
}

// ──────────────────────────────────────────────
// Express App
// ──────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(requestIdMiddleware);

// ── Health Probes ──────────────────────────────
app.get('/health/startup', (req, res) => {
  res.json({ status: isStarted ? 'UP' : 'STARTING', service: 'account-service' });
});

app.get('/health/liveness', async (req, res, next) => {
  try {
    await pool.execute('SELECT 1');
    res.json({ status: 'UP', service: 'account-service' });
  } catch (err) {
    next(createError(503, 'HEALTH_CHECK_FAILED', 'Liveness check failed'));
  }
});

app.get('/health/readiness', async (req, res, next) => {
  try {
    if (!isStarted) throw new Error('Not ready');
    await pool.execute('SELECT 1');
    res.json({ status: 'READY', service: 'account-service' });
  } catch (err) {
    next(createError(503, 'NOT_READY', 'Service not ready'));
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'account-service' });
});

// ── Create Account ─────────────────────────────
app.post('/accounts', async (req, res, next) => {
  const log = logger.child({ requestId: req.requestId, endpoint: 'create-account' });
  try {
    const { userId, accountType = 'SAVINGS' } = req.body;
    if (!userId) return next(createError(400, 'VALIDATION_ERROR', 'userId is required'));

    const accountNumber = 'ACC' + Date.now() + Math.floor(Math.random() * 1000);
    const [result] = await pool.execute(
      'INSERT INTO accounts (user_id, account_number, account_type, balance) VALUES (?, ?, ?, 2500.00)',
      [userId, accountNumber, accountType]
    );
    log.info({ userId, accountId: result.insertId }, 'Account created with welcome bonus');
    res.status(201).json({ success: true, accountId: result.insertId, accountNumber });
  } catch (err) {
    next(err);
  }
});

// ── Get Accounts by User ───────────────────────
app.get('/accounts/user/:userId', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM accounts WHERE user_id = ?',
      [req.params.userId]
    );
    res.json({ success: true, accounts: rows });
  } catch (err) {
    next(err);
  }
});

// ── Lookup Account by Account Number ───────────
// Used by the Transfer UI so users type ACC... instead of raw DB IDs
app.get('/accounts/lookup', async (req, res, next) => {
  try {
    const { accountNumber } = req.query;
    if (!accountNumber) return next(createError(400, 'VALIDATION_ERROR', 'accountNumber query param required'));
    const [rows] = await pool.execute(
      'SELECT id, account_number, account_type, balance, user_id FROM accounts WHERE account_number = ?',
      [accountNumber.trim()]
    );
    if (rows.length === 0) return next(createError(404, 'ACCOUNT_NOT_FOUND', 'No account found with that account number'));
    res.json({ success: true, account: rows[0] });
  } catch (err) { next(err); }
});

// ── Get Single Account ─────────────────────────
app.get('/accounts/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM accounts WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return next(createError(404, 'ACCOUNT_NOT_FOUND', 'Account not found'));
    res.json({ success: true, account: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── Debit Account (row-level lock) ─────────────
app.post('/accounts/:id/debit', async (req, res, next) => {
  const log = logger.child({ requestId: req.requestId, endpoint: 'debit' });
  const conn = await pool.getConnection();
  try {
    const { amount, compensationKey } = req.body;
    const accountId = req.params.id;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return next(createError(400, 'VALIDATION_ERROR', 'Valid positive amount required'));
    }

    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT * FROM accounts WHERE id = ? AND is_frozen = 0 FOR UPDATE',
      [accountId]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return next(createError(404, 'ACCOUNT_NOT_FOUND', 'Account not found or is frozen'));
    }

    const account = rows[0];
    if (parseFloat(account.balance) < parseFloat(amount)) {
      await conn.rollback();
      return next(createError(400, 'INSUFFICIENT_FUNDS', 'Insufficient balance'));
    }

    await conn.execute(
      'UPDATE accounts SET balance = balance - ? WHERE id = ?',
      [amount, accountId]
    );
    await conn.commit();

    log.info({ accountId, amount }, 'Debit successful');
    res.json({ success: true, newBalance: (parseFloat(account.balance) - parseFloat(amount)).toFixed(2) });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// ── Credit Account (row-level lock) ────────────
app.post('/accounts/:id/credit', async (req, res, next) => {
  const log = logger.child({ requestId: req.requestId, endpoint: 'credit' });
  const conn = await pool.getConnection();
  try {
    const { amount } = req.body;
    const accountId = req.params.id;

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return next(createError(400, 'VALIDATION_ERROR', 'Valid positive amount required'));
    }

    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT * FROM accounts WHERE id = ? AND is_frozen = 0 FOR UPDATE',
      [accountId]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return next(createError(404, 'ACCOUNT_NOT_FOUND', 'Account not found or is frozen'));
    }

    await conn.execute(
      'UPDATE accounts SET balance = balance + ? WHERE id = ?',
      [amount, accountId]
    );
    const newBalance = (parseFloat(rows[0].balance) + parseFloat(amount)).toFixed(2);
    await conn.commit();

    log.info({ accountId, amount }, 'Credit successful');
    res.json({ success: true, newBalance });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// ── Top Up (deposit) ───────────────────────────
app.post('/accounts/:id/topup', async (req, res, next) => {
  const log = logger.child({ requestId: req.requestId, endpoint: 'topup' });
  const conn = await pool.getConnection();
  try {
    const { amount } = req.body;
    const accountId = req.params.id;
    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      return next(createError(400, 'VALIDATION_ERROR', 'Valid positive amount required'));
    }

    await conn.beginTransaction();
    const [rows] = await conn.execute(
      'SELECT * FROM accounts WHERE id = ? FOR UPDATE', [accountId]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return next(createError(404, 'ACCOUNT_NOT_FOUND', 'Account not found'));
    }
    await conn.execute(
      'UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, accountId]
    );
    const newBalance = (parseFloat(rows[0].balance) + parseFloat(amount)).toFixed(2);
    await conn.commit();

    log.info({ accountId, amount }, 'Top-up successful');
    res.json({ success: true, newBalance });
  } catch (err) {
    await conn.rollback();
    next(err);
  } finally {
    conn.release();
  }
});

// ── Global Error Handler ───────────────────────
app.use(errorMiddleware);

// ── Boot ───────────────────────────────────────
app.listen(PORT, () => logger.info({ port: PORT }, 'account-service listening'));

init().catch(err => {
  logger.fatal({ err }, 'account-service failed to initialise');
  process.exit(1);
});
