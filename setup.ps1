$services = @('user-service', 'account-service', 'transaction-service', 'payment-service', 'loan-service', 'notification-service', 'fraud-detection-service', 'config-service', 'service-discovery', 'reporting-service')
$ports = @{
  'user-service'=3001; 'account-service'=3002; 'transaction-service'=3003; 'payment-service'=3004; 'loan-service'=3005; 'notification-service'=3006; 'fraud-detection-service'=3007; 'config-service'=3008; 'service-discovery'=3009; 'reporting-service'=3010
}

$backendDir = "C:\Users\Aswin A S\.gemini\antigravity\scratch\banking-system\services"
New-Item -ItemType Directory -Force -Path $backendDir | Out-Null

foreach ($svc in $services) {
    $svcDir = Join-Path $backendDir $svc
    $srcDir = Join-Path $svcDir "src"
    New-Item -ItemType Directory -Force -Path $srcDir | Out-Null

    $port = $ports[$svc]

    $packageJson = @"
{
  "name": "$svc",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "dev": "nodemon src/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "dotenv": "^16.3.1",
    "mysql2": "^3.6.1",
    "amqplib": "^0.10.3",
    "ioredis": "^5.3.2",
    "axios": "^1.5.0",
    "uuid": "^9.0.1"
  }
}
"@
    Set-Content -Path (Join-Path $svcDir "package.json") -Value $packageJson

    $indexJs = @"
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || $port;

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: '$svc' });
});

app.listen(PORT, () => {
    console.log(`${svc} is running on port ${PORT}`);
});
"@
    Set-Content -Path (Join-Path $srcDir "index.js") -Value $indexJs

    $dockerfile = @"
FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install --production
COPY src ./src
EXPOSE $port
CMD ["node", "src/index.js"]
"@
    Set-Content -Path (Join-Path $svcDir "Dockerfile") -Value $dockerfile
}

# Frontend setup
$frontendDir = "C:\Users\Aswin A S\.gemini\antigravity\scratch\banking-system\frontend"
$frontendSrcDir = Join-Path $frontendDir "src"
New-Item -ItemType Directory -Force -Path $frontendSrcDir | Out-Null

$fePackageJson = @"
{
  "name": "frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 3000",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.16.0",
    "axios": "^1.5.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.1.0",
    "vite": "^4.4.5"
  }
}
"@
Set-Content -Path (Join-Path $frontendDir "package.json") -Value $fePackageJson

$viteConfig = @"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3000
  }
})
"@
Set-Content -Path (Join-Path $frontendDir "vite.config.js") -Value $viteConfig

$indexHtml = @"
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Banking System Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
"@
Set-Content -Path (Join-Path $frontendDir "index.html") -Value $indexHtml

$mainJsx = @"
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
"@
Set-Content -Path (Join-Path $frontendSrcDir "main.jsx") -Value $mainJsx

$appJsx = @"
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

function Home() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    axios.get('http://localhost:3009/health')
      .then(res => setHealth(res.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>Banking System Dashboard</h1>
      <p>Welcome to the Microservices Banking Portal.</p>
      {health && <p>Service Discovery Status: {health.status}</p>}
      <nav>
        <ul>
          <li><Link to="/login">Login</Link></li>
          <li><Link to="/accounts">My Accounts</Link></li>
          <li><Link to="/transfer">Transfer Money</Link></li>
        </ul>
      </nav>
    </div>
  );
}

function Login() { return <h2>Login Placeholder</h2>; }
function Accounts() { return <h2>Accounts Placeholder</h2>; }
function Transfer() { return <h2>Transfer Placeholder</h2>; }

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/transfer" element={<Transfer />} />
      </Routes>
    </Router>
  );
}
"@
Set-Content -Path (Join-Path $frontendSrcDir "App.jsx") -Value $appJsx

$feDockerfile = @"
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
"@
Set-Content -Path (Join-Path $frontendDir "Dockerfile") -Value $feDockerfile

Write-Output "Scaffolding complete!"
