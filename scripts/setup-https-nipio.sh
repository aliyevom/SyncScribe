#!/bin/bash

# Quick HTTPS setup using nip.io and self-signed certificate
# For testing screen sharing - works immediately, no domain needed!

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

VM_NAME="${VM_NAME:-syncscribe-vm}"
ZONE="${ZONE:-us-central1-a}"
EXTERNAL_IP="${EXTERNAL_IP:-}"

# Get IP if not provided
if [ -z "$EXTERNAL_IP" ]; then
    EXTERNAL_IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null || echo "")
    if [ -z "$EXTERNAL_IP" ]; then
        echo -e "${RED}Error: Could not determine VM external IP. Please set EXTERNAL_IP environment variable.${NC}"
        exit 1
    fi
fi

# nip.io domain (automatically resolves to your IP)
NIP_IP=$(echo "$EXTERNAL_IP" | tr '.' '-')
NIP_DOMAIN="syncscribe.${NIP_IP}.nip.io"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Quick HTTPS Setup with nip.io${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo -e "${YELLOW}This will enable HTTPS using:${NC}"
echo "  Domain: $NIP_DOMAIN"
echo "  (automatically points to $EXTERNAL_IP)"
echo ""
echo -e "${YELLOW}Note: Uses self-signed certificate${NC}"
echo "  You'll see a browser warning - click 'Advanced' and 'Proceed'"
echo ""

read -p "Continue? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
fi

echo -e "${BLUE}Setting up HTTPS...${NC}"

gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
set -e
cd ~/meeting-transcriber

echo '=== Creating self-signed SSL certificate ==='
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/nginx-selfsigned.key \
  -out /etc/nginx/ssl/nginx-selfsigned.crt \
  -subj '/C=US/ST=State/L=City/O=SyncScribe/CN=$NIP_DOMAIN'

echo ''
echo '=== Creating HTTPS nginx configuration ==='
cat > ~/meeting-transcriber/client/nginx-https.conf << 'EOF'
upstream syncscribe_server {
  server server:5002;
}

# HTTP to HTTPS redirect
server {
  listen 80;
  server_name _;
  return 301 https://\$host\$request_uri;
}

# HTTPS server
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name _;

  # Self-signed SSL
  ssl_certificate /etc/nginx/ssl/nginx-selfsigned.crt;
  ssl_certificate_key /etc/nginx/ssl/nginx-selfsigned.key;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;

  root /usr/share/nginx/html;
  index index.html;

  # Gzip
  gzip on;
  gzip_vary on;
  gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;

  # WebSocket proxy
  location /socket.io/ {
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection \"upgrade\";
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_buffering off;
    proxy_cache_bypass \$http_upgrade;
    proxy_pass http://syncscribe_server;
  }

  # API proxy
  location /api/ {
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_pass http://syncscribe_server;
  }

  # Static files cache
  location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot|map)$ {
    expires 1y;
    add_header Cache-Control \"public, immutable\";
  }

  location = /index.html { 
    internal;
    add_header Cache-Control \"no-cache\";
  }

  location / {
    try_files \$uri \$uri/ /index.html\$is_args\$args;
  }

  # Security headers
  add_header X-Frame-Options \"SAMEORIGIN\" always;
  add_header X-Content-Type-Options \"nosniff\" always;
}
EOF

echo ''
echo '=== Updating .env for HTTPS ==='
sed -i 's|REACT_APP_SERVER_URL=.*|REACT_APP_SERVER_URL=https://$NIP_DOMAIN:5002|g' .env

echo ''
echo '=== Stopping services ==='
sudo docker-compose down

echo ''
echo '=== Updating docker-compose for HTTPS ==='
cat > docker-compose.override.yml << 'EOFOVERRIDE'
version: '3.8'
services:
  client:
    volumes:
      - /etc/nginx/ssl:/etc/nginx/ssl:ro
      - ./client/nginx-https.conf:/etc/nginx/conf.d/default.conf:ro
EOFOVERRIDE

echo ''
echo '=== Rebuilding client with new URL ==='
sudo docker-compose build client

echo ''
echo '=== Starting services ==='
sudo docker-compose up -d

echo ''
echo '=== Waiting for services to start ==='
sleep 15

echo ''
echo '=== Status ==='
sudo docker-compose ps
"

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  HTTPS Setup Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "${BLUE}Access your application:${NC}"
echo "  https://$NIP_DOMAIN"
echo ""
echo -e "${YELLOW}⚠️  Browser Security Warning:${NC}"
echo "  You'll see a 'Not Secure' warning because we're using a self-signed certificate"
echo "  Click 'Advanced' → 'Proceed to site' to continue"
echo "  This is safe for testing - for production, use a real domain and Let's Encrypt"
echo ""
echo -e "${BLUE}After accepting the certificate:${NC}"
echo "  ✅ Screen sharing will work"
echo "  ✅ Microphone access will work"
echo "  ✅ All browser features enabled"
echo ""

