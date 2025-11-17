#!/bin/bash

# SyncScribe GCP VM Deployment Script
# This script automates the deployment of SyncScribe to a GCP VM using Docker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
PROJECT_ID="${1:-}"
VM_NAME="${2:-syncscribe-vm}"
ZONE="${3:-us-central1-a}"
MACHINE_TYPE="${4:-e2-medium}"

# Print colored message
print_msg() {
    local color=$1
    shift
    echo -e "${color}$@${NC}"
}

# Print usage
usage() {
    echo "Usage: $0 <project-id> [vm-name] [zone] [machine-type]"
    echo ""
    echo "Arguments:"
    echo "  project-id    : GCP project ID (required)"
    echo "  vm-name       : Name for the VM (default: syncscribe-vm)"
    echo "  zone          : GCP zone (default: us-central1-a)"
    echo "  machine-type  : VM machine type (default: e2-medium)"
    echo ""
    echo "Example:"
    echo "  $0 my-project-123 syncscribe-vm us-central1-a e2-medium"
    exit 1
}

# Check if project ID is provided
if [ -z "$PROJECT_ID" ]; then
    print_msg "$RED" "Error: Project ID is required"
    usage
fi

print_msg "$BLUE" "======================================"
print_msg "$BLUE" "  SyncScribe GCP VM Deployment"
print_msg "$BLUE" "======================================"
echo ""
print_msg "$YELLOW" "Configuration:"
print_msg "$YELLOW" "  Project ID    : $PROJECT_ID"
print_msg "$YELLOW" "  VM Name       : $VM_NAME"
print_msg "$YELLOW" "  Zone          : $ZONE"
print_msg "$YELLOW" "  Machine Type  : $MACHINE_TYPE"
echo ""

# Confirm before proceeding
read -p "Proceed with deployment? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_msg "$YELLOW" "Deployment cancelled"
    exit 0
fi

# Set project
print_msg "$BLUE" "Step 1: Setting GCP project..."
gcloud config set project "$PROJECT_ID"

# Check if VM already exists
print_msg "$BLUE" "Step 2: Checking if VM exists..."
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" >/dev/null 2>&1; then
    print_msg "$YELLOW" "VM $VM_NAME already exists in zone $ZONE"
    read -p "Do you want to recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_msg "$YELLOW" "Deleting existing VM..."
        gcloud compute instances delete "$VM_NAME" --zone="$ZONE" --quiet
    else
        print_msg "$YELLOW" "Using existing VM"
        EXISTING_VM=true
    fi
fi

# Create VM if it doesn't exist
if [ -z "$EXISTING_VM" ]; then
    print_msg "$BLUE" "Step 3: Creating VM instance..."
    
    # Create startup script
    cat > /tmp/startup-script.sh << 'EOF'
#!/bin/bash
apt-get update
apt-get install -y docker.io docker-compose git curl wget
systemctl enable docker
systemctl start docker
usermod -aG docker $USER
EOF
    
    gcloud compute instances create "$VM_NAME" \
        --zone="$ZONE" \
        --machine-type="$MACHINE_TYPE" \
        --image-family=ubuntu-2204-lts \
        --image-project=ubuntu-os-cloud \
        --boot-disk-size=50GB \
        --boot-disk-type=pd-standard \
        --tags=http-server,https-server,syncscribe-api \
        --metadata-from-file=startup-script=/tmp/startup-script.sh
    
    rm /tmp/startup-script.sh
    
    print_msg "$GREEN" "✓ VM created successfully"
else
    print_msg "$BLUE" "Step 3: Skipping VM creation (using existing VM)"
fi

# Create firewall rules
print_msg "$BLUE" "Step 4: Setting up firewall rules..."

# HTTP rule
if ! gcloud compute firewall-rules describe allow-syncscribe-http >/dev/null 2>&1; then
    gcloud compute firewall-rules create allow-syncscribe-http \
        --allow tcp:80 \
        --target-tags http-server \
        --description="Allow HTTP traffic to SyncScribe" \
        --quiet
    print_msg "$GREEN" "✓ HTTP firewall rule created"
else
    print_msg "$YELLOW" "✓ HTTP firewall rule already exists"
fi

# HTTPS rule
if ! gcloud compute firewall-rules describe allow-syncscribe-https >/dev/null 2>&1; then
    gcloud compute firewall-rules create allow-syncscribe-https \
        --allow tcp:443 \
        --target-tags https-server \
        --description="Allow HTTPS traffic to SyncScribe" \
        --quiet
    print_msg "$GREEN" "✓ HTTPS firewall rule created"
else
    print_msg "$YELLOW" "✓ HTTPS firewall rule already exists"
fi

# API rule
if ! gcloud compute firewall-rules describe allow-syncscribe-api >/dev/null 2>&1; then
    gcloud compute firewall-rules create allow-syncscribe-api \
        --allow tcp:5002 \
        --target-tags syncscribe-api \
        --description="Allow API traffic to SyncScribe" \
        --quiet
    print_msg "$GREEN" "✓ API firewall rule created"
else
    print_msg "$YELLOW" "✓ API firewall rule already exists"
fi

# Get external IP
print_msg "$BLUE" "Step 5: Getting VM external IP..."
EXTERNAL_IP=$(gcloud compute instances describe "$VM_NAME" \
    --zone="$ZONE" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

if [ -z "$EXTERNAL_IP" ]; then
    print_msg "$RED" "Error: Could not get external IP"
    exit 1
fi

print_msg "$GREEN" "✓ External IP: $EXTERNAL_IP"

# Wait for VM to be ready
print_msg "$BLUE" "Step 6: Waiting for VM to be ready (60 seconds)..."
sleep 60

# Upload deployment files
print_msg "$BLUE" "Step 7: Uploading deployment files..."
gcloud compute scp \
    --zone="$ZONE" \
    --recurse \
    "$(pwd)" \
    "$VM_NAME":~/meeting-transcriber \
    || print_msg "$YELLOW" "Warning: Some files may already exist on VM"

# Create .env file on VM
print_msg "$BLUE" "Step 8: Creating .env file..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
cd ~/meeting-transcriber
cat > .env << 'EOF'
# API Keys - REPLACE WITH YOUR ACTUAL KEYS
OPENAI_API_KEY=your_openai_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
ASSEMBLYAI_API_KEY=your_assemblyai_api_key_here

# Server Configuration
NODE_ENV=production
PORT=5002

# React App Configuration
REACT_APP_SERVER_URL=http://$EXTERNAL_IP:5002
EOF
"

print_msg "$GREEN" "✓ .env file created"
print_msg "$YELLOW" "⚠ IMPORTANT: You need to update the API keys in .env file!"

# Deploy application
print_msg "$BLUE" "Step 9: Deploying application..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command="
cd ~/meeting-transcriber
echo '=== Building Docker images (this may take 5-10 minutes)...'
sudo docker-compose build
echo '=== Starting services...'
sudo docker-compose up -d
echo '=== Checking service status...'
sleep 10
sudo docker-compose ps
"

print_msg "$GREEN" "✓ Application deployed"

# Print summary
echo ""
print_msg "$GREEN" "======================================"
print_msg "$GREEN" "  Deployment Complete!"
print_msg "$GREEN" "======================================"
echo ""
print_msg "$YELLOW" "Next steps:"
echo ""
print_msg "$BLUE" "1. Update API keys:"
echo "   gcloud compute ssh $VM_NAME --zone=$ZONE"
echo "   cd meeting-transcriber"
echo "   nano .env"
echo "   sudo docker-compose restart server"
echo ""
print_msg "$BLUE" "2. Access your application:"
echo "   http://$EXTERNAL_IP"
echo ""
print_msg "$BLUE" "3. View logs:"
echo "   gcloud compute ssh $VM_NAME --zone=$ZONE"
echo "   cd meeting-transcriber"
echo "   sudo docker-compose logs -f"
echo ""
print_msg "$BLUE" "4. Customize team data (optional):"
echo "   gcloud compute ssh $VM_NAME --zone=$ZONE"
echo "   cd meeting-transcriber"
echo "   nano server/team-data.json"
echo "   sudo docker-compose restart server"
echo ""
print_msg "$YELLOW" "⚠ Don't forget to configure SSL/HTTPS for production!"
print_msg "$YELLOW" "   See GCP_VM_DEPLOYMENT.md for instructions"
echo ""

# Save connection info
cat > deployment-info.txt << EOF
SyncScribe Deployment Information
==================================

Project ID: $PROJECT_ID
VM Name: $VM_NAME
Zone: $ZONE
External IP: $EXTERNAL_IP

Application URLs:
- Frontend: http://$EXTERNAL_IP
- API: http://$EXTERNAL_IP:5002

SSH Command:
gcloud compute ssh $VM_NAME --zone=$ZONE --project=$PROJECT_ID

Useful Commands:
- View logs: sudo docker-compose logs -f
- Restart: sudo docker-compose restart
- Stop: sudo docker-compose stop
- Start: sudo docker-compose up -d

Deployed: $(date)
EOF

print_msg "$GREEN" "✓ Deployment info saved to: deployment-info.txt"

