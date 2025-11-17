#!/bin/bash
# Script 2: Make application offline (Zero cost in GCP)
# Stops all containers and optionally stops the VM to save costs

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

VM_NAME="${VM_NAME:-syncscribe-vm}"
ZONE="${ZONE:-us-central1-a}"
STOP_VM="${STOP_VM:-false}"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  SyncScribe Offline Mode${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Stop containers
echo -e "${YELLOW}Step 1: Stopping containers...${NC}"
# Use --quiet to avoid SSH key prompts, and --impersonate-service-account if set
SSH_OPTS="--zone=$ZONE --quiet"
if [ -n "$CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT" ]; then
    SSH_OPTS="$SSH_OPTS --impersonate-service-account=$CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT"
fi
gcloud compute ssh "$VM_NAME" $SSH_OPTS --command '
    # Find docker-compose.yml location
    if [ -f ~/meeting-transcriber/docker-compose.yml ]; then
        cd ~/meeting-transcriber
    elif [ -f ~/docker-compose.yml ]; then
        cd ~
    else
        # Try to find docker-compose.yml
        COMPOSE_DIR=$(find ~ -name docker-compose.yml -type f 2>/dev/null | head -1 | xargs dirname)
        if [ -n "$COMPOSE_DIR" ]; then
            cd "$COMPOSE_DIR"
        else
            echo "Error: Could not find docker-compose.yml"
            exit 1
        fi
    fi &&
    sudo docker-compose down &&
    echo "✓ Containers stopped"
'

echo -e "${GREEN}✓ Application is now offline${NC}"

# Ask if user wants to stop the VM (saves more money)
# Skip prompt if STOP_VM env var is set (for CI/CD)
if [ "$STOP_VM" = "true" ]; then
    REPLY="y"
else
    echo ""
    read -p "Do you want to STOP the VM to save costs? (y/N): " -n 1 -r
    echo
fi

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Step 2: Stopping VM...${NC}"
    gcloud compute instances stop "$VM_NAME" --zone="$ZONE"
    echo -e "${GREEN}✓ VM stopped - Zero cost mode activated${NC}"
    echo ""
    echo -e "${YELLOW}Note: To bring the application back online, run:${NC}"
    echo "  ./scripts/deploy-online.sh"
else
    echo -e "${YELLOW}VM is still running (you'll be charged for compute time)${NC}"
    echo -e "${YELLOW}Containers are stopped - application is offline${NC}"
fi

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  Application Offline${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

