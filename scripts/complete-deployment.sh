#!/bin/bash

# Complete the SyncScribe deployment after VM creation

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

VM_NAME="${VM_NAME:-syncscribe-vm}"
ZONE="${ZONE:-us-central1-a}"
EXTERNAL_IP="${EXTERNAL_IP:-}"

echo -e "${BLUE}====================================${NC}"
echo -e "${BLUE}  Complete SyncScribe Deployment${NC}"
echo -e "${BLUE}====================================${NC}"
echo ""

# Step 1: Upload code
echo -e "${BLUE}Step 1: Uploading code to VM (this may take a few minutes)...${NC}"

# Create a temporary archive excluding large directories
echo "Creating deployment archive..."
tar czf /tmp/syncscribe-deploy.tar.gz \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='client/node_modules' \
  --exclude='server/node_modules' \
  --exclude='client/build' \
  --exclude='.k8s-tmp' \
  --exclude='Archive.zip' \
  -C "$(pwd)" .

# Upload the archive
gcloud compute scp \
  --zone="$ZONE" \
  /tmp/syncscribe-deploy.tar.gz \
  "$VM_NAME":~/

# Extract on VM
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
  mkdir -p ~/meeting-transcriber
  tar xzf ~/syncscribe-deploy.tar.gz -C ~/meeting-transcriber/
  rm ~/syncscribe-deploy.tar.gz
"

# Clean up local archive
rm /tmp/syncscribe-deploy.tar.gz

echo -e "${GREEN}✓ Code uploaded${NC}"

# Step 2: Install Docker
echo -e "${BLUE}Step 2: Installing Docker...${NC}"

gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
set -e
echo '=== Installing Docker ==='
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker \$USER

echo '=== Docker installed and started ==='
"

echo -e "${GREEN}✓ Docker installed${NC}"

# Step 3: Create .env file
echo -e "${BLUE}Step 3: Creating .env file...${NC}"

gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
cd ~/meeting-transcriber
cat > .env << 'EOF'
# API Keys - UPDATE THESE WITH YOUR ACTUAL KEYS
OPENAI_API_KEY=your_openai_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here

NODE_ENV=production
PORT=5002
REACT_APP_SERVER_URL=http://$EXTERNAL_IP:5002
EOF
echo '.env file created'
"

echo -e "${GREEN}✓ .env file created${NC}"

# Step 4: Build and deploy
echo -e "${BLUE}Step 4: Building Docker images (this takes 5-10 minutes)...${NC}"

gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
set -e
cd ~/meeting-transcriber

echo '=== Building Docker images ==='
sudo docker-compose build

echo ''
echo '=== Starting services ==='
sudo docker-compose up -d

echo ''
echo '=== Waiting for services to start ==='
sleep 20

echo ''
echo '=== Checking service status ==='
sudo docker-compose ps

echo ''
echo '=== Service logs (last 20 lines) ==='
sudo docker-compose logs --tail=20
"

echo ""
echo -e "${GREEN}====================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${GREEN}====================================${NC}"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Update your API keys!${NC}"
echo ""
echo "1. SSH into your VM:"
echo "   gcloud compute ssh $VM_NAME --zone=$ZONE"
echo ""
echo "2. Edit the .env file:"
echo "   cd ~/meeting-transcriber"
echo "   nano .env"
echo ""
echo "3. Restart the server:"
echo "   sudo docker-compose restart server"
echo ""
echo -e "${BLUE}Access your application at:${NC}"
echo "   http://$EXTERNAL_IP"
echo ""
echo -e "${BLUE}View logs:${NC}"
echo "   gcloud compute ssh $VM_NAME --zone=$ZONE"
echo "   cd ~/meeting-transcriber"
echo "   sudo docker-compose logs -f"
echo ""

