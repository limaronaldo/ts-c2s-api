# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript C2S Lead Enrichment API - a rewrite of the Rust-based `rust-c2s-api`. Provides lead enrichment services for Contact2Sale (C2S) CRM integration by discovering CPFs from contact info and fetching detailed person data from multiple external APIs.

**Live URL**: https://ts-c2s-api.fly.dev

## Tech Stack

- **Runtime**: Bun 1.1+
- **Framework**: Elysia (type-safe web framework)
- **Database**: PostgreSQL with Drizzle ORM
- **Caching**: In-memory (default) or Redis (optional)
- **Validation**: Zod (config) + Elysia's typebox (routes)
- **HTTP Client**: ky
- **Logging**: pino + pino-pretty
- **Testing**: Bun test (179 tests)
- **Metrics**: Prometheus (prom-client)
- **Email**: Resend

## Commands

```bash
# Development
bun dev                 # Run with hot reload
bun start               # Run production

# Database
bun db:generate         # Generate Drizzle migrations
bun db:migrate          # Run migrations
bun db:studio           # Open Drizzle Studio

# Quality
bun test                # Run tests (140 tests)
bun typecheck           # TypeScript check (tsc --noEmit)

# Deployment
fly deploy              # Deploy to Fly.io
fly status              # Check deployment status
fly logs                # View production logs

# Docker
docker compose up       # Local dev with PostgreSQL
```

## Architecture

### Entry Point & Conditional Loading

The server (`src/index.ts`) supports two modes:
- **Minimal mode**: Only `/health` endpoint (when env vars missing)
- **Full mode**: All routes loaded when `DB_URL`, `C2S_TOKEN`, `WORK_API` are set

Routes requiring config are dynamically imported to allow health checks without full configuration.

### Middleware Stack

When full config is available, the following middleware is applied:
1. **Error Handler** - Standardized error responses
2. **Rate Limiting** - Sliding window rate limiter (configurable)
3. **API Key Auth** - Optional API key validation

### Dependency Injection

`src/container.ts` implements a singleton service container pattern. Services are created once and shared:

```
Container
├── External API Services (stateless, config-dependent)
│   ├── WorkApiService      - Completa Buscas (enrichment data)
│   ├── DiretrixService     - CPF discovery fallback #3
│   ├── DBaseService        - CPF discovery fallback #1
│   ├── MimirService        - CPF discovery fallback #2
│   └── C2SService          - CRM integration
│
├── Internal Services
│   ├── DbStorageService    - Party/contact persistence
│   ├── CpfDiscoveryService - 3-tier fallback orchestrator
│   ├── EnrichmentService   - Main orchestrator
│   ├── RetryService        - Exponential backoff retry logic
│   ├── AlertService        - Slack webhook alerts
│   ├── EmailService        - Email alerts via Resend
│   └── PrometheusService   - Metrics collection
```

### Enrichment Flow

1. Webhook/request received with lead info (phone/email)
2. **CPF Discovery** (`CpfDiscoveryService`): Cache → DBase → Mimir → Diretrix
3. **Data Fetch** (`WorkApiService`): All modules for discovered CPF
4. **Storage** (`DbStorageService`): Upsert party + contacts
5. **C2S Update** (`C2SService`): Push enriched description back
6. **Retry** (if failed): Exponential backoff (1h, 2h, 4h, 8h, 16h)

### Caching Strategy

**In-Memory Caches** (`src/utils/cache.ts`):
- `contactToCpfCache` - phone/email → CPF mapping (24h TTL)
- `recentCpfCache` - recently enriched CPFs (1h TTL)
- `processingLeadsCache` - leads currently processing (5m TTL)
- `workApiCache` - Work API responses (1h TTL)

**Redis Caches** (`src/utils/redis-cache.ts`) - Optional, for multi-instance:
- `redisCpfCache` - CPF cache with `c2s:cpf:` prefix
- `redisContactCache` - Contact cache with `c2s:contact:` prefix
- `redisWorkApiCache` - Work API cache with `c2s:workapi:` prefix

Redis automatically falls back to in-memory if unavailable.

### Database Schema

Uses `analytics` schema for local data:
- `analytics.parties` - People/companies
- `analytics.party_contacts` - Phones/emails with source tracking
- `analytics.addresses` - Address management
- `analytics.webhook_events` - C2S webhook audit trail
- `analytics.google_ads_leads` - Google Ads integration with retry tracking

**Retry Columns** (google_ads_leads):
- `retry_count` - Number of retry attempts
- `last_retry_at` - Timestamp of last retry
- `last_error` - Error message from last attempt

## Environment Variables

### Required
```bash
DB_URL                  # PostgreSQL connection string
C2S_TOKEN               # Contact2Sale API token
C2S_URL                 # C2S API base URL
WORK_API                # Completa Buscas API key
DIRETRIX_USER           # Diretrix username
DIRETRIX_PASS           # Diretrix password
MIMIR_TOKEN             # Mimir API token
DBASE_KEY               # DBase API key
```

### Optional - Features
```bash
# Cron Job
ENABLE_CRON=true        # Enable scheduled enrichment
CRON_INTERVAL="*/15 * * * *"  # Every 15 minutes
CRON_BATCH_SIZE=25      # Leads per batch
CRON_DELAY_MS=1000      # Delay between enrichments

# Retry Logic
RETRY_ENABLED=true      # Enable retry for failed leads
RETRY_MAX_ATTEMPTS=5    # Max retries before marking as failed

# Alerts - Slack
ALERT_WEBHOOK_URL=https://hooks.slack.com/...  # Slack webhook
ALERT_RATE_LIMIT_MINUTES=5   # Min time between same alert type
ALERT_ERROR_THRESHOLD=50     # Error rate % to trigger alert

# Alerts - Email (RML-795)
RESEND_API_KEY=re_xxxxx      # Resend API key
ALERT_EMAIL_ENABLED=true     # Enable email alerts
ALERT_EMAIL_FROM=alerts@domain.com  # Sender address
ALERT_EMAIL_TO=email1@x.com,email2@x.com  # Recipients (comma-separated)

# Redis (optional, falls back to in-memory)
REDIS_ENABLED=false     # Enable Redis caching
REDIS_URL=redis://...   # Redis connection URL

# Security
API_KEY=your-key        # Single API key
API_KEYS=key1,key2      # Multiple API keys (comma-separated)
WEBHOOK_SECRET=secret   # Webhook signature validation

# Rate Limiting
RATE_LIMIT_ENABLED=true # Enable rate limiting
RATE_LIMIT_MAX=100      # Max requests per window
RATE_LIMIT_WINDOW_MS=60000  # Window size (1 minute)

# Business Logic
INCOME_MULTIPLIER=1.9   # Income adjustment factor
```

## API Endpoints

### Core Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (always available) |
| `/leads` | GET | List leads from C2S |
| `/enrich` | POST | Enrich a lead |
| `/enrich/batch` | POST | Batch enrich (max 100) |
| `/customer/:cpf` | GET | Customer lookup by CPF |

### Webhook Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/c2s` | POST | C2S webhook receiver |
| `/webhook/google-ads` | POST | Google Ads lead capture |

### Dashboard Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/dashboard` | GET | HTML monitoring dashboard |
| `/dashboard/data` | GET | JSON data for dashboard |
| `/dashboard/retryable` | GET | List leads eligible for retry |
| `/dashboard/retry` | POST | Trigger manual retry processing |
| `/dashboard/export` | GET | Export leads (CSV/JSON) |
| `/metrics` | GET | Prometheus metrics endpoint |

### Dashboard Export Options
```bash
# Export all leads as CSV
GET /dashboard/export

# Export failed leads as CSV
GET /dashboard/export?status=failed

# Export as JSON with limit
GET /dashboard/export?format=json&limit=100

# Export partial leads
GET /dashboard/export?status=partial&format=csv
```

## Dashboard Features

**Live URL**: https://ts-c2s-api.fly.dev/dashboard

### Metrics Cards
- Total Processed (with session duration)
- Success Rate (full + partial enrichments)
- CPF Discovery Rate
- Need Attention (failed + unenriched count)

### Status Distribution Chart
- Donut chart showing lead status breakdown
- Color-coded: completed (green), partial (yellow), unenriched (red), failed (dark red)

### Service Health
- Real-time status of external services (diretrix, work_api, dbase, c2s)
- Shows downtime duration if service is unavailable

### Cron Status
- Running/Stopped indicator
- Current processing status
- Next scheduled run time
- Error rate percentage

### Recent Activity Table
- Last 20 leads with search and filter
- Filter by name, phone, or lead ID
- Filter by status (completed, partial, unenriched, failed)

### Failed Leads Panel
- Shows leads that failed after max retries
- Displays last error message
- Shows retry count and last attempt time

### Actions
- **Retry Now** button - Manually trigger retry processing
- **Export** dropdown - Download leads as CSV or JSON

### Date Filtering (RML-796)
- **Presets**: Today, Last 7 days, Last 30 days, All time
- **Custom Range**: Date from/to inputs
- **URL Persistence**: Filter state saved in URL params
- Query params: `?preset=7d` or `?dateFrom=2026-01-01&dateTo=2026-01-06`

## Retry Logic

### Exponential Backoff Schedule
| Retry # | Delay |
|---------|-------|
| 1 | 1 hour |
| 2 | 2 hours |
| 3 | 4 hours |
| 4 | 8 hours |
| 5 | 16 hours |

### Retryable Statuses
- `partial` - CPF found but Work API data incomplete
- `unenriched` - CPF not found

### Flow
1. Lead enrichment fails → status set to `partial` or `unenriched`
2. Cron job checks for retryable leads every 15 minutes
3. If enough time has passed since last retry, attempt enrichment
4. On success → status changes to `completed`
5. On failure → increment `retry_count`, update `last_error`
6. After 5 retries → status changes to `failed`, alert sent

## Alerts

### Alert Types
| Type | Severity | Trigger | Email |
|------|----------|---------|-------|
| `lead_max_retries` | ⚠️ warning | Lead fails after 5 retries | ✅ |
| `high_error_rate` | 🚨 critical | Error rate exceeds 50% | ✅ |
| `service_down` | 🚨 critical | External service down for 5+ min | ✅ |

### Slack Integration

Alerts are sent to Slack using the Incoming Webhooks format with blocks:

```
⚠️ LEAD MAX RETRIES
────────────────────
Lead test-123 failed after 5 retries: CPF not found

App: ts-c2s-api | Env: production | Time: 2026-01-05T18:56:00Z
```

### Configuration
```bash
# Set webhook URL in Fly.io
fly secrets set ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz

# Optional settings (defaults shown)
ALERT_RATE_LIMIT_MINUTES=5      # Min time between same alert type
ALERT_ERROR_THRESHOLD=50        # Error rate % to trigger alert
ALERT_ERROR_WINDOW_MINUTES=60   # Window for error rate calculation
ALERT_SERVICE_DOWN_MINUTES=5    # Time before service_down alert
```

### Testing Alerts
```bash
# Send test alert directly to Slack
curl -X POST "https://hooks.slack.com/services/xxx/yyy/zzz" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "⚠️ TEST ALERT",
    "blocks": [
      {"type": "header", "text": {"type": "plain_text", "text": "⚠️ TEST ALERT", "emoji": true}},
      {"type": "section", "text": {"type": "mrkdwn", "text": "Test message from ts-c2s-api"}},
      {"type": "context", "elements": [{"type": "mrkdwn", "text": "*App:* ts-c2s-api | *Env:* test"}]}
    ]
  }'
```

### Email Alerts (RML-795)

Email alerts complement Slack for critical notifications. Uses Resend API.

**Configuration:**
```bash
fly secrets set RESEND_API_KEY=re_xxxxx
fly secrets set ALERT_EMAIL_ENABLED=true
fly secrets set ALERT_EMAIL_FROM=alerts@yourdomain.com
fly secrets set ALERT_EMAIL_TO=team@company.com,oncall@company.com
```

**Email Format:**
- Color-coded header (red=critical, yellow=warning)
- Alert message with details table
- Direct link to dashboard
- Timestamp and environment info

**When Emails Are Sent:**
- All critical alerts (high_error_rate, service_down)
- Lead max retries warnings

## Prometheus Metrics (RML-797)

### Endpoint
```
GET /metrics
```

Returns metrics in Prometheus format for scraping.

### Available Metrics

| Metric | Type | Labels | Description |
|--------|------|--------|-------------|
| `c2s_enrichment_total` | counter | status | Total enrichments by status |
| `c2s_enrichment_duration_seconds` | histogram | status | Enrichment duration |
| `c2s_cpf_discovery_total` | counter | source, result | CPF discovery attempts |
| `c2s_cpf_discovery_duration_seconds` | histogram | source | CPF discovery duration |
| `c2s_external_api_calls_total` | counter | service, status | External API calls |
| `c2s_external_api_duration_seconds` | histogram | service | External API duration |
| `c2s_retry_total` | counter | result | Retry attempts |
| `c2s_retry_queue_size` | gauge | - | Leads eligible for retry |
| `c2s_webhook_total` | counter | source, status | Webhooks received |
| `c2s_leads_by_status` | gauge | status | Current leads by status |
| `c2s_http_requests_total` | counter | method, path, status | HTTP requests |
| `c2s_http_request_duration_seconds` | histogram | method, path | HTTP request duration |

### Default Metrics
Also includes standard Node.js metrics:
- `process_cpu_*` - CPU usage
- `process_resident_memory_bytes` - Memory usage
- `nodejs_eventloop_lag_seconds` - Event loop lag
- `nodejs_heap_*` - Heap statistics

### Example Usage
```bash
# Get all metrics
curl https://ts-c2s-api.fly.dev/metrics

# Filter c2s metrics
curl -s https://ts-c2s-api.fly.dev/metrics | grep "c2s_"
```

### Grafana Integration
Configure Prometheus to scrape:
```yaml
scrape_configs:
  - job_name: 'ts-c2s-api'
    static_configs:
      - targets: ['ts-c2s-api.fly.dev']
    scheme: https
    scrape_interval: 30s
```

## Rate Limiting

### Default Configuration
- **Max requests**: 100 per minute
- **Window**: Sliding window algorithm
- **Scope**: Per IP + path combination

### Response Headers
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1703116518
```

### Rate Limited Response (429)
```json
{
  "success": false,
  "error": "rate_limit_exceeded",
  "message": "Rate limit exceeded, please slow down",
  "retryAfter": 45
}
```

### Skipped Paths
- `/health` - Always allowed
- `/dashboard` - Dashboard access not rate limited

## Authentication

### API Key Authentication
When `API_KEY` or `API_KEYS` is set, requests must include:
- Header: `X-API-Key: your-key`
- Or query param: `?api_key=your-key`
- Or Bearer token: `Authorization: Bearer your-key`

### Skipped Paths
- `/health` - No auth required
- `/dashboard` - No auth required (for monitoring)
- `/webhook/*` - Uses webhook-specific auth

### Unauthorized Response (401)
```json
{
  "success": false,
  "error": "unauthorized",
  "message": "Invalid or missing API key"
}
```

## Deployment

### Fly.io Configuration
- **App**: ts-c2s-api
- **Region**: gru (São Paulo)
- **URL**: https://ts-c2s-api.fly.dev
- **Dedicated IPv4**: 37.16.3.251 (for DBase IP whitelist)

### Machine Specs
- CPU: shared, 1 core
- Memory: 512 MB
- Min machines: 1
- Auto-scaling: enabled

### Health Checks
- Path: `/health`
- Interval: 30s
- Timeout: 5s
- Grace period: 10s

### Deploy Commands
```bash
fly deploy              # Deploy latest changes
fly status              # Check machines status
fly logs                # Stream production logs
fly ssh console         # SSH into machine
fly secrets set KEY=val # Set environment variable
```

## Testing

### Test Structure
```
tests/
├── routes/
│   ├── health.test.ts      # Health endpoint tests
│   ├── enrich.test.ts      # Enrichment endpoint tests
│   └── webhook.test.ts     # Webhook endpoint tests
├── services/
│   ├── enrichment.service.test.ts
│   ├── cpf-discovery.service.test.ts
│   ├── db-storage.service.test.ts
│   ├── retry.service.test.ts    # Retry logic tests
│   └── alert.service.test.ts    # Alert service tests
└── utils/
    ├── cache.test.ts       # Cache tests
    ├── retry.test.ts       # Retry utility tests
    └── name-matcher.test.ts
```

### Running Tests
```bash
bun test                # Run all tests
bun test --watch        # Watch mode
bun test retry          # Run tests matching "retry"
```

### Test Stats
- **Total tests**: 179
- **Test files**: 13
- **Passing**: 100%

## File Structure

```
src/
├── config/
│   └── index.ts            # Zod config validation
├── db/
│   ├── client.ts           # Drizzle client
│   └── schema.ts           # Database schema
├── errors/
│   └── app-error.ts        # Error handling
├── jobs/
│   └── enrichment-cron.ts  # Scheduled enrichment
├── middleware/
│   ├── auth.ts             # API key authentication
│   ├── rate-limit.ts       # Rate limiting
│   └── metrics.ts          # Prometheus HTTP instrumentation
├── routes/
│   ├── health.ts
│   ├── leads.ts
│   ├── enrich.ts
│   ├── webhook.ts
│   ├── customer.ts
│   ├── dashboard.ts        # Dashboard endpoints
│   └── ...
├── services/
│   ├── enrichment.service.ts
│   ├── cpf-discovery.service.ts
│   ├── work-api.service.ts
│   ├── c2s.service.ts
│   ├── diretrix.service.ts
│   ├── dbase.service.ts
│   ├── mimir.service.ts
│   ├── db-storage.service.ts
│   ├── retry.service.ts    # Retry logic
│   ├── alert.service.ts    # Slack + email alerts
│   ├── email.service.ts    # Resend email delivery
│   ├── prometheus.service.ts # Prometheus metrics
│   ├── metrics.service.ts
│   └── web-insight.service.ts # Auto-insight generation
├── templates/
│   └── dashboard.html.ts   # Dashboard HTML
├── utils/
│   ├── cache.ts            # In-memory cache
│   ├── redis-cache.ts      # Redis cache
│   ├── logger.ts
│   ├── normalize.ts
│   ├── phone.ts
│   ├── retry.ts
│   ├── name-matcher.ts
│   ├── description-builder.ts
│   ├── surname-analyzer.ts # Surname analysis for insights
│   ├── insight-formatter.ts # Insight message formatting
│   ├── neighborhoods.ts    # Noble neighborhoods SP/RJ (RML-810)
│   └── high-value-detector.ts # Premium lead detection (RML-810)
├── container.ts            # DI container
└── index.ts                # Entry point
```

## Changelog

### January 15, 2026

#### High-Value Lead Alerts Improvements
- **Fixed duplicate messages**: Removed `WebInsightService.generateInsightsAsync()` from enrichment flow
  - Before: Lead received 2 messages (Enrichment + Insight with redundant info)
  - After: Lead receives 1 message (Enrichment only)
- **Fixed inconsistent income values**: `description-builder.ts` now applies income multiplier (1.9x)
  - Before: Enrichment showed R$ 13.957, Insight showed R$ 26.520
  - After: Both show R$ 26.520 (consistent)
- **Fixed false positive notable families**: Common surnames no longer trigger "família notável"
  - Added `TOO_COMMON_FOR_NOTABLE` list in `surname-analyzer.ts`
  - Removed: Camargo, Andrade, Batista, Diniz, Moreira, Bueno, Klein, Trajano, etc.
  - Before: "Augusto Camargo Neto" → "Família Camargo Corrêa" (false positive)
  - After: "Camargo" treated as common surname (no alert)
  - Still notable: Safra, Lemann, Steinbruch, Gerdau, Marinho, Rudge, Setúbal (rare surnames)
- **Adjusted high-value scoring**:
  - Very high income (>= R$20k): 50 pts (triggers alert alone)
  - High income (>= R$15k): 36 pts (needs another factor)
  - Noble neighborhood: 15 pts
  - Notable family: 50 pts
  - Alert threshold: 50+ pts

#### RML-872: Deep Lead Analysis
- Added automatic deep lead analysis after enrichment
- New services created:
  - `WebSearchService` - Google Custom Search integration for person/company lookup
  - `DomainAnalyzerService` - Email domain analysis to identify companies
  - `RiskDetectorService` - Risk detection with known individuals database (e.g., Fernandin OIG)
  - `TierCalculatorService` - Multi-factor tier scoring (Platinum/Gold/Silver/Bronze/Risk)
  - `LeadAnalysisService` - Orchestrator that coordinates all analysis services
- New database table `analytics.lead_analyses` stores analysis results
- Tier scoring based on: income, role, education, neighborhood, company, family name
- Risk detection for:
  - Known individuals (CPI das Bets, fraud investigations)
  - Negative news mentions (lavagem, fraude, investigação)
  - Suspicious patterns
- New alert type `lead_risk_detected` for high-risk leads
- Configuration: `ENABLE_LEAD_ANALYSIS=true` (default)
- Async execution - doesn't block enrichment response

#### RML-871: PDF Report Generation
- Added `/dashboard/report` endpoint for PDF generation
- Professional HTML template with tier-based styling
- Chrome headless PDF generation via `report.service.ts`

### January 12, 2026

#### RML-811: Fix Duplicate "Nome: Unknown" Messages
- Fixed issue where leads with name "Unknown" were sending duplicate messages to C2S
- Added validation in `createUnenrichedCustomer()` to skip message when name is Unknown/empty
- Added validation in `createBasicCustomer()` to skip message when name is Unknown/empty
- Modified `processRetries()` in cron job to:
  - Skip leads with Unknown name (they will never enrich successfully)
  - Mark them as failed to prevent infinite retry loops
  - Added `isValidNameForRetry()` helper function
- Leads with valid names still receive messages as before
- Status is updated even when message is skipped (for tracking purposes)

### January 6, 2026

#### RML-809: Smart Cron Schedule
- Replaced fixed 15-minute cron with dynamic intervals
- Business hours (09-19h SP): 5 min intervals
- Evening (19-23:30h): 20 min intervals
- Night (23:30-06h): 60 min intervals
- Early morning (06-09h): 20 min intervals
- Dashboard shows current period and interval

#### RML-810: High-Value Lead Alerts
- Added `neighborhoods.ts` with 90+ noble neighborhoods (SP/RJ)
- Added `high-value-detector.ts` with multi-criteria detection
- New alert type `high_value_lead` with Slack + Email
- Criteria: income >= R$10k, noble neighborhood, multiple companies, notable family
- Async execution after successful enrichment

#### RML-795: Email Alerts
- Added Resend integration for email alerts
- Created `email.service.ts` with HTML email templates
- Emails sent for critical alerts and lead_max_retries
- Configuration: `RESEND_API_KEY`, `ALERT_EMAIL_*`

#### RML-796: Dashboard Date Filter
- Added date filtering to dashboard with presets (Today, 7d, 30d, All)
- Custom date range inputs
- URL parameter persistence for filter state
- Updated `db-storage.service.ts` with date filtering

#### RML-797: Prometheus Metrics
- Added `/metrics` endpoint with prom-client
- Custom metrics: enrichment, CPF discovery, API calls, retries
- HTTP request instrumentation via middleware
- Default Node.js metrics (CPU, memory, event loop)

#### RML-798: Expanded Surname Database
- Added 150+ rare surnames (Korean, Chinese, Indian, Jewish, etc.)
- Added 75+ notable families (banking, real estate, tech, media)
- Improved lead scoring accuracy

### January 5, 2026

#### Slack Alerts Fix
- Fixed Slack webhook format (was returning 400 error)
- Changed from generic JSON to Slack blocks format
- Added header, section, and context blocks
- Alerts now display properly in Slack channel

#### Linear Integration
- Created 4 feature issues in Linear (RML-795 to RML-798)
- Email alerts, Dashboard date filter, Prometheus metrics, Surname database expansion

### December 29, 2025

#### Message Logging
- Added full message content logging to C2S service
- Logs include leadId, message length, and full message content
- Helps debug enrichment and insight message formatting

### December 24-25, 2025

#### Auto-Insights Feature
- Added automatic insight generation for incoming leads
- Surname analyzer detects rare surnames and notable families
- CNPJ lookup via ReceitaWS/Brasil API/Casa dos Dados
- Google Custom Search integration for LinkedIn, news, companies
- Async execution - doesn't block webhook response
- Lead scoring with Bronze/Silver/Gold/Platinum tiers

#### New Services
- `WebInsightService` - Main insight orchestrator
- `CnpjLookupService` - Company search by owner name
- `GoogleSearchService` - Web search with 90/day rate limit

#### Configuration
- `ENABLE_WEB_INSIGHTS` - Toggle insights (default: true)
- `INSIGHT_MIN_CONFIDENCE` - Min score to send (default: 60)
- `GOOGLE_API_KEY` / `GOOGLE_CSE_ID` - Google Search credentials

### December 20, 2025

#### Dashboard Enhancements
- Added donut chart for lead status distribution
- Added CSV/JSON export functionality (`/dashboard/export`)
- Added search and status filtering for leads table
- Added manual retry trigger button
- Added retryable leads endpoint (`/dashboard/retryable`)

#### Redis Caching
- Added optional Redis support with in-memory fallback
- New config: `REDIS_ENABLED`, `REDIS_URL`
- Automatic reconnection and graceful degradation
- Redis caches: `redisCpfCache`, `redisContactCache`, `redisWorkApiCache`

#### API Security
- Added rate limiting middleware (sliding window)
- Added API key authentication middleware
- New config: `API_KEY`, `API_KEYS`, `RATE_LIMIT_*`
- Standard rate limit headers in responses

#### Testing
- Added 34 new tests for retry and alert services
- Fixed TypeScript errors in existing tests
- Total: 140 tests across 11 files

#### Previous (RML-639)
- Retry logic with exponential backoff
- Dashboard with real-time monitoring
- Slack webhook alerts
- Diretrix 400 error fix

## C2S Message Format

When a lead is enriched, a message is sent to C2S with the following simplified format:

### Full Enrichment (CPF + Work API data)
```
CPF: 123.456.789-00
Nome: João da Silva
Nascimento: 15/03/1985
Sexo: Masculino
Mãe: Maria da Silva

Renda: R$ 15.000,00
Renda Presumida: R$ 18.000,00
Patrimônio: R$ 500.000,00

Profissão: Engenheiro Civil
Escolaridade: Superior Completo
Estado Civil: Casado

📱 +55 11 99999-8888 (celular)
📱 +55 11 3333-4444 (residencial)
✉️ joao@email.com

📍 Rua das Flores, 123
   Apto 45
   Jardins - São Paulo - SP
   CEP: 01234-567

🎯 Campanha: Google Ads - Imóveis Alto Padrão
```

### Simple (CPF not found)
```
Nome: João da Silva
📱 +55 11 99999-8888
✉️ joao@email.com

🎯 Campanha: Google Ads - Imóveis
```

### Partial (CPF found, Work API timeout)
```
CPF: 123.456.789-00
Nome: João da Silva
📱 +55 11 99999-8888
✉️ joao@email.com

🎯 Campanha: Google Ads - Imóveis
```

### Name Mismatch Warning
When the lead name doesn't match the CPF owner, a warning is prepended:
```
⚠️ Nome diferente do Lead: Joao Silva

CPF: 123.456.789-00
Nome: João Pedro da Silva Santos
...
```

## Database Queries

### Check enrichment stats by date
```sql
SELECT 
  created_at::date as date, 
  enrichment_status, 
  COUNT(*) 
FROM analytics.google_ads_leads 
WHERE created_at >= '2025-12-21' 
GROUP BY 1, 2 
ORDER BY 1 DESC, 2;
```

### View enriched leads with party data
```sql
SELECT 
  p.name, 
  p.cpf_cnpj as cpf, 
  p.income, 
  g.created_at::time as time
FROM analytics.google_ads_leads g
JOIN analytics.parties p ON g.party_id = p.id
WHERE g.created_at::date = '2025-12-21' 
  AND g.enrichment_status = 'completed'
ORDER BY g.created_at;
```

### Find high-income leads
```sql
SELECT 
  p.name, 
  p.cpf_cnpj, 
  p.income::numeric as income,
  g.created_at
FROM analytics.google_ads_leads g
JOIN analytics.parties p ON g.party_id = p.id
WHERE p.income IS NOT NULL
ORDER BY p.income::numeric DESC
LIMIT 20;
```

### Check retry status
```sql
SELECT 
  lead_id,
  enrichment_status,
  retry_count,
  last_retry_at,
  last_error
FROM analytics.google_ads_leads
WHERE enrichment_status IN ('partial', 'unenriched', 'failed')
ORDER BY retry_count DESC;
```

## Performance Metrics

### Typical enrichment stats (Dec 2025)
- **Daily leads**: 15-20 new leads
- **Success rate**: ~94% (15 enriched, 1 unenriched typical)
- **CPF discovery rate**: ~95%
- **Processing time**: 15-40 seconds per lead

### Top leads by income (Dec 21, 2025)
| Name | Income (R$) |
|------|-------------|
| Sergio Botelho Teixeira | 33,276 |
| Jeanette Azar | 24,940 |
| Francisco Roberto Soares Da Silva | 23,293 |
| Marcelo Rodrigues | 21,276 |

## Lead Analysis & Insights Feature (Dec 24, 2025)

### Overview
Análise manual de leads do C2S com pesquisa web para identificar insights exclusivos sobre clientes de alto valor.

### Scripts Criados

```bash
# Buscar últimos 25 leads do C2S
bun run get-leads.ts

# Analisar status de enriquecimento
bun run analyze-leads.ts

# Analisar leads com dados completos
bun run analyze-all-leads.ts

# Analisar melhores leads com renda
bun run analyze-best-leads.ts

# Enviar insights exclusivos ao C2S
bun run send-insights.ts
```

### Insights Exclusivos Descobertos (24/12/2025)

| Lead | Insight | Potencial |
|------|---------|-----------|
| **Dercio Falabella** | CEO do Grupo Hauzen (5 empresas imobiliárias, capital R$592k) | ⭐⭐⭐⭐⭐ |
| **Lucia Leal Rudge** | Família do VP do Itaú, parente de Lala Rudge (influenciadora) | ⭐⭐⭐⭐⭐ |
| **Luiz Godinho** | Casal dono da ARC Cosméticos (4 empresas, confirmado via CNPJ) | ⭐⭐⭐⭐ |
| **Mario Roos** | Empresário sul-africano, Entrepreneur of the Year 2019 | ⭐⭐⭐⭐ |
| **Nicolas Passafaro** | Filho de advogado condecorado (sobrenome raro no Brasil) | ⭐⭐⭐⭐ |
| **Clarimundo Sant'anna** | Casal no Leblon/RJ, renda R$6.836/mês | ⭐⭐⭐⭐ |
| **Francisco Soares** | Maior renda da lista: R$12.259/mês (R$147k/ano) | ⭐⭐⭐⭐⭐ |

### Análise de Name Mismatch

Quando o CPF encontrado pertence a pessoa diferente do lead, geralmente indica:

| Padrão | Significado | Exemplo |
|--------|-------------|---------|
| Mesmo sobrenome | Cônjuge ou familiar | Luiz Godinho → Adriana Godinho |
| Sobrenome raro | Família específica | Nicolas Passafaro → Leonardo Passafaro |
| Nome junto | Email/nome concatenado | Martarabello → Marta + Rabello |
| Endereço nobre | Patrimônio familiar | Sant'anna no Leblon |

### Estatísticas de Enriquecimento (24/12/2025)

```
Total Leads: 25
├── Full Match (mesma pessoa): 7 (28%)
├── Name Mismatch (família/cônjuge): 14 (56%)
├── Failed (CPF não encontrado): 3 (12%)
└── Partial (dados incompletos): 1 (4%)

CPF Discovery Rate: 84%
Insights Enviados: 8 leads prioritários
```

### Mensagens Enviadas ao C2S

Formato das mensagens de insight:
```
🔍 INSIGHT EXCLUSIVO - LEAD PRIORITÁRIO

📊 Perfil Empresarial/Familiar:
[Detalhes descobertos via pesquisa web]

💰 Perfil Financeiro:
[Renda, empresas, patrimônio]

💡 Por que é valioso:
[Análise de potencial]

🎯 Recomendação:
[Sugestão de abordagem]

Fonte: [Fontes consultadas]
```

### Fontes de Pesquisa Utilizadas

- **CNPJ Services** - Consulta de sócios e empresas
- **Adv Dinâmico** - Perfis empresariais
- **Escavador** - Processos e registros públicos
- **LinkedIn** - Perfis profissionais
- **EOY South Africa** - Entrepreneur of the Year
- **Metrópoles/Caras** - Perfis de alta sociedade

### Limitações Conhecidas

1. **C2S PATCH API quebrada** - Endpoint `/integration/leads/:id` com `is_favorite` retorna erro Ruby
2. **Alternativa implementada** - Tags VIP criadas para marcar leads prioritários
3. **Pesquisa manual** - Insights requerem análise humana + web search

## Message Logging (Dec 29, 2025)

All messages sent to C2S are now logged for debugging purposes:

```bash
# View message content in logs
fly logs | grep "Message content sent to C2S"
```

**Log format:**
```json
{
  "level": 30,
  "module": "c2s",
  "leadId": "abc123",
  "messageLength": 450,
  "messageContent": "CPF: 123.456.789-00\nNome: João...",
  "msg": "Message content sent to C2S"
}
```

This helps verify:
- Enrichment message format and content
- Insight message was generated and sent
- Name mismatch warnings are being added

## Smart Cron Schedule (RML-809)

### Overview

O cron de enrichment agora usa intervalos dinâmicos baseados no horário de São Paulo, otimizando o processamento durante horário comercial.

### Schedule

| Período | Horário (SP) | Intervalo | Justificativa |
|---------|--------------|-----------|---------------|
| **Business Hours** | 09:00 - 19:00 | 5 min | Leads frescos, vendedores ativos |
| **Evening** | 19:00 - 23:30 | 20 min | Menos urgente, ainda processando |
| **Night** | 23:30 - 06:00 | 60 min | Mínimo necessário |
| **Early Morning** | 06:00 - 09:00 | 20 min | Preparando para horário comercial |

### Implementation

```typescript
// src/jobs/enrichment-cron.ts
function getSmartInterval(): { intervalMs: number; period: string } {
  const now = new Date();
  const spTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const hours = spTime.getHours();
  const minutes = spTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;

  // 09:00-19:00: 5 min (business hours)
  if (timeInMinutes >= 540 && timeInMinutes < 1140) {
    return { intervalMs: 5 * 60 * 1000, period: "business" };
  }
  // 19:00-23:30: 20 min (evening)
  if (timeInMinutes >= 1140 && timeInMinutes < 1410) {
    return { intervalMs: 20 * 60 * 1000, period: "evening" };
  }
  // 23:30-06:00: 60 min (night)
  if (timeInMinutes >= 1410 || timeInMinutes < 360) {
    return { intervalMs: 60 * 60 * 1000, period: "night" };
  }
  // 06:00-09:00: 20 min (early morning)
  return { intervalMs: 20 * 60 * 1000, period: "early_morning" };
}
```

### Dashboard Status

O dashboard mostra o período atual e intervalo:

```json
{
  "cron": {
    "enabled": true,
    "running": true,
    "currentPeriod": "business",
    "currentIntervalMinutes": 5,
    "lastRun": "2026-01-06T15:30:00Z",
    "nextRun": "2026-01-06T15:35:00Z"
  }
}
```

### Verificação

```bash
# Ver status do cron no dashboard
curl -s https://ts-c2s-api.fly.dev/dashboard/data | jq '.cron'

# Ver logs do cron
fly logs | grep "Smart cron"
```

## High-Value Lead Alerts (RML-810)

### Overview

Detecção automática de leads premium com alertas via Slack + Email. Quando um lead é enriquecido com sucesso, o sistema analisa múltiplos critérios para identificar clientes de alto valor.

### Criteria

| Critério | Threshold | Exemplo |
|----------|-----------|---------|
| **Alta Renda** | >= R$10.000/mês | Renda ou renda presumida |
| **Bairro Nobre** | Lista SP/RJ | Jardins, Itaim, Leblon, Ipanema |
| **Múltiplas Empresas** | >= 2 ativas | Sócio de 3 empresas |
| **Família Notável** | Lista conhecida | Safra, Rudge, Lemann |
| **Sobrenome Raro** | Confiança >= 70% | Passafaro, Falabella |

### Noble Neighborhoods

**São Paulo (50+ bairros):**
```
jardim europa, jardim america, jardim paulistano, jardim paulista,
itaim bibi, vila nova conceicao, moema, vila olimpia, pinheiros,
higienopolis, morumbi, brooklin, campo belo, paraiso, vila mariana,
perdizes, pacaembu, sumare, pompeia, lapa, vila madalena, butanta,
real parque, cidade jardim, granja julieta, chacara flora,
chacara santo antonio, santo amaro, jardim marajoara, interlagos,
alphaville, tambore, aldeia da serra, granja viana
```

**Rio de Janeiro (40+ bairros):**
```
leblon, ipanema, lagoa, gavea, jardim botanico, humaita, botafogo,
flamengo, laranjeiras, cosme velho, santa teresa, urca, leme,
copacabana, arpoador, sao conrado, barra da tijuca, recreio,
joatinga, itanhanga, alto da boa vista, tijuca, vila isabel,
graca, gloria, catete, centro
```

### Alert Format (Slack)

```
🔥 HIGH VALUE LEAD

*Nome:* João da Silva
*Renda:* R$ 15.000,00/mês
*Bairro:* Jardim Europa
*Empresas:* 3 ativas
*Telefone:* +55 11 99999-8888

*Por que é premium:*
• Renda alta: R$ 15.000,00/mês
• Bairro nobre: Jardim Europa
• 3 empresas ativas

App: ts-c2s-api | Env: production | Time: 2026-01-06T15:30:00Z
```

### Implementation Files

| File | Purpose |
|------|---------|
| `src/utils/neighborhoods.ts` | Base de dados de bairros nobres SP/RJ |
| `src/utils/high-value-detector.ts` | Lógica de detecção com `detectHighValueLead()` |
| `src/services/alert.service.ts` | Alert type `high_value_lead` e formatação |
| `src/services/enrichment.service.ts` | Integração via `checkHighValueLeadAsync()` |

### Code Flow

```typescript
// enrichment.service.ts - após enrichment bem-sucedido
this.checkHighValueLeadAsync(
  leadId,
  name,
  personData,
  phone,
  email,
  c2sResult.data.id,
);

// Executa async, não bloqueia retorno
private checkHighValueLeadAsync(...) {
  (async () => {
    const result = detectHighValueLead({
      income: personData.renda,
      addresses: personData.enderecos,
      enrichedName: personData.nome,
    });

    if (result.isHighValue) {
      await alertService.alertHighValueLead({
        leadId,
        name: personData.nome,
        income: result.details.income,
        neighborhood: result.details.neighborhood,
        reasons: result.reasons,
      });
    }
  })();
}
```

### Testing Detection

```typescript
import { detectHighValueLead } from "./utils/high-value-detector";

const result = detectHighValueLead({
  income: 15000,
  addresses: [{ neighborhood: "Jardim Europa", city: "São Paulo", state: "SP" }],
  enrichedName: "João Safra",
});

// result:
// {
//   isHighValue: true,
//   reasons: [
//     "Renda alta: R$ 15.000,00/mês",
//     "Bairro nobre: Jardim Europa",
//     "Família notável: Família bancária, uma das mais ricas do Brasil"
//   ],
//   details: {
//     income: 15000,
//     neighborhood: "Jardim Europa",
//     familyName: "safra",
//     familyContext: "Família bancária, uma das mais ricas do Brasil"
//   }
// }
```

### Logs

```bash
# Ver detecções de high-value
fly logs | grep "High-value lead detected"

# Exemplo de log
{
  "level": 30,
  "module": "enrichment",
  "leadId": "abc123",
  "reasons": ["Renda alta: R$ 15.000,00/mês", "Bairro nobre: Jardim Europa"],
  "details": { "income": 15000, "neighborhood": "Jardim Europa" },
  "msg": "High-value lead detected!"
}
```

## TODO

### Pending
- [ ] DBase IP whitelist for `37.16.3.251` - Requested Dec 20, follow up Dec 23
- [ ] Reportar bug do C2S PATCH API (is_favorite retorna 422)
- [ ] RML-811: Dashboard authentication (simple password)

### Completed (Jan 6, 2026)
- [x] RML-795: Email alerts (Resend integration)
- [x] RML-796: Dashboard date range filtering
- [x] RML-797: Prometheus metrics endpoint
- [x] RML-798: Expand surname database
- [x] RML-809: Smart cron schedule (dynamic intervals)
- [x] RML-810: High-value lead alerts

## Auto-Insights Feature (Dec 24, 2025)

### Overview

Funcionalidade automática que gera insights sobre leads quando chegam via webhook. Analisa conexões familiares, sobrenomes raros, perfil empresarial e envia mensagens enriquecidas ao C2S.

### Architecture

```
Lead chega via Webhook
        ↓
[1] Enrichment normal (CPF, renda, endereços)
        ↓
[2] WebInsightService (async, não bloqueia)
    ├── Análise de sobrenome (raro/notável)
    ├── Detecção de relação familiar
    ├── Verificação de nome concatenado
    ├── Análise de telefone internacional
    └── Score de qualidade (tier)
        ↓
[3] Se insights >= confiança mínima:
    └── C2SService.createMessage() com insight
```

### New Files Created

| File | Purpose |
|------|---------|
| `src/utils/surname-analyzer.ts` | Análise de sobrenomes raros e famílias notáveis |
| `src/utils/insight-formatter.ts` | Formatação de mensagens de insight |
| `src/services/web-insight.service.ts` | Serviço principal de geração de insights |
| `src/services/cnpj-lookup.service.ts` | Busca de empresas via ReceitaWS/Brasil API |
| `src/services/google-search.service.ts` | Pesquisa web via Google Custom Search |
| `scripts/setup-google-search.sh` | Script para configurar Google Cloud API |
| `tests/utils/surname-analyzer.test.ts` | Testes unitários do analisador |
| `tests/utils/insight-formatter.test.ts` | Testes do formatador |

### Modified Files

| File | Changes |
|------|---------|
| `src/container.ts` | Registra `WebInsightService` |
| `src/services/enrichment.service.ts` | Chama `generateInsightsAsync()` após enrichment |
| `src/config/index.ts` | Novas variáveis `ENABLE_WEB_INSIGHTS`, `INSIGHT_MIN_CONFIDENCE`, `ENABLE_CNPJ_LOOKUP`, `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` |

### Configuration

```bash
# Habilitar insights automáticos (default: true)
ENABLE_WEB_INSIGHTS=true

# Confiança mínima para enviar insight (0-100, default: 60)
INSIGHT_MIN_CONFIDENCE=60

# Habilitar busca de CNPJ (default: true)
ENABLE_CNPJ_LOOKUP=true

# Google Custom Search (opcional)
GOOGLE_API_KEY=your-api-key
GOOGLE_CSE_ID=your-cse-id
ENABLE_GOOGLE_SEARCH=true
```

### Insight Types Detected

| Type | Detection Method | Example |
|------|------------------|---------|
| `business_owner` | CNPJ lookup (ReceitaWS/Casa dos Dados) | Dercio Falabella (5 empresas, R$592k capital) |
| `notable_family` | Lista de famílias conhecidas | Rudge (VP Itaú), Safra (banqueiro) |
| `rare_surname` | Lista de sobrenomes raros | Passafaro, Falabella, Trussardi |
| `family_connection` | Mesmo sobrenome no lead vs CPF | Luiz Godinho → Adriana Godinho |
| `high_income` | Renda >= R$10k/mês | Francisco Soares (R$12.259) |
| `international` | Código de país != +55 | Mario Roos (+27 África do Sul) |
| `multiple_properties` | >= 3 imóveis no CPF | 9 propriedades registradas |
| `concatenated_name` | Nome sem espaço | Martarabello → Marta Rabello |

### CNPJ Lookup Sources

| Source | Type | Rate Limit | Features |
|--------|------|------------|----------|
| **ReceitaWS** | Gratuita | 3/min | Dados completos do CNPJ |
| **Brasil API** | Gratuita | Fallback | Dados básicos do CNPJ |
| **Casa dos Dados** | Gratuita | Limitada | Busca por nome do sócio |

O sistema automaticamente:
1. Busca empresas onde a pessoa é sócia/administradora
2. Filtra apenas empresas ATIVAS
3. Extrai capital social e função na empresa
4. Respeita rate limits (3 requests/min para ReceitaWS)

### Google Search Integration

| Feature | Description |
|---------|-------------|
| **LinkedIn** | Encontra perfil profissional |
| **Notícias** | Forbes, Exame, Valor, Estadão, etc. |
| **Registros legais** | Escavador, JusBrasil |
| **Empresas** | Extrai menções de empresas |

**Configuração:**
```bash
# Rodar script de setup (cria projeto Google Cloud)
chmod +x scripts/setup-google-search.sh
./scripts/setup-google-search.sh

# Adicionar secrets no Fly.io
fly secrets set GOOGLE_API_KEY=your-api-key
fly secrets set GOOGLE_CSE_ID=your-cse-id
```

**Limites:**
- 100 queries/dia grátis
- $5 por 1000 queries adicionais
- Rate limit interno: 90/dia (margem de segurança)

**Projeto configurado:**
- Google Cloud Project: `propane-landing-434018-h2`
- CSE ID: `9354176aee2084dec`

### Notable Families Database

```typescript
const NOTABLE_FAMILIES = {
  'rudge': { context: 'Família bancária, VP Itaú', related: ['Lala Rudge'] },
  'safra': { context: 'Família bancária', related: ['Banco Safra'] },
  'lemann': { context: 'Sócios 3G Capital', related: ['AB InBev'] },
  'marinho': { context: 'Organizações Globo', related: ['Roberto Marinho'] },
  'setúbal': { context: 'Fundadores Itaú', related: ['Olavo Setúbal'] },
  // ... mais famílias
};
```

### Rare Surnames Database

```typescript
const RARE_SURNAMES = new Set([
  'passafaro', 'falabella', 'trussardi', 'berlusconi',  // Italianos
  'rosenbauer', 'rothschild',                           // Alemães
  'azar', 'khoury', 'mansour',                          // Árabes
  'roos', 'botha',                                      // Sul-africanos
  'tidi', 'yamazaki',                                   // Japoneses
  // ... mais sobrenomes
]);
```

### Lead Scoring (Tiers)

| Tier | Score | Criteria |
|------|-------|----------|
| 💎 Platinum | >= 70 | Notable family + high income + properties |
| 🥇 Gold | >= 50 | Rare surname + high income OR family connection |
| 🥈 Silver | >= 30 | International OR family connection |
| 🥉 Bronze | < 30 | Basic lead without special indicators |

### Insight Message Format

```
💎 INSIGHT AUTOMÁTICO

📊 Perfil Descoberto:
👑 Família Rudge
   • Família bancária tradicional de São Paulo
   • Membros conhecidos: José Rudge (ex-VP Itaú), Lala Rudge

👨‍👩‍👧‍👦 Conexão Familiar Detectada
   • Lead: Luiz Godinho
   • CPF encontrado: Adriana Godinho
   • Relação: Provável cônjuge

💰 Indicadores:
   • Renda: R$ 15.000/mês
   • Imóveis: 5 registrados
   • Endereços: 3 encontrados

🎯 Recomendação:
   LEAD PRIORITÁRIO! Família de alto perfil. Atendimento especial.

⚡ Confiança: 92%
```

### Async Execution

Insights são gerados de forma assíncrona após o enrichment:
- **Não bloqueia** a resposta do webhook
- Executa em **background** após C2S update
- Falhas são **logadas** mas não afetam o fluxo principal

```typescript
// enrichment.service.ts
if (this.enableWebInsights) {
  this.generateInsightsAsync(leadId, name, personData, propertyData, phone, email, campaignName);
}
// Returns immediately, insight processing continues in background
```

### Testing

```bash
# Run insight-related tests
bun test surname-analyzer
bun test insight-formatter

# Test cases cover:
# - Surname extraction and analysis
# - Family connection detection
# - Concatenated name detection
# - International phone detection
# - Lead scoring calculation
# - Message formatting
```
