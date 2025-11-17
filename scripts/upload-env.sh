#!/bin/bash
# Helper script to securely upload .env file to VM
# This preserves your API keys without committing them to Git

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

VM_NAME="${VM_NAME:-syncscribe-vm}"
ZONE="${ZONE:-us-central1-a}"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Upload .env file to VM${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check if .env file exists locally
if [ ! -f ".env" ]; then
    echo -e "${RED}Error: .env file not found in current directory${NC}"
    echo -e "${YELLOW}Please run this script from the project root where .env exists${NC}"
    exit 1
fi

echo -e "${YELLOW}Uploading .env file to VM...${NC}"
echo "VM: $VM_NAME"
echo "Zone: $ZONE"
echo ""

# Upload .env file
gcloud compute scp --zone="$ZONE" .env "$VM_NAME":~/meeting-transcriber/.env

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ .env file uploaded successfully${NC}"
    echo ""
    echo -e "${YELLOW}Verifying upload...${NC}"
    gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command "
        if [ -f ~/meeting-transcriber/.env ]; then
            echo '✓ .env file exists on VM'
            echo 'File size:'
            ls -lh ~/meeting-transcriber/.env | awk '{print \$5}'
            echo ''
            echo 'To restart containers with new environment variables, run:'
            echo '  cd ~/meeting-transcriber && sudo docker-compose down && sudo docker-compose up -d'
        else
            echo '❌ .env file not found on VM'
            exit 1
        fi
    "
    echo ""
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}  Upload Complete${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "  1. Restart containers to load new environment variables:"
    echo "     ./scripts/deploy-online.sh"
    echo "  OR manually:"
    echo "     gcloud compute ssh $VM_NAME --zone=$ZONE --command='cd ~/meeting-transcriber && sudo docker-compose restart'"
else
    echo -e "${RED}❌ Failed to upload .env file${NC}"
    exit 1
fi

