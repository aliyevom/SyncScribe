#!/bin/bash

# Setup HTTPS for SyncScribe using Let's Encrypt
# This script configures SSL/TLS certificates for your domain

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  SyncScribe HTTPS Setup${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check if domain is provided
DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ]; then
    echo -e "${RED}Error: Domain name is required${NC}"
    echo ""
    echo "Usage: $0 <domain> <email>"
    echo "Example: $0 syncscribe.yourdomain.com admin@yourdomain.com"
    echo ""
    echo "Options:"
    echo "1. Use a custom domain (recommended for production)"
    echo "2. Use nip.io for testing: syncscribe.34-63-187-247.nip.io"
    echo ""
    exit 1
fi

if [ -z "$EMAIL" ]; then
    echo -e "${RED}Error: Email is required for Let's Encrypt${NC}"
    echo "Usage: $0 <domain> <email>"
    exit 1
fi

VM_NAME="${VM_NAME:-syncscribe-vm}"
ZONE="${ZONE:-us-central1-a}"
EXTERNAL_IP="${EXTERNAL_IP:-}"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Domain:      $DOMAIN"
echo "  Email:       $EMAIL"
echo "  External IP: $EXTERNAL_IP"
echo ""

read -p "Proceed with HTTPS setup? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Setup cancelled${NC}"
    exit 0
fi

# Upload SSL setup script
echo -e "${BLUE}Step 1: Creating SSL setup script...${NC}"
cat > /tmp/ssl-setup.sh << 'EOFSCRIPT'
#!/bin/bash
set -e

DOMAIN="$1"
EMAIL="$2"

echo "=== Installing Certbot ==="
sudo apt-get update
sudo apt-get install -y certbot

echo ""
echo "=== Stopping containers to free ports 80 and 443 ==="
cd ~/meeting-transcriber
sudo docker-compose stop

echo ""
echo "=== Obtaining SSL certificate ==="
sudo certbot certonly --standalone \
    -d "$DOMAIN" \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    --preferred-challenges http

echo ""
echo "=== Creating nginx SSL configuration ==="
cat > ~/meeting-transcriber/client/nginx-ssl.conf << 'EOF'
upstream syncscribe_server {
  server server:5002;
}

# HTTP to HTTPS redirect
server {
  listen 80;
  server_name _;
  return 301 https://$host$request_uri;
}

# HTTPS server
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name _;

  # SSL configuration
  ssl_certificate /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/DOMAIN_PLACEHOLDER/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;
  ssl_prefer_server_ciphers on;

  root /usr/share/nginx/html;
  index index.html;

  # Enable gzip compression
  gzip on;
  gzip_vary on;
  gzip_min_length 10240;
  gzip_proxied expired no-cache no-store private auth;
  gzip_types text/plain text/css text/xml text/javascript application/x-javascript application/xml+rss application/javascript application/json;

  # WebSocket proxy for Socket.IO
  location /socket.io/ {
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;
    proxy_cache_bypass $http_upgrade;
    proxy_pass http://syncscribe_server;
  }

  # Optional REST API proxy
  location /api/ {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://syncscribe_server;
  }

  # Cache static assets
  location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|woff|woff2|ttf|eot|map)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  # Serve index.html only via internal redirects
  location = /index.html { 
    internal;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
  }

  # SPA routing
  location / {
    try_files $uri $uri/ /index.html$is_args$args;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
  }

  # Security headers
  add_header X-Frame-Options "SAMEORIGIN" always;
  add_header X-Content-Type-Options "nosniff" always;
  add_header X-XSS-Protection "1; mode=block" always;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
EOF

# Replace domain placeholder
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" ~/meeting-transcriber/client/nginx-ssl.conf

echo ""
echo "=== Updating docker-compose.yml for SSL ==="
# Backup original
cp ~/meeting-transcriber/docker-compose.yml ~/meeting-transcriber/docker-compose.yml.bak

# Update docker-compose to use SSL config and mount certificates
cat > ~/meeting-transcriber/docker-compose-ssl.yml << 'EOF'
version: '3.8'

services:
  server:
    build:
      context: .
      dockerfile: Dockerfile.server
    container_name: syncscribe-server
    ports:
      - "5002:5002"
    environment:
      - NODE_ENV=production
      - PORT=5002
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DEEPGRAM_API_KEY=${DEEPGRAM_API_KEY}
      - ASSEMBLYAI_API_KEY=${ASSEMBLYAI_API_KEY}
    volumes:
      - ./server/team-data.json:/app/server/team-data.json:ro
      - ./server/meeting-tags.json:/app/server/meeting-tags.json:ro
      - ./server/knowledge:/app/server/knowledge:ro
    restart: unless-stopped
    networks:
      - syncscribe-network
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:5002/healthz', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  client:
    build:
      context: .
      dockerfile: Dockerfile.client.ssl
      args:
        - REACT_APP_SERVER_URL=https://DOMAIN_PLACEHOLDER:5002
    container_name: syncscribe-client
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /etc/letsencrypt:/etc/letsencrypt:ro
      - ./client/nginx-ssl.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - server
    restart: unless-stopped
    networks:
      - syncscribe-network

networks:
  syncscribe-network:
    driver: bridge
EOF

sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" ~/meeting-transcriber/docker-compose-ssl.yml

echo ""
echo "=== Starting services with SSL ==="
sudo docker-compose -f docker-compose-ssl.yml up -d

echo ""
echo "✅ SSL Setup Complete!"
echo ""
echo "Your application is now available at:"
echo "  https://$DOMAIN"
echo ""
echo "Note: SSL certificate will auto-renew via certbot"

EOFSCRIPT

gcloud compute scp /tmp/ssl-setup.sh "$VM_NAME":~/ --zone="$ZONE"
rm /tmp/ssl-setup.sh

echo -e "${GREEN}✓ SSL setup script uploaded${NC}"

# Run the SSL setup
echo -e "${BLUE}Step 2: Running SSL setup on VM...${NC}"
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
  chmod +x ~/ssl-setup.sh
  ~/ssl-setup.sh '$DOMAIN' '$EMAIL'
"

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  HTTPS Setup Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "${BLUE}Your application is now available at:${NC}"
echo "  https://$DOMAIN"
echo ""
echo -e "${YELLOW}Note: DNS must be pointing to $EXTERNAL_IP${NC}"
echo ""

