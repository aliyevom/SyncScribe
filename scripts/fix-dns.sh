#!/bin/bash
# Quick script to check DNS and VM IP match

DOMAIN="${1:-voiceido.com}"
VM_NAME="${VM_NAME:-syncscribe-vm}"
ZONE="${ZONE:-us-central1-a}"
GCP_PROJECT_ID="${GCP_PROJECT_ID:-meeting-trans-443019}"

VM_IP=$(gcloud compute instances describe "$VM_NAME" \
    --zone="$ZONE" \
    --project="$GCP_PROJECT_ID" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null || true)
DNS_IP=$(dig +short "$DOMAIN" | head -1)

echo "======================================"
echo "  DNS Configuration Check"
echo "======================================"
echo ""
echo "VM External IP:    $VM_IP"
echo "$DOMAIN:    $DNS_IP"
echo ""

if [ -z "$VM_IP" ]; then
    echo "Could not determine VM IP for $VM_NAME in $GCP_PROJECT_ID/$ZONE"
    exit 1
elif [ "$VM_IP" = "$DNS_IP" ]; then
    echo "✅ DNS is correctly configured!"
else
    echo "❌ DNS MISMATCH!"
    echo ""
    echo "You need to update your DNS A record:"
    echo "  1. Go to Hostinger DNS management"
    echo "  2. Edit the A record for @ (root domain)"
    echo "  3. Change it to: $VM_IP"
    echo "  4. Wait 5-15 minutes for DNS propagation"
    echo ""
    echo "Current DNS points to: $DNS_IP"
    echo "Should point to:      $VM_IP"
fi
echo ""
