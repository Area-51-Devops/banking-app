require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3005;

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
}

app.get('/health', (req, res) => res.status(200).json({ status: 'UP', service: 'loan-service' }));

app.post('/loans', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO loans (user_id, amount, status) VALUES (?, ?, ?)',
            [userId, amount, 'APPROVED'] // Auto-approve for demo
        );
        res.status(201).json({ loanId: result.insertId, status: 'APPROVED' });
    } catch (err) {
        res.status(500).json({ error: 'Loan application failed' });
    }
});

app.get('/loans/user/:userId', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT * FROM loans WHERE user_id = ?', [req.params.userId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch loans' });
    }
});

init().then(() => {
    app.listen(PORT, () => console.log(`loan-service running on port ${PORT}`));
}).catch(console.error);
