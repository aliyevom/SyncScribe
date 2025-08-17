# SyncScribe on GKE

## Prereqs
- gcloud CLI authenticated to your project
- Docker logged in to GCR/Artifact Registry via gcloud
- Enabled GKE APIs

## Secrets
Copy `k8s/secret.template.yaml` to `k8s/secret.yaml` and put your keys.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: syncscribe-secrets
  namespace: syncscribe
stringData:
  deepgram_api_key: "<your-deepgram-key>"
```

## Build and Deploy
```
./scripts/deploy-gke.sh <project-id> <gcr-region> <cluster-name> <cluster-zone>
```

## Room routing model
- The browser path `/:roomId(_service)` is preserved across refresh.
- The server joins the Socket.IO room using that `roomId` once connected.
- In Kubernetes, multiple users share the same server Deployment, but each meeting room is a logical room; you can scale the server replica count horizontally.

If you need true one-pod-per-room scheduling, add a small room orchestrator and use a headless Service per room; open an issue and we can extend this.