# Nexus-Bank Kubernetes Manifests (Helm)

This repository contains the infrastructure-as-code and configuration definitions for the **Nexus Bank** microservices architecture. The application deployments have been thoroughly modernized into **production-ready Helm Charts** located in the `charts/` directory.

These charts replace static declarative YAMLs with centralized, dynamically injected environment variables, intelligent `initContainer` routing, automated secret management, and deterministic startup sequencing.

## Microservices Architecture

The system consists of **11 independent microservices**, engineered with strict dependency gates (via `initContainers`) to ensure Zero-Downtime scaling and crash-loop prevention during complete cluster reboots.

### Core Services
1. **`user-service` (Port 3001):** Identity management and authentication. Mints and signs JWT tokens (default expiry: 8h). Safely connects to `mysql` and `redis`.
2. **`account-service` (Port 3002):** Core banking account registry. Exposes account balances. Starts exclusively after `mysql` reaches a healthy state.
3. **`transaction-service` (Port 3003):** The primary ledger engine. Contains the most stringent init-gates: it halts booting until `mysql`, `rabbitmq`, `account-service`, and `config-service` are all live.
4. **`payment-service` (Port 3004):** Handles routing of internal/external wire and system payments. Boot-gated behind `mysql`, `rabbitmq`, and `account-service`.
5. **`loan-service` (Port 3005):** Evaluates credit risks and issues loans. Relies heavily on amqp messages.
6. **`frontend` (Port 80 - Rollout):** The React SPA interface served by Nginx. **Note:** Operates using an **Argo Rollout** (`argoproj.io/v1alpha1`) rather than a standard Deployment, allowing safe Blue/Green deployment strategies. Static UI views wait for `user-service` and `account-service` logic before booting.

### Asynchronous / Supporting Services
7. **`notification-service` (Port 3006):** Listens to `rabbitmq` message queues to distribute emails/alerts for transaction validations and system events.
8. **`fraud-detection-service` (Port 3007):** Stateless traffic listener. Connects to `rabbitmq.data` and `config-service` to immediately quarantine or reject suspicious transfers before they commit to the ledger.
9. **`config-service` (Port 3008):** Central dynamic configuration server for internal services. Boot-gated behind `redis`.
10. **`service-discovery` (Port 3009):** Maps instances dynamically inside the ecosystem. Operates independently with no `initContainer` boot requirements.
11. **`reporting-service` (Port 3010):** Batch analytics and statement aggregation. Connects securely to the database.

---

## Technical Features

* **Centralized Kgateway Routing:** The frontend proxy no longer manages APIs. Any request traversing `http://<domain>/api/*` is intelligently handled by Kgateway HTTPRoutes which intercept traffic *before* it reaches the frontend Nginx pod.
* **Probes:** Standardized across every node:
  * `/health/startup`: Protects slow-booting Node instances from premature Liveness kills.
  * `/health/liveness`: Checks database connectivity. 
  * `/health/readiness`: Determines service mesh availability.
* **Secure Environment Loading:** Database variables (`DB_HOST` cross-namespace, `DB_NAME`, `PORT`) are mapped dynamically via `configMapRef`, while sensitive values (`DB_USER`, `DB_PASS`, `JWT_SECRET`) strictly leverage `secretKeyRef` avoiding plaintext container leaks.

---

## Deployment Steps

Because the application relies on strict dependency booting (`initContainers`), the data layer **must** be deployed before the application layer.

### 1. Requirements
* Kubernetes Cluster (EC2 / EKS / K3s)
* Helm 3+ installed locally or on your EC2 jumpbox
* Ensure `argoproj.io` CRDs are installed on your cluster for the Frontend Rollout.

### 2. Deploy the Data Layer (Namespaces & Secrets)
Create the namespaces and seed your infrastructure:
```bash
kubectl apply -f namespaces.yaml

# IMPORTANT: Ensure your backend Secrets correspond to the templates
# For example, standard deployments expect a 'banking-secrets' object.
kubectl apply -f ../banking-app/k8s/config/banking-secrets.yaml
```
Next, launch your database and broker (MySQL, Redis, RabbitMQ) into the `data` namespace.

### 3. Deploy the Microservices (Via Helm)
Once MySQL and RabbitMQ are reporting as `Running`, deploy the 11 charts. You can automate this via ArgoCD, or manually execute Helm:

```bash
# Navigate to the charts directory
cd charts/

# Deploy internal config and discovery first
helm upgrade --install config-service ./config-service -n backend
helm upgrade --install service-discovery ./service-discovery -n backend

# Deploy core data dependents
helm upgrade --install user-service ./user-service -n backend
helm upgrade --install account-service ./account-service -n backend

# Deploy async systems & remaining logic
helm upgrade --install transaction-service ./transaction-service -n backend
helm upgrade --install payment-service ./payment-service -n backend
helm upgrade --install loan-service ./loan-service -n backend
helm upgrade --install fraud-detection-service ./fraud-detection-service -n backend
helm upgrade --install reporting-service ./reporting-service -n backend
helm upgrade --install notification-service ./notification-service -n backend

# Finally, deploy the frontend rollout into its specific namespace
helm upgrade --install frontend ./frontend -n frontend
```

### 4. Verify the Deployment
```bash
# Watch the pods spin up (initContainers will hold until downstream APIs are live)
kubectl get pods -n backend -w

# Check Argo Rollout status for the SPA
kubectl argo rollouts get rollout frontend -n frontend
```
