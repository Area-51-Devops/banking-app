# Kubernetes NFS Dynamic Provisioning Setup

This guide explains how to configure dynamic NFS storage provisioning in a Kubernetes cluster using a dedicated NFS server node.

---

## Architecture

```text
Dedicated NFS Node (Storage Server)
   └── /mnt/nfs-share  (exported)

Master Node
   └── NFS Provisioner Pod

Worker Nodes
   └── NFS client packages installed

Kubernetes
   PVC → StorageClass(nfs-client) → Provisioner → NFS folders
```

---

## 1. Dedicated NFS Server Setup

Perform these steps on a **separate Linux VM** that will act as the storage node.

Example NFS server IP: `172.31.70.50`

### Install NFS Server

```bash
sudo apt update
sudo apt install nfs-kernel-server -y
```

### Create Shared Directory

```bash
sudo mkdir -p /mnt/nfs-share
sudo chown nobody:nogroup /mnt/nfs-share
sudo chmod 777 /mnt/nfs-share
```

### Configure NFS Exports

```bash
sudo nano /etc/exports
```

Add the following line:

```
/mnt/nfs-share 172.31.0.0/16(rw,sync,no_subtree_check,no_root_squash)
```

> Replace `172.31.0.0/16` with your cluster subnet or VPC CIDR.

### Apply Export Settings

```bash
sudo exportfs -a
sudo systemctl restart nfs-kernel-server
sudo systemctl enable nfs-kernel-server
```

### Verify Export

```bash
showmount -e
```

Expected output:

```
Export list for 172.31.70.50:
/mnt/nfs-share 172.31.0.0/16
```

---

## 2. Configure Security Group / Firewall

Allow NFS traffic to the dedicated storage server.

| Protocol | Port | Source               |
|----------|------|----------------------|
| TCP      | 2049 | Kubernetes Node CIDR |

---

## 3. Install NFS Client on All Kubernetes Nodes

Run this on the **master node and all worker nodes**:

```bash
sudo apt update
sudo apt install nfs-common -y
```

### Verify NFS Connectivity

From any worker node:

```bash
sudo mkdir -p /mnt/test-nfs
sudo mount 172.31.70.50:/mnt/nfs-share /mnt/test-nfs
touch /mnt/test-nfs/test-file.txt
ls -l /mnt/test-nfs
```

Unmount after testing:

```bash
sudo umount /mnt/test-nfs
```

---

## 4. Install Dynamic NFS Provisioner

Run these steps on the **master node only**.

### Install Helm (if not installed)

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
```

### Add Helm Repository

```bash
helm repo add nfs-subdir-external-provisioner https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/
helm repo update
```

### Create Namespace

```bash
kubectl create namespace nfs-provisioner
```

### Install Provisioner

```bash
helm install nfs-client nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace nfs-provisioner \
  --set nfs.server=172.31.70.50 \
  --set nfs.path=/mnt/nfs-share \
  --set storageClass.name=nfs-client \
  --set storageClass.defaultClass=false
```

---

## 5. Verify Provisioner Installation

```bash
kubectl get pods -n nfs-provisioner
kubectl get storageclass
```

Expected pod status: `Running`  
Expected storage class: `nfs-client`

---

## 6. Test Dynamic Provisioning

Create a file `pvc-test.yaml`:

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: test-pvc
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: nfs-client
  resources:
    requests:
      storage: 1Gi
```

Apply and verify:

```bash
kubectl apply -f pvc-test.yaml
kubectl get pvc
```

Expected output:

```
NAME       STATUS   VOLUME                                     CAPACITY
test-pvc   Bound    pvc-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   1Gi
```

On the NFS server, a new directory should appear automatically:

```bash
ls -l /mnt/nfs-share
# default-test-pvc-pvc-xxxxxxxx
```

---

## Useful Commands

```bash
# Check provisioner logs
kubectl logs -n nfs-provisioner deployment/nfs-client-nfs-subdir-external-provisioner

# List PVCs
kubectl get pvc

# List PVs
kubectl get pv
```

---

## Advantages of a Dedicated NFS Node

- Storage remains independent of worker nodes
- Better production reliability and scalability
- Easier backup and restore
- Cleaner Kubernetes architecture
