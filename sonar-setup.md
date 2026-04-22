# SonarQube 26.3 Installation Guide on AWS EC2 (Ubuntu)

This guide walks through installing **SonarQube 26.3** with **PostgreSQL** on an AWS EC2 instance running Ubuntu 22.04 or 24.04.

---

## Prerequisites

- EC2 instance running **Ubuntu 22.04 or 24.04**
- Instance type: **t3.medium or higher** (minimum 2 vCPUs and 4GB RAM)
- Root or `sudo` access
- Port **9000** open in the EC2 Security Group (inbound TCP 9000)

---

## Step 1 — Update the System and Install Dependencies

```bash
sudo apt update -y
sudo apt upgrade -y
sudo apt install -y openjdk-21-jdk unzip wget postgresql postgresql-contrib
```

**Why:**
- **openjdk-21-jdk** — SonarQube 26.x requires Java 21. Older versions will cause a startup failure.
- **unzip / wget** — Used to download and extract the SonarQube package.
- **postgresql / postgresql-contrib** — SonarQube requires an external database in production. PostgreSQL is the recommended option.

Verify Java is installed correctly:

```bash
java -version
```

---

## Step 2 — Configure PostgreSQL

Start and enable PostgreSQL so it runs on boot:

```bash
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

Open the PostgreSQL prompt as the `postgres` superuser:

```bash
sudo -u postgres psql
```

Run the following commands inside the prompt to create the database user and database:

```sql
CREATE USER sonar WITH ENCRYPTED PASSWORD 'Sonar@123';
CREATE DATABASE sonarqube OWNER sonar;
GRANT ALL PRIVILEGES ON DATABASE sonarqube TO sonar;
\q
```

**Why:**
- SonarQube cannot use its built-in H2 database in production — an external DB is mandatory.
- A dedicated user `sonar` is created instead of using the `postgres` superuser, following the principle of least privilege.
- `ENCRYPTED PASSWORD` stores the password securely in PostgreSQL's system catalog.

---

## Step 3 — Apply System Tuning

SonarQube bundles Elasticsearch internally, which requires higher kernel and file descriptor limits than Linux defaults.

Add the following kernel parameters:

```bash
sudo bash -c 'cat >> /etc/sysctl.conf <<EOF
vm.max_map_count=524288
fs.file-max=131072
EOF'
```

Apply the changes immediately:

```bash
sudo sysctl -p
```

Set per-user process and file limits for the `sonarqube` user:

```bash
sudo bash -c 'cat >> /etc/security/limits.conf <<EOF
sonarqube   -   nofile   131072
sonarqube   -   nproc    8192
EOF'
```

**Why:**

| Parameter | Reason |
|-----------|--------|
| `vm.max_map_count=524288` | Elasticsearch requires a high memory map count to index source code. The default Linux value (65530) is too low and will cause Elasticsearch to crash at startup. |
| `fs.file-max=131072` | Increases the system-wide limit on open file descriptors. SonarQube opens many files during code analysis. |
| `nofile=131072` | Per-process file descriptor limit for the `sonarqube` user — must align with the system-wide value. |
| `nproc=8192` | Maximum threads the `sonarqube` user can create. Both SonarQube and Elasticsearch are heavily multi-threaded. |

---

## Step 4 — Create a Dedicated SonarQube System User

```bash
sudo groupadd sonarqube
sudo useradd -r -d /opt/sonarqube -g sonarqube sonarqube
```

**Why:**
- SonarQube **must not run as root** — this is a hard security requirement.
- `-r` creates a system account with no interactive login shell, which is appropriate for background services.

---

## Step 5 — Download and Extract SonarQube

Download the SonarQube package to `/tmp`:

```bash
cd /tmp
sudo wget https://binaries.sonarsource.com/Distribution/sonarqube/sonarqube-26.3.0.120487.zip
```

Extract and move it to `/opt`:

```bash
sudo unzip sonarqube-26.3.0.120487.zip -d /opt/
sudo mv /opt/sonarqube-26.3.0.120487 /opt/sonarqube
```

Give ownership of all files to the `sonarqube` user:

```bash
sudo chown -R sonarqube:sonarqube /opt/sonarqube
```

**Why:**
- `/opt` is the standard Linux directory for third-party software installations.
- `chown -R` ensures the `sonarqube` user can read config files and write logs without permission errors.

---

## Step 6 — Configure SonarQube

Open the SonarQube properties file:

```bash
sudo nano /opt/sonarqube/conf/sonar.properties
```

Add the following lines at the end of the file:

```properties
sonar.jdbc.username=sonar
sonar.jdbc.password=Sonar@123
sonar.jdbc.url=jdbc:postgresql://localhost/sonarqube
sonar.web.host=0.0.0.0
sonar.web.port=9000
```

**Why:**
- The JDBC settings tell SonarQube how to connect to the PostgreSQL database created in Step 2.
- `sonar.web.host=0.0.0.0` binds the web interface to all network interfaces so it is reachable via the EC2 public IP.
- `sonar.web.port=9000` is the default SonarQube web port.

Now set the run-as user in the startup script:

```bash
sudo sed -i "s|#RUN_AS_USER=.*|RUN_AS_USER=sonarqube|" /opt/sonarqube/bin/linux-x86-64/sonar.sh
```

**Why:** This ensures the SonarQube startup script explicitly runs as the `sonarqube` user, not as root or the current shell user.

---

## Step 7 — Create a systemd Service

Create the service file:

```bash
sudo nano /etc/systemd/system/sonarqube.service
```

Paste the following content:

```ini
[Unit]
Description=SonarQube service
After=network.target postgresql.service

[Service]
Type=forking
ExecStart=/opt/sonarqube/bin/linux-x86-64/sonar.sh start
ExecStop=/opt/sonarqube/bin/linux-x86-64/sonar.sh stop
User=sonarqube
Group=sonarqube
Restart=always
LimitNOFILE=131072
LimitNPROC=8192
TimeoutStartSec=5
SuccessExitStatus=143

[Install]
WantedBy=multi-user.target
```

**Why:**

| Setting | Reason |
|---------|--------|
| `After=postgresql.service` | Guarantees PostgreSQL is fully up before SonarQube starts, preventing database connection failures on reboot. |
| `Type=forking` | SonarQube's startup script forks a child process. This tells systemd to track the child PID, not the parent shell. |
| `Restart=always` | Automatically restarts SonarQube if it crashes unexpectedly. |
| `LimitNOFILE / LimitNPROC` | Applies the same file and thread limits at the service level to reinforce the system-wide settings from Step 3. |
| `SuccessExitStatus=143` | Exit code 143 (SIGTERM) is a normal graceful shutdown — marking it as success prevents systemd from logging a false failure on stop. |

---

## Step 8 — Start SonarQube

Reload systemd to register the new service, then enable and start it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable sonarqube
sudo systemctl start sonarqube
```

**Why:**
- `daemon-reload` is required whenever a new `.service` file is created so systemd recognises it.
- `enable` ensures SonarQube starts automatically on every server reboot.

Check the service status:

```bash
sudo systemctl status sonarqube
```

Wait about 60–90 seconds for SonarQube to fully initialise, then open your browser:

```
http://<YOUR-EC2-PUBLIC-IP>:9000
```

---

## Default Login Credentials

| Field    | Value         |
|----------|---------------|
| Username | `admin`       |
| Password | `admin`       |
| DB Name  | `sonarqube`   |
| DB User  | `sonar`       |

> You will be prompted to change the admin password on first login.

---

## Useful Log Commands

```bash
# Overall application log
sudo tail -f /opt/sonarqube/logs/sonar.log

# Web server log
sudo tail -f /opt/sonarqube/logs/web.log

# Elasticsearch log (check this if SonarQube fails to start)
sudo tail -f /opt/sonarqube/logs/es.log
```

---

## Troubleshooting

**SonarQube not starting — Elasticsearch error?**

The most common cause is the kernel parameters not being applied:

```bash
sysctl vm.max_map_count        # Must be 524288
sudo tail -f /opt/sonarqube/logs/es.log
```

**Port 9000 not reachable from browser?**

Check the EC2 Security Group and confirm there is an inbound rule for TCP port 9000.

**Database connection error?**

```bash
sudo -u postgres psql -c "\l"    # Verify sonarqube database exists
sudo -u postgres psql -c "\du"   # Verify sonar user exists
```

---

## Post-Installation — Generate Token and Add to GitHub Secrets

### Step 1 — Log in to SonarQube

Open your browser and go to:

```
http://<YOUR-EC2-PUBLIC-IP>:9000
```

Log in with:

- **Username:** `admin`
- **Password:** `admin`

You will be prompted to set a new password on first login. Do this before proceeding.

---

### Step 2 — Generate a Global Analysis Token

1. Click on your **account icon** (top-right corner) → select **My Account**
2. Go to the **Security** tab
3. Under the **Tokens** section, fill in the following:
   - **Name:** give it a recognizable name, e.g. `github-actions-token`
   - **Type:** select `Global Analysis Token`
   - **Expiration:** choose an expiry or select `No expiration`
4. Click **Generate**
5. **Copy the token immediately** — it will not be shown again after you close the dialog

> **Why a Global Analysis Token?** This token type allows CI/CD pipelines (like GitHub Actions) to run code analysis across any project on the SonarQube instance without needing your admin username and password.

---

### Step 3 — Add the Token to GitHub Organization Secrets

1. Go to your **GitHub Organization** page
2. Navigate to **Settings → Secrets and variables → Actions**
3. Click **New organization secret**
4. Fill in:
   - **Name:** `SONAR_TOKEN`
   - **Value:** paste the token copied from SonarQube
5. Under **Repository access**, choose which repositories can use this secret
6. Click **Add secret**

Also add the SonarQube server URL as a second secret:

- **Name:** `SONAR_HOST_URL`
- **Value:** `http://<YOUR-EC2-PUBLIC-IP>:9000`

> **Why store these as organization secrets?** Storing credentials as secrets keeps them out of your source code and allows all repositories in the organization to reference them securely in GitHub Actions workflows.

---

### How to Use in a GitHub Actions Workflow

Reference these secrets in your `.github/workflows/sonar.yml`:

```yaml
- name: SonarQube Scan
  uses: SonarSource/sonarqube-scan-action@master
  env:
    SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
    SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
```
