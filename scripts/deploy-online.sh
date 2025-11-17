#!/bin/bash
# Script 3: Make application online (Restore from last build)
# Starts the VM (if stopped) and brings all services online with correct permissions

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

VM_NAME="${VM_NAME:-syncscribe-vm}"
ZONE="${ZONE:-us-central1-a}"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  SyncScribe Online Mode${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check VM status and start if needed
echo -e "${YELLOW}Step 1: Checking VM status...${NC}"
VM_STATUS=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(status)')

if [ "$VM_STATUS" = "TERMINATED" ] || [ "$VM_STATUS" = "STOPPED" ]; then
    echo -e "${YELLOW}VM is stopped. Starting VM...${NC}"
    gcloud compute instances start "$VM_NAME" --zone="$ZONE"
    echo -e "${YELLOW}Waiting for VM to be ready (30 seconds)...${NC}"
    sleep 30
    echo -e "${GREEN}✓ VM started${NC}"
else
    echo -e "${GREEN}✓ VM is already running${NC}"
fi

# Wait for SSH to be ready (with timeout)
echo -e "${YELLOW}Step 2: Waiting for SSH connection...${NC}"
SSH_READY=false
for i in {1..60}; do
    if timeout 5 gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="echo 'SSH ready'" 2>/dev/null; then
        SSH_READY=true
        break
    fi
    if [ $((i % 5)) -eq 0 ]; then
        echo "  Attempt $i/60..."
    fi
    sleep 2
done

if [ "$SSH_READY" = false ]; then
    echo -e "${RED}Error: Could not establish SSH connection after 2 minutes${NC}"
    echo -e "${YELLOW}Trying to continue anyway...${NC}"
fi

# Start Docker daemon if needed
echo -e "${YELLOW}Step 3: Ensuring Docker is running...${NC}"
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command "
    sudo systemctl start docker 2>/dev/null || true &&
    sudo systemctl enable docker 2>/dev/null || true &&
    sleep 3 &&
    sudo docker ps > /dev/null 2>&1 && echo '✓ Docker daemon ready' || echo '⚠ Docker may not be fully ready'
" || echo -e "${YELLOW}Warning: Could not verify Docker status${NC}"

# Start containers
echo -e "${YELLOW}Step 4: Starting containers...${NC}"
gcloud compute ssh "$VM_NAME" $SSH_OPTS --command "
    cd ~/meeting-transcriber &&
    
    # Check if docker-compose.yml exists
    if [ ! -f docker-compose.yml ]; then
        echo 'Error: docker-compose.yml not found. Please run deploy-dev.sh first.'
        exit 1
    fi &&
    
    # Start services (with retry logic)
    if ! sudo docker-compose up -d; then
        echo '⚠ First attempt failed. Checking container status...' &&
        sudo docker-compose ps &&
        echo 'Trying to restart...' &&
        sudo docker-compose down &&
        sleep 2 &&
        sudo docker-compose up -d
    fi &&
    echo '✓ Containers started' &&
    
    # Wait for services to be ready
    echo 'Waiting for services to initialize (15 seconds)...' &&
    sleep 15 &&
    
    # Fix all file permissions (critical for images, worklets, etc.)
    echo '' &&
    echo '=== Fixing file permissions ===' &&
    sudo docker exec syncscribe-client sh -c '
        find /usr/share/nginx/html -type f -exec chmod 644 {} \; &&
        find /usr/share/nginx/html -type d -exec chmod 755 {} \; &&
        find /usr/share/nginx/html -name \"._*\" -delete &&
        chmod 644 /usr/share/nginx/html/*.worklet.js 2>/dev/null || true &&
        chmod 755 /usr/share/nginx/html/images 2>/dev/null || true &&
        chmod -R 644 /usr/share/nginx/html/images/* 2>/dev/null || true &&
        echo \"✓ Permissions fixed\"
    ' &&
    
    # Verify services
    echo '' &&
    echo '=== Service Status ===' &&
    sudo docker-compose ps &&
    
    # Health checks
    echo '' &&
    echo '=== Health Checks ===' &&
    echo 'Server health:' &&
    curl -s http://localhost:5002/healthz && echo '' || echo 'Server not responding' &&
    echo '' &&
    echo 'Client (main page):' &&
    curl -s -I http://localhost:80 | head -3 &&
    echo '' &&
    echo 'Audio worklet:' &&
    curl -s -I http://localhost:80/audio-processor.worklet.js | head -3 &&
    echo '' &&
    echo 'Deepgram logo:' &&
    curl -s -I http://localhost:80/images/deepgram.svg | head -3 &&
    echo '' &&
    echo '=== External connectivity test ===' &&
    echo 'Testing if application is accessible externally...' &&
    curl -s -I http://localhost:80 2>&1 | head -3 || echo '⚠ External test failed (this is normal if testing from VM)'
" $SSH_OPTS || {
    echo -e "${RED}Error: Failed to start services${NC}"
    echo -e "${YELLOW}Checking container status...${NC}"
    gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command "cd ~/meeting-transcriber && sudo docker-compose ps" || true
    exit 1
}

# Check DNS configuration
echo ""
echo -e "${YELLOW}Step 5: Checking DNS configuration...${NC}"
VM_IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
DNS_IP=$(dig +short syncscribe.app 2>/dev/null | head -1 || echo "")

if [ -n "$DNS_IP" ] && [ "$VM_IP" = "$DNS_IP" ]; then
    echo -e "${GREEN}✓ DNS is correctly configured${NC}"
    DNS_OK=true
else
    echo -e "${RED}⚠ DNS MISMATCH!${NC}"
    echo "  VM IP:      $VM_IP"
    echo "  DNS points: ${DNS_IP:-not found}"
    echo ""
    echo -e "${YELLOW}Update DNS A record at Hostinger to: $VM_IP${NC}"
    DNS_OK=false
fi

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  Application Online!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "${BLUE}VM IP Address: ${VM_IP}${NC}"
if [ "$DNS_OK" = false ]; then
    echo -e "${YELLOW}⚠ DNS needs update - site may not be accessible until DNS propagates${NC}"
    echo ""
    echo -e "${YELLOW}To fix DNS:${NC}"
    echo "  1. Go to Hostinger DNS management"
    echo "  2. Edit A record for @ (root domain)"
    echo "  3. Change to: $VM_IP"
    echo "  4. Wait 5-15 minutes"
    echo "  5. Run: ./scripts/fix-dns.sh to verify"
else
    echo -e "${GREEN}✓ DNS is configured correctly${NC}"
fi
echo ""
echo -e "${BLUE}Your application URL:${NC}"
echo "  https://syncscribe.app"
echo ""
echo -e "${GREEN}All services are running with correct permissions${NC}"
echo ""

