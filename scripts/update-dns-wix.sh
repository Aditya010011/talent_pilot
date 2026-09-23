#!/usr/bin/env bash
set -euo pipefail
: "${WIX_API_KEY:?Set WIX_API_KEY to an account-level Wix API key}"
DOMAIN=inluwa.com
HOST=app.inluwa.com
NEW_IP=34.126.141.210
OLD_IP=104.43.91.196

# Preview current zone
curl -sS -X GET "https://www.wixapis.com/domains/v1/dns-zones/${DOMAIN}" \
  -H "Authorization: ${WIX_API_KEY}" | tee /tmp/wix-dns.json | head -c 2000; echo

# Update A record for app subdomain
curl -sS -X PATCH "https://www.wixapis.com/domains/v1/dns-zones/${DOMAIN}" \
  -H "Authorization: ${WIX_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"deletions\":[{\"type\":\"A\",\"hostName\":\"${HOST}\",\"values\":[\"${OLD_IP}\"]}],\"additions\":[{\"type\":\"A\",\"hostName\":\"${HOST}\",\"ttl\":3600,\"values\":[\"${NEW_IP}\"]}]}"
echo
dig +short "$HOST"
