# Ubuntu Deployment Guide: Maximo MCP Server

This guide describes the step-by-step process of deploying your containerized Maximo Model Context Protocol (MCP) server to an Ubuntu host, securing it behind an Nginx Reverse Proxy, and configuring Let's Encrypt SSL certificates.

---

## Prerequisites (Ubuntu Server Setup)

SSH into your Ubuntu server and run the following commands to ensure all system software, Docker, Nginx, and Certbot are installed.

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

### 3. Install Nginx & Certbot
```bash
# Install Nginx
sudo apt install -y nginx

# Install Certbot and its Nginx integration
sudo apt install -y certbot python3-certbot-nginx

# Start and enable Nginx
sudo systemctl enable --now nginx
```

---

## Step 1: Copy Project Files to the Server

Create a folder on your Ubuntu server (for example: `/var/www/maximo-mcp`) and upload the project files there. 

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

---

## Step 4: Configure Nginx & SSL

### 1. Copy the Nginx Configuration
Copy the provided `nginx.conf` from your project folder into Nginx’s configuration structure:
```bash
sudo cp nginx.conf /etc/nginx/sites-available/mxm-mcp-server
```

### 2. Enable the Site
Create a symbolic link in the `sites-enabled` directory:
```bash
sudo ln -s /etc/nginx/sites-available/mxm-mcp-server /etc/nginx/sites-enabled/
```

### 3. Obtain Let's Encrypt SSL Certificate
Run Certbot to request an SSL certificate. Certbot will verify your domain ownership and automatically inject the standard SSL directives:
```bash
sudo certbot --nginx -d mxm-mcp-server.biendongpoc.vn
```
*Follow the interactive instructions on the CLI. Once finished, Certbot will update `/etc/nginx/sites-available/mxm-mcp-server` with the paths to the generated certificates.*

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

## Step 6: Setup Auto-Renewal for SSL Certificates

Let's Encrypt certificates are valid for 90 days. Certbot installs an automated systemd timer to renew certificates. To verify that renewal works:
```bash
sudo certbot renew --dry-run
```
If this completes with no errors, your SSL renewal is fully automated and secure!
