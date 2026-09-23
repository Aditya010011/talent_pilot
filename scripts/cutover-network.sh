#!/usr/bin/env bash
set -euo pipefail
PROJECT=single-quanta-461104-i7
ZONE=asia-southeast1-b
INSTANCE=ai-interview
NEW_IP=34.126.141.210
OLD_IP=104.43.91.196
DOMAIN=app.inluwa.com

echo "==> Adding http-server/https-server network tags"
gcloud compute instances add-tags "$INSTANCE" --zone="$ZONE" --project="$PROJECT" --tags=http-server,https-server

echo "==> Ensuring firewall allows 80/443 (default rules already exist for those tags)"
gcloud compute firewall-rules describe default-allow-http --project="$PROJECT" >/dev/null
gcloud compute firewall-rules describe default-allow-https --project="$PROJECT" >/dev/null

echo "==> Issuing Let's Encrypt cert for $DOMAIN (DNS must already point here)"
CURRENT=$(dig +short "$DOMAIN" | tail -1)
if [[ "$CURRENT" != "$NEW_IP" ]]; then
  echo "DNS for $DOMAIN is '$CURRENT' (expected $NEW_IP). Update Wix A record first."
  exit 1
fi
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email info@inluwa.com --redirect

echo "==> Verifying"
curl -sI "https://$DOMAIN/login" | head -5
echo "Cutover network complete."
