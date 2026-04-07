require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3008;

const config = {
    globalSettings: {
        maintenanceMode: false,
        supportedCurrencies: ['USD', 'EUR'],
        maxTransferLimit: 10000
    }
};

app.get('/health', (req, res) => res.json({ status: 'UP', service: 'config-service' }));

app.get('/config', (req, res) => {
    res.json(config);
});

app.listen(PORT, () => {
    console.log(`config-service running on port ${PORT}`);
});
