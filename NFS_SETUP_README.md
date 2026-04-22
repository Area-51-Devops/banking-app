# NFS Setup Guide

This guide provides step-by-step instructions for setting up an NFS (Network File System) Server, configuring an NFS Client, and utilizing NFS for Persistent Volumes in Kubernetes.

## 1. Setting up the NFS Server (Ubuntu/Debian)

### Install the NFS Kernel Server
First, update your package index and install the NFS kernel server package:
```bash
sudo apt update
sudo apt install nfs-kernel-server -y
```

### Create the Export Directory
Create the directory you intend to share with clients. In this example, we use `/var/nfs/general`:
```bash
sudo mkdir -p /var/nfs/general
```

Since we want client machines to have proper access, we will change the ownership of the folder to the `nobody` user and `nogroup` group, which is standard for NFS shares:
```bash
sudo chown nobody:nogroup /var/nfs/general
sudo chmod 777 /var/nfs/general
```

### Configure the NFS Exports
The `/etc/exports` file controls which directories are shared and who can access them. Open the file in your preferred text editor:
```bash
sudo nano /etc/exports
```

Add the following line to grant access to clients. Replace `client_ip` with the actual IP address of your client, or use a subnet (e.g., `192.168.1.0/24`) to allow multiple clients:
```text
/var/nfs/general    client_ip(rw,sync,no_subtree_check)
```
*   `rw`: Grants read and write access to the volume.
*   `sync`: Forces NFS to write changes to disk before replying to the client (improves stability).
*   `no_subtree_check`: Disables subtree checking, which improves reliability when clients are accessing files that are frequently renamed.

### Restart the NFS Service
To apply the changes, restart the NFS service:
```bash
sudo systemctl restart nfs-kernel-server
```

### Configure the Firewall (Optional)
If you are using UFW (Uncomplicated Firewall), allow traffic from your client IP to the NFS service:
```bash
sudo ufw allow from client_ip to any port nfs
```

---

## 2. Setting up the NFS Client (Ubuntu/Debian)

### Install the NFS Common Package
On the client machine, install the package required to mount NFS shares:
```bash
sudo apt update
sudo apt install nfs-common -y
```

### Create the Mount Point
Create a local directory where you will mount the remote NFS share:
```bash
sudo mkdir -p /nfs/general
```

### Mount the NFS Share
Mount the share by replacing `nfs_server_ip` with the IP address of your NFS server:
```bash
sudo mount nfs_server_ip:/var/nfs/general /nfs/general
```

### Verify the Mount
You can verify that the NFS share is mounted successfully by running:
```bash
df -h
```

### Automount on Boot (via /etc/fstab)
To ensure the NFS share is mounted automatically every time the client reboots, add it to `/etc/fstab`:
```bash
sudo nano /etc/fstab
```
Add the following line to the bottom of the file:
```text
nfs_server_ip:/var/nfs/general    /nfs/general   nfs auto,nofail,noatime,nolock,intr,tcp,actimeo=1800 0 0
```

---

## 3. Using NFS in Kubernetes

If you plan to use this NFS server to provide storage for your Kubernetes cluster, you can statically provision volumes using `PersistentVolume` (PV) and `PersistentVolumeClaim` (PVC) manifests.

### Example PersistentVolume (PV)
Create a file named `nfs-pv.yaml` with the following content:
```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: nfs-pv
spec:
  capacity:
    storage: 10Gi
  accessModes:
    - ReadWriteMany
  nfs:
    server: nfs_server_ip
    path: "/var/nfs/general"
```
Apply it using: `kubectl apply -f nfs-pv.yaml`

### Example PersistentVolumeClaim (PVC)
Create a file named `nfs-pvc.yaml`:
```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: nfs-pvc
spec:
  accessModes:
    - ReadWriteMany
  storageClassName: "" # Use an empty string to bind directly to our manually created PV
  resources:
    requests:
      storage: 10Gi
```
Apply it using: `kubectl apply -f nfs-pvc.yaml`

### Dynamic Provisioning (Optional)
For automatic dynamic provisioning of NFS volumes in Kubernetes, it is highly recommended to install the [NFS Subdir External Provisioner](https://github.com/kubernetes-sigs/nfs-subdir-external-provisioner) via Helm.
