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

# Environment variables for API keys (can be set from GitHub Actions secrets)
# These will be used to create/update .env file on the VM
export OPENAI_API_KEY="${OPENAI_API_KEY:-}"
export DEEPGRAM_API_KEY="${DEEPGRAM_API_KEY:-}"
export ASSEMBLYAI_API_KEY="${ASSEMBLYAI_API_KEY:-}"
export OPENROUTER_API_KEY="${OPENROUTER_API_KEY:-}"
export GCS_PROJECT_ID="${GCS_PROJECT_ID:-}"
export GCS_BUCKET_N1="${GCS_BUCKET_N1:-}"
export GCS_BUCKET_U1="${GCS_BUCKET_U1:-}"
export GCS_CLIENT_EMAIL="${GCS_CLIENT_EMAIL:-}"
export GCS_PRIVATE_KEY="${GCS_PRIVATE_KEY:-}"
export REACT_APP_SERVER_URL="${REACT_APP_SERVER_URL:-https://syncscribe.app}"
# Note: REACT_APP_RAG_PASSWORD is excluded to disable password gate in production
# Unless explicitly provided via CI env var for a specific environment
export REACT_APP_RAG_PASSWORD="${REACT_APP_RAG_PASSWORD:-}"

# Setup SSH options for service account impersonation
SSH_OPTS="--zone=$ZONE --quiet"
if [ -n "$CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT" ]; then
    SSH_OPTS="$SSH_OPTS --impersonate-service-account=$CLOUDSDK_AUTH_IMPERSONATE_SERVICE_ACCOUNT"
fi

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
    echo -e "${GREEN}[OK] VM started${NC}"
else
    echo -e "${GREEN}[OK] VM is already running${NC}"
fi

# Wait for SSH to be ready (with timeout)
echo -e "${YELLOW}Step 2: Waiting for SSH connection...${NC}"
SSH_READY=false
for i in {1..60}; do
    if timeout 5 gcloud compute ssh "$VM_NAME" $SSH_OPTS --command="echo 'SSH ready'" 2>/dev/null; then
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
gcloud compute ssh "$VM_NAME" $SSH_OPTS --command '
    sudo systemctl start docker 2>/dev/null || true &&
    sudo systemctl enable docker 2>/dev/null || true &&
    sleep 3 &&
    sudo docker ps > /dev/null 2>&1 && echo "[OK] Docker daemon ready" || echo "[X] Docker may not be fully ready"
' || echo -e "${YELLOW}Warning: Could not verify Docker status${NC}"

# Deploy code if not present
echo -e "${YELLOW}Step 4: Ensuring code is deployed...${NC}"
DEPLOY_CODE="${DEPLOY_CODE:-true}"
if [ "$DEPLOY_CODE" = "true" ]; then
    # Determine repository and branch
    # When triggered from GitHub Actions, GITHUB_REF contains the branch that triggered the workflow
    # (e.g., refs/heads/feature-branch or refs/heads/main)
    if [ -n "$GITHUB_REPOSITORY" ]; then
        GITHUB_REPO="$GITHUB_REPOSITORY"
        # Extract branch from GITHUB_REF (e.g., refs/heads/vm-control-workflow -> vm-control-workflow)
        if [ -n "$GITHUB_REF" ]; then
            BRANCH="${GITHUB_REF#refs/heads/}"
            BRANCH="${BRANCH#refs/tags/}"
            echo "[OK] Using branch from workflow trigger: $BRANCH (from $GITHUB_REF)"
        else
            BRANCH="main"
            echo "[OK] GITHUB_REF not set, defaulting to main branch"
        fi
    else
        # Fallback for local execution
        GITHUB_REPO="${GITHUB_REPO:-aliyevom/SyncScribe}"
        BRANCH="${GITHUB_BRANCH:-main}"
        echo "[OK] Running locally, using default branch: $BRANCH"
    fi
    
    GITHUB_REPO_URL="https://github.com/$GITHUB_REPO.git"
    
    echo "Repository: $GITHUB_REPO"
    echo "Branch: $BRANCH"
    
    # Deploy code via git clone
    # Pass environment variables to the remote command so they're available for .env creation
    # Use base64 encoding to safely pass API keys through SSH (handles special characters)
    OPENAI_API_KEY_B64=$(echo -n "$OPENAI_API_KEY" | base64 -w 0 2>/dev/null || echo -n "$OPENAI_API_KEY" | base64 | tr -d '\n')
    DEEPGRAM_API_KEY_B64=$(echo -n "$DEEPGRAM_API_KEY" | base64 -w 0 2>/dev/null || echo -n "$DEEPGRAM_API_KEY" | base64 | tr -d '\n')
    ASSEMBLYAI_API_KEY_B64=$(echo -n "$ASSEMBLYAI_API_KEY" | base64 -w 0 2>/dev/null || echo -n "$ASSEMBLYAI_API_KEY" | base64 | tr -d '\n')
    OPENROUTER_API_KEY_B64=$(echo -n "$OPENROUTER_API_KEY" | base64 -w 0 2>/dev/null || echo -n "$OPENROUTER_API_KEY" | base64 | tr -d '\n')
    GCS_PROJECT_ID_B64=$(echo -n "$GCS_PROJECT_ID" | base64 -w 0 2>/dev/null || echo -n "$GCS_PROJECT_ID" | base64 | tr -d '\n')
    GCS_BUCKET_N1_B64=$(echo -n "$GCS_BUCKET_N1" | base64 -w 0 2>/dev/null || echo -n "$GCS_BUCKET_N1" | base64 | tr -d '\n')
    GCS_BUCKET_U1_B64=$(echo -n "$GCS_BUCKET_U1" | base64 -w 0 2>/dev/null || echo -n "$GCS_BUCKET_U1" | base64 | tr -d '\n')
    GCS_CLIENT_EMAIL_B64=$(echo -n "$GCS_CLIENT_EMAIL" | base64 -w 0 2>/dev/null || echo -n "$GCS_CLIENT_EMAIL" | base64 | tr -d '\n')
    GCS_PRIVATE_KEY_B64=$(echo -n "$GCS_PRIVATE_KEY" | base64 -w 0 2>/dev/null || echo -n "$GCS_PRIVATE_KEY" | base64 | tr -d '\n')
    REACT_APP_SERVER_URL_B64=$(echo -n "$REACT_APP_SERVER_URL" | base64 -w 0 2>/dev/null || echo -n "$REACT_APP_SERVER_URL" | base64 | tr -d '\n')
    REACT_APP_RAG_PASSWORD_B64=$(echo -n "$REACT_APP_RAG_PASSWORD" | base64 -w 0 2>/dev/null || echo -n "$REACT_APP_RAG_PASSWORD" | base64 | tr -d '\n')
    
    gcloud compute ssh "$VM_NAME" $SSH_OPTS --command "
        # Decode environment variables from base64 (handles special characters safely)
        export OPENAI_API_KEY=\$(echo '$OPENAI_API_KEY_B64' | base64 -d 2>/dev/null || echo '')
        export DEEPGRAM_API_KEY=\$(echo '$DEEPGRAM_API_KEY_B64' | base64 -d 2>/dev/null || echo '')
        export ASSEMBLYAI_API_KEY=\$(echo '$ASSEMBLYAI_API_KEY_B64' | base64 -d 2>/dev/null || echo '')
        export OPENROUTER_API_KEY=\$(echo '$OPENROUTER_API_KEY_B64' | base64 -d 2>/dev/null || echo '')
        export GCS_PROJECT_ID=\$(echo '$GCS_PROJECT_ID_B64' | base64 -d 2>/dev/null || echo '')
        export GCS_BUCKET_N1=\$(echo '$GCS_BUCKET_N1_B64' | base64 -d 2>/dev/null || echo '')
        export GCS_BUCKET_U1=\$(echo '$GCS_BUCKET_U1_B64' | base64 -d 2>/dev/null || echo '')
        export GCS_CLIENT_EMAIL=\$(echo '$GCS_CLIENT_EMAIL_B64' | base64 -d 2>/dev/null || echo '')
        export GCS_PRIVATE_KEY=\$(echo '$GCS_PRIVATE_KEY_B64' | base64 -d 2>/dev/null || echo '')
        export REACT_APP_SERVER_URL=\$(echo '$REACT_APP_SERVER_URL_B64' | base64 -d 2>/dev/null || echo 'https://syncscribe.app')
        export REACT_APP_RAG_PASSWORD=\$(echo '$REACT_APP_RAG_PASSWORD_B64' | base64 -d 2>/dev/null || echo '')
        
        # Ensure git is installed
        if ! command -v git >/dev/null 2>&1; then
            echo 'Installing git...' &&
            sudo apt-get update -qq >/dev/null 2>&1 &&
            sudo apt-get install -y git >/dev/null 2>&1 || {
                echo '[X] Failed to install git'
                exit 1
            }
        fi &&
        
        # Backup .env file if it exists (preserve API keys and configuration)
        ENV_BACKUP_PATH=''
        BACKUP_FILE=''
        if [ -f ~/meeting-transcriber/.env ]; then
            echo 'Backing up .env file...' &&
            BACKUP_FILE=~/.env.backup.$(date +%s) &&
            cp ~/meeting-transcriber/.env \"\$BACKUP_FILE\" &&
            ENV_BACKUP_PATH=\"\$BACKUP_FILE\" &&
            echo '[OK] .env file backed up to '\$BACKUP_FILE
        elif [ -f ~/.env ]; then
            echo 'Found .env in home directory, backing up...' &&
            BACKUP_FILE=~/.env.backup.$(date +%s) &&
            cp ~/.env \"\$BACKUP_FILE\" &&
            ENV_BACKUP_PATH=\"\$BACKUP_FILE\" &&
            echo '[OK] .env file backed up to '\$BACKUP_FILE
        else
            echo '[X] No .env file found - API keys may be missing'
        fi &&
        
        # Clone or update repository
        if [ ! -d ~/meeting-transcriber/.git ]; then
            echo 'Cloning repository from GitHub...' &&
            rm -rf ~/meeting-transcriber &&
            git clone --depth 1 --branch '$BRANCH' '$GITHUB_REPO_URL' ~/meeting-transcriber 2>&1 || {
                echo '[X] Clone failed for branch '$BRANCH', trying main branch...' &&
                git clone --depth 1 --branch main 'https://github.com/$GITHUB_REPO.git' ~/meeting-transcriber 2>&1 || {
                    echo '[X] Git clone failed'
                    exit 1
                }
            } &&
            cd ~/meeting-transcriber &&
            # Initialize submodules if .gitmodules exists
            if [ -f .gitmodules ]; then
                echo 'Initializing submodules...' &&
                git submodule update --init --recursive --depth 1 2>&1 || echo '[X] Submodule init failed, continuing...'
            fi &&
            echo '[OK] Repository cloned'
        else
            echo 'Repository exists, pulling latest changes...' &&
            cd ~/meeting-transcriber &&
            # Clean up any problematic remote references
            git remote prune origin 2>&1 || true &&
            # Reset any local changes that might conflict
            git reset --hard HEAD 2>&1 || true &&
            git clean -fd 2>&1 || true &&
            # Fetch from origin (without --all to avoid issues)
            echo 'Fetching from origin...' &&
            git fetch origin 2>&1 || {
                echo '[X] Git fetch failed, trying to continue...'
            } &&
            # Check if the branch exists on remote
            if git ls-remote --heads origin '$BRANCH' 2>&1 | grep -q 'refs/heads/'$BRANCH'$'; then
                echo 'Branch '$BRANCH' exists on remote, switching to it...' &&
                # Fetch the specific branch
                git fetch origin '$BRANCH' 2>&1 || true &&
                # Checkout the branch, creating it if needed
                if git show-ref --verify --quiet refs/heads/'$BRANCH'; then
                    echo 'Local branch '$BRANCH' exists, checking it out...' &&
                    git checkout '$BRANCH' 2>&1 &&
                    git reset --hard origin/'$BRANCH' 2>&1 || true
                else
                    echo 'Creating local branch '$BRANCH' tracking origin/'$BRANCH'...' &&
                    git checkout -b '$BRANCH' origin/'$BRANCH' 2>&1 || {
                        echo '[X] Failed to create branch, trying alternative...'
                        git branch '$BRANCH' origin/'$BRANCH' 2>&1 || true &&
                        git checkout '$BRANCH' 2>&1 || true
                    }
                fi &&
                # Pull latest changes
                git pull origin '$BRANCH' 2>&1 || {
                    echo '[X] Git pull failed, but branch is checked out'
                }
            else
                echo '[X] Branch '$BRANCH' not found on remote, checking out main...' &&
                git fetch origin main 2>&1 || true &&
                git checkout -B main origin/main 2>&1 &&
                git pull origin main 2>&1 || {
                    echo '[X] Git pull failed, but continuing with existing code'
                }
            fi &&
            # Update submodules if they exist
            if [ -f .gitmodules ]; then
                echo 'Updating submodules...' &&
                # Sync submodule URLs first
                git submodule sync --recursive 2>&1 || true &&
                # Get the expected submodule commit from parent repo
                EXPECTED_CLIENT_COMMIT=$(git ls-tree HEAD client 2>&1 | awk '{print $3}' | head -1 | tr -d '[:space:]' | grep -E '^[a-f0-9]{40}$' || echo '') &&
                if [ -n "${EXPECTED_CLIENT_COMMIT:-}" ] && [ "${EXPECTED_CLIENT_COMMIT}" != "client" ]; then
                    echo 'Expected client submodule commit: '$EXPECTED_CLIENT_COMMIT &&
                    # Update submodule to the expected commit
                    git submodule update --init --recursive --depth 1 2>&1 || {
                        echo '[X] Standard submodule update failed, trying alternative method...'
                        # Force update submodules to match parent repo commit
                        if [ -d client/.git ]; then
                            echo 'Forcing client submodule to expected commit...' &&
                            cd client &&
                            git fetch origin 2>&1 || true &&
                            git checkout '$EXPECTED_CLIENT_COMMIT' 2>&1 || {
                                echo '[X] Failed to checkout expected commit '$EXPECTED_CLIENT_COMMIT', updating to latest master...'
                                git fetch origin master 2>&1 || true &&
                                git checkout master 2>&1 || true &&
                                git pull origin master 2>&1 || true
                            } &&
                            cd ..
                        elif [ ! -d client ]; then
                            echo 'Client submodule directory missing, initializing...' &&
                            git submodule update --init client 2>&1 || true
                        fi
                    } &&
                    # Verify submodule is at correct commit
                    if [ -d client/.git ]; then
                        CURRENT_CLIENT_COMMIT=$(cd client && git rev-parse HEAD 2>&1 | tr -d '[:space:]') &&
                        echo 'Current client submodule commit: '$CURRENT_CLIENT_COMMIT &&
                        if [ -n "${CURRENT_CLIENT_COMMIT}" ] && [ -n "${EXPECTED_CLIENT_COMMIT}" ] && [ "${CURRENT_CLIENT_COMMIT}" != "${EXPECTED_CLIENT_COMMIT}" ]; then
                            echo '[X] Client submodule commit mismatch! Expected: '$EXPECTED_CLIENT_COMMIT', Got: '$CURRENT_CLIENT_COMMIT
                            echo 'Attempting to fix by updating to expected commit...' &&
                            cd client &&
                            git fetch origin 2>&1 || true &&
                            git checkout '$EXPECTED_CLIENT_COMMIT' 2>&1 || {
                                echo '[X] Failed to checkout expected commit, updating to latest master...'
                                git fetch origin master 2>&1 || true &&
                                git checkout master 2>&1 || true &&
                                git pull origin master 2>&1 || true
                            } &&
                            cd ..
                        else
                            echo '[OK] Client submodule is at correct commit'
                        fi
                    fi
                else
                    echo '[X] Could not determine expected client submodule commit, updating to latest master...' &&
                    if [ -d client/.git ]; then
                        cd client &&
                        git fetch origin master 2>&1 || true &&
                        git checkout master 2>&1 || true &&
                        git pull origin master 2>&1 || true &&
                        cd ..
                    elif [ ! -d client ]; then
                        echo 'Initializing client submodule...' &&
                        git submodule update --init --recursive client 2>&1 || true
                    fi
                fi
            fi &&
            echo '[OK] Repository updated to branch: '$BRANCH''
        fi &&
        
        # Restore or create .env file
        ENV_CREATED=false
        if [ -n \"\$ENV_BACKUP_PATH\" ] && [ -f \"\$ENV_BACKUP_PATH\" ]; then
            echo 'Restoring .env file from backup...' &&
            cp \"\$ENV_BACKUP_PATH\" ~/meeting-transcriber/.env &&
            echo '[OK] .env file restored from backup'
            ENV_CREATED=true
        else
            # Try to find the latest backup file
            LATEST_BACKUP=\$(ls -t ~/.env.backup.* 2>/dev/null | head -1) &&
            if [ -n \"\$LATEST_BACKUP\" ] && [ -f \"\$LATEST_BACKUP\" ]; then
                echo 'Restoring .env file from latest backup...' &&
                cp \"\$LATEST_BACKUP\" ~/meeting-transcriber/.env &&
                echo '[OK] .env file restored from backup'
                ENV_CREATED=true
            fi
        fi &&
        
        # Create/update .env file from environment variables (from GitHub Actions secrets)
        # This allows GitHub Actions to inject API keys without committing them
        if [ -n \"\$OPENAI_API_KEY\" ] || [ -n \"\$DEEPGRAM_API_KEY\" ] || [ -n \"\$ASSEMBLYAI_API_KEY\" ]; then
            echo 'Creating/updating .env file from environment variables...' &&
            {
                [ -n \"\$OPENAI_API_KEY\" ] && echo \"OPENAI_API_KEY=\$OPENAI_API_KEY\" || true
                [ -n \"\$DEEPGRAM_API_KEY\" ] && echo \"DEEPGRAM_API_KEY=\$DEEPGRAM_API_KEY\" || true
                [ -n \"\$ASSEMBLYAI_API_KEY\" ] && echo \"ASSEMBLYAI_API_KEY=\$ASSEMBLYAI_API_KEY\" || true
                [ -n \"\$OPENROUTER_API_KEY\" ] && echo \"OPENROUTER_API_KEY=\$OPENROUTER_API_KEY\" || true
                [ -n \"\$GCS_PROJECT_ID\" ] && echo \"GCS_PROJECT_ID=\$GCS_PROJECT_ID\" || true
                [ -n \"\$GCS_BUCKET_N1\" ] && echo \"GCS_BUCKET_N1=\$GCS_BUCKET_N1\" || true
                [ -n \"\$GCS_BUCKET_U1\" ] && echo \"GCS_BUCKET_U1=\$GCS_BUCKET_U1\" || true
                [ -n \"\$GCS_CLIENT_EMAIL\" ] && echo \"GCS_CLIENT_EMAIL=\$GCS_CLIENT_EMAIL\" || true
                [ -n \"\$GCS_PRIVATE_KEY\" ] && echo \"GCS_PRIVATE_KEY=\$GCS_PRIVATE_KEY\" || true
                [ -n \"\$REACT_APP_SERVER_URL\" ] && echo \"REACT_APP_SERVER_URL=\$REACT_APP_SERVER_URL\" || echo \"REACT_APP_SERVER_URL=https://syncscribe.app\"
                # Don't add REACT_APP_RAG_PASSWORD to .env file (it's a build arg)
            } > ~/meeting-transcriber/.env &&
            echo '[OK] .env file created from environment variables'
            ENV_CREATED=true
        fi &&
        
        # Verify docker-compose.yml exists
        if [ ! -f ~/meeting-transcriber/docker-compose.yml ]; then
            echo '[X] docker-compose.yml not found after deployment'
            exit 1
        else
            echo '[OK] docker-compose.yml found'
        fi &&
        
        # Check if .env exists and has content
        if [ -f ~/meeting-transcriber/.env ]; then
            ENV_SIZE=\$(wc -c < ~/meeting-transcriber/.env) &&
            if [ \"\$ENV_SIZE\" -gt 10 ]; then
                echo '[OK] .env file exists and has content'
                # Show which keys are set (without revealing values)
                echo 'Environment variables in .env:'
                grep -E '^(OPENAI_API_KEY|DEEPGRAM_API_KEY|ASSEMBLYAI_API_KEY|REACT_APP_SERVER_URL)=' ~/meeting-transcriber/.env | sed 's/=.*/=***/' || true
            else
                echo '[X] .env file exists but appears empty or incomplete'
            fi
        else
            echo '[X] WARNING: .env file not found - API keys are missing!'
            echo '   The application will not work without API keys.'
            echo ''
            if [ -n \"\$OPENAI_API_KEY\" ] || [ -n \"\$DEEPGRAM_API_KEY\" ] || [ -n \"\$ASSEMBLYAI_API_KEY\" ]; then
                echo '   Environment variables were provided but .env file creation failed.'
                echo '   This may be a permissions issue.'
            else
                echo '   No API keys provided via environment variables.'
                echo '   Please either:'
                echo '   1. Add secrets to GitHub Actions (recommended):'
                echo '      - OPENAI_API_KEY'
                echo '      - DEEPGRAM_API_KEY'
                echo '      - ASSEMBLYAI_API_KEY'
                echo '   2. Or manually create ~/meeting-transcriber/.env with required variables'
            fi
        fi
    " || {
        echo -e "${RED}[X] Failed to deploy code${NC}"
        echo -e "${YELLOW}The application code needs to be on the VM to start containers.${NC}"
        echo -e "${YELLOW}Please deploy manually using: ./scripts/deploy-dev.sh${NC}"
        exit 1
    }
    
    echo -e "${GREEN}[OK] Code deployment complete${NC}"
else
    echo -e "${YELLOW}Skipping code deployment (DEPLOY_CODE=false)${NC}"
fi

# Start containers
echo -e "${YELLOW}Step 5: Starting containers...${NC}"
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
    
    if [ -z "$COMPOSE_DIR" ] || [ ! -f "$COMPOSE_DIR/docker-compose.yml" ]; then
        echo "[X] Error: docker-compose.yml not found."
        echo "   The application needs to be deployed first."
        echo "   Please run: ./scripts/deploy-dev.sh"
        echo ""
        echo "   Searched in:"
        echo "   - ~/meeting-transcriber/docker-compose.yml"
        echo "   - ~/docker-compose.yml"
        echo "   - ~/* (via find)"
        exit 1
    fi
    
    cd "$COMPOSE_DIR"
    echo "Using docker-compose.yml from: $COMPOSE_DIR"
    
    # Verify docker-compose.yml exists
    if [ ! -f docker-compose.yml ]; then
        echo "[X] Error: docker-compose.yml not found in: $(pwd)"
        exit 1
    fi &&
    
    # Load environment variables for the build
    set -a
    [ -f .env ] && source .env
    set +a
    
    # Rebuild and start services
    echo "Building services..." &&
    # Pass build arguments explicitly
    if ! sudo docker-compose build --no-cache \
        --build-arg REACT_APP_SERVER_URL="${REACT_APP_SERVER_URL}" \
        --build-arg REACT_APP_RAG_PASSWORD="${REACT_APP_RAG_PASSWORD}"; then
        echo "[X] Build failed, trying without build args..."
        sudo docker-compose build --no-cache
    fi &&
    
    if ! sudo docker-compose up -d; then
        echo "[X] First attempt failed. Checking container status..." &&
        sudo docker-compose ps &&
        echo "Trying to restart..." &&
        sudo docker-compose down &&
        sleep 2 &&
        sudo docker-compose up -d
    fi &&
    echo "[OK] Containers started" &&
    
    # Wait for services to be ready
    echo "Waiting for services to initialize (15 seconds)..." &&
    sleep 15 &&
    
    # Fix all file permissions (critical for images, worklets, etc.)
    echo "" &&
    echo "=== Fixing file permissions ===" &&
    CLIENT_CONTAINER=$(sudo docker ps -q -f name=client) &&
    if [ -n "$CLIENT_CONTAINER" ]; then
        sudo docker exec "$CLIENT_CONTAINER" sh -c "
            find /usr/share/nginx/html -type f -exec chmod 644 {} \; &&
            find /usr/share/nginx/html -type d -exec chmod 755 {} \; &&
            find /usr/share/nginx/html -name \"._*\" -delete &&
            chmod 644 /usr/share/nginx/html/*.worklet.js 2>/dev/null || true &&
            chmod 755 /usr/share/nginx/html/images 2>/dev/null || true &&
            chmod -R 644 /usr/share/nginx/html/images/* 2>/dev/null || true &&
            echo \"[OK] Permissions fixed\"
        "
    else
        echo "[X] Client container not found, skipping permission fixes"
    fi &&
    
    # Verify services
    echo "" &&
    echo "=== Service Status ===" &&
    sudo docker-compose ps &&
    
    # Health checks
    echo "" &&
    echo "=== Health Checks ===" &&
    echo "Server health:" &&
    curl -s http://localhost:5002/healthz && echo "" || echo "Server not responding" &&
    echo "" &&
    echo "Client (main page):" &&
    curl -s -I http://localhost:80 | head -3 &&
    echo "" &&
    echo "Audio worklet:" &&
    curl -s -I http://localhost:80/audio-processor.worklet.js | head -3 &&
    echo "" &&
    echo "Deepgram logo:" &&
    curl -s -I http://localhost:80/images/deepgram.svg | head -3 &&
    echo "" &&
    echo "=== External connectivity test ===" &&
    echo "Testing if application is accessible externally..." &&
    curl -s -I http://localhost:80 2>&1 | head -3 || echo "[X] External test failed (this is normal if testing from VM)"
' || {
    echo -e "${RED}Error: Failed to start services${NC}"
    echo -e "${YELLOW}Checking container status...${NC}"
    gcloud compute ssh "$VM_NAME" $SSH_OPTS --command '
        # Find docker-compose.yml location
        if [ -f ~/meeting-transcriber/docker-compose.yml ]; then
            cd ~/meeting-transcriber
        elif [ -f ~/docker-compose.yml ]; then
            cd ~
        else
            COMPOSE_FILE=$(find ~ -name docker-compose.yml -type f 2>/dev/null | head -1)
            if [ -n "$COMPOSE_FILE" ] && [ -f "$COMPOSE_FILE" ]; then
                cd "$(dirname "$COMPOSE_FILE")"
            else
                cd ~
            fi
        fi &&
        sudo docker-compose ps' || true
    exit 1
}

# Check DNS configuration
echo ""
echo -e "${YELLOW}Step 6: Checking DNS configuration...${NC}"
VM_IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
DNS_IP=$(dig +short syncscribe.app 2>/dev/null | head -1 || echo "")

if [ -n "$DNS_IP" ] && [ "$VM_IP" = "$DNS_IP" ]; then
    echo -e "${GREEN}[OK] DNS is correctly configured${NC}"
    DNS_OK=true
else
    echo -e "${RED}[X] DNS MISMATCH!${NC}"
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
    echo -e "${YELLOW}[X] DNS needs update - site may not be accessible until DNS propagates${NC}"
    echo ""
    echo -e "${YELLOW}To fix DNS:${NC}"
    echo "  1. Go to Hostinger DNS management"
    echo "  2. Edit A record for @ (root domain)"
    echo "  3. Change to: $VM_IP"
    echo "  4. Wait 5-15 minutes"
    echo "  5. Run: ./scripts/fix-dns.sh to verify"
else
    echo -e "${GREEN}[OK] DNS is configured correctly${NC}"
fi
echo ""
echo -e "${BLUE}Your application URL:${NC}"
echo "  https://syncscribe.app"
echo ""
echo -e "${GREEN}All services are running with correct permissions${NC}"
echo ""

