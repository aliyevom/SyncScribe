#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/deploy-gke.sh <gcp-project-id> <gcr-region> <cluster-name> <cluster-zone>
# Example:
#   scripts/deploy-gke.sh my-proj us gke-syncscribe us-central1-a

PROJECT_ID=${1:?"need <project-id>"}
REGION=${2:-us}
CLUSTER=${3:?"need <cluster-name>"}
ZONE=${4:?"need <cluster-zone>"}

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT_DIR"

# Configure docker to use gcloud as a credential helper
if [[ "$REGION" == "us" || "$REGION" == "eu" || "$REGION" == "asia" ]]; then
  REPO_HOST="$REGION.gcr.io"
else
  REPO_HOST="gcr.io"
fi

IMAGE_SERVER="$REPO_HOST/$PROJECT_ID/syncscribe-server:$(git rev-parse --short HEAD)-$(date +%s)"
IMAGE_CLIENT="$REPO_HOST/$PROJECT_ID/syncscribe-client:$(git rev-parse --short HEAD)-$(date +%s)"
IMAGE_SERVER_LATEST="$REPO_HOST/$PROJECT_ID/syncscribe-server:latest"
IMAGE_CLIENT_LATEST="$REPO_HOST/$PROJECT_ID/syncscribe-client:latest"

echo "Building server image $IMAGE_SERVER"
docker build -f Dockerfile.server -t "$IMAGE_SERVER" .

echo "Building client image $IMAGE_CLIENT"
docker build -f Dockerfile.client -t "$IMAGE_CLIENT" .

echo "Pushing images"
docker push "$IMAGE_SERVER"
docker push "$IMAGE_CLIENT"

# Also tag and push :latest for stable manifests
docker tag "$IMAGE_SERVER" "$IMAGE_SERVER_LATEST"
docker tag "$IMAGE_CLIENT" "$IMAGE_CLIENT_LATEST"
docker push "$IMAGE_SERVER_LATEST"
docker push "$IMAGE_CLIENT_LATEST"

# Get cluster credentials
gcloud container clusters get-credentials "$CLUSTER" --zone "$ZONE" --project "$PROJECT_ID"

# Prepare manifests
mkdir -p .k8s-tmp
# Render manifests against :latest (cluster always pulls the most recent build)
sed "s|REPLACE_SERVER_IMAGE|$IMAGE_SERVER_LATEST|g" k8s/server.yaml > .k8s-tmp/server.yaml
sed "s|REPLACE_CLIENT_IMAGE|$IMAGE_CLIENT_LATEST|g" k8s/client.yaml > .k8s-tmp/client.yaml

# Apply
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml || true
kubectl apply -f .k8s-tmp/server.yaml
kubectl apply -f .k8s-tmp/client.yaml
kubectl apply -f k8s/ingress.yaml || true

echo "Deployment applied. Fetching service external IP..."
kubectl -n syncscribe get svc syncscribe-client -w | cat