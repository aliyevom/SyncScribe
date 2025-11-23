# SyncScribe Makefile
# Comprehensive project management commands

.PHONY: help install start start-server start-client stop clean setup dev build test lint format update-team tag-meeting analyze-tags monitor-server monitor-client list-server list-client online-server online-client offline-server offline-client online-all offline-all image render-latest purge-all purge-workloads purge-gclb purge-cluster purge-everything reset-online-all setup-gcs upload-samples test-documents

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
	@echo "Document RAG System:"
	@echo "  make setup-gcs     - Setup GCS buckets and service account"
	@echo "  make upload-samples- Upload sample documents to GCS"
	@echo "  make test-documents- Test document processing"
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
	@echo "  make offline-all    - Scale both to 0 replicas and remove LB/Ingress"
	@echo "  make image          - Build and push :latest images via Cloud Build"
	@echo "  make render-latest  - Regenerate .k8s-tmp manifests to use :latest"
	@echo "  make purge-all      - Delete deployments (fully remove workloads)"
	@echo "  make purge-workloads- Delete all namespace resources and the namespace"
	@echo "  make purge-gclb     - Clean GCLB leftovers (NEG, backend, rules)"
	@echo "  make purge-cluster  - Delete the GKE cluster (destructive)"
	@echo "  make purge-everything - Purge workloads, GCLB and cluster*****""
	@echo "  make reset-online-all- Recreate cluster, build+push, deploy, expose*****"
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
	@echo "[OK] Installing dependencies..."
	@cd server && npm install
	@cd client && npm install
	@echo "[OK] Dependencies installed"

# Start both server and client
start:
	@echo "[OK] Starting SyncScribe..."
	@./setup.sh --skip-install --clean

# Start only server
start-server:
	@echo "[OK] Starting server..."
	@cd server && node index.js

# Start only client
start-client:
	@echo "[OK] Starting client..."
	@cd client && npm start

# Stop all processes
stop:
	@echo "[OK] Stopping all processes..."
	@-lsof -ti:5002 | xargs kill -9 2>/dev/null || true
	@-lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	@echo "[OK] All processes stopped"

# Clean ports and node_modules
clean: stop
	@echo "[OK] Cleaning project..."
	@rm -rf server/node_modules client/node_modules
	@rm -f server/package-lock.json client/package-lock.json
	@echo "[OK] Project cleaned"

# Full setup
setup:
	@echo "[OK] Setting up SyncScribe..."
	@./setup.sh

# Development mode
dev:
	@echo "[OK] Starting in development mode..."
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
	@echo "[OK] Building production version..."
	@cd client && npm run build
	@echo "[OK] Build complete"

# Update team data
update-team:
	@echo "[OK] Updating team data..."
	@cp server/team-data-example.json server/team-data.json
	@echo "[OK] Team data updated. Edit server/team-data.json to customize."

# Create meeting tags configuration
tag-meeting:
	@echo "[OK] Creating meeting tags configuration..."
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
	@echo '        "icon": "[OK]",' >> server/meeting-tags.json
	@echo '        "aiPrompt": "Mark this as a key decision point"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "action": {' >> server/meeting-tags.json
	@echo '        "icon": "[OK]",' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This requires specific action items"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "blocker": {' >> server/meeting-tags.json
	@echo '        "icon": "[X]",' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This is blocking progress and needs resolution"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "idea": {' >> server/meeting-tags.json
	@echo '        "icon": "[OK]",' >> server/meeting-tags.json
	@echo '        "aiPrompt": "This is an idea or suggestion to explore"' >> server/meeting-tags.json
	@echo '      },' >> server/meeting-tags.json
	@echo '      "question": {' >> server/meeting-tags.json
	@echo '        "icon": "[OK]",' >> server/meeting-tags.json
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
	@echo "[OK] Meeting tags configuration created"

# Analyze current tags
analyze-tags:
	@echo "[OK] Tag Analytics:"
	@echo "================"
	@if [ -f server/meeting-tags.json ]; then \
		echo "Available tags:"; \
		cat server/meeting-tags.json | grep -E '"(critical|high|medium|low|decision|action|blocker|idea|question)"' | sed 's/.*"\([^"]*\)".*/  - \1/'; \
	else \
		echo "No tags configured. Run 'make tag-meeting' to create tags."; \
	fi

# Run tests
test:
	@echo "[OK] Running tests..."
	@cd server && npm test
	@cd client && npm test

# Run linters
lint:
	@echo "[OK] Running linters..."
	@cd client && npm run lint || true
	@echo "[OK] Linting complete"

# Format code
format:
	@echo "[OK] Formatting code..."
	@cd client && npx prettier --write "src/**/*.{js,jsx,ts,tsx,css,md}" || true
	@cd server && npx prettier --write "**/*.{js,json,md}" || true
	@echo "[OK] Code formatted" 

# Setup GCS buckets for document RAG
setup-gcs:
	@echo "[OK] Setting up GCS buckets..."
	@PROJECT_ID=$${PROJECT_ID:-meeting-trans-443019}; \
	./scripts/setup-gcs-buckets.sh $$PROJECT_ID

# Upload sample documents to GCS
upload-samples:
	@echo "📤 Uploading sample documents..."
	@PROJECT_ID=$${PROJECT_ID:-meeting-trans-443019}; \
	./scripts/upload-sample-docs.sh $$PROJECT_ID

# Test document processing
test-documents:
	@echo "[OK] Testing document processing..."
	@curl -X POST http://localhost:5002/api/process-documents

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
	@echo "[OK] Restoring external access (Service/Ingress)..."
	@if [ -f .k8s-tmp/server.yaml ]; then echo "Applying .k8s-tmp/server.yaml"; kubectl -n syncscribe apply -f .k8s-tmp/server.yaml; else echo "Applying k8s/server.yaml"; kubectl -n syncscribe apply -f k8s/server.yaml; fi
	@if [ -f .k8s-tmp/client.yaml ]; then echo "Applying .k8s-tmp/client.yaml"; kubectl -n syncscribe apply -f .k8s-tmp/client.yaml; else echo "Applying k8s/client.yaml"; kubectl -n syncscribe apply -f k8s/client.yaml; fi
	@if [ -f k8s/managed-cert.yaml ]; then kubectl -n syncscribe apply -f k8s/managed-cert.yaml; else echo "Managed cert manifest not found (skipped)"; fi
	@if [ -f k8s/ingress.yaml ]; then kubectl -n syncscribe apply -f k8s/ingress.yaml; else echo "Ingress manifest not found (skipped)"; fi
	@echo "[OK] Online completed. Current resources:"
	@kubectl -n syncscribe get deploy,svc,ingress || true

# Delete deployments to fully remove workloads from the cluster
purge-all:
	@echo "[OK] Deleting deployments (syncscribe-client, syncscribe-server)..."
	@kubectl -n syncscribe delete deploy/syncscribe-client --ignore-not-found
	@kubectl -n syncscribe delete deploy/syncscribe-server --ignore-not-found
	@echo "[OK] Purge complete. Remaining resources:"
	@kubectl -n syncscribe get deploy,svc,ingress || true

# Fully purge namespace resources (services, ingresses, HPAs, configmaps, secrets, etc.) and the namespace itself
purge-workloads:
	@echo "[OK] Purging all resources in namespace 'syncscribe'..."
	@kubectl delete ingress --all -n syncscribe --ignore-not-found || true
	@kubectl delete svc --all -n syncscribe --ignore-not-found || true
	@kubectl delete deploy --all -n syncscribe --ignore-not-found || true
	@kubectl delete statefulset --all -n syncscribe --ignore-not-found || true
	@kubectl delete ds --all -n syncscribe --ignore-not-found || true
	@kubectl delete hpa --all -n syncscribe --ignore-not-found || true
	@kubectl delete cm --all -n syncscribe --ignore-not-found || true
	@kubectl delete secret --all -n syncscribe --ignore-not-found || true
	@kubectl delete job --all -n syncscribe --ignore-not-found || true
	@kubectl delete pod --all -n syncscribe --ignore-not-found || true
	@echo "[OK] Deleting namespace 'syncscribe'..."
	@kubectl delete namespace syncscribe --ignore-not-found || true
	@echo "[OK] Namespace purge requested (deletion may take ~1-2 minutes)."

# Best-effort cleanup of GCLB resources left by GCE Ingress (scoped by name containing 'syncscribe')
purge-gclb:
	@echo "🧹 Cleaning GCLB artifacts (best-effort)..."
	@PROJECT_ID=$${PROJECT_ID:-meeting-trans-443019}; REGION=$${REGION:-us-central1}; ZONE=$${ZONE:-us-central1-a}; \
	 echo "Project=$$PROJECT_ID Region=$$REGION Zone=$$ZONE"; \
	 set -e; \
	 for bs in $$(gcloud compute backend-services list --project $$PROJECT_ID --format='value(name)' | grep -E 'syncscribe|k8s1-.*syncscribe' || true); do echo "Deleting backend-service $$bs"; gcloud compute backend-services delete $$bs --global --quiet --project $$PROJECT_ID || true; done; \
	 for fr in $$(gcloud compute forwarding-rules list --project $$PROJECT_ID --format='value(name,region)' | awk '/syncscribe|k8s2-/{print $$1" "$$2}' || true); do set -- $$fr; name=$$1; region=$$2; if [ -n "$$region" ]; then echo "Deleting forwarding-rule $$name in $$region"; gcloud compute forwarding-rules delete $$name --region $$region --quiet --project $$PROJECT_ID || true; else echo "Deleting global forwarding-rule $$name"; gcloud compute forwarding-rules delete $$name --global --quiet --project $$PROJECT_ID || true; fi; done; \
	 for tp in $$(gcloud compute target-http-proxies list --project $$PROJECT_ID --format='value(name)' | grep -E 'syncscribe|k8s2-' || true); do echo "Deleting target-http-proxy $$tp"; gcloud compute target-http-proxies delete $$tp --quiet --project $$PROJECT_ID || true; done; \
	 for um in $$(gcloud compute url-maps list --project $$PROJECT_ID --format='value(name)' | grep -E 'syncscribe|k8s2-' || true); do echo "Deleting url-map $$um"; gcloud compute url-maps delete $$um --quiet --project $$PROJECT_ID || true; done; \
	 for hc in $$(gcloud compute health-checks list --project $$PROJECT_ID --format='value(name)' | grep -E 'syncscribe|k8s' || true); do echo "Deleting health-check $$hc"; gcloud compute health-checks delete $$hc --quiet --project $$PROJECT_ID || true; done; \
	 for neg in $$(gcloud compute network-endpoint-groups list --zones $$ZONE --project $$PROJECT_ID --format='value(name)' | grep -E 'syncscribe|k8s1-' || true); do echo "Deleting NEG $$neg in $$ZONE"; gcloud compute network-endpoint-groups delete $$neg --zone $$ZONE --quiet --project $$PROJECT_ID || true; done; \
	 echo "[OK] GCLB cleanup attempted."

# Delete the entire GKE cluster (destructive)
purge-cluster:
	@PROJECT_ID=$${PROJECT_ID:-meeting-trans-443019}; CLUSTER=$${CLUSTER:-gke-syncscribe}; ZONE=$${ZONE:-us-central1-a}; \
	 echo "🔥 Deleting cluster '$$CLUSTER' in $$ZONE (project $$PROJECT_ID)..."; \
	 gcloud container clusters delete "$$CLUSTER" --zone "$$ZONE" --project "$$PROJECT_ID" --quiet || true
	@echo "[OK] Cluster delete requested."

# Run full cleanup sequence
purge-everything: purge-workloads purge-gclb purge-cluster
	@echo "[OK] Full cleanup sequence executed."

# Recreate cluster if missing, build uniquely tagged images, render manifests and bring online
reset-online-all:
	@PROJECT_ID=$${PROJECT_ID:-meeting-trans-443019}; CLUSTER=$${CLUSTER:-gke-syncscribe}; ZONE=$${ZONE:-us-central1-a}; REGION=$${REGION:-us}; \
	 echo "🔁 Resetting environment for $$PROJECT_ID (cluster=$$CLUSTER zone=$$ZONE)"; \
	 if ! gcloud container clusters describe "$$CLUSTER" --zone "$$ZONE" --project "$$PROJECT_ID" >/dev/null 2>&1; then \
	   echo "[OK] Creating cluster $$CLUSTER..."; \
	   gcloud container clusters create "$$CLUSTER" --zone "$$ZONE" --num-nodes=1 --project "$$PROJECT_ID"; \
	 else \
	   echo "[OK] Cluster exists."; \
	 fi; \
	 gcloud container clusters get-credentials "$$CLUSTER" --zone "$$ZONE" --project "$$PROJECT_ID"; \
	 kubectl apply -f k8s/namespace.yaml; \
	 kubectl apply -f k8s/secret.yaml || true; \
	 # Reserve global static IP (idempotent) and compute nip.io domain \
	 if ! gcloud compute addresses describe syncscribe-ip --global --project "$$PROJECT_ID" >/dev/null 2>&1; then \
	   echo "[OK] Reserving global static IP 'syncscribe-ip'..."; \
	   gcloud compute addresses create syncscribe-ip --global --project "$$PROJECT_ID"; \
	 fi; \
	 IP=$$(gcloud compute addresses describe syncscribe-ip --global --project "$$PROJECT_ID" --format='value(address)'); \
	 DOMAIN=$$(echo $$IP | awk -F. '{printf "%s-%s-%s-%s.nip.io", $$1,$$2,$$3,$$4}'); \
	 echo "[OK] Using domain $$DOMAIN"; \
	 TAG=$$(git rev-parse --short HEAD)-$$(date +%s); \
	 echo "[OK] Building images with tag $$TAG..."; \
	 gcloud builds submit --config cloudbuild.yaml \
	   --substitutions _SERVER_IMAGE=us.gcr.io/$$PROJECT_ID/syncscribe-server:$$TAG,_CLIENT_IMAGE=us.gcr.io/$$PROJECT_ID/syncscribe-client:$$TAG .; \
	 echo "[OK] Rendering manifests to .k8s-tmp for tag $$TAG..."; \
	 mkdir -p .k8s-tmp; \
	 sed "s|REPLACE_SERVER_IMAGE|us.gcr.io/$$PROJECT_ID/syncscribe-server:$$TAG|g" k8s/server.yaml > .k8s-tmp/server.yaml; \
	 sed "s|REPLACE_CLIENT_IMAGE|us.gcr.io/$$PROJECT_ID/syncscribe-client:$$TAG|g" k8s/client.yaml > .k8s-tmp/client.yaml; \
	 if [ -f k8s/managed-cert.yaml ]; then sed "s|REPLACE_DOMAIN|$$DOMAIN|g" k8s/managed-cert.yaml > .k8s-tmp/managed-cert.yaml; fi; \
	 if [ -f k8s/ingress.yaml ]; then sed "s|REPLACE_DOMAIN|$$DOMAIN|g" k8s/ingress.yaml > .k8s-tmp/ingress.yaml; fi; \
	 echo "[OK] Applying manifests..."; \
	 kubectl -n syncscribe apply -f .k8s-tmp/server.yaml; \
	 kubectl -n syncscribe apply -f .k8s-tmp/client.yaml; \
	 if [ -f .k8s-tmp/managed-cert.yaml ]; then kubectl -n syncscribe apply -f .k8s-tmp/managed-cert.yaml; fi; \
	 if [ -f .k8s-tmp/ingress.yaml ]; then kubectl -n syncscribe apply -f .k8s-tmp/ingress.yaml; fi; \
	 echo "[OK] Waiting for rollouts..."; \
	 kubectl -n syncscribe rollout status deploy/syncscribe-server; \
	 kubectl -n syncscribe rollout status deploy/syncscribe-client; \
	 echo "--- External Endpoints ---"; \
	 INGRESS=$$(kubectl -n syncscribe get ingress syncscribe-client -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true); \
	 [ -z "$$INGRESS" ] && INGRESS=$$(kubectl -n syncscribe get ingress syncscribe-client -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true); \
	 if [ -n "$$INGRESS" ]; then echo "Ingress: $$INGRESS/*"; else echo "Ingress: (pending)"; fi; \
	 LB_IP=$$(kubectl -n syncscribe get svc syncscribe-client -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || true); \
	 [ -z "$$LB_IP" ] && LB_IP=$$(kubectl -n syncscribe get svc syncscribe-client -o jsonpath='{.status.loadBalancer.ingress[0].hostname}' 2>/dev/null || true); \
	 LB_PORT=$$(kubectl -n syncscribe get svc syncscribe-client -o jsonpath='{.spec.ports[0].port}' 2>/dev/null || echo 80); \
	 if [ -n "$$LB_IP" ]; then echo "LoadBalancer: $$LB_IP:$$LB_PORT"; echo "Browser URL: http://$$LB_IP/"; else echo "LoadBalancer: (pending)"; fi; \
	 echo "[OK] HTTPS URL (once cert is ACTIVE): https://$$DOMAIN"; \
	 echo "[OK] reset-online-all completed for tag $$TAG."

# Build and push images with :latest via Cloud Build
image:
	@echo "[OK] Building and pushing images (:latest) via Cloud Build..."
	@PROJECT_ID=$${PROJECT_ID:-meeting-trans-443019}; \
	 echo "Using PROJECT_ID=$$PROJECT_ID"; \
	 gcloud builds submit --config cloudbuild.yaml \
	   --substitutions _SERVER_IMAGE=us.gcr.io/$$PROJECT_ID/syncscribe-server:latest,_CLIENT_IMAGE=us.gcr.io/$$PROJECT_ID/syncscribe-client:latest .
	@$(MAKE) render-latest
	@echo "[OK] Images built and manifests rendered to .k8s-tmp/*.yaml (using :latest)"

# Render manifests pointing to :latest into .k8s-tmp
render-latest:
	@echo "[OK] Rendering manifests to .k8s-tmp with :latest images..."
	@PROJECT_ID=$${PROJECT_ID:-meeting-trans-443019}; \
	 mkdir -p .k8s-tmp; \
	 sed "s|REPLACE_SERVER_IMAGE|us.gcr.io/$$PROJECT_ID/syncscribe-server:latest|g" k8s/server.yaml > .k8s-tmp/server.yaml; \
	 sed "s|REPLACE_CLIENT_IMAGE|us.gcr.io/$$PROJECT_ID/syncscribe-client:latest|g" k8s/client.yaml > .k8s-tmp/client.yaml; \
	 echo "Rendered: .k8s-tmp/server.yaml, .k8s-tmp/client.yaml"

# Take workloads offline (replicas = 0)
offline-server:
	@echo "[OK] Scaling server to 0 replicas..."
	@kubectl -n syncscribe scale deploy/syncscribe-server --replicas=0
	@kubectl -n syncscribe get deploy/syncscribe-server

offline-client:
	@echo "[OK] Scaling client to 0 replicas..."
	@kubectl -n syncscribe scale deploy/syncscribe-client --replicas=0
	@kubectl -n syncscribe get deploy/syncscribe-client

offline-all: offline-client offline-server
	@echo "🧹 Removing external access (Service/Ingress)..."
	@kubectl -n syncscribe get svc syncscribe-client >/dev/null 2>&1 && kubectl -n syncscribe delete svc syncscribe-client || echo "Service syncscribe-client not found (skipped)"
	@kubectl -n syncscribe get ingress syncscribe-client >/dev/null 2>&1 && kubectl -n syncscribe delete ingress syncscribe-client || echo "Ingress syncscribe-client not found (skipped)"
	@echo "[OK] Offline completed. Remaining resources:"
	@kubectl -n syncscribe get deploy,svc,ingress || true