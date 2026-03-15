#!/usr/bin/env bash
# Deploy plot-compare to an Ubuntu server.
# Run this ON the server as root (handles both first-time setup and updates).
#
# Usage:
#   git clone <repo-url> /var/www/plot-compare
#   cd /var/www/plot-compare && sudo bash deploy/deploy.sh [your-domain.com]

set -euo pipefail

DOMAIN="${1:-}"
APP_NAME="plot-compare"
APP_DIR="/var/www/$APP_NAME"
APP_PORT=3000
SERVICE_NAME="$APP_NAME"

if [[ -n "$DOMAIN" ]]; then
  SERVER_NAME="${DOMAIN} www.${DOMAIN}"
else
  SERVER_NAME="_"
fi

echo "=================================================="
echo "  Plot Compare — Deploy"
[[ -n "$DOMAIN" ]] && echo "  Domain: $DOMAIN"
echo "  App directory: $APP_DIR"
echo "=================================================="

if [[ $EUID -ne 0 ]]; then
  echo "error: run as root (sudo bash deploy/deploy.sh)" >&2
  exit 1
fi

if [[ ! -f "$APP_DIR/.env.local" ]]; then
  echo "error: $APP_DIR/.env.local not found." >&2
  echo "       Create it with your API keys before deploying:" >&2
  echo "         ANTHROPIC_API_KEY=sk-ant-..." >&2
  echo "         OPENAI_API_KEY=sk-..." >&2
  echo "         XAI_API_KEY=xai-..." >&2
  exit 1
fi

# -- 0. Swap (prevents OOM kills during npm ci / next build on small servers) --
if [[ ! -f /swapfile ]]; then
  echo "Creating 2GB swapfile..."
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap enabled: $(free -h | awk '/Swap/{print $2}')"
else
  echo "Swap already exists — skipping."
fi

# -- 1. System packages -------------------------------------------------------
echo ""
echo "[1/5] Installing system packages..."
apt-get update -qq
apt-get install -y curl git nginx ufw certbot python3-certbot-nginx

# -- 2. Node.js (via nvm — won't touch other Node versions on the server) ------
echo ""
echo "[2/5] Installing Node.js 20 via nvm..."
export NVM_DIR="/root/.nvm"
if [[ ! -d "$NVM_DIR" ]]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
source "$NVM_DIR/nvm.sh"
nvm install 20
nvm use 20
NODE_BIN="$(which node)"
NPM_BIN="$(which npm)"
echo "Node: $($NODE_BIN --version)  npm: $($NPM_BIN --version)"

# -- 3. Build -----------------------------------------------------------------
echo ""
echo "[3/5] Building app..."
cd "$APP_DIR"
$NPM_BIN ci
NODE_ENV=production $NPM_BIN run build

# -- 4. Systemd service -------------------------------------------------------
echo ""
echo "[4/5] Installing systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Plot Compare Next.js app
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
ExecStart=$NODE_BIN node_modules/.bin/next start --port $APP_PORT
Restart=always
RestartSec=5
EnvironmentFile=$APP_DIR/.env.local
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}
echo "Service status:"
systemctl --no-pager status ${SERVICE_NAME} | head -5

# -- 5. Nginx & SSL -----------------------------------------------------------
echo ""
echo "[5/5] Configuring nginx and firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

NGINX_CONF="/etc/nginx/sites-available/${SERVICE_NAME}"

if [[ ! -f "$NGINX_CONF" ]]; then
  echo "Writing nginx config..."
  cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    server_name ${SERVER_NAME};

    location /_next/static/ {
        alias $APP_DIR/.next/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /public/ {
        alias $APP_DIR/public/;
        expires 1d;
    }

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
        client_max_body_size 10M;
    }
}
EOF
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/
  rm -f /etc/nginx/sites-enabled/default
else
  echo "nginx config already exists — skipping write (preserving any SSL config)."
fi

nginx -t && systemctl reload nginx

if [[ -n "$DOMAIN" ]]; then
  echo ""
  echo "Requesting SSL certificate..."
  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email || {
    echo "WARNING: certbot failed. Run manually:"
    echo "  certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}"
  }
fi

# -- Done ---------------------------------------------------------------------
echo ""
echo "=================================================="
if [[ -n "$DOMAIN" ]]; then
  echo "  Deployed to https://${DOMAIN}"
else
  echo "  Deployed successfully!"
  echo "  App running at http://127.0.0.1:$APP_PORT"
fi
echo ""
echo "  Service:  systemctl status ${SERVICE_NAME}"
echo "  Logs:     journalctl -u ${SERVICE_NAME} -f"
echo "  Update:   cd $APP_DIR && git pull && sudo bash deploy/deploy.sh${DOMAIN:+ $DOMAIN}"
echo "=================================================="
