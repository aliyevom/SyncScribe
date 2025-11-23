#!/bin/bash
# Script 1: Deploy latest code changes (Development Deployment)
# This script syncs your latest code and rebuilds/deploys the application
# Allows checking page source and viewing changes immediately

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

VM_NAME="syncscribe-vm"
ZONE="us-central1-a"
PROJECT_ROOT="/Users/aliyevom/Documents/@SYNC[latest]/@SyncScribe/meeting-transcriber"

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  SyncScribe Development Deployment${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check if we're in the project root
if [ ! -f "package.json" ] || [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}Error: Must run from project root directory${NC}"
    exit 1
fi

# Create temporary archive excluding unnecessary files
echo -e "${YELLOW}Step 1: Creating deployment archive...${NC}"

# Create a temporary combined .env file for deployment
echo "Generating .env for deployment..."
> .env.deploy
if [ -f ".env" ]; then cat .env >> .env.deploy; echo "" >> .env.deploy; fi
if [ -f "server/.env" ]; then cat server/.env >> .env.deploy; echo "" >> .env.deploy; fi

# Extract GCS credentials from key.json if available and not in .env
if [ -f "client/key.json" ]; then
    if ! grep -q "GCS_CLIENT_EMAIL" .env.deploy; then
        echo "Extracting GCS credentials from client/key.json..."
        # Simple extraction using grep/sed/awk (assuming standard JSON format)
        CLIENT_EMAIL=$(grep '"client_email":' client/key.json | cut -d'"' -f4)
        # Extract private key (handling newlines is tricky in shell, use node)
        PRIVATE_KEY=$(node -e "console.log(require('./client/key.json').private_key.replace(/\n/g, '\\\\n'))")
        
        echo "GCS_CLIENT_EMAIL=$CLIENT_EMAIL" >> .env.deploy
        echo "GCS_PRIVATE_KEY=\"$PRIVATE_KEY\"" >> .env.deploy
    fi
fi

# Add build-time variables
echo "REACT_APP_SERVER_URL=https://syncscribe.app" >> .env.deploy
echo "REACT_APP_RAG_PASSWORD=apple" >> .env.deploy

TMP_ARCHIVE="/tmp/syncscribe-dev-$(date +%s).tar.gz"
tar czf "$TMP_ARCHIVE" \
    --exclude '.git' \
    --exclude 'node_modules' \
    --exclude 'client/node_modules' \
    --exclude 'server/node_modules' \
    --exclude 'client/build' \
    --exclude '.k8s-tmp' \
    --exclude '.env' \
    --exclude 'server/.env' \
    --exclude 'client/.env' \
    --exclude '*.log' \
    --exclude '.DS_Store' \
    -C "$(pwd)" .

echo -e "${GREEN}[OK] Archive created${NC}"

# Upload to VM
echo -e "${YELLOW}Step 2: Uploading to VM...${NC}"
gcloud compute scp --zone="$ZONE" "$TMP_ARCHIVE" "$VM_NAME":~/meeting-transcriber-archive.tar.gz
gcloud compute scp --zone="$ZONE" .env.deploy "$VM_NAME":~/meeting-transcriber.env

# Cleanup local temp .env
rm .env.deploy

# Extract and deploy on VM
BUILD_VERSION="dev-$(date +%Y%m%d-%H%M%S)"
BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

echo -e "${YELLOW}Step 3: Extracting and deploying on VM...${NC}"
echo -e "${BLUE}Build Version: ${BUILD_VERSION}${NC}"
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command "
    cd ~/meeting-transcriber &&
    tar xzf ~/meeting-transcriber-archive.tar.gz --strip-components=0 &&
    rm ~/meeting-transcriber-archive.tar.gz &&
    
    # Move uploaded .env to correct location
    mv ~/meeting-transcriber.env .env &&
    
    echo '=== Building and deploying services ===' &&
    sudo docker-compose down &&
    
    # Load environment variables for the shell command
    set -a
    source .env
    set +a
    
    sudo docker-compose build --no-cache \
        --build-arg BUILD_VERSION=${BUILD_VERSION} \
        --build-arg BUILD_TIMESTAMP=${BUILD_TIMESTAMP} \
        --build-arg REACT_APP_SERVER_URL=\${REACT_APP_SERVER_URL} \
        --build-arg REACT_APP_RAG_PASSWORD=\${REACT_APP_RAG_PASSWORD} &&
    sudo docker-compose up -d &&
    
    echo '' &&
    echo '=== Fixing file permissions ===' &&
    sleep 5 &&
    sudo docker exec syncscribe-client sh -c '
        find /usr/share/nginx/html -type f -exec chmod 644 {} \; &&
        find /usr/share/nginx/html -type d -exec chmod 755 {} \; &&
        find /usr/share/nginx/html -name \"._*\" -delete &&
        chmod 644 /usr/share/nginx/html/*.worklet.js 2>/dev/null || true &&
        chmod 755 /usr/share/nginx/html/images 2>/dev/null || true &&
        chmod -R 644 /usr/share/nginx/html/images/* 2>/dev/null || true
    ' &&
    
    echo '' &&
    echo '=== Service Status ===' &&
    sudo docker-compose ps &&
    
    echo '' &&
    echo '=== Testing endpoints ===' &&
    echo 'Main page:' &&
    curl -s -I http://localhost:80 | head -3 &&
    echo '' &&
    echo 'Audio worklet:' &&
    curl -s -I http://localhost:80/audio-processor.worklet.js | head -3 &&
    echo '' &&
    echo 'Deepgram logo:' &&
    curl -s -I http://localhost:80/images/deepgram.svg | head -3
"

# Cleanup
rm -f "$TMP_ARCHIVE"

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}  Development Deployment Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "${BLUE}Your application is available at:${NC}"
echo "  https://syncscribe.app"
echo ""
echo -e "${YELLOW}You can now check page source and view changes${NC}"
echo ""

