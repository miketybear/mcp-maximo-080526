# Ubuntu Deployment Guide: Maximo MCP Server

This guide describes the step-by-step process of deploying your containerized Maximo Model Context Protocol (MCP) server to an Ubuntu host, securing it behind an Nginx Reverse Proxy, and configuring Let's Encrypt SSL certificates.

---

## Prerequisites (Ubuntu Server Setup)

SSH into your Ubuntu server and run the following commands to ensure all system software, Docker, and Nginx are installed.

### 1. Update Ubuntu Repository Index
```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Docker & Docker Compose
```bash
# Install Docker
sudo apt install -y docker.io

# Enable and start Docker service
sudo systemctl enable --now docker

# Install Docker Compose v2 (recommended)
sudo apt install -y docker-compose-v2

# Optional: Add your user to the docker group so you don't need 'sudo' for docker commands
sudo usermod -aG docker $USER
# (Log out and log back in for this to take effect)
```

### 3. Install Nginx
```bash
# Install Nginx
sudo apt install -y nginx

# Start and enable Nginx
sudo systemctl enable --now nginx
```

---

## Step 1: Copy Project Files to the Server

### Option A: Clone via Git (recommended)

If the server can reach the repository, clone it directly. This is the preferred method because every future update becomes a single `git pull` (see Step 6) instead of copying files by hand:

```bash
sudo mkdir -p /var/www/maximo-mcp
sudo chown $USER:$USER /var/www/maximo-mcp
git clone https://github.com/miketybear/mcp-maximo-080526.git /var/www/maximo-mcp
cd /var/www/maximo-mcp
```

`.env` is git-ignored, so it is never touched by `git pull` — you still create it manually in Step 2.

### Option B: Manual Upload

Create a folder on your Ubuntu server (for example: `/var/www/maximo-mcp`) and upload the project files there (e.g. via `scp`/`rsync`).

You only need the following core files on the server:
- `src/` (and all its subfolders)
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `Dockerfile`
- `.dockerignore`
- `docker-compose.yml`
- `nginx.conf`

---

## Step 2: Configure Environment Variables

Create a `.env` file on the host machine in the root directory of your project (`/var/www/maximo-mcp/.env`). 

Ensure it has the correct permissions:
```bash
touch .env
chmod 600 .env # Restricts reading/writing to owner only
nano .env
```

Paste your actual environment configurations. **Ensure you define `MCP_API_KEY` to protect your server:**

```env
# URL of your IBM Maximo instance
MAXIMO_URL=https://maximo-test.biendongpoc.vn/maximo

# API Key for accessing Maximo
API_KEY=your-secret-maximo-api-key-here

# Security API Token for protecting your MCP server (Bearer Authentication)
# Clients must pass this as: Authorization: Bearer <mcp_api_key>
MCP_API_KEY=your-highly-secure-mcp-token-here

# Server PORT (bound internally to container)
PORT=3030
```

---

## Step 3: Build and Run the Docker Container

Build the optimized multi-stage TypeScript Docker container and spin up the service in the background:

```bash
# Build and start container in detached mode
docker compose up -d --build

# Inspect status
docker compose ps

# View real-time container startup logs
docker compose logs -f
```

You should see logs indicating the MCP server is listening on port `3030`:
```text
MCP Server running on http://localhost:3030/mcp
Health check available at http://localhost:3030/health
```

> [!NOTE]
> **DCR client registration persistence.** When `AUTH_PROVIDER=entra-id`, clients that self-register via Dynamic Client Registration (RFC 7591 — e.g. Claude Desktop, Cursor) are stored in `/app/data/dcr-clients.json` inside the container. `docker-compose.yml` mounts this path as the named volume `dcr-data`, so registrations survive `docker compose up -d --build`. They are **not** preserved if you run `docker compose down -v` (the `-v` flag deletes named volumes) — avoid that flag unless you intend to force every connected client to re-register.

---

## Step 4: Configure Nginx & SSL

### 1. Prepare SSL Certificates
Ensure your custom SSL certificates are placed in a secure directory on the Ubuntu host.
For example, create a directory for the certificates:
```bash
sudo mkdir -p /etc/nginx/ssl
sudo chmod 700 /etc/nginx/ssl
```
Copy your custom certificates into `/etc/nginx/ssl/`:
- `certificate-2025.pem` (Public certificate)
- `privatekey-2025.pem` (Private key)
- `ca-certificate-2025.pem` (Optional: CA Chain / Bundle)

Ensure secure permissions for the private key:
```bash
sudo chmod 600 /etc/nginx/ssl/privatekey-2025.pem
```

### 2. Copy and Adapt the Nginx Configuration
Copy the provided `nginx.conf` from your project folder into Nginx’s configuration structure:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/mxm-mcp-server
```

Open the configuration to verify that the SSL certificate paths match your custom certs:
```bash
sudo nano /etc/nginx/sites-available/mxm-mcp-server
```
Confirm the following lines point to your uploaded certificates:
```nginx
ssl_certificate /etc/nginx/ssl/certificate-2025.pem;
ssl_certificate_key /etc/nginx/ssl/privatekey-2025.pem;
ssl_trusted_certificate /etc/nginx/ssl/ca-certificate-2025.pem; # Optional
```

### 3. Enable the Site
Create a symbolic link in the `sites-enabled` directory:
```bash
sudo ln -s /etc/nginx/sites-available/mxm-mcp-server /etc/nginx/sites-enabled/
```

### 4. Verify and Reload Nginx
Test Nginx for any configuration syntax errors:
```bash
sudo nginx -t
```
If it reports "syntax is ok", reload Nginx to apply changes:
```bash
sudo systemctl reload nginx
```

---

## Step 5: Verification & Testing

Verify that your deployment is active, proxied correctly, and secured using Bearer Tokens:

### 1. Test Unauthenticated Requests
Make a standard request without authentication. It should fail with `401 Unauthorized`:
```bash
curl -i -X POST https://mxm-mcp-server.biendongpoc.vn/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```
**Expected response:**
```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json; charset=utf-8

{
  "error": "Unauthorized",
  "message": "Missing or invalid Authorization header. Expected Bearer Token."
}
```

### 2. Test Authenticated Requests
Make a request passing your `MCP_API_KEY` token. It should succeed and return the list of registered Maximo tools:
```bash
curl -i -X POST https://mxm-mcp-server.biendongpoc.vn/mcp \
  -H "Authorization: Bearer your-highly-secure-mcp-token-here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```
**Expected response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "jsonrpc": "2.0",
  "result": {
    "tools": [
      {
        "name": "mcp_maximo-mcp_get_work_order",
        "description": "Fetch detailed information for a specific Maximo Work Order by its wonum.",
        ...
      },
      ...
    ]
  },
  "id": 1
}
```

### 3. Test Public Health Check Endpoint
Your health check is open and accessible publicly to verify service status easily:
```bash
curl -i https://mxm-mcp-server.biendongpoc.vn/health
```
**Expected response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "status": "ok"
}
```

---

## Step 6: Updating the Server (Redeployment)

When you develop and implement new tools or make updates to the Maximo MCP server, use the following steps to redeploy the server with zero or minimal downtime.

### 1. Sync Updated Project Files

**Option A — Git pull (recommended, if the server was set up via Step 1 Option A):**
```bash
cd /var/www/maximo-mcp
git status   # make sure there are no local edits that would conflict
git pull origin main
```
This updates every tracked file in one command — `src/`, `package.json`, `Dockerfile`, `docker-compose.yml`, and `nginx.conf` included. `.env` is git-ignored and is never touched.

**Option B — Manual copy:**
Copy the modified files from your development machine to the `/var/www/maximo-mcp` directory on the server. Don't assume only `src/` changed — check the actual diff of the release you're deploying. Commonly touched files:
* `src/` directory (tools, schemas, client updates, auth/OAuth logic)
* `package.json` and `package-lock.json` (if dependencies changed)
* `Dockerfile` and `docker-compose.yml` (if the container image or volumes changed)
* `nginx.conf` (if reverse-proxy behavior, headers, or CORS rules changed)

> [!IMPORTANT]
> If `nginx.conf` changed, copying it into `/var/www/maximo-mcp` alone does **nothing** — Nginx reads its config from `/etc/nginx/sites-available/mxm-mcp-server`. Re-copy it and reload, same as Step 4:
> ```bash
> sudo cp nginx.conf /etc/nginx/sites-available/mxm-mcp-server
> sudo nginx -t && sudo systemctl reload nginx
> ```

### 2. Rebuild and Restart the Container
Run the Docker Compose command with the `--build` flag. Docker will execute the multi-stage build, compile the new TypeScript tools inside the container, install any new dependencies, and replace the running container:

```bash
# Navigate to project directory
cd /var/www/maximo-mcp

# Build new image and restart the container in the background
docker compose up -d --build
```

> [!NOTE]
> Do **not** add `-v` to `docker compose down`/`up` during a redeploy — that flag deletes named volumes, including `dcr-data` (persisted DCR client registrations, see Step 3), forcing every already-connected MCP client to re-register.

### 3. Verify Container Startup
Check the real-time container logs to verify the TypeScript compilation succeeded and the server is listening:
```bash
docker compose logs -f
```
You should see output confirming the server registry registered the new tools:
```text
[registry] Registered 3 tool(s): search_work_orders, get_work_order, update_work_order_status
```

### 4. Verify Registered Tools Externally
Use `curl` on your development machine or the server to query the `tools/list` endpoint using your secure Bearer token. Ensure your new tools appear in the JSON response:

```bash
curl -i -X POST https://mxm-mcp-server.biendongpoc.vn/mcp \
  -H "Authorization: Bearer your-highly-secure-mcp-token-here" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/list", "id": 1}'
```

---

## Applying the OAuth Stability Update (Copilot Studio / Claude Desktop fixes)

If you're deploying commits `bb4d2f0` (`fix: resolve OAuth instability blocking Copilot Studio and Claude Desktop`) and `6b056b6` (`feat: persist DCR client registrations across restarts`) onto a server that was already running `AUTH_PROVIDER=entra-id`, follow Step 6 with these files in mind — all three changed:

* `src/index.ts` — `/authorize` no longer rejects the real Entra proxy `client_id` (fixes Copilot Studio "Manual" OAuth and Claude Desktop's "Advanced settings" static Client ID entry); `/token` no longer forwards the client's own `Authorization` header to Entra ID.
* `nginx.conf` — adds `proxy_hide_header` for `Access-Control-Allow-Origin`/`-Headers` on the OAuth location block, removing the duplicate CORS headers that made browsers silently reject `/register` responses (this was breaking Claude Desktop's connector setup).
* `Dockerfile` / `docker-compose.yml` — DCR client registrations are now persisted to the `dcr-data` volume so a container restart mid-login no longer produces `"Unknown client_id"` errors.

Redeploy checklist:
1. Sync files (Step 6.1) — **`git pull` covers all three; a manual copy must include `nginx.conf`, not just `src/`.**
2. Re-copy `nginx.conf` and reload Nginx (`sudo cp nginx.conf /etc/nginx/sites-available/mxm-mcp-server && sudo nginx -t && sudo systemctl reload nginx`) — skipping this leaves the duplicate-CORS bug in place even after the container is rebuilt.
3. `docker compose up -d --build` (without `-v`).
4. Confirm the new volume mounted and loaded any pre-existing registrations:
   ```bash
   docker compose logs | grep dcr
   ```
   On first boot with no prior registrations this is silent; after a client has registered at least once, you should see `[dcr] Loaded N persisted client registration(s) from ...` on subsequent restarts.
5. Re-test the connector from Copilot Studio and/or Claude Desktop end-to-end (sign-in should complete without an `invalid_client` / "Unknown client_id" error).
