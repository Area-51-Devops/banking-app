'use strict';
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const mysql   = require('mysql2/promise');

const { logger }              = require('../shared/logger');
const { requestIdMiddleware }  = require('../shared/requestId');
const { errorMiddleware, createError } = require('../shared/errorMiddleware');

const PORT = process.env.PORT || 3010;

let pool;
let isStarted = false;

async function connectWithRetry(maxRetries = 10) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const p = mysql.createPool({
        host: process.env.DB_HOST || 'mysql', user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || 'rootpassword', database: process.env.DB_NAME || 'banking_db',
        waitForConnections: true, connectionLimit: 10, queueLimit: 0
      });
      await p.execute('SELECT 1'); logger.info({ service: 'reporting-service' }, 'MySQL connected'); return p;
    } catch (err) {
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      logger.warn({ attempt, delay }, 'MySQL not ready, retrying...');
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

async function init() { pool = await connectWithRetry(); isStarted = true; }

const app = express();
app.use(cors()); app.use(express.json()); app.use(requestIdMiddleware);

app.get('/health/startup',   (req, res) => res.json({ status: isStarted ? 'UP' : 'STARTING', service: 'reporting-service' }));
app.get('/health/liveness',  async (req, res, next) => {
  try { await pool.execute('SELECT 1'); res.json({ status: 'UP', service: 'reporting-service' }); }
  catch { next(createError(503, 'HEALTH_CHECK_FAILED', 'DB ping failed')); }
});
app.get('/health/readiness', (req, res) => res.json({ status: isStarted ? 'READY' : 'NOT_READY', service: 'reporting-service' }));
app.get('/health',           (req, res) => res.json({ status: 'UP', service: 'reporting-service' }));

// ── Transaction History (paginated) ───────────
app.get('/reports/transactions/:accountId', async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    const accountId = req.params.accountId;

    const [rows] = await pool.execute(
      `SELECT * FROM transactions
         WHERE from_account_id = ? OR to_account_id = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [accountId, accountId, Number(limit), offset]
    );
    const [[{ total }]] = await pool.execute(
      'SELECT COUNT(*) AS total FROM transactions WHERE from_account_id=? OR to_account_id=?',
      [accountId, accountId]
    );
    res.json({ success: true, transactions: rows, pagination: { page: Number(page), limit: Number(limit), total } });
  } catch (err) { next(err); }
});

// ── Financial Summary for User ─────────────────
app.get('/reports/summary/:userId', async (req, res, next) => {
  try {
    const userId = req.params.userId;

    // Total balance across all accounts
    const [[{ totalBalance }]] = await pool.execute(
      'SELECT COALESCE(SUM(balance), 0) AS totalBalance FROM accounts WHERE user_id=?', [userId]
    );

    // Total debits (money sent)
    const [[{ totalDebits }]] = await pool.execute(
      `SELECT COALESCE(SUM(t.amount), 0) AS totalDebits
         FROM transactions t JOIN accounts a ON t.from_account_id = a.id
         WHERE a.user_id=? AND t.status='SUCCESS'`, [userId]
    );

    // Total credits (money received)
    const [[{ totalCredits }]] = await pool.execute(
      `SELECT COALESCE(SUM(t.amount), 0) AS totalCredits
         FROM transactions t JOIN accounts a ON t.to_account_id = a.id
         WHERE a.user_id=? AND t.status='SUCCESS'`, [userId]
    );

    // Active loans
    const [[{ activeLoanCount, totalLoanAmount }]] = await pool.execute(
      `SELECT COUNT(*) AS activeLoanCount, COALESCE(SUM(amount), 0) AS totalLoanAmount
         FROM loans WHERE user_id=? AND status='APPROVED'`, [userId]
    );

    // Recent transactions (last 5, deduplicated — the OR-join would produce duplicates)
    const [recent] = await pool.execute(
      `SELECT DISTINCT t.* FROM transactions t
         WHERE (t.from_account_id IN (SELECT id FROM accounts WHERE user_id=?)
            OR t.to_account_id   IN (SELECT id FROM accounts WHERE user_id=?))
           AND t.status='SUCCESS'
         ORDER BY t.created_at DESC LIMIT 5`, [userId, userId]
    );

    res.json({
      success: true,
      summary: { totalBalance, totalDebits, totalCredits, activeLoanCount, totalLoanAmount, recentTransactions: recent }
    });
  } catch (err) { next(err); }
});

app.use(errorMiddleware);

app.listen(PORT, () => logger.info({ port: PORT }, 'reporting-service listening'));

init().catch(err => { logger.fatal({ err }, 'reporting-service failed'); process.exit(1); });
