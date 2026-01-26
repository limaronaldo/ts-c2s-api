# ts-c2s-api - Memora Knowledge Base

This document contains persistent knowledge to be stored in Memora for AI assistance.

---

## Memory 1: Project Overview

**Tags:** ts-c2s-api, project, overview

### Content

ts-c2s-api is a TypeScript Lead Enrichment API for MBRAS real estate. It enriches leads from Contact2Sale (C2S) CRM with CPF discovery and person data.

**Key Facts:**
- Runtime: Bun + Elysia framework
- Database: PostgreSQL (Drizzle ORM) on Neon
- Deployed: Fly.io at https://ts-c2s-api.fly.dev
- Purpose: Enrich real estate leads with income, addresses, CPF data

**Main Flow:**
1. Lead arrives via webhook (C2S or Google Ads)
2. CPF Discovery: phone → Work API → CPF
3. Enrichment: CPF → Work API → full person data
4. Storage: PostgreSQL + update C2S CRM
5. Alerts: Slack + Email for high-value leads

---

## Memory 2: External APIs

**Tags:** ts-c2s-api, apis, credentials

### Content

**Work API (Completa Buscas)** - Primary enrichment source
- Endpoint: https://completa.workbuscas.com/api
- Modules: phone (CPF lookup), cpf (full data)
- Returns CPF with 14 chars (needs slice to 11)
- Rate limit: 2s between requests

**CPF Discovery Fallback Chain:**
1. Work API phone module (primary, ~85% success)
2. DBase (requires IP whitelist - pending)
3. Mimir (backup)
4. Diretrix (last resort)

**C2S API** - CRM integration
- Base URL configured via C2S_URL env
- Token auth via C2S_TOKEN
- Used for: lead list, create messages, update leads

---

## Memory 3: Database Schema

**Tags:** ts-c2s-api, database, schema

### Content

**Production DB (Fly.io):** analytics schema
- `analytics.parties` - People/companies with CPF, income
- `analytics.party_contacts` - Phones, emails
- `analytics.google_ads_leads` - Lead tracking with retry status
- `analytics.webhook_events` - Audit trail

**Batch Enrichment DB (leads-mb on Neon):** c2s schema
- `c2s.leads` - 36k leads exported from C2S
- `c2s.enriched_leads` - Enrichment results
- `c2s.duplicate_leads` - Duplicate tracking

**Connection (leads-mb):**
```
postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb
```

---

## Memory 4: Key Patterns

**Tags:** ts-c2s-api, patterns, code

### Content

**CPF Normalization:**
Work API returns 14-char CPF (e.g., "00032060751810"). Always slice to 11:
```typescript
if (cpf && cpf.length === 14) {
  cpf = cpf.slice(-11);
}
```

**Income Multiplier:**
Raw income from Work API is multiplied by 1.9 for display:
```typescript
const displayIncome = rawIncome * 1.9;
```

**Async Alert Pattern:**
High-value detection runs async, doesn't block response:
```typescript
this.checkHighValueLeadAsync(leadId, name, data); // fire and forget
```

**Service Container:**
All services in `src/container.ts` as singletons. Access via:
```typescript
import { container } from "./container";
container.workApi.fetchByCpf(cpf);
```

---

## Memory 5: Common Issues & Fixes

**Tags:** ts-c2s-api, troubleshooting, bugs

### Content

**Issue: 0% CPF Discovery**
- Cause: Work API returns 14-char CPF, code expected 11
- Fix: Add `cpf.slice(-11)` normalization
- Files: `cpf-discovery.service.ts`, `batch.ts`

**Issue: Database connection drops**
- Cause: Neon closes idle connections after ~5 min
- Fix: Script has retry logic, just restart if stuck
- Affects: Batch enrichment scripts

**Issue: DBase/Diretrix not working locally**
- Cause: IP not whitelisted (only Fly.io IP works)
- Workaround: Use deployed API endpoint `/batch/enrich-direct`

**Issue: Duplicate messages to C2S**
- Cause: Both enrichment and insight services sending
- Fix: Disabled WebInsightService, use enrichment only

---

## Memory 6: Deployment

**Tags:** ts-c2s-api, deployment, fly

### Content

**Fly.io App:** ts-c2s-api
**Region:** gru (São Paulo)
**URL:** https://ts-c2s-api.fly.dev
**Dedicated IPv4:** 37.16.3.251 (for DBase IP whitelist)

**Deploy Commands:**
```bash
fly deploy              # Deploy
fly logs                # View logs
fly secrets set KEY=val # Set env var
fly ssh console         # SSH in
```

**Health Check:** GET /health
**Dashboard:** GET /dashboard (no auth)
**Metrics:** GET /metrics (Prometheus)

---

## Memory 7: Scripts Organization

**Tags:** ts-c2s-api, scripts, structure

### Content

Scripts reorganized January 2026:

```
scripts/
├── enrichment/     # enrich-via-api.ts, retry-unenriched.ts
├── export/         # export-c2s-psql.ts
├── analysis/       # check-db-status.ts, identify-duplicates.ts
├── debug/          # test-work-api.ts, simulate-*.ts
├── reports/        # leads-by-seller.ts, relatorio-*.ts
└── utils/          # buscar-cpf.ts, check-c2s-*.ts
```

**Batch Enrichment:**
```bash
# Start (runs in background)
nohup bun run scripts/enrichment/enrich-via-api.ts > /tmp/enrich-output.log 2>&1 &

# Monitor
tail -f /tmp/enrich-output.log

# Control
touch /tmp/enrich-pause   # Pause
rm /tmp/enrich-pause      # Resume
touch /tmp/enrich-stop    # Stop
```

---

## Memory 8: High-Value Lead Detection

**Tags:** ts-c2s-api, high-value, alerts

### Content

**Criteria for high-value alerts:**
- Income >= R$10,000/month
- Noble neighborhood (SP: Jardins, Itaim, Moema; RJ: Leblon, Ipanema)
- Notable family (Safra, Lemann, Rudge, etc.)
- Multiple companies (>= 2)

**Alert destinations:**
- Slack: ALERT_WEBHOOK_URL
- Email: via Resend (RESEND_API_KEY)

**Common false positive:**
Common surnames like "Camargo", "Andrade" were triggering "família notável" - fixed by adding TOO_COMMON_FOR_NOTABLE list.

---

## Memory 9: Batch Enrichment Status (Jan 2026)

**Tags:** ts-c2s-api, batch, enrichment, status

### Content

**Batch Enrichment Project - January 2026**

Goal: Enrich 36,000 historical C2S leads

**Current Status:**
- Total leads: 36,113
- Duplicates: 31,403
- Unique to process: ~21,848
- CPF Discovery Rate: ~85%

**Process:**
1. Exported all leads to leads-mb PostgreSQL
2. Identified duplicates by phone
3. Copied existing enrichments (3,347)
4. Running batch via `/batch/enrich-direct` endpoint
5. Using Work API only (DBase/Diretrix need IP whitelist)

**Results Storage:**
- `c2s.enriched_leads` table on leads-mb
- Status: completed / partial / unenriched / failed

---

## Memory 10: Linear Integration

**Tags:** ts-c2s-api, linear, issues

### Content

**Linear Project:** MBRAS Tools
**Issue Prefix:** RML-xxx

**Completed Issues:**
- RML-795: Email alerts (Resend)
- RML-796: Dashboard date filter
- RML-797: Prometheus metrics
- RML-798: Surname database expansion
- RML-809: Smart cron schedule
- RML-810: High-value lead alerts
- RML-811: Fix duplicate messages
- RML-872: Deep lead analysis

**Pending:**
- RML-811: Dashboard authentication

**Create new issue:**
```bash
/linear-issue <title>
```

---

## How to Add to Memora

After Memora MCP is active, run these commands in Claude Code:

```
# Add each memory
create_memory "ts-c2s-api Project Overview" with tags [ts-c2s-api, project]
create_memory "ts-c2s-api External APIs" with tags [ts-c2s-api, apis]
# ... etc
```

Or use the Memora CLI:
```bash
cd ~/Projects/FORK/memora
source .venv/bin/activate
python -m memora.cli add --title "ts-c2s-api Overview" --tags "ts-c2s-api,project" --content "..."
```
