CREATE DATABASE IF NOT EXISTS banking_db;
USE banking_db;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(255) UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,          -- bcrypt hashed
    email       VARCHAR(255) NOT NULL,
    role        ENUM('USER', 'ADMIN') DEFAULT 'USER',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Seed initial admin user (see README for credentials)
-- INSERT IGNORE ensures idempotency — safe to re-run
INSERT IGNORE INTO users (id, username, password, email, role) 
VALUES (1, 'admin', '$2a$10$DFdCs1/O.mmjYSXVTUZiNJAFTWCeJuwmuKmko/yKVefJ2MEN', 'admin@nexus.com', 'ADMIN');

-- ============================================================
-- ACCOUNTS
-- ============================================================
CREATE TABLE IF NOT EXISTS accounts (
    id             INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT NOT NULL,
    account_number VARCHAR(50) UNIQUE NOT NULL,
    account_type   ENUM('SAVINGS','CHECKING') DEFAULT 'SAVINGS',
    balance        DECIMAL(15,2) DEFAULT 0.00,
    is_frozen      TINYINT(1) DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- ============================================================
-- TRANSACTIONS  (Saga state machine)
-- States: INITIATED -> DEBITED -> CREDITED -> SUCCESS
--         INITIATED -> DEBITED -> FAILED  (compensation issued)
--         DEBITED   -> FLAGGED           (fraud check pending)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    from_account_id INT,
    to_account_id   INT,
    amount          DECIMAL(15,2) NOT NULL,
    status          VARCHAR(50)  NOT NULL DEFAULT 'INITIATED',
    saga_state      VARCHAR(50)  NOT NULL DEFAULT 'INITIATED',
    idempotency_key VARCHAR(255),
    request_id      VARCHAR(255),
    timeout_at      DATETIME,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_transactions_status    (status),
    INDEX idx_transactions_saga_state (saga_state),
    INDEX idx_transactions_idem_key  (idempotency_key)
);

-- ============================================================
-- OUTBOX EVENTS  (Transactional Outbox Pattern)
-- States: UNPUBLISHED -> PROCESSING -> PUBLISHED
--         PROCESSING  -> FAILED (on MQ error, retry later)
-- ============================================================
CREATE TABLE IF NOT EXISTS outbox_events (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    event_type    VARCHAR(100) NOT NULL,
    aggregate_id  VARCHAR(255) NOT NULL,       -- e.g. transaction_id
    payload       JSON,
    status        ENUM('UNPUBLISHED','PROCESSING','PUBLISHED','FAILED') DEFAULT 'UNPUBLISHED',
    retry_count   INT DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_outbox_status (status)
);

-- ============================================================
-- IDEMPOTENCY KEYS  (per-user, per-endpoint scoped)
-- ============================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    idem_key      VARCHAR(255) NOT NULL,
    user_id       INT NOT NULL,
    endpoint      VARCHAR(255) NOT NULL,
    response      JSON,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_idem (idem_key, user_id, endpoint),
    INDEX idx_idem_user_endpoint (user_id, endpoint)
);

-- ============================================================
-- LOANS  (Application pipeline)
-- ============================================================
CREATE TABLE IF NOT EXISTS loans (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    user_id      INT NOT NULL,
    amount       DECIMAL(15,2) NOT NULL,
    tenure_months INT NOT NULL DEFAULT 12,
    interest_rate DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    emi_amount   DECIMAL(15,2),
    status       ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
    updated_by   INT DEFAULT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (updated_by) REFERENCES users(id),
    INDEX idx_loans_user_id (user_id),
    INDEX idx_loans_status  (status)
);

-- ============================================================
-- PAYMENTS  (Bill payments with status tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    account_id      INT NOT NULL,
    user_id         INT NOT NULL,
    biller_code     VARCHAR(100) NOT NULL,
    biller_name     VARCHAR(255),
    amount          DECIMAL(15,2) NOT NULL,
    status          ENUM('INITIATED','PENDING','COMPLETED','FAILED') DEFAULT 'INITIATED',
    idempotency_key VARCHAR(255),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payments_account_id    (account_id),
    INDEX idx_payments_user_id       (user_id),
    INDEX idx_payments_idem_key      (idempotency_key)
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    user_id     INT NOT NULL,
    event_type  VARCHAR(100) NOT NULL,
    message     VARCHAR(500) NOT NULL,
    is_read     TINYINT(1) DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notifications_user_id (user_id),
    INDEX idx_notifications_is_read (is_read)
);

-- ============================================================
-- PROCESSED EVENTS  (Notification deduplication)
-- TTL: rows older than 7 days are cleaned up by the service
-- ============================================================
CREATE TABLE IF NOT EXISTS processed_events (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    event_id   VARCHAR(255) UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_processed_events_created_at (created_at)
);
