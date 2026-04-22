# Kubernetes Cluster Setup Guide

This README provides step-by-step instructions for setting up a Kubernetes cluster with 1 master node and 2 worker nodes using `kubeadm` on Linux/Ubuntu VMs.

## Prerequisites

- 3 Linux/Ubuntu virtual machines (1 Master, 2 Workers)
- Open required ports in security groups (see [Required Ports](#required-ports))
- Root or `sudo` access on all nodes

---

## High-Level Setup Flow

1. Setup 3 Cloud VMs (1 Master, 2 Worker Nodes)
2. Open Required Ports (Control plane & component ports)
3. Run Prerequisite Steps on both Master & Worker nodes
4. Initialize Control Plane (`kubeadm init` on Master)
5. Install CNI Plugin (Calico networking)
6. Join Worker Nodes (`kubeadm join` on each Worker)

---

## Required Ports

### Control Plane Ports

| Port | Component |
|------|-----------|
| 6443 | API Server |
| 2379–2380 | ETCD |
| 10257 | Controller Manager |
| 10259 | Scheduler |
| 10250 | Kubelet |

### Worker Node Ports

| Port | Component |
|------|-----------|
| 10256 | Kube-Proxy |
| 10250 | Kubelet |
| 30000–32767 | NodePort Services |

---

## Master Node Setup

Execute the following steps on the **Master** node.

### Step 1: Disable Swap

```bash
swapoff -a
sudo sed -i '/ swap / s/^\(.*\)$/#\1/g' /etc/fstab
free -m  # Verify swap is 0
```

### Step 2: Load Kernel Modules

```bash
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
overlay
br_netfilter
EOF

sudo modprobe overlay
sudo modprobe br_netfilter
```

### Step 3: Configure Kernel Networking Parameters

```bash
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF

sudo sysctl --system
```

### Step 4: Install Container Runtime (containerd)

```bash
curl -LO https://github.com/containerd/containerd/releases/download/v1.7.14/containerd-1.7.14-linux-amd64.tar.gz
sudo tar Cxzvf /usr/local containerd-1.7.14-linux-amd64.tar.gz

curl -LO https://raw.githubusercontent.com/containerd/containerd/main/containerd.service
sudo mkdir -p /usr/local/lib/systemd/system/
sudo mv containerd.service /usr/local/lib/systemd/system/

sudo mkdir -p /etc/containerd
containerd config default | sudo tee /etc/containerd/config.toml
sudo sed -i 's/SystemdCgroup = false/SystemdCgroup = true/g' /etc/containerd/config.toml

sudo systemctl daemon-reload
sudo systemctl enable --now containerd
```

### Step 5: Install runc

```bash
curl -LO https://github.com/opencontainers/runc/releases/download/v1.1.12/runc.amd64
sudo install -m 755 runc.amd64 /usr/local/sbin/runc
```

### Step 6: Install CNI Plugins

```bash
curl -LO https://github.com/containernetworking/plugins/releases/download/v1.5.0/cni-plugins-linux-amd64-v1.5.0.tgz
sudo mkdir -p /opt/cni/bin
sudo tar Cxzvf /opt/cni/bin cni-plugins-linux-amd64-v1.5.0.tgz
```

### Step 7: Install Kubernetes Components

```bash
sudo apt-get update
sudo apt-get install -y apt-transport-https ca-certificates curl gpg

sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.34/deb/Release.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg

echo "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.34/deb/ /" | \
  sudo tee /etc/apt/sources.list.d/kubernetes.list

sudo apt-get update
sudo apt-get install -y kubelet kubeadm kubectl
sudo apt-mark hold kubelet kubeadm kubectl

kubeadm version
kubectl version --client
```

### Step 8: Configure crictl

```bash
sudo crictl config runtime-endpoint unix:///var/run/containerd/containerd.sock
```

### Step 9: Initialize the Control Plane

> **Note:** Replace `<MASTER_IP>` with the actual private IP of your master VM.

```bash
sudo kubeadm init \
  --pod-network-cidr=192.168.0.0/16 \
  --apiserver-advertise-address=<MASTER_IP> \
  --node-name master
```

> **Important:** Save the `kubeadm join` command from the output — you'll need it for worker nodes.

### Step 10: Configure kubectl Access

```bash
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

kubectl get nodes  # Should show NotReady (CNI not yet installed)
```

### Step 11: Install Calico Networking (CNI)

```bash
kubectl create -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/tigera-operator.yaml

curl https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/custom-resources.yaml -O
kubectl apply -f custom-resources.yaml

kubectl get pods -A   # Wait for all pods to be Running
kubectl get nodes     # Should now show Ready
```

---

## Worker Nodes Setup

Repeat **Steps 1–8** from the Master Node section on each Worker Node.

### Step 9: Join Worker Node to the Cluster

Run the join command that was output during `kubeadm init` on the master:

```bash
sudo kubeadm join <MASTER_IP>:6443 \
  --token <your-token> \
  --discovery-token-ca-cert-hash sha256:<your-hash>
```

### Step 10: Verify Cluster Node Status

On the **Master** node, run:

```bash
kubectl get nodes
```

Expected output:

```
NAME      STATUS   ROLES           AGE   VERSION
master    Ready    control-plane   10m   v1.34.x
worker1   Ready    <none>          5m    v1.34.x
worker2   Ready    <none>          4m    v1.34.x
```

---

## Final Verification

Check all pods across all namespaces:

```bash
kubectl get pods -A
```

All pods should be in `Running` or `Completed` state.

---

## Troubleshooting

### Node stuck in `NotReady`

```bash
journalctl -u kubelet -f              # Check kubelet logs
kubectl describe node <node-name>     # Check node events
```

Usually caused by CNI not yet running or swap still enabled.

### Pods stuck in `Pending` or `ContainerCreating`

```bash
kubectl describe pod <pod-name> -n <namespace>
```

Often indicates a CNI networking issue or image pull failure.

### `kubeadm init` fails

```bash
sudo kubeadm init --dry-run   # Run preflight checks
sudo kubeadm reset            # Reset if needed, then re-run init
```

### Join token expired

Generate a new token on the Master:

```bash
kubeadm token create --print-join-command
```

This outputs a complete, ready-to-use join command for new workers.

### `crictl` connection refused

```bash
sudo systemctl status containerd
sudo crictl --runtime-endpoint unix:///var/run/containerd/containerd.sock ps
```

---

## Key Concepts

| Component | Description |
|-----------|-------------|
| **kubeadm** | Bootstrap tool for initializing and joining nodes |
| **containerd + runc** | Container runtime stack |
| **Calico CNI** | Provides pod-to-pod networking |
| **kubelet** | Node agent that manages pods |
