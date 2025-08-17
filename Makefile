# SyncScribe Makefile
# Comprehensive project management commands

.PHONY: help install start start-server start-client stop clean setup dev build test lint format update-team tag-meeting analyze-tags monitor-server monitor-client list-server list-client online-server online-client offline-server offline-client online-all offline-all

# Default target - show help
help:
	@echo "SyncScribe Project Commands:"
	@echo "============================"
	@echo "  make install       - Install all dependencies"
	@echo "  make start         - Start both server and client (split terminal)"
	@echo "  make start-server  - Start only the server"
	@echo "  make start-client  - Start only the client"
	@echo "  make stop          - Stop all running processes"
	@echo "  make clean         - Clean ports and remove node_modules"
	@echo "  make setup         - Full setup (install + configure)"
	@echo "  make dev           - Development mode with hot reload"
	@echo "  make build         - Build production version"
	@echo ""
	@echo "Kubernetes monitoring:"
	@echo "  make monitor-server - Tail server logs (syncscribe namespace)"
	@echo "  make monitor-client - Tail client logs (syncscribe namespace)"
	@echo "  make list-server    - List server pods"
	@echo "  make list-client    - List client pods"
	@echo "  make online-server  - Scale server to 1 replica"
	@echo "  make online-client  - Scale client to 1 replica"
	@echo "  make offline-server - Scale server to 0 replicas"
	@echo "  make offline-client - Scale client to 0 replicas"
	@echo "  make online-all     - Scale both to 1 replica"
	@echo "  make offline-all    - Scale both to 0 replicas"
	@echo ""
	@echo "Team & Tag Management:"
	@echo "  make update-team   - Update team data from example"
	@echo "  make tag-meeting   - Create meeting tags configuration"
	@echo "  make analyze-tags  - Show current tag analytics"
	@echo ""
	@echo "Maintenance:"
	@echo "  make test          - Run tests"
	@echo "  make lint          - Run linters"
	@echo "  make format        - Format code"

# Install all dependencies
install:
	@echo "📦 Installing dependencies..."
	@cd server && npm install
	@cd client && npm install
	@echo "✅ Dependencies installed"

# Start both server and client
start:
	@echo "🚀 Starting SyncScribe..."
	@./setup.sh --skip-install --clean

# Start only server
start-server:
	@echo "🖥️  Starting server..."
	@cd server && node index.js

# Start only client
start-client:
	@echo "🌐 Starting client..."
	@cd client && npm start

# Stop all processes
stop:
	@echo "🛑 Stopping all processes..."
	@-lsof -ti:5002 | xargs kill -9 2>/dev/null || true
	@-lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@echo "✅ All processes stopped"

# Clean ports and node_modules
clean: stop
	@echo "🧹 Cleaning project..."
	@rm -rf server/node_modules client/node_modules
	@rm -f server/package-lock.json client/package-lock.json
	@echo "✅ Project cleaned"

# Full setup
setup:
	@echo "🔧 Setting up SyncScribe..."
	@./setup.sh

# Development mode
dev:
	@echo "👨‍💻 Starting in development mode..."
	@if command -v concurrently >/dev/null 2>&1; then \
		concurrently -n "SERVER,CLIENT" -c "blue,green" \
			"cd server && nodemon index.js" \
			"cd client && npm start"; \
	else \
		echo "Installing concurrently..."; \
		npm install -g concurrently; \
		make dev; \
	fi

# Build production
build:
	@echo "🏗️  Building production version..."
	@cd client && npm run build
	@echo "✅ Build complete"

# Update team data
update-team:
	@echo "👥 Updating team data..."
	@cp server/team-data-example.json server/team-data.json
	@echo "✅ Team data updated. Edit server/team-data.json to customize."

# Create meeting tags configuration
tag-meeting:
	@echo "🏷️  Creating meeting tags configuration..."
	@echo "Creating server/meeting-tags.json..."
	@echo '{' > server/meeting-tags.json
	@echo '  "tags": {' >> server/meeting-tags.json
	@echo '    "priority": {' >> server/meeting-tags.json
	@echo '      "critical": {' >> server/meeting-tags.json
	@echo '        "color": "#FF0000",' >> server/meeting-tags.json
	@echo '        "weight": 10,' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This is a CRITICAL priority item requiring immediate attention"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "high": {' >> server/meeting-tags.json
	@echo '        "color": "#FFA500",' >> server/meeting-tags.json
	@echo '        "weight": 7,' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This is a high priority item that should be addressed soon"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "medium": {' >> server/meeting-tags.json
	@echo '        "color": "#FFFF00",' >> server/meeting-tags.json
	@echo '        "weight": 5,' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This is a medium priority item for regular workflow"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "low": {' >> server/meeting-tags.json
	@echo '        "color": "#00FF00",' >> server/meeting-tags.json
	@echo '        "weight": 3,' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This is a low priority item that can be addressed later"' >> server/meeting-tags.json
	@echo '      }' >> server/meeting-tags.json
	@echo '    },' >> server/meeting-tags.json
	@echo '    "type": {' >> server/meeting-tags.json
	@echo '      "decision": {' >> server/meeting-tags.json
	@echo '        "icon": "🎯",' >> server/meeting-tags.json
	@echo '        "aiPrompt": "Mark this as a key decision point"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "action": {' >> server/meeting-tags.json
	@echo '        "icon": "📋",' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This requires specific action items"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "blocker": {' >> server/meeting-tags.json
	@echo '        "icon": "🚫",' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This is blocking progress and needs resolution"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "idea": {' >> server/meeting-tags.json
	@echo '        "icon": "💡",' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This is an idea or suggestion to explore"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "question": {' >> server/meeting-tags.json
	@echo '        "icon": "❓",' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This requires clarification or answers"' >> server/meeting-tags.json
	@echo '      }' >> server/meeting-tags.json
	@echo '    },' >> server/meeting-tags.json
	@echo '    "department": {' >> server/meeting-tags.json
	@echo '      "engineering": {' >> server/meeting-tags.json
	@echo '        "experts": ["CTO", "Tech Lead", "Senior Engineers"],' >> server/meeting-tags.json
	@echo '        "aiPrompt": "Technical discussion requiring engineering expertise"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "product": {' >> server/meeting-tags.json
	@echo '        "experts": ["Product Manager", "Product Owner"],' >> server/meeting-tags.json
	@echo '        "aiPrompt": "Product-related discussion about features or roadmap"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "design": {' >> server/meeting-tags.json
	@echo '        "experts": ["Design Lead", "UX Designer"],' >> server/meeting-tags.json
	@echo '        "aiPrompt": "Design-related discussion about UI/UX"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "business": {' >> server/meeting-tags.json
	@echo '        "experts": ["CEO", "Business Lead"],' >> server/meeting-tags.json
	@echo '        "aiPrompt": "Business strategy or commercial discussion"' >> server/meeting-tags.json
	@echo '      }' >> server/meeting-tags.json
	@echo '    },' >> server/meeting-tags.json
	@echo '    "project": {' >> server/meeting-tags.json
	@echo '      "dashboard-v2": {' >> server/meeting-tags.json
	@echo '        "team": ["Frontend", "Backend", "Design"],' >> server/meeting-tags.json
	@echo '        "aiPrompt": "Related to Dashboard v2 project"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "api-migration": {' >> server/meeting-tags.json
	@echo '        "team": ["Backend", "DevOps"],' >> server/meeting-tags.json
	@echo '        "aiPrompt": "Related to API Migration project"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "mobile-app": {' >> server/meeting-tags.json
	@echo '        "team": ["Mobile", "Backend"],' >> server/meeting-tags.json
	@echo '        "aiPrompt": "Related to Mobile App project"' >> server/meeting-tags.json
	@echo '      }' >> server/meeting-tags.json
	@echo '    }' >> server/meeting-tags.json
	@echo '  },' >> server/meeting-tags.json
	@echo '  "autoTagRules": [' >> server/meeting-tags.json
	@echo '    {' >> server/meeting-tags.json
	@echo '      "keywords": ["critical", "urgent", "asap", "emergency"],' >> server/meeting-tags.json
	@echo '      "tags": ["priority:critical"]' >> server/meeting-tags.json
	@echo '    },' >> server/meeting-tags.json
	@echo '    {' >> server/meeting-tags.json
	@echo '      "keywords": ["decide", "decision", "choose", "select"],' >> server/meeting-tags.json
	@echo '      "tags": ["type:decision"]' >> server/meeting-tags.json
	@echo '    },' >> server/meeting-tags.json
	@echo '    {' >> server/meeting-tags.json
	@echo '      "keywords": ["blocked", "blocker", "stuck", "waiting"],' >> server/meeting-tags.json
	@echo '      "tags": ["type:blocker"]' >> server/meeting-tags.json
	@echo '    },' >> server/meeting-tags.json
	@echo '    {' >> server/meeting-tags.json
	@echo '      "keywords": ["action item", "todo", "task", "assign"],' >> server/meeting-tags.json
	@echo '      "tags": ["type:action"]' >> server/meeting-tags.json
	@echo '    }' >> server/meeting-tags.json
	@echo '  ]' >> server/meeting-tags.json
	@echo '}' >> server/meeting-tags.json
	@echo "✅ Meeting tags configuration created"

# Analyze current tags
analyze-tags:
	@echo "📊 Tag Analytics:"
	@echo "================"
	@if [ -f server/meeting-tags.json ]; then \
		echo "Available tags:"; \
		cat server/meeting-tags.json | grep -E '"(critical|high|medium|low|decision|action|blocker|idea|question)"' | sed 's/.*"\([^"]*\)".*/  - \1/'; \
	else \
		echo "No tags configured. Run 'make tag-meeting' to create tags."; \
	fi

# Run tests
test:
	@echo "🧪 Running tests..."
	@cd server && npm test
	@cd client && npm test

# Run linters
lint:
	@echo "🔍 Running linters..."
	@cd client && npm run lint || true
	@echo "✅ Linting complete"

# Format code
format:
	@echo "✨ Formatting code..."
	@cd client && npx prettier --write "src/**/*.{js,jsx,ts,tsx,css,md}" || true
	@cd server && npx prettier --write "**/*.{js,json,md}" || true
	@echo "✅ Code formatted" 

# Monitor server logs
monitor-server:
	@echo "📡 Tailing server logs... (Ctrl+C to stop)"
	@kubectl -n syncscribe logs deploy/syncscribe-server -f --tail=100 --timestamps | sed -u 's/^/[server] /'

# Monitor client logs
monitor-client:
	@echo "📡 Tailing client logs... (Ctrl+C to stop)"
	@kubectl -n syncscribe logs deploy/syncscribe-client -f --tail=100 --timestamps | sed -u 's/^/[client] /'

# List server pods
list-server:
	@kubectl -n syncscribe get pods -l app=syncscribe-server -o wide

# List client pods
list-client:
	@kubectl -n syncscribe get pods -l app=syncscribe-client -o wide

# Bring workloads online (replicas = 1)
online-server:
	@echo "🔌 Scaling server to 1 replica..."
	@kubectl -n syncscribe scale deploy/syncscribe-server --replicas=1
	@kubectl -n syncscribe rollout status deploy/syncscribe-server

online-client:
	@echo "🔌 Scaling client to 1 replica..."
	@kubectl -n syncscribe scale deploy/syncscribe-client --replicas=1
	@kubectl -n syncscribe rollout status deploy/syncscribe-client

online-all: online-server online-client

# Take workloads offline (replicas = 0)
offline-server:
	@echo "🛑 Scaling server to 0 replicas..."
	@kubectl -n syncscribe scale deploy/syncscribe-server --replicas=0
	@kubectl -n syncscribe get deploy/syncscribe-server

offline-client:
	@echo "🛑 Scaling client to 0 replicas..."
	@kubectl -n syncscribe scale deploy/syncscribe-client --replicas=0
	@kubectl -n syncscribe get deploy/syncscribe-client

offline-all: offline-client offline-server