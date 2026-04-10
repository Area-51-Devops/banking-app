# 🏦 BankSecure - Microservices Banking System

This is a complete, production-grade banking system featuring **10 backend Node.js microservices** and a **React frontend**, all containerized using Docker and Docker Compose. It demonstrates advanced distributed architecture patterns including **Saga Orchestration**, the **Outbox Pattern**, scoped Idempotency, and highly resilient connection strategies.

---

## 🏗 Architecture Overview

| Service | Port | Tech Stack | Description |
|---------|------|------------|-------------|
| **frontend** | `80` | React (Vite) + Nginx | Glassmorphism Dashboard in INR. Nginx acts as an internal API Gateway proxying calls to backend services. |
| **user-service** | `3001` | Node.js / Express | Manages Auth (bcrypt + JWT) and persistent sessions via Redis. |
| **account-service**| `3002` | Node.js / Express | ACID-compliant account engine using `SELECT FOR UPDATE` row-level locks. |
| **transaction-service**| `3003` | Node.js / Express | **Saga Orchestrator**. Handles transfers, Outbox events (SKIP LOCKED), and timeout recovery. |
| **payment-service** | `3004` | Node.js / Express | Biller system (Electricity, Water, Broadband) with idempotency tracking. |
| **loan-service** | `3005` | Node.js / Express | Loan application pipeline and dynamic EMI calculation endpoint. |
| **notification-service**| `3006` | Node.js / Express | Consumes MQ events, dedups via `processed_events` table (w/ TTL), and serves REST UI. |
| **fraud-detection-service** | `3007` | Node.js / Express | Async rule engine evaluating large transactions against thresholds. |
| **config-service** | `3008` | Node.js / Express | Redis-backed dynamic configuration (fraud thresholds, global variables). |
| **reporting-service**| `3010` | Node.js / Express | Aggregates transaction history and builds highly optimized dashboard summaries. |
| **service-discovery**| `3009` | Node.js / Express | Hardcoded mock registry placeholder. |

### Auxiliary Infrastructure
- **MySQL (3306)**: Fully initialized Schema with multiple transaction isolation setups.
- **RabbitMQ (5672/15672)**: Async message broker for all cross-domain event flows.
- **Redis (6379)**: Memory store for session tokens, liveness checks, and configuration caching.

---

## 🚀 How to Run using Docker Compose

**Prerequisites:** Docker and Docker Compose (v2+) must be installed.

1. Navigate to the root directory `banking-app`.
2. Clean up any existing instances and bring up the full stack:
   ```bash
   docker-compose down -v
   docker-compose up --build -d
   ```
3. Wait for about 60-90 seconds. Services are protected by strict exponential backoffs and K8s-ready `/health/startup` probes so they will auto-configure connectivity based on startup order.
4. Access the Frontend UI: **http://localhost** (Notice there is no port, it securely runs on 80 and reverse proxies `/api/*`).
5. To shut down gracefully: `docker-compose down`

---

## 🎮 Emulating Advanced Architecture Features

### 1. Robust Account Provisioning
- Go to `http://localhost/register`.
- Create a new account. `user-service` securely hashes passwords and instantly delegates to `account-service` to provision the exact starting balances via HTTP calls leveraging `axios-retry`.

### 2. Saga Orchestrated Transfers
- Log in and navigate to **Transfer**.
- When you transfer money, `transaction-service` utilizes a local state machine (`INITIATED`, `DEBITED`, `CREDITED`, `SUCCESS`).
- If an issue occurs halfway through processing, the orchestrator triggers async compensation routes (reversing `DEBIT` steps to guarantee balance consistency).

### 3. Distributed Idempotency
- Send a transfer. Then immediately refresh or duplicate the request.
- The UI binds a unique `Idempotency-Key` headers (`uuidv4`).
- `transaction-service` strictly checks `<user_id, endpoint, key>`, capturing the exact initial JSON response and rejecting the duplicate operation securely without double spending.

### 4. Async Rule Engines (Fraud)
- Initiate a massive transfer (default config sets threshold at ₹5,00,000).
- `transaction-service` sets state to `FLAGGED` and publishes an Outbox event using strict `SELECT FOR UPDATE SKIP LOCKED` guarantees.
- `fraud-detection` asynchronously validates rules and returns a `FraudRejected` decision causing money to securely reverse.

### 5. Smart Notifications
- View the **Notifications** bell.
- High-volume MQ traffic is strictly deduplicated using a MySQL `processed_events` lookup.
- Events older than 7_DAYS are aggressively swept using a built-in background cleaner job.

---

## 🛡️ Production Hardening Characteristics
This architecture eliminates common monolithic anti-patterns:
- **No Direct Reversals**: Failures correctly utilize compensating transactions.
- **Crash Safety**: Saga Poller (`startSagaRecoveryPoller`) automatically seeks orphaned transfers where `timeout_at < NOW()` to credit funds back correctly.
- **No `localhost` coupling**: Standardized API Gateway routing via Nginx resolves Docker-Compose and EC2 deployment DNS bindings permanently.
- **Localization**: Pure native `Intl.NumberFormat('en-IN')` ensuring valid Indian Rupee outputs, coupled with safe standard UI rendering avoiding complex JS floats.
