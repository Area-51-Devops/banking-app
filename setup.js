const fs = require('fs');
const path = require('path');

const services = [
  { name: 'user-service', port: 3001 },
  { name: 'account-service', port: 3002 },
  { name: 'transaction-service', port: 3003 },
  { name: 'payment-service', port: 3004 },
  { name: 'loan-service', port: 3005 },
  { name: 'notification-service', port: 3006 },
  { name: 'fraud-detection-service', port: 3007 },
  { name: 'config-service', port: 3008 },
  { name: 'service-discovery', port: 3009 },
  { name: 'reporting-service', port: 3010 },
];

const backendDir = path.join(__dirname, 'services');
if (!fs.existsSync(backendDir)) fs.mkdirSync(backendDir, { recursive: true });

services.forEach(svc => {
  const svcDir = path.join(backendDir, svc.name);
  if (!fs.existsSync(svcDir)) fs.mkdirSync(svcDir, { recursive: true });

  // package.json
  const packageJson = {
    name: svc.name,
    version: "1.0.0",
    description: `Banking System - ${svc.name}`,
    main: "src/index.js",
    scripts: {
      "start": "node src/index.js",
      "dev": "nodemon src/index.js"
    },
    dependencies: {
      "express": "^4.18.2",
      "cors": "^2.8.5",
      "dotenv": "^16.3.1",
      "mysql2": "^3.6.1",
      "amqplib": "^0.10.3",
      "ioredis": "^5.3.2",
      "axios": "^1.5.0",
      "uuid": "^9.0.1"
    },
    devDependencies: {
      "nodemon": "^3.0.1"
    }
  };
  fs.writeFileSync(path.join(svcDir, 'package.json'), JSON.stringify(packageJson, null, 2));

  // index.js
  const srcDir = path.join(svcDir, 'src');
  if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir);
  
  const indexJs = `require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || ${svc.port};

app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', service: '${svc.name}' });
});

app.listen(PORT, () => {
    console.log(\`${svc.name} is running on port \${PORT}\`);
});
`;
  fs.writeFileSync(path.join(srcDir, 'index.js'), indexJs);

  // Dockerfile
  const dockerfile = `FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

COPY src ./src

EXPOSE ${svc.port}

CMD ["node", "src/index.js"]
`;
  fs.writeFileSync(path.join(svcDir, 'Dockerfile'), dockerfile);
});

console.log('All 10 services generated.');
