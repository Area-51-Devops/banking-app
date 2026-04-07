require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const amqp = require('amqplib');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3003;
const ACCOUNT_SVC = process.env.ACCOUNT_SVC_URL || 'http://account-service:3002';

let pool;
let mqChannel;

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

    let retries = 5;
    while(retries--) {
        try {
            const conn = await amqp.connect(process.env.MQ_URL || 'amqp://rabbitmq');
            mqChannel = await conn.createChannel();
            await mqChannel.assertExchange('tx_exchange', 'fanout', {durable: false});
            console.log("Connected to RabbitMQ");
            break;
        } catch(err) {
            console.log("Waiting for MQ...");
            await new Promise(res => setTimeout(res, 3000));
        }
    }
}

app.get('/health', (req, res) => res.status(200).json({ status: 'UP', service: 'transaction-service' }));

app.post('/transfer', async (req, res) => {
    const { fromAccountId, toAccountId, amount } = req.body;
    try {
        // 1. Debit from Account
        await axios.post(`${ACCOUNT_SVC}/accounts/${fromAccountId}/debit`, { amount });
        
        // 2. Credit to Account
        try {
            await axios.post(`${ACCOUNT_SVC}/accounts/${toAccountId}/credit`, { amount });
        } catch(creditErr) {
            // Rollback (Saga pattern simplified)
            await axios.post(`${ACCOUNT_SVC}/accounts/${fromAccountId}/credit`, { amount });
            return res.status(500).json({ error: 'Transfer failed, rolled back' });
        }

        // 3. Log to DB
        const [result] = await pool.execute(
            'INSERT INTO transactions (from_account_id, to_account_id, amount, status) VALUES (?, ?, ?, ?)',
            [fromAccountId, toAccountId, amount, 'SUCCESS']
        );

        // 4. Publish Event
        const event = { id: result.insertId, fromAccountId, toAccountId, amount, timestamp: new Date() };
        mqChannel.publish('tx_exchange', '', Buffer.from(JSON.stringify(event)));

        res.json({ message: 'Transfer successful', transactionId: result.insertId });
    } catch (err) {
        console.error("Transfer Error", err.response?.data || err.message);
        res.status(400).json({ error: 'Transfer failed' });
    }
});

init().then(() => {
    app.listen(PORT, () => console.log(`transaction-service running on port ${PORT}`));
}).catch(console.error);
