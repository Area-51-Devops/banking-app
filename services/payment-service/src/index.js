require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3004;
const ACCOUNT_SVC = process.env.ACCOUNT_SVC_URL || 'http://account-service:3002';

app.get('/health', (req, res) => res.status(200).json({ status: 'UP', service: 'payment-service' }));

app.post('/pay-bill', async (req, res) => {
    const { accountId, amount, billerCode } = req.body;
    try {
        // Debit account
        await axios.post(`${ACCOUNT_SVC}/accounts/${accountId}/debit`, { amount });
        
        // In real life, call external biller API here.
        
        res.json({ message: `Successfully paid ${amount} to biller ${billerCode}` });
    } catch (err) {
        console.error("Payment Error", err.response?.data || err.message);
        res.status(400).json({ error: 'Payment failed' });
    }
});

app.listen(PORT, () => {
    console.log(`payment-service running on port ${PORT}`);
});
