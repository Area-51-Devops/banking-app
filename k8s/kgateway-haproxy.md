# Kubernetes Gateway (kgateway) with HAProxy Setup

---

## Prerequisites

- A running Kubernetes cluster with `kubectl` configured on the master node
- A dedicated node for HAProxy
- Security group rules:
  - Kubernetes nodes: allow NodePort range **30000–32767** from the HAProxy node
  - HAProxy node: allow **port 80** (HTTP) and **port 22** (SSH) from anywhere

---

## Step 1 — Install Helm

On the **master node**, install Helm by following the official Debian/Ubuntu instructions:

```
https://helm.sh/docs/intro/install/
```

Or run the install script directly:

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

Verify:

```bash
helm version
```

---

## Step 2 — Install Gateway API CRDs

```bash
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.4.0/standard-install.yaml
```

Verify:

```bash
kubectl get crd | grep gateway
```

---

## Step 3 — Install kgateway via Helm

Follow all steps in the official kgateway Helm installation guide:

```
https://kgateway.dev/docs/envoy/latest/install/helm
```

Install kgateway CRDs:

```bash
helm upgrade -i --create-namespace \
  --namespace kgateway-system \
  --version v2.1.0 \
  kgateway-crds oci://cr.kgateway.dev/kgateway-dev/charts/kgateway-crds
```

Install kgateway:

```bash
helm upgrade -i \
  --namespace kgateway-system \
  --version v2.1.0 \
  kgateway oci://cr.kgateway.dev/kgateway-dev/charts/kgateway
```

Verify pods are running:

```bash
kubectl get pods -n kgateway-system
```

Verify GatewayClass is accepted:

```bash
kubectl get gatewayclass
```

---

## Step 4 — Apply Gateway and Route YAML Files

```bash
kubectl apply -f gateway.yaml
kubectl apply -f httproute.yaml
```

Verify:

```bash
kubectl get gateway
kubectl get httproute
```

---

## Step 5 — Get the kgateway NodePort

```bash
kubectl get svc -n kgateway-system
```

Look for the `NodePort` service and note the port mapped to **80**. Example:

```
NAME       TYPE       CLUSTER-IP     PORT(S)        AGE
kgateway   NodePort   10.96.45.12    80:31234/TCP   5m
```

Note this port — it is used in the HAProxy configuration.

---

## Step 6 — Install HAProxy (In NFS node)

On the **HAProxy node**, run:

```bash
sudo apt update
sudo apt install haproxy -y
```

---

## Step 7 — Configure HAProxy

```bash
sudo nano /etc/haproxy/haproxy.cfg
```

Add the following at the end of the file. Replace `<WORKER_NODE_1_IP>`, `<WORKER_NODE_2_IP>`, and `<NODEPORT>` with your actual values:

```haproxy
frontend http_front
    mode http
    bind *:80
    default_backend k8s_gateway

backend k8s_gateway
    mode http
    balance roundrobin
    option forwardfor
    server worker-node-1 <WORKER_NODE_1_IP>:<NODEPORT> check
    server worker-node-2 <WORKER_NODE_2_IP>:<NODEPORT> check
```

---

## Step 8 — Start HAProxy

```bash
sudo systemctl restart haproxy
sudo systemctl enable haproxy
sudo systemctl status haproxy
```

---

## Verify

Send a request to the HAProxy node's public IP:

```bash
curl http://<HAPROXY_PUBLIC_IP>/
```
