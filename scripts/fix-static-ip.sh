#!/bin/bash
# Fix: Assign static IP to VM so it never changes when stopping/starting

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

VM_NAME="syncscribe-vm"
ZONE="us-central1-a"
REGION="us-central1"
STATIC_IP_NAME="syncscribe-ip-regional"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Assign Static IP to VM${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Get current network interface name
echo -e "${YELLOW}Step 1: Getting VM network information...${NC}"
ACCESS_CONFIG=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].name)')
CURRENT_IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo "Current IP: $CURRENT_IP"
echo "Access Config Name: $ACCESS_CONFIG"
echo ""

# Check if static IP already exists
EXISTING_STATIC_IP=$(gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --format='get(address)' 2>/dev/null || echo "")

if [ -n "$EXISTING_STATIC_IP" ]; then
    STATIC_IP_ADDRESS="$EXISTING_STATIC_IP"
    echo -e "${GREEN}✓ Found existing static IP: $STATIC_IP_ADDRESS${NC}"
    
    # Check if it's already attached
    if [ "$CURRENT_IP" = "$STATIC_IP_ADDRESS" ]; then
        echo -e "${GREEN}✓ Static IP is already attached!${NC}"
        echo "Current IP: $CURRENT_IP"
        exit 0
    fi
else
    echo -e "${YELLOW}Step 2: Creating new static IP in region $REGION...${NC}"
    gcloud compute addresses create "$STATIC_IP_NAME" \
        --region="$REGION" \
        --description="Static IP for SyncScribe VM"
    
    STATIC_IP_ADDRESS=$(gcloud compute addresses describe "$STATIC_IP_NAME" --region="$REGION" --format='get(address)')
    echo -e "${GREEN}✓ Created static IP: $STATIC_IP_ADDRESS${NC}"
fi

echo ""
echo -e "${YELLOW}Step 3: Removing current ephemeral IP...${NC}"
gcloud compute instances delete-access-config "$VM_NAME" \
    --zone="$ZONE" \
    --access-config-name="$ACCESS_CONFIG" || {
    echo -e "${YELLOW}Note: Access config may not exist or already removed${NC}"
}

echo ""
echo -e "${YELLOW}Step 4: Attaching static IP...${NC}"
gcloud compute instances add-access-config "$VM_NAME" \
    --zone="$ZONE" \
    --access-config-name="$ACCESS_CONFIG" \
    --address="$STATIC_IP_ADDRESS"

echo ""
echo -e "${GREEN}✓ Static IP attached!${NC}"
echo ""
echo -e "${BLUE}New VM IP: ${STATIC_IP_ADDRESS}${NC}"
echo ""

# Verify the IP was attached
NEW_IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
if [ "$NEW_IP" = "$STATIC_IP_ADDRESS" ]; then
    echo -e "${GREEN}✓ Verified: Static IP is now attached${NC}"
    echo ""
    echo -e "${YELLOW}Next steps:${NC}"
    echo "1. Update DNS A record at Hostinger to: $STATIC_IP_ADDRESS"
    echo "2. Wait 5-15 minutes for DNS propagation"
    echo "3. Run: ./scripts/fix-dns.sh to verify"
    echo ""
    echo -e "${GREEN}After this, your IP will NEVER change, even when stopping/starting the VM!${NC}"
else
    echo -e "${RED}⚠ Warning: IP attachment may have failed${NC}"
    echo "Expected: $STATIC_IP_ADDRESS"
    echo "Got: $NEW_IP"
fi
echo ""

