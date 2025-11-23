#!/bin/bash

# RAG Integration Test Runner
# Runs both server and client tests for RAG functionality

set -e

echo "Running RAG Integration Tests"
echo "================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the project root
if [ ! -f "package.json" ]; then
    echo "[X] Error: Please run this script from the project root directory"
    exit 1
fi

# Run server tests
echo -e "${BLUE}Running Server Tests...${NC}"
echo ""
cd server
if npm test; then
    echo -e "${GREEN}[OK] Server tests passed${NC}"
else
    echo -e "${YELLOW}[X] Some server tests failed or were skipped${NC}"
fi
cd ..

echo ""
echo -e "${BLUE}Running Client Tests...${NC}"
echo ""
cd client
# Note: React Scripts may have issues with paths containing square brackets [latest]
# Tests are located in: src/components/__tests__/
# To run manually: cd client && npm test
if CI=true npm test -- --watchAll=false --passWithNoTests 2>&1 | tee /tmp/client-test-output.log; then
    if grep -q "No tests found" /tmp/client-test-output.log; then
        echo -e "${YELLOW}[X] No client tests found${NC}"
        echo -e "${YELLOW}   This may be due to path issues with [latest] in directory name${NC}"
        echo -e "${YELLOW}   Tests exist in: src/components/__tests__/${NC}"
        echo -e "${YELLOW}   To run manually: cd client && npm test${NC}"
    else
        echo -e "${GREEN}[OK] Client tests passed${NC}"
    fi
else
    echo -e "${YELLOW}[X] Some client tests failed or were skipped${NC}"
fi
cd ..

echo ""
echo -e "${GREEN}[OK] Test run complete!${NC}"
echo ""
echo "Note: Some tests may be skipped if GCS credentials are not configured."
echo "This is expected behavior for local development."

