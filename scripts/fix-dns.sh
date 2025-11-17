#!/bin/bash
# Quick script to check DNS and VM IP match

VM_IP=$(gcloud compute instances describe syncscribe-vm --zone=us-central1-a --format='get(networkInterfaces[0].accessConfigs[0].natIP)')
DNS_IP=$(dig +short syncscribe.app)

echo "======================================"
echo "  DNS Configuration Check"
echo "======================================"
echo ""
echo "VM External IP:    $VM_IP"
echo "syncscribe.app:    $DNS_IP"
echo ""

if [ "$VM_IP" = "$DNS_IP" ]; then
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

