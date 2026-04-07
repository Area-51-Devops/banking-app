require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3002;

let pool;

async function init() {
    pool = mysql.createPool({
        host: process.env.DB_HOST || 'mysql',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASS || 'rootpassword',
        database: process.env.DB_NAME || 'banking_db',
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    console.log("Account service connected to DB.");
}

app.get('/health', (req, res) => res.status(200).json({ status: 'UP', service: 'account-service' }));

app.post('/accounts', async (req, res) => {
    try {
        const { userId, accountNumber, initialBalance = 0 } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO accounts (user_id, account_number, balance) VALUES (?, ?, ?)',
            [userId, accountNumber, initialBalance]
        );
        res.status(201).json({ accountId: result.insertId, accountNumber, balance: initialBalance });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

app.get('/accounts/user/:userId', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM accounts WHERE user_id = ?', [req.params.userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch' });
    }
});

app.get('/accounts/:accountId', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM accounts WHERE id = ?', [req.params.accountId]);
        if(rows.length === 0) return res.status(404).send('Not found');
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch' });
    }
});

app.post('/accounts/:accountId/credit', async (req, res) => {
    // Basic atomic update
    try {
        const { amount } = req.body;
        await pool.execute('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, req.params.accountId]);
        const [rows] = await pool.execute('SELECT balance FROM accounts WHERE id = ?', [req.params.accountId]);
        res.json({ balance: rows[0].balance });
    } catch (err) {
        res.status(500).json({ error: 'Credit failed' });
    }
});

app.post('/accounts/:accountId/debit', async (req, res) => {
    try {
        const { amount } = req.body;
        const [rows] = await pool.execute('SELECT balance FROM accounts WHERE id = ?', [req.params.accountId]);
        if(rows.length === 0) return res.status(404).send('Not found');
        if(rows[0].balance < amount) return res.status(400).json({ error: 'Insufficient funds' });
        
        await pool.execute('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, req.params.accountId]);
        res.json({ message: 'Debit successful' });
    } catch (err) {
        res.status(500).json({ error: 'Debit failed' });
    }
});

init().then(() => {
    app.listen(PORT, () => console.log(`account-service running on port ${PORT}`));
}).catch(console.error);
