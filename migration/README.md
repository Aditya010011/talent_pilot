# VM migration notes (2026-07-19)

## Completed on this VM
- Docker app stack running (gateway:3000, nextjs, relay, resume)
- Supabase local started; schema + data restored from old Azure VM API
- Storage objects migrated (recordings/screenshots/resumes/videos)
- Auth user `info@inluwa.com` recreated (same UUID)
- nginx reverse proxy installed for `app.inluwa.com` → `127.0.0.1:3000`
- cloudflared quick tunnel for interim public HTTPS (bypasses GCP firewall)

## Temp login password
`info@inluwa.com` password was reset during restore to:
`TempMigrateChangeMe!2026`
Change it immediately after login.

## Still requires credentials (cannot automate from this VM)
1. **GCP firewall**: add network tags `http-server,https-server` on instance `ai-interview`
   ```bash
   gcloud compute instances add-tags ai-interview --zone=asia-southeast1-b --tags=http-server,https-server
   ```
   Or run: `./scripts/cutover-network.sh` after `gcloud auth login` with an owner/editor account.

2. **DNS (Wix)**: point `app.inluwa.com` A record from `104.43.91.196` → `34.126.141.210`
   - Wix dashboard → Domains → DNS, or
   - `WIX_API_KEY=... ./scripts/update-dns-wix.sh`

3. **TLS**: after DNS+firewall, run certbot:
   ```bash
   sudo certbot --nginx -d app.inluwa.com --agree-tos -m info@inluwa.com --redirect
   ```

## Interim public URL
See cloudflared process / systemd for current trycloudflare.com URL.
