require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

let pool;
let redis;

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
    redis = new Redis({ host: process.env.REDIS_HOST || 'redis' });
    console.log("User service connected to DB and Redis.");
}

app.get('/health', (req, res) => res.status(200).json({ status: 'UP', service: 'user-service' }));

app.post('/register', async (req, res) => {
    try {
        const { username, password, email } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO users (username, password, email) VALUES (?, ?, ?)',
            [username, password, email]
        );
        res.status(201).json({ id: result.insertId, username, email });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const [rows] = await pool.execute('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
        if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
        
        const user = rows[0];
        const token = uuidv4();
        await redis.set(`session:${token}`, user.id, 'EX', 3600); // 1 hr expiry
        
        res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

app.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send('Unauthorized');
    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).send('Unauthorized');

    const userId = await redis.get(`session:${token}`);
    if (!userId) return res.status(401).send('Session expired');

    const [rows] = await pool.execute('SELECT id, username, email FROM users WHERE id = ?', [userId]);
    if (rows.length === 0) return res.status(404).send('User not found');
    res.json(rows[0]);
});

init().then(() => {
    app.listen(PORT, () => console.log(`user-service running on port ${PORT}`));
}).catch(console.error);
