# 🏦 NexusBank - Microservices Banking System

This is a complete, production-like banking system featuring **10 backend Node.js microservices** and a **React frontend**, all containerized using Docker and Docker Compose. It demonstrates inter-service REST communication, Async events via RabbitMQ, Data Persistence with MySQL, and Session caching using Redis.

---

## 🏗 Architecture Overview

| Service | Port | Tech Stack | Storage/MQ | Description |
|---------|------|------------|------------|-------------|
| **frontend** | `3000` | React (Vite) | - | Single Page App Dashboard |
| **user-service** | `3001` | Node.js / Express | MySQL, Redis | Manages Users, Auth, and persistent sessions. |
| **account-service**| `3002` | Node.js / Express | MySQL | Creates accounts, handles balance increments/decrements. |
| **transaction-service**| `3003` | Node.js / Express | MySQL, RabbitMQ | Transfers money between accounts, publishes `tx_events`. |
| **payment-service** | `3004` | Node.js / Express | MySQL | External bill payment simulation. |
| **loan-service** | `3005` | Node.js / Express | MySQL | Basic loan processing and approval engine. |
| **notification-service**| `3006` | Node.js / Express | RabbitMQ | Async consumer: Logs email/sms simulation for transactions. |
| **fraud-detection-service** | `3007` | Node.js / Express | RabbitMQ | Async consumer: Alerts on transactions > $10,000. |
| **config-service** | `3008` | Node.js / Express | - | Serves mock global platform settings. |
| **service-discovery**| `3009` | Node.js / Express | - | Maps logical microservice names to internal Docker DNS. |
| **reporting-service**| `3010` | Node.js / Express | MySQL | Serves user transaction history from DB. |

---

## 🚀 How to Run using Docker Compose

**Prerequisites:** Docker and Docker Compose must be installed and running on your system.

1. Navigate to the root directory `banking-system`.
2. Run the full orchestrator to build local images and spin up 14 containers (10 Services + 1 Frontend + MySQL + Redis + RabbitMQ):
   ```bash
   docker-compose up --build -d
   ```
3. *(Optional)* View logs across all services to see the system boots and DB connections happen:
   ```bash
   docker-compose logs -f
   ```
4. Access the Frontend UI: **http://localhost:3000**
5. To shut down gracefully: `docker-compose down`

---

## 🎮 Emulating E2E Workflows (From the UI)

1. **Registration & Welcome Bonus**
   - Go to `http://localhost:3000/register`.
   - Enter `johndoe`, `john@example.com`, `password123` and click **Sign Up**.
   - *Behind the scenes*: The UI hits `user-service`. The user is created in MySQL. Immediately after, an account is made in `account-service` funded with a $1000 starting balance.

2. **Money Transfer & Pub/Sub Events**
   - Log in. Navigate to the **Transfer** tab. 
   - Enter another generated `Account ID` (e.g. `2`) under "To Account ID" and a small amount like `$50`.
   - *Behind the scenes*: 
      1. `transaction-service` hits `account-service` via REST to Debit $50 and Credit $50. 
      2. It records the transaction into MySQL.
      3. It publishes the event to RabbitMQ's `tx_exchange` fanout.
   - **Check logs** to see microservices act asynchronously:
     ```bash
     docker logs banking-system-fraud-detection-service-1
     docker logs banking-system-notification-service-1
     ```

3. **Applying for High-Risk Loans (Fraud Trigger!)**
   - Go to the **Loans** tab. Enter a high loan `$20000`. 
   - The UI hits `loan-service`. Now go back to **Transfer**, transfer $15000 to Account ID `2`. 
   - Check the `fraud-detection-service` logs, you will see a `[Fraud Alert] Suspicious large transaction detected`!

---

## 🧪 Sample API Requests (via Postman / cURL)

If you don't want to use the UI, you can directly interact with the Microservices routing API.

### 1. Register a User
```bash
curl -X POST http://localhost:3001/register \
-H "Content-Type: application/json" \
-d '{"username":"steve", "email":"steve@mail.com", "password":"123"}'
```

### 2. Login User (Get Token)
```bash
curl -X POST http://localhost:3001/login \
-H "Content-Type: application/json" \
-d '{"username":"steve", "password":"123"}'
```

### 3. Create Bank Account
```bash
curl -X POST http://localhost:3002/accounts \
-H "Content-Type: application/json" \
-d '{"userId": 1, "accountNumber": "CHK-001", "initialBalance": 2500}'
```

### 4. Transfer Money (Triggers MQ Events)
```bash
curl -X POST http://localhost:3003/transfer \
-H "Content-Type: application/json" \
-d '{"fromAccountId": 1, "toAccountId": 2, "amount": 250.00}'
```

### 5. Check Service Health
```bash
curl -X GET http://localhost:3001/health
```

---

## 🔍 Observability and Data Seed
The MySQL `db-init/init.sql` automatically populates the `banking_db` schema when the `banking_mysql` container starts up. `redis` stores the lightweight UUID session keys without JWT configuration required. You can observe the interactions by tailing the docker-compose stdout as `console.log` instances track all service-to-service integration hooks.
# banking-app
# banking-app
