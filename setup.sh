#!/bin/bash

# SyncScribe Setup Script
# This script sets up and runs both server and client in split terminal mode

echo "🚀 SyncScribe Setup Script"
echo "========================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command_exists node; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

# Check if running on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    TERMINAL="Terminal"
    if ! command_exists osascript; then
        echo -e "${RED}Error: osascript not found (required for macOS)${NC}"
        exit 1
    fi
fi

# Function to setup environment
setup_environment() {
    echo -e "${BLUE}Setting up environment...${NC}"
    
    # Check if .env exists in server
    if [ ! -f "server/.env" ]; then
        echo -e "${YELLOW}Creating .env file from example...${NC}"
        if [ -f "server/.env.example" ]; then
            cp server/.env.example server/.env
            echo -e "${GREEN}✓ Created server/.env${NC}"
            echo -e "${YELLOW}Please update server/.env with your API keys${NC}"
        else
            echo -e "${RED}Warning: No .env.example found in server directory${NC}"
        fi
    fi
    
    # Check if team-data.json exists
    if [ ! -f "server/team-data.json" ]; then
        echo -e "${YELLOW}Creating team-data.json from example...${NC}"
        if [ -f "server/team-data-example.json" ]; then
            cp server/team-data-example.json server/team-data.json
            echo -e "${GREEN}✓ Created server/team-data.json${NC}"
        fi
    fi
}

# Function to install dependencies
install_dependencies() {
    echo -e "${BLUE}Installing dependencies...${NC}"
    
    # Install server dependencies
    echo -e "${YELLOW}Installing server dependencies...${NC}"
    cd server && npm install
    cd ..
    
    # Install client dependencies
    echo -e "${YELLOW}Installing client dependencies...${NC}"
    cd client && npm install
    cd ..
    
    echo -e "${GREEN}✓ Dependencies installed${NC}"
}

# Function to kill processes on ports
cleanup_ports() {
    echo -e "${BLUE}Cleaning up ports...${NC}"
    
    # Kill process on port 5002 (server)
    if lsof -ti:5002 > /dev/null 2>&1; then
        echo -e "${YELLOW}Killing process on port 5002...${NC}"
        lsof -ti:5002 | xargs kill -9 2>/dev/null
    fi
    
    # Kill process on port 3000 (client)
    if lsof -ti:3000 > /dev/null 2>&1; then
        echo -e "${YELLOW}Killing process on port 3000...${NC}"
        lsof -ti:3000 | xargs kill -9 2>/dev/null
    fi
    
    echo -e "${GREEN}✓ Ports cleaned${NC}"
}

# Main setup
main() {
    # Parse arguments
    SKIP_INSTALL=false
    CLEAN_PORTS=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --skip-install)
                SKIP_INSTALL=true
                shift
                ;;
            --clean)
                CLEAN_PORTS=true
                shift
                ;;
            --help)
                echo "Usage: ./setup.sh [OPTIONS]"
                echo "Options:"
                echo "  --skip-install    Skip npm install"
                echo "  --clean          Clean up ports before starting"
                echo "  --help           Show this help message"
                exit 0
                ;;
            *)
                echo "Unknown option: $1"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
    
    # Setup environment
    setup_environment
    
    # Clean ports if requested
    if [ "$CLEAN_PORTS" = true ]; then
        cleanup_ports
    fi
    
    # Install dependencies unless skipped
    if [ "$SKIP_INSTALL" = false ]; then
        install_dependencies
    fi
    
    echo -e "${BLUE}Starting SyncScribe...${NC}"
    
    # For macOS - open in split Terminal windows
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # Start server in new Terminal tab
        osascript -e "
        tell application \"Terminal\"
            activate
            tell application \"System Events\" to keystroke \"t\" using command down
            delay 0.5
            do script \"cd $(pwd)/server && echo 'Starting SyncScribe Server...' && node index.js\" in front window
        end tell"
        
        # Give server time to start
        sleep 2
        
        # Start client in another Terminal tab
        osascript -e "
        tell application \"Terminal\"
            tell application \"System Events\" to keystroke \"t\" using command down
            delay 0.5
            do script \"cd $(pwd)/client && echo 'Starting SyncScribe Client...' && npm start\" in front window
        end tell"
        
        echo -e "${GREEN}✓ SyncScribe is starting in split Terminal tabs${NC}"
        echo -e "${BLUE}Server: http://localhost:5002${NC}"
        echo -e "${BLUE}Client: http://localhost:3000${NC}"
        
    # For Linux - use gnome-terminal or xterm
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if command_exists gnome-terminal; then
            gnome-terminal --tab --title="SyncScribe Server" -- bash -c "cd $(pwd)/server && echo 'Starting SyncScribe Server...' && node index.js; exec bash"
            sleep 2
            gnome-terminal --tab --title="SyncScribe Client" -- bash -c "cd $(pwd)/client && echo 'Starting SyncScribe Client...' && npm start; exec bash"
        elif command_exists xterm; then
            xterm -T "SyncScribe Server" -e "cd $(pwd)/server && echo 'Starting SyncScribe Server...' && node index.js; bash" &
            sleep 2
            xterm -T "SyncScribe Client" -e "cd $(pwd)/client && echo 'Starting SyncScribe Client...' && npm start; bash" &
        else
            echo -e "${RED}No suitable terminal emulator found${NC}"
            echo "Please run manually:"
            echo "  Terminal 1: cd server && node index.js"
            echo "  Terminal 2: cd client && npm start"
        fi
        
    # Fallback - run with npm-run-all or concurrently
    else
        echo -e "${YELLOW}Running in fallback mode...${NC}"
        if command_exists concurrently; then
            concurrently -n "SERVER,CLIENT" -c "blue,green" \
                "cd server && node index.js" \
                "cd client && npm start"
        else
            echo -e "${RED}Platform not fully supported for split terminal${NC}"
            echo "Please run manually in two terminals:"
            echo "  Terminal 1: cd server && node index.js"
            echo "  Terminal 2: cd client && npm start"
        fi
    fi
}

# Run main function
main "$@" 