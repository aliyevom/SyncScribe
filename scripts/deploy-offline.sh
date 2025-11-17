#!/bin/bash
# Script 2: Make application offline (Zero cost in GCP)
# Stops all containers and optionally stops the VM to save costs

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

VM_NAME="syncscribe-vm"
ZONE="us-central1-a"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  SyncScribe Offline Mode${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Stop containers
echo -e "${YELLOW}Step 1: Stopping containers...${NC}"
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command "
    cd ~/meeting-transcriber &&
    sudo docker-compose down &&
    echo '✓ Containers stopped'
"

echo -e "${GREEN}✓ Application is now offline${NC}"

# Ask if user wants to stop the VM (saves more money)
echo ""
read -p "Do you want to STOP the VM to save costs? (y/N): " -n 1 -r
echo
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

