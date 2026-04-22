# CI/CD Implementation Documentation

This document outlines the Continuous Integration and Continuous Deployment (CI/CD) architecture implemented for the Banking Application using GitHub Actions.

## Overview

The CI/CD pipeline is designed around a **Reusable Workflow** pattern to ensure consistency, reduce code duplication, and enforce security and quality checks across all microservices. 

Each individual microservice has a lightweight workflow file that triggers a central `common-ci.yml` workflow, passing service-specific parameters and secrets.

## Architecture & Triggering Mechanism

### Path-Based Filtering
To optimize build times and CI runner usage, workflows are triggered using **path-based filtering**. A microservice's CI pipeline will only run if changes are detected within its specific directory.

Example from `account-service.yml`:
```yaml
on:
  push:
    paths:
      - 'services/account-service/**'
  pull_request:
    paths:
      - 'services/account-service/**'
```

### Reusable Workflow (`common-ci.yml`)
Located at `.github/workflows/common-ci.yml`, this file contains the core logic for the CI pipeline. It accepts inputs such as `working_directory`, `image_name`, and `sonar_project_key` to adapt its steps for whichever service called it.

### Service-Based Template Files (`ci-templates`)
To decouple and modularize the CI/CD processes further, we have also implemented granular, service-based template files in the `ci-templates` directory. These templates isolate specific CI/CD tasks into dedicated workflows, such as:
* `ci-sonar.yml`: Dedicated to SonarQube code quality analysis.
* `ci-snyk.yml`: Dedicated to Snyk dependency vulnerability scanning.
* `ci-image.yml`: Dedicated to Docker image building, Trivy scanning, and registry push.
* `common-cd.yml`: Dedicated to continuous deployment tasks.

This modular approach provides maximum flexibility, allowing services with unique requirements to compose their pipelines using these specialized blocks instead of relying solely on the unified `common-ci.yml`.

## CI/CD Pipeline Stages

The central `common-ci.yml` executes the following sequence of steps:

1. **Source Code Checkout & Caching**
   * Checks out the repository.
   * Implements NPM caching (`~/.npm`) to speed up subsequent workflow runs.

2. **Code Quality Analysis (SonarQube)**
   * Executes a SonarQube scan using `SonarSource/sonarqube-scan-action`.
   * Enforces a Quality Gate with a 5-minute timeout to ensure code meets defined quality standards before proceeding.

3. **Dependency Installation**
   * Runs `npm ci` (or `npm install` as a fallback) to install Node.js dependencies.

4. **Software Composition Analysis (Snyk)**
   * Scans dependencies for vulnerabilities using `snyk/actions/node`.
   * Configured with `--severity-threshold=high` to fail the build if high-severity vulnerabilities are found in `package.json`.

5. **Build (Optional)**
   * Executes `npm run build` if the calling workflow sets `run_build: true` (e.g., typically used for the React frontend).

6. **Containerization (Docker Build)**
   * Builds the Docker image for the microservice using the provided Docker context and Dockerfile path.
   * Tags the image with `:v1` (and pushes to the designated Docker registry).

7. **Container Security Scanning (Trivy)**
   * Scans the newly built Docker image using `aquasecurity/trivy-action`.
   * Configured to fail the pipeline if `HIGH` or `CRITICAL` vulnerabilities are detected in the image layers.

8. **Artifact Registration (Docker Push)**
   * Logs into the Docker registry using provided credentials.
   * Pushes the verified image to the registry.

9. **Notifications**
   * Uses `dawidd6/action-send-mail` to send email alerts based on the pipeline outcome.
   * **Success:** Sent only on merges/pushes to the `main` branch.
   * **Failure:** Sent whenever the pipeline fails, including run details and logs links for debugging.

## Adding a New Service to CI/CD

To onboard a new microservice (e.g., `new-service`) into the CI pipeline:

1. Create a new workflow file `.github/workflows/new-service.yml`.
2. Configure the path-based triggers for `services/new-service/**`.
3. Call the `common-ci.yml` workflow, providing the necessary inputs and passing required secrets:

```yaml
name: New-Service-CI
on:
  push:
    paths:
      - 'services/new-service/**'
jobs:
  call-common:
    uses: ./.github/workflows/common-ci.yml
    with:
      working_directory: services/new-service
      image_name: new-service
      sonar_project_key: new-service
    secrets:
      SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}
      SONAR_HOST_URL: ${{ secrets.SONAR_HOST_URL }}
      SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
      DOCKER_USERNAME: ${{ secrets.DOCKER_USERNAME }}
      DOCKER_PASSWORD: ${{ secrets.DOCKER_PASSWORD }}
      # ... Include SMTP Secrets as well
```

## Secrets Management

The pipeline relies on several GitHub Actions Secrets stored at the repository or organization level:
* `SONAR_TOKEN` & `SONAR_HOST_URL`
* `SNYK_TOKEN`
* `DOCKER_USERNAME` & `DOCKER_PASSWORD`
* `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `EMAIL_TO`
