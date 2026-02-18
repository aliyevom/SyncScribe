#!/bin/bash

# Renew SSL certificate for syncscribe.app
# This script renews the Let's Encrypt certificate and restarts containers
# Run this script on the VM where the certificate is installed

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DOMAIN="${1:-syncscribe.app}"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  SSL Certificate Renewal${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo "Domain: $DOMAIN"
echo ""

CERT_PATH="/etc/letsencrypt/live/$DOMAIN"

# Check if certificate exists (using sudo since certs are root-owned)
if ! sudo test -f "$CERT_PATH/fullchain.pem"; then
    echo -e "${RED}Error: Certificate not found at $CERT_PATH${NC}"
    echo "Please run the SSL setup script first: scripts/setup-https.sh"
    exit 1
fi

# Check certificate expiration
echo -e "${BLUE}Checking certificate expiration...${NC}"
EXPIRY_DATE=$(sudo openssl x509 -enddate -noout -in "$CERT_PATH/fullchain.pem" | cut -d= -f2)
EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y" "$EXPIRY_DATE" +%s 2>/dev/null || echo "0")
CURRENT_EPOCH=$(date +%s)
DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))

echo "Certificate expires: $EXPIRY_DATE"
echo "Days until expiry: $DAYS_UNTIL_EXPIRY"
echo ""

if [ $DAYS_UNTIL_EXPIRY -gt 30 ]; then
    echo -e "${GREEN}Certificate is still valid for $DAYS_UNTIL_EXPIRY days. No renewal needed.${NC}"
    exit 0
fi

# Stop containers to free ports 80 and 443
echo -e "${YELLOW}Stopping containers to free ports 80 and 443...${NC}"
cd ~/meeting-transcriber 2>/dev/null || cd /root/meeting-transcriber 2>/dev/null || {
    echo -e "${RED}Error: Could not find meeting-transcriber directory${NC}"
    exit 1
}
sudo docker-compose stop client server 2>/dev/null || true

# Wait a moment for ports to be released
sleep 3

# Renew certificate
echo -e "${BLUE}Renewing certificate...${NC}"
if sudo certbot renew --standalone --non-interactive --cert-name "$DOMAIN" 2>&1; then
    echo -e "${GREEN}✓ Certificate renewed successfully${NC}"
else
    echo -e "${YELLOW}Standard renewal failed, attempting force renewal...${NC}"
    
    # Get email from existing certificate or use default
    CERT_EMAIL=$(sudo certbot certificates 2>/dev/null | grep -A 5 "$DOMAIN" | grep 'Account Email' | awk '{print $3}' | head -1 || echo 'admin@syncscribe.app')
    
    # Try to obtain a new certificate with force renewal
    if sudo certbot certonly --standalone \
        -d "$DOMAIN" \
        --non-interactive \
        --agree-tos \
        --force-renewal \
        --email "$CERT_EMAIL" \
        --preferred-challenges http 2>&1; then
        echo -e "${GREEN}✓ Certificate obtained successfully${NC}"
    else
        echo -e "${RED}✗ Failed to renew certificate${NC}"
        # Restart containers anyway
        echo -e "${YELLOW}Restarting containers...${NC}"
        sudo docker-compose up -d
        exit 1
    fi
fi

# Restart containers
echo -e "${BLUE}Restarting containers...${NC}"
sudo docker-compose up -d

# Verify certificate
sleep 5
echo ""
echo -e "${BLUE}Verifying certificate...${NC}"
NEW_EXPIRY_DATE=$(sudo openssl x509 -enddate -noout -in "$CERT_PATH/fullchain.pem" | cut -d= -f2)
echo "New certificate expires: $NEW_EXPIRY_DATE"

# Test nginx config and reload
CLIENT_CONTAINER=$(sudo docker ps -q -f name=client)
if [ -n "$CLIENT_CONTAINER" ]; then
    if sudo docker exec "$CLIENT_CONTAINER" nginx -t 2>&1 | grep -q "successful"; then
        echo -e "${GREEN}✓ Nginx configuration is valid${NC}"
        # Reload nginx to pick up new certificate
        if sudo docker exec "$CLIENT_CONTAINER" nginx -s reload 2>/dev/null; then
            echo -e "${GREEN}✓ Nginx reloaded with new certificate${NC}"
        else
            echo -e "${YELLOW}Nginx reload failed, restarting container...${NC}"
            sudo docker-compose restart client
        fi
    else
        echo -e "${YELLOW}Nginx config test failed, restarting container...${NC}"
        sudo docker-compose restart client
    fi
else
    echo -e "${YELLOW}Warning: Client container not found${NC}"
fi

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  Certificate Renewal Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo "Certificate is now valid until: $NEW_EXPIRY_DATE"
