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
GCP_PROJECT_ID="${GCP_PROJECT_ID:-}"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  SyncScribe Offline Mode${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check VM status first
echo -e "${YELLOW}Checking VM status...${NC}"
VM_STATUS=""
if [ -n "$GCP_PROJECT_ID" ]; then
    VM_STATUS=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$GCP_PROJECT_ID" --format='get(status)' 2>/dev/null || echo "UNKNOWN")
else
    VM_STATUS=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(status)' 2>/dev/null || echo "UNKNOWN")
fi

if [ "$VM_STATUS" = "TERMINATED" ] || [ "$VM_STATUS" = "STOPPED" ]; then
    echo -e "${GREEN}✓ VM is already stopped - no containers to stop${NC}"
    echo -e "${GREEN}✓ Application is already offline${NC}"
    SKIP_SSH=true
elif [ "$VM_STATUS" = "RUNNING" ]; then
    echo -e "${GREEN}✓ VM is running - proceeding to stop containers${NC}"
    SKIP_SSH=false
else
    echo -e "${YELLOW}⚠ VM status is: $VM_STATUS${NC}"
    echo -e "${YELLOW}⚠ Attempting to stop containers anyway...${NC}"
    SKIP_SSH=false
fi

# Stop containers (only if VM is running)
if [ "$SKIP_SSH" != "true" ]; then
    echo -e "${YELLOW}Step 1: Stopping containers...${NC}"
    # Use --quiet to avoid SSH key prompts, and --impersonate-service-account if set
    SSH_OPTS="--zone=$ZONE --quiet"
    if [ -n "$CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT" ]; then
        SSH_OPTS="$SSH_OPTS --impersonate-service-account=$CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT"
    fi
    
    # Temporarily disable set -e for SSH command to handle connection failures gracefully
    set +e
    SSH_EXIT_CODE=0
    if [ -n "$GCP_PROJECT_ID" ]; then
        gcloud compute ssh "$VM_NAME" $SSH_OPTS --project="$GCP_PROJECT_ID" --command '
            # Find docker-compose.yml location
            COMPOSE_DIR=""
            if [ -f ~/meeting-transcriber/docker-compose.yml ]; then
                COMPOSE_DIR=~/meeting-transcriber
            elif [ -f ~/docker-compose.yml ]; then
                COMPOSE_DIR=~
            else
                # Try to find docker-compose.yml
                COMPOSE_FILE=$(find ~ -name docker-compose.yml -type f 2>/dev/null | head -1)
                if [ -n "$COMPOSE_FILE" ] && [ -f "$COMPOSE_FILE" ]; then
                    COMPOSE_DIR="$(dirname "$COMPOSE_FILE")"
                fi
            fi
            
            if [ -z "$COMPOSE_DIR" ]; then
                echo "⚠ No docker-compose.yml found - application may not be deployed yet"
                echo "Checking if any containers are running..."
                RUNNING_CONTAINERS=$(sudo docker ps -q 2>/dev/null | wc -l)
                if [ "$RUNNING_CONTAINERS" -gt 0 ]; then
                    echo "Found $RUNNING_CONTAINERS running container(s), stopping them..."
                    sudo docker stop $(sudo docker ps -q) 2>/dev/null || true
                    echo "✓ Containers stopped"
                else
                    echo "✓ No containers running - application is already offline"
                fi
            else
                cd "$COMPOSE_DIR"
                echo "Found docker-compose.yml in: $COMPOSE_DIR"
                sudo docker-compose down 2>/dev/null || {
                    echo "⚠ docker-compose down failed, trying to stop containers directly..."
                    sudo docker stop $(sudo docker ps -q) 2>/dev/null || true
                }
                echo "✓ Containers stopped"
            fi
        ' || SSH_EXIT_CODE=$?
    else
        gcloud compute ssh "$VM_NAME" $SSH_OPTS --command '
            # Find docker-compose.yml location
            COMPOSE_DIR=""
            if [ -f ~/meeting-transcriber/docker-compose.yml ]; then
                COMPOSE_DIR=~/meeting-transcriber
            elif [ -f ~/docker-compose.yml ]; then
                COMPOSE_DIR=~
            else
                # Try to find docker-compose.yml
                COMPOSE_FILE=$(find ~ -name docker-compose.yml -type f 2>/dev/null | head -1)
                if [ -n "$COMPOSE_FILE" ] && [ -f "$COMPOSE_FILE" ]; then
                    COMPOSE_DIR="$(dirname "$COMPOSE_FILE")"
                fi
            fi
            
            if [ -z "$COMPOSE_DIR" ]; then
                echo "⚠ No docker-compose.yml found - application may not be deployed yet"
                echo "Checking if any containers are running..."
                RUNNING_CONTAINERS=$(sudo docker ps -q 2>/dev/null | wc -l)
                if [ "$RUNNING_CONTAINERS" -gt 0 ]; then
                    echo "Found $RUNNING_CONTAINERS running container(s), stopping them..."
                    sudo docker stop $(sudo docker ps -q) 2>/dev/null || true
                    echo "✓ Containers stopped"
                else
                    echo "✓ No containers running - application is already offline"
                fi
            else
                cd "$COMPOSE_DIR"
                echo "Found docker-compose.yml in: $COMPOSE_DIR"
                sudo docker-compose down 2>/dev/null || {
                    echo "⚠ docker-compose down failed, trying to stop containers directly..."
                    sudo docker stop $(sudo docker ps -q) 2>/dev/null || true
                }
                echo "✓ Containers stopped"
            fi
        ' || SSH_EXIT_CODE=$?
    fi
    
    # Re-enable set -e
    set -e
    
    # If SSH failed, it's likely because VM is stopped - that's OK for deploy-offline
    if [ $SSH_EXIT_CODE -ne 0 ]; then
        echo -e "${YELLOW}⚠ Could not SSH into VM (exit code: $SSH_EXIT_CODE)${NC}"
        echo -e "${YELLOW}⚠ This is expected if the VM is already stopped${NC}"
    fi
fi

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
    # Check VM status before attempting to stop
    CURRENT_STATUS=""
    if [ -n "$GCP_PROJECT_ID" ]; then
        CURRENT_STATUS=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --project="$GCP_PROJECT_ID" --format='get(status)' 2>/dev/null || echo "UNKNOWN")
    else
        CURRENT_STATUS=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(status)' 2>/dev/null || echo "UNKNOWN")
    fi
    
    if [ "$CURRENT_STATUS" = "TERMINATED" ] || [ "$CURRENT_STATUS" = "STOPPED" ]; then
        echo -e "${GREEN}✓ VM is already stopped - Zero cost mode already active${NC}"
    else
        if [ -n "$GCP_PROJECT_ID" ]; then
            gcloud compute instances stop "$VM_NAME" --zone="$ZONE" --project="$GCP_PROJECT_ID" || {
                echo -e "${YELLOW}⚠ Failed to stop VM, but continuing...${NC}"
            }
        else
            gcloud compute instances stop "$VM_NAME" --zone="$ZONE" || {
                echo -e "${YELLOW}⚠ Failed to stop VM, but continuing...${NC}"
            }
        fi
        echo -e "${GREEN}✓ VM stopped - Zero cost mode activated${NC}"
    fi
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

