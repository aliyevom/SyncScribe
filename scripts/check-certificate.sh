#!/bin/bash

# Check SSL certificate status for syncscribe.app
# This script checks the certificate expiration locally

set -e

DOMAIN="${1:-syncscribe.app}"

echo "======================================"
echo "  SSL Certificate Status Check"
echo "======================================"
echo ""
echo "Domain: $DOMAIN"
echo ""

# Check certificate via openssl
echo "Checking certificate..."
echo ""

CERT_INFO=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>&1 | openssl x509 -noout -dates -subject -issuer 2>/dev/null || echo "")

if [ -z "$CERT_INFO" ]; then
    echo "Error: Could not retrieve certificate information"
    echo ""
    echo "Possible issues:"
    echo "  - Domain is not accessible"
    echo "  - Certificate has expired"
    echo "  - SSL/TLS connection failed"
    exit 1
fi

echo "$CERT_INFO" | while IFS= read -r line; do
    if [[ $line == notBefore* ]]; then
        echo "Valid from: ${line#notBefore=}"
    elif [[ $line == notAfter* ]]; then
        EXPIRY_DATE="${line#notAfter=}"
        echo "Valid until: $EXPIRY_DATE"
        
        # Calculate days until expiry
        EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s 2>/dev/null || date -j -f "%b %d %H:%M:%S %Y" "$EXPIRY_DATE" +%s 2>/dev/null || echo "0")
        CURRENT_EPOCH=$(date +%s)
        DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $CURRENT_EPOCH) / 86400 ))
        
        echo ""
        if [ $DAYS_UNTIL_EXPIRY -lt 0 ]; then
            echo "Certificate EXPIRED $((-$DAYS_UNTIL_EXPIRY)) days ago"
            echo ""
            echo "Action required: Renew certificate immediately"
            echo "  Run: ./scripts/renew-certificate.sh (on VM)"
            echo "  Or use GitHub Actions workflow: renew-certificate"
        elif [ $DAYS_UNTIL_EXPIRY -lt 30 ]; then
            echo "Certificate expires in $DAYS_UNTIL_EXPIRY days"
            echo ""
            echo "Action recommended: Renew certificate soon"
            echo "  Run: ./scripts/renew-certificate.sh (on VM)"
            echo "  Or use GitHub Actions workflow: renew-certificate"
        else
            echo "Certificate is valid for $DAYS_UNTIL_EXPIRY more days"
        fi
    elif [[ $line == subject* ]]; then
        echo "Subject: ${line#subject=}"
    elif [[ $line == issuer* ]]; then
        echo "Issuer: ${line#issuer=}"
    fi
done

echo ""
echo "======================================"

# Also check certificate chain
echo ""
echo "Checking certificate chain..."
VERIFY_RESULT=$(echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>&1 | grep "Verify return code" || echo "")
if [ -n "$VERIFY_RESULT" ]; then
    echo "$VERIFY_RESULT"
    if echo "$VERIFY_RESULT" | grep -q "0 (ok)"; then
        echo "Certificate chain is valid"
    else
        echo "Certificate chain verification failed"
    fi
fi
