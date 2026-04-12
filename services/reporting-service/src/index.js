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

    // Total debits = peer-to-peer transfers (SUCCESS) + completed bill payments
    const [[{ txDebits }]] = await pool.execute(
      `SELECT COALESCE(SUM(t.amount), 0) AS txDebits
         FROM transactions t JOIN accounts a ON t.from_account_id = a.id
         WHERE a.user_id=? AND t.status='SUCCESS'`, [userId]
    );
    const [[{ billDebits }]] = await pool.execute(
      `SELECT COALESCE(SUM(p.amount), 0) AS billDebits
         FROM payments p JOIN accounts a ON p.account_id = a.id
         WHERE a.user_id=? AND p.status='COMPLETED'`, [userId]
    );
    const totalDebits = Number(txDebits) + Number(billDebits);

    // Total credits (money received via transfers + loan disbursements)
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

    // Recent activity: last 10 items combining transfers + bill payments
    const [recent] = await pool.execute(
      `SELECT id, from_account_id, to_account_id, amount, status, created_at,
              'TRANSFER' AS activity_type, NULL AS biller_name,
              from_account_number, to_account_number
       FROM (
         SELECT t.id, t.from_account_id, t.to_account_id, t.amount, t.status, t.created_at,
                COALESCE(a1.account_number, 'LOAN CREDIT') AS from_account_number,
                a2.account_number AS to_account_number
         FROM transactions t
         LEFT JOIN accounts a1 ON t.from_account_id = a1.id
         LEFT JOIN accounts a2 ON t.to_account_id = a2.id
         WHERE (t.from_account_id IN (SELECT id FROM accounts WHERE user_id=?)
            OR  t.to_account_id   IN (SELECT id FROM accounts WHERE user_id=?))
       ) AS tx_sub

       UNION ALL

       SELECT CAST(p.id AS CHAR), p.account_id, NULL, p.amount, p.status, p.created_at,
              'BILL_PAYMENT', p.biller_name,
              a.account_number, NULL
       FROM payments p
       JOIN accounts a ON p.account_id = a.id
       WHERE a.user_id=?

       ORDER BY created_at DESC LIMIT 10`,
      [userId, userId, userId]
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
