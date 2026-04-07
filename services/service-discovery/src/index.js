require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3009;

// Mock registry mapping logical names to docker hostnames
const registry = {
    'user-service': 'http://user-service:3001',
    'account-service': 'http://account-service:3002',
    'transaction-service': 'http://transaction-service:3003',
    'payment-service': 'http://payment-service:3004',
    'loan-service': 'http://loan-service:3005',
    'reporting-service': 'http://reporting-service:3010'
};

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'service-discovery' }));

app.get('/resolve/:serviceName', (req, res) => {
    const url = registry[req.params.serviceName];
    if (url) {
        res.json({ url });
    } else {
        res.status(404).json({ error: 'Service not found' });
    }
});

app.listen(PORT, () => {
    console.log(`service-discovery running on port ${PORT}`);
});
