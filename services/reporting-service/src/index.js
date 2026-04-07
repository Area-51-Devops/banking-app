require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3010;

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

app.get('/health', (req, res) => res.status(200).json({ status: 'UP', service: 'reporting-service' }));

app.get('/reports/transactions/:accountId', async (req, res) => {
    try {
        const accountId = req.params.accountId;
        // Fetch all transactions where account is sender or receiver
        const [rows] = await pool.execute(
            'SELECT * FROM transactions WHERE from_account_id = ? OR to_account_id = ? ORDER BY timestamp DESC',
            [accountId, accountId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch transaction history' });
    }
});

init().then(() => {
    app.listen(PORT, () => console.log(`reporting-service running on port ${PORT}`));
}).catch(console.error);
