# Nexus Banking — Kubernetes Deployment Guide

> **Stack**: HAProxy → Kgateway (Gateway API) → backend microservices | 4-namespace isolation | NetworkPolicies | HPA | Kyverno admission control

---

## Repository Structure

```
k8s/
├── namespaces.yaml              ← Apply first
├── config/                      ← Secrets + ConfigMaps (apply second)
│   ├── secrets.yaml             ← data-secrets (data ns) + banking-secrets (backend ns)
│   ├── banking-config.yaml      ← Shared env vars for backend services
│   ├── mysql-init.yaml          ← DB schema + seed SQL
│   └── nginx-config.yaml        ← Nginx config for frontend pod
├── volumes/                     ← Data layer (apply third)
│   ├── mysql.yaml               ← MySQL 8 StatefulSet + 5Gi PVC
│   ├── redis.yaml               ← Redis 7 Deployment
│   └── rabbitmq.yaml            ← RabbitMQ 3 Deployment
├── deployments/                 ← Application services (apply fourth)
│   ├── config-service.yaml      ← Port 3008
│   ├── user-service.yaml        ← Port 3001
│   ├── account-service.yaml     ← Port 3002
│   ├── transaction-service.yaml ← Port 3003
│   ├── payment-service.yaml     ← Port 3004
│   ├── loan-service.yaml        ← Port 3005
│   ├── notification-service.yaml← Port 3006
│   ├── fraud-detection.yaml     ← Port 3007
│   ├── reporting-service.yaml   ← Port 3010
│   ├── service-discovery.yaml   ← Port 3009
│   └── frontend.yaml            ← nginx SPA (frontend ns)
├── gateway/                     ← Kgateway routing (apply fifth)
│   ├── gateway.yaml             ← Gateway resource + ReferenceGrants
│   ├── front_route.yaml         ← /* → frontend (catch-all)
│   ├── user_route.yaml          ← /api/user/ → user-service:3001
│   ├── account_route.yaml       ← /api/account/ → account-service:3002
│   ├── tx_route.yaml            ← /api/tx/ → transaction-service:3003
│   ├── loan_route.yaml          ← /api/loan/ → loan-service:3005
│   ├── payment_route.yaml       ← /api/payment/ → payment-service:3004
│   ├── notify_route.yaml        ← /api/notify/ → notification-service:3006
│   └── report_route.yaml        ← /api/report/ → reporting-service:3010
├── autoscaling/hpa/             ← Optional: requires metrics-server
│   ├── frontend-hpa.yaml        ← 1-5 replicas @ 70% CPU
│   ├── payment-hpa.yaml         ← 1-6 replicas @ 65% CPU
│   └── transaction-service-hpa.yaml ← 1-8 replicas @ 60% CPU
├── admission-controller/        ← Optional: requires Kyverno
│   ├── bankingImagePolicy.yaml  ← Enforce image registry
│   └── resourcePolicy.yaml      ← Enforce resource limits
├── monitor/                     ← Optional: requires Prometheus Operator
│   └── banking-service-monitor.yaml
└── net-policies/                ← Apply after all pods are running
    ├── default-deny.yaml        ← Block everything by default
    ├── gate-policy.yaml         ← Allow external → gate → frontend/backend
    ├── frontend-policy.yaml     ← Allow gate → frontend; frontend → backend fallback
    ├── backend-policy.yaml      ← Allow gate+frontend → backend; backend → data
    └── data-policy.yaml         ← Allow backend → data only
```

---

## Routing Architecture

```
Browser
  |
  v
HAProxy (external LB)
  |
  v
Kgateway Gateway (gate ns, port 80)
  |
  +-- /api/user/      -[rewrite]--> user-service.backend:3001
  +-- /api/account/   -[rewrite]--> account-service.backend:3002
  +-- /api/tx/        -[rewrite]--> transaction-service.backend:3003
  +-- /api/loan/      -[rewrite]--> loan-service.backend:3005
  +-- /api/payment/   -[rewrite]--> payment-service.backend:3004
  +-- /api/notify/    -[rewrite]--> notification-service.backend:3006
  +-- /api/report/    -[rewrite]--> reporting-service.backend:3010
  |
  +-- /* (catch-all)  ----------->  frontend.frontend:80 (nginx)
                                       |
                                       +-- /*  -----------> index.html (SPA)
```

Path rewrite: /api/user/users/login strips /api/user/ -> service receives /users/login

---

## Before You Apply

### 1. Replace Docker Hub username
```powershell
# In k8s/ directory (PowerShell)
Get-ChildItem -Path "deployments" -Filter "*.yaml" -Recurse |
  ForEach-Object { (Get-Content $_.FullName) -replace 'aswin2003', 'YOUR_USERNAME' |
  Set-Content $_.FullName }
```

### 2. Verify GatewayClass
```bash
kubectl get gatewayclass
# gatewayClassName in gateway/gateway.yaml must match
# Default: kgateway — update if yours differs (e.g. gloo-gateway)
```

### 3. Check default StorageClass
```bash
kubectl get storageclass
# If no (default) — add storageClassName: <name> to volumes/mysql.yaml PVC
```

---

## Deploy (in order)

```bash
# 1. Namespaces
kubectl apply -f namespaces.yaml

# 2. Config
kubectl apply -f config/

# 3. Data layer
kubectl apply -f volumes/
kubectl wait -n data --for=condition=ready pod -l app=mysql    --timeout=120s
kubectl wait -n data --for=condition=ready pod -l app=redis    --timeout=60s
kubectl wait -n data --for=condition=ready pod -l app=rabbitmq --timeout=90s

# 4. Backend + Frontend
kubectl apply -f deployments/

# 5. Gateway routing
kubectl apply -f gateway/

# 6. NetworkPolicies (apply last — avoids blocking init traffic)
kubectl apply -f net-policies/default-deny.yaml
kubectl apply -f net-policies/gate-policy.yaml
kubectl apply -f net-policies/frontend-policy.yaml
kubectl apply -f net-policies/backend-policy.yaml
kubectl apply -f net-policies/data-policy.yaml
```

### Optional tools
```bash
# metrics-server (for HPA)
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl apply -f autoscaling/hpa/

# Kyverno (for admission control)
kubectl create -f https://github.com/kyverno/kyverno/releases/latest/download/install.yaml
kubectl apply -f admission-controller/

# Prometheus Operator (for monitoring)
kubectl apply -f monitor/
```

---

## Verify

```bash
# Pod health across namespaces
kubectl get pods -n data
kubectl get pods -n backend
kubectl get pods -n frontend

# Gateway status
kubectl get gateway    -n gate   # PROGRAMMED = True
kubectl get httproute  -n gate   # ACCEPTED = True, RESOLVED = True
kubectl get referencegrant -n frontend
kubectl get referencegrant -n backend

# Cross-namespace connectivity test
kubectl run -it --rm test --image=busybox -n backend -- \
  nc -z mysql.data.svc.cluster.local 3306 && echo "MySQL OK"

# Verify nginx config
kubectl exec -n frontend deployment/frontend -- cat /etc/nginx/conf.d/default.conf

# HPA status
kubectl get hpa -n backend
kubectl get hpa -n frontend
```

---

## Login Credentials

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `admin123` |
| Role | `ADMIN` |
