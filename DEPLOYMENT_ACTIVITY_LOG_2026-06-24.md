# Inluwa Interview Platform — Deployment & Development Activity Log

**Document date:** 24 June 2026  
**Environment:** Production Docker stack on Azure VM (`104.43.91.196`)  
**Live URL:** https://app.inluwa.com  
**Repository path:** `/home/azureuser/interview`

---

## 1. Executive Summary

Local development changes were deployed to the live Docker environment (not pushed to GitHub due to repo write-access restrictions). Work focused on:

- Interview feedback screen redesign (HR workflow)
- AI interview reliability (anti-hallucination, follow-up limits, dynamic LLM responses)
- Recording/transcript persistence fixes
- CV analysis integration in feedback UI
- Production stability (Internal Server Error recovery)

**Current status (24 Jun 2026):** All Docker services running. Site responding (HTTP 200 on `/login`, redirect on `/`).

---

## 2. Infrastructure & Deployment

| Service | Container | Role | Host port |
|---------|-----------|------|-----------|
| Gateway | `interview-gateway-1` | Reverse proxy / WebSocket routing | 3000 |
| Next.js | `interview-nextjs-1` | Web app (production build) | internal 3001 |
| Voice relay | `interview-relay-1` | Google STT/TTS + LLM interview | internal 8081/8082 |
| Emotion | `interview-emotion-1` | Face/emotion analysis API | internal 8090 |

**Deploy command used:**
```bash
cd /home/azureuser/interview
npm run build
docker compose up -d --build
```

**Config files:**
- `docker-compose.yml` — service definitions
- `.env.local` — Supabase, API keys, relay URLs
- `gateway.js` — routes traffic to Next.js, Supabase, relay, emotion

**Note:** Git push to `github.com/Innocorn-Repos/interview.git` failed with HTTP 403 (no write access). All changes were applied directly on the VM via Docker rebuild.

---

## 3. Feature Work Completed

### 3.1 Feedback Screen UI Overhaul (`src/components/interview/interview-results.tsx`)

- Split layout: left sidebar + main content area
- Navigation order:
  1. AI Interview Result
  2. Transcript and Relay
  3. CV Analysis
  4. HR Comments
- Left sidebar upgraded to full-height **Candidate Overview** panel:
  - Onboarding photo (`participantMetadata.capturedPhoto`)
  - Candidate name/email
  - Session snapshot (date, start/end time, duration, role, status, score)
  - Navigation buttons
- Removed duplicate metadata cards from main feedback body (moved to sidebar)
- Interview screenshots shown only under AI Interview Result (not all tabs)

### 3.2 AI Interview Result Sections (reordered)

1. Overall Hireability  
2. Communication Tone & Emotional Presence  
3. Core Competencies  
4. Behavioral Analysis (Big 5)

Additional UI:
- Spider/radar charts aligned (sections 3 & 4 same height)
- Detailed tables for Communication Tone, Core Competencies, Big 5 (web + PDF)
- Collapsible **Interview Highlights** (per-question dropdowns)
- **Integrity signals** and **Vibe** cards
- Tab switching log in integrity signals (replaced “face out of view”)

### 3.3 Pros/Cons → Recommendations / Strengths / Gaps

- 3-tab sliding control under Overall Hireability
- **Recommendations:** HR-oriented bullet points from overall score
- **Strengths:** from LLM `pros`
- **Gaps:** from LLM `cons`
- Standalone summary block removed (replaced by Recommendations tab)

### 3.4 HR Decision Workflow

- HR Comments section includes:
  - Status dropdown: `PENDING`, `SHORTLISTED`, `WAITLISTED`, `REJECTED`
  - Free-text HR comments
- Backend: `updateEvaluationStatus` mutation (`src/server/routers/session.ts`)
- Comments stored in `participantMetadata.hrComment`

### 3.5 CV Analysis (Feedback Tab)

- CV rubric display from candidate profile + assessment criteria
- Sections: overall score, rubrics, professionalism, red flags, profile analysis

---

## 4. AI & Interview Behaviour Fixes

| Issue | Root cause | Fix |
|-------|------------|-----|
| LLM hallucinated grades when candidate didn’t answer | Summary prompt + no guard for empty input | Anti-hallucination rules in `summary.ts`; `isSubstantiveAnswer` bypass in `summarize/route.ts` and `voice/save/route.ts` |
| LLM repeated “Yes, I can hear you clearly…” after real answers | Meta-utterance detection too broad | Stricter `isMetaClarificationOnlyUtterance` in `google-voice-relay.ts` |
| Too many follow-ups on same question | Follow-up depth allowed 1–2 | Hard-capped to max 1 follow-up across relays; question slider sync |
| Video/recording not on feedback screen | Session marked complete before async save finished | `setLocallyCompleted` moved to `finally`; longer save timeouts in `voice-interface.tsx` |
| Eye contact not in report | Metadata not passed to summary LLM | `participantMetadata` included in summary prompt via `voice/save/route.ts` |
| Transcript too fragmented | Each STT chunk = separate line | Consecutive user voice messages merged in transcript |

**Key files:**
- `server/google-voice-relay.ts` (and other relays for follow-up cap)
- `src/lib/ai/prompts/summary.ts`
- `src/app/api/ai/summarize/route.ts`
- `src/app/api/voice/save/route.ts`
- `src/components/session/voice-interface.tsx`

---

## 5. Data & Database

| Item | Location | Notes |
|------|----------|-------|
| Token usage | `sessions.tokenUsage` (JSONB) | Migration: `supabase/migrations/20260612000004_add_token_usage_to_sessions.sql` |
| HR evaluation status | `sessions.evaluationStatus` | Migrations under `supabase/migrations/20260622000000_*` |
| Onboarding photo | `sessions.participantMetadata.capturedPhoto` | Set during interviewee onboarding |
| Local Supabase Studio | `http://127.0.0.1:54323` | Via SSH tunnel from dev machine |

**View token usage in Supabase:** Table Editor → `sessions` → column `tokenUsage`.

---

## 6. Incidents & Resolution

### 6.1 Internal Server Error (24 Jun 2026)

**Symptom:** `app.inluwa.com` showed “Internal Server Error” on all pages.

**Logs:**
```
TypeError: URL is not a constructor
  at parseRelativeUrl (.../next/dist/shared/lib/router/utils/parse-relative-url.js)
  at NextNodeServer.handleRequestImpl
```

**Diagnosis:**
- Next.js container had been running ~42 hours
- Production `.next` build was stale/corrupted (local test also showed missing chunk files before clean rebuild)
- Fresh `rm -rf .next && npm run build` succeeded locally (login → HTTP 200)

**Resolution:**
1. Clean local rebuild: `rm -rf .next && npm run build`
2. Recreate Docker containers: `docker compose up -d --build`
3. Verified: `/login` → 200, `/` → 307 redirect to dashboard

**Prevention:** After major changes, always run clean build before Docker deploy. Restart stack if 500 persists after long uptime.

### 6.2 SSH Access (Dev / Supabase Studio)

**Symptom:** `Permission denied (publickey)` when SSH without key.

**Resolution:** Use Azure private key:
```bash
ssh -i ~/.ssh/<your-azure-key> azureuser@104.43.91.196
# Supabase Studio tunnel:
ssh -i ~/.ssh/<your-azure-key> -L 54323:127.0.0.1:54323 azureuser@104.43.91.196
```

### 6.3 Git Push Blocked

**Symptom:** `remote: Write access to repository not granted` (403).

**Workaround:** Deploy via Docker on VM only; coordinate repo access for future Git-based releases.

---

## 7. Files Modified (Summary)

**Frontend:** `interview-results.tsx`, `pdf-report.tsx`, `report-charts.tsx`, `voice-interface.tsx`  
**Backend/API:** `summarize/route.ts`, `voice/save/route.ts`, `analysis.ts`, `session.ts`  
**Voice relay:** `google-voice-relay.ts`, `deepgram-voice-relay.ts`, `openai-voice-relay.ts`, `voice-relay.ts`  
**AI prompts:** `summary.ts`, `constants.ts`  
**Database:** migrations for `tokenUsage`, `evaluationStatus`, `job_description`, CV analysis

*(Full diff: uncommitted on VM — run `git status` / `git diff` on server.)*

---

## 8. Verification Checklist

- [ ] https://app.inluwa.com loads and login works
- [ ] Complete a test interview; confirm video appears on feedback screen
- [ ] Feedback sidebar shows photo + session snapshot
- [ ] Recommendations / Strengths / Gaps tabs work
- [ ] Integrity signals show tab switching count
- [ ] HR status + comments save correctly
- [ ] PDF export includes Core Competencies table
- [ ] `sessions.tokenUsage` populated after voice interview

---

## 9. Outstanding / Recommended Next Steps

1. **Git access:** Grant push access or create PR workflow so VM changes are backed up in repo.
2. **Full no-cache Docker rebuild:** Ensures Docker image matches latest local `.next` (optional; interrupted once).
3. **Monitoring:** Add uptime check + alert on Next.js 500 errors.
4. **Document deploy runbook:** Standardize `build → docker compose up -d --build → curl health check`.

---

## 10. Contact / Server Details

| Item | Value |
|------|-------|
| VM host | `104.43.91.196` |
| App URL | https://app.inluwa.com |
| Docker port | 3000 (gateway) |
| Local Supabase API | `127.0.0.1:54321` (on VM) |
| Local Supabase Studio | `127.0.0.1:54323` (on VM) |

---

*End of log — generated for internal handover / management review.*
