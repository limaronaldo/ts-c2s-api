# ts-c2s-api

Lead enrichment API for MBRAS that integrates with C2S CRM. Automatically enriches leads with CPF, income, property data, and contact information from multiple data sources.

## Features

- **3-Tier CPF Discovery**: DBase → Diretrix → Work API fallback chain
- **Lead Enrichment**: Fetches income, addresses, phones, emails from Work API
- **Property Data**: Integrates with IBVI database for property ownership info
- **C2S Integration**: Creates/updates leads and adds enrichment messages
- **Retry Logic**: Exponential backoff (1h, 2h, 4h, 8h, 16h) for failed leads
- **Dashboard**: Real-time monitoring at `/dashboard`
- **Slack Alerts**: Webhook notifications for failures and high error rates
- **Cron Job**: Scheduled enrichment every 15 minutes

## Quick Start

```bash
# Install dependencies
bun install

# Set environment variables (see Configuration below)
cp .env.example .env

# Run database migrations
bun run db:generate
bun run db:migrate

# Start development server
bun run dev

# Start production server
bun run start
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ts-c2s-api                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐          │
│  │   Webhooks   │    │  Cron Job    │    │  Dashboard   │          │
│  │  /webhook/*  │    │  (15 min)    │    │  /dashboard  │          │
│  └──────┬───────┘    └──────┬───────┘    └──────────────┘          │
│         │                   │                                       │
│         ▼                   ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   Enrichment Service                         │   │
│  │  1. Receive lead (webhook/cron)                              │   │
│  │  2. Discover CPF (3-tier fallback)                           │   │
│  │  3. Fetch enrichment data (Work API)                         │   │
│  │  4. Fetch property data (IBVI DB)                            │   │
│  │  5. Store in database                                        │   │
│  │  6. Create/update C2S lead with message                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                 CPF Discovery (3 Tiers)                      │   │
│  │  Tier 1: DBase (fastest, requires IP whitelist)              │   │
│  │  Tier 2: Diretrix (comprehensive, direct API)                │   │
│  │  Tier 3: Work API phone module (fallback)                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/c2s` | POST | Receives C2S lead events (create/update/close) |
| `/webhook/google-ads` | POST | Receives Google Ads lead form submissions |

### Lead Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/leads` | GET | List leads with pagination |
| `/leads/:id` | GET | Get lead by ID |
| `/enrich` | POST | Manually trigger enrichment for a lead |
| `/batch/enrich` | POST | Batch enrich multiple leads |

### C2S Proxy

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/customer/:id` | GET | Get C2S customer details |
| `/sellers` | GET | List C2S sellers |
| `/tags` | GET | List C2S tags |
| `/queues` | GET | List C2S queues |
| `/activities` | GET | List C2S activities |
| `/company` | GET | Get C2S company info |

### Monitoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/metrics` | GET | Prometheus-style metrics |
| `/dashboard` | GET | HTML monitoring dashboard |
| `/dashboard/data` | GET | JSON data for dashboard |

### Work API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/work-api/cpf/:cpf` | GET | Lookup person by CPF |

## Configuration

### Required Environment Variables

```bash
# Database (Neon PostgreSQL)
DB_URL=postgresql://user:pass@host/db

# C2S CRM API
C2S_TOKEN=your-c2s-api-token
C2S_URL=https://c2s.com.br/api/v1

# Work API (Completa Buscas) - Main enrichment source
WORK_API=your-work-api-token
WORK_API_URL=https://completa.workbuscas.com/api

# Diretrix API - CPF discovery tier 2
DIRETRIX_USER=your-diretrix-user
DIRETRIX_PASS=your-diretrix-password
DIRETRIX_URL=https://api.diretrix.com.br

# DBase API - CPF discovery tier 1 (requires IP whitelist)
DBASE_KEY=your-dbase-api-key
DBASE_URL=https://app.dbase.com.br/sistema/consultas/Data-basebrasil-api2024/

# Mimir API (IBVI Azure fallback)
MIMIR_TOKEN=your-mimir-token
MIMIR_URL=https://ibvi-mimir.azurewebsites.net
```

### Optional Environment Variables

```bash
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Webhook verification
WEBHOOK_SECRET=your-webhook-secret
PUBLIC_URL=https://your-app.fly.dev

# Income multiplier (default 1.9x)
INCOME_MULTIPLIER=1.9

# Cron job settings
ENABLE_CRON=true
CRON_INTERVAL=*/15 * * * *  # Every 15 minutes
CRON_BATCH_SIZE=25
CRON_DELAY_MS=1000

# Retry settings
RETRY_ENABLED=true
RETRY_MAX_ATTEMPTS=5

# Alert settings (Slack webhook)
ALERT_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
ALERT_RATE_LIMIT_MINUTES=5
ALERT_ERROR_THRESHOLD=50      # Alert if >50% errors
ALERT_ERROR_WINDOW_MINUTES=10
ALERT_SERVICE_DOWN_MINUTES=5
```

## Database Schema

The API uses the `analytics` schema in PostgreSQL:

### Tables

| Table | Description |
|-------|-------------|
| `analytics.parties` | People and companies with CPF/CNPJ |
| `analytics.party_contacts` | Phone numbers and emails |
| `analytics.addresses` | Physical addresses |
| `analytics.webhook_events` | Webhook idempotency tracking |
| `analytics.google_ads_leads` | Google Ads lead storage with retry tracking |

### Key Columns (google_ads_leads)

| Column | Type | Description |
|--------|------|-------------|
| `lead_id` | varchar | External lead ID |
| `enrichment_status` | varchar | pending/processing/completed/partial/unenriched/basic/failed |
| `retry_count` | integer | Number of retry attempts |
| `last_retry_at` | timestamp | Last retry timestamp |
| `last_error` | text | Last error message |
| `party_id` | uuid | Link to enriched party |
| `c2s_customer_id` | varchar | C2S customer ID |

## Enrichment Flow

### 1. Lead Reception

Leads enter the system via:
- **C2S Webhook** (`/webhook/c2s`): When leads are created/updated in C2S
- **Google Ads Webhook** (`/webhook/google-ads`): Direct from Google Ads forms
- **Cron Job**: Fetches recent unenriched leads from C2S every 15 min

### 2. CPF Discovery (3-Tier Fallback)

```
Phone/Email → DBase (Tier 1)
                ↓ (if not found)
             Diretrix (Tier 2)
                ↓ (if not found)
             Work API Phone Module (Tier 3)
                ↓ (if not found)
             Mark as "unenriched"
```

**Name Matching**: Compares lead name with database name. If mismatch (score < 0.5), adds warning to C2S message but still enriches.

### 3. Data Enrichment

Once CPF is found:
1. **Work API**: Fetches income, addresses, phones, emails, occupation, education
2. **IBVI Database**: Fetches property ownership data (parallel)
3. **Store**: Saves party data to local database

### 4. C2S Integration

Creates a formatted message in C2S with:
- Campaign info
- Income (with 1.9x multiplier)
- Addresses (up to 2)
- Phone numbers
- Property ownership summary
- Name mismatch warning (if applicable)

### 5. Retry Logic

Failed leads (status: `partial`, `unenriched`) are retried with exponential backoff:

| Retry # | Delay |
|---------|-------|
| 1 | 1 hour |
| 2 | 2 hours |
| 3 | 4 hours |
| 4 | 8 hours |
| 5 | 16 hours |

After 5 retries, lead is marked as `failed` and a Slack alert is sent.

## Monitoring

### Dashboard

Access the monitoring dashboard at `/dashboard`:

- **Metrics**: Total processed, success rate, failures
- **Status Breakdown**: Counts by enrichment status
- **Recent Activity**: Last 20 leads with status badges
- **Failed Leads**: Last 10 permanently failed leads
- **Cron Status**: Next run, is processing
- **Service Health**: DBase, Diretrix, Work API, C2S status

Auto-refreshes every 30 seconds.

### Alerts

Slack alerts are sent for:

| Alert Type | Severity | Trigger |
|------------|----------|---------|
| `lead_max_retries` | Warning | Lead fails after 5 retries |
| `high_error_rate` | Critical | >50% failures in 10 min window |
| `service_down` | Critical | External service down >5 min |

Rate limited to 1 alert per type per 5 minutes.

### Metrics Endpoint

`GET /metrics` returns Prometheus-style metrics:

```
# HELP leads_total Total number of leads processed
# TYPE leads_total counter
leads_total{status="completed"} 1234
leads_total{status="failed"} 56

# HELP enrichment_duration_seconds Time to enrich a lead
# TYPE enrichment_duration_seconds histogram
enrichment_duration_seconds_bucket{le="1"} 100
enrichment_duration_seconds_bucket{le="5"} 200
```

## Deployment

### Fly.io

```bash
# Deploy
fly deploy

# Set secrets
fly secrets set DB_URL=postgresql://...
fly secrets set C2S_TOKEN=...
fly secrets set WORK_API=...
# ... etc

# Allocate dedicated IPv4 (for DBase IP whitelist)
fly ips allocate-v4

# View logs
fly logs
```

### Docker

```bash
docker build -t ts-c2s-api .
docker run -p 3000:3000 --env-file .env ts-c2s-api
```

## Development

```bash
# Run with hot reload
bun run dev

# Type check
bun run typecheck

# Generate database migrations
bun run db:generate

# Apply migrations
bun run db:migrate

# Run tests
bun test
```

## Project Structure

```
src/
├── config/           # Environment configuration with Zod validation
├── db/
│   ├── client.ts     # Drizzle database client
│   └── schema.ts     # Database schema definitions
├── errors/           # Custom error classes
├── jobs/
│   └── enrichment-cron.ts  # Scheduled enrichment job
├── routes/
│   ├── health.ts     # Health check endpoint
│   ├── webhook.ts    # C2S and Google Ads webhooks
│   ├── leads.ts      # Lead management endpoints
│   ├── enrich.ts     # Manual enrichment endpoint
│   ├── batch.ts      # Batch operations
│   ├── dashboard.ts  # Monitoring dashboard
│   ├── metrics.ts    # Prometheus metrics
│   └── ...           # C2S proxy routes
├── services/
│   ├── enrichment.service.ts   # Main orchestrator
│   ├── cpf-discovery.service.ts # 3-tier CPF lookup
│   ├── diretrix.service.ts     # Diretrix API client
│   ├── dbase.service.ts        # DBase API client
│   ├── work-api.service.ts     # Work API client
│   ├── c2s.service.ts          # C2S CRM client
│   ├── db-storage.service.ts   # Database operations
│   ├── ibvi-property.service.ts # IBVI property lookup
│   ├── alert.service.ts        # Slack alerts
│   ├── retry.service.ts        # Retry logic
│   └── metrics.service.ts      # Metrics collection
├── templates/
│   └── dashboard.html.ts       # Dashboard HTML template
├── utils/
│   ├── logger.ts               # Pino logger
│   ├── cache.ts                # In-memory caches
│   ├── phone.ts                # Phone normalization
│   ├── normalize.ts            # Data normalization
│   ├── name-matcher.ts         # Name comparison
│   ├── description-builder.ts  # C2S message formatting
│   └── retry.ts                # Retry utilities
└── index.ts          # Application entry point
```

## External Services

| Service | Purpose | Tier |
|---------|---------|------|
| **DBase** | CPF lookup by phone | 1 (fastest) |
| **Diretrix** | CPF lookup by phone/email | 2 |
| **Work API** | CPF lookup + full enrichment | 3 (fallback) |
| **C2S** | CRM lead management | - |
| **IBVI DB** | Property ownership data | - |
| **Mimir** | Azure IBVI fallback | Legacy |

## Troubleshooting

### Common Issues

**DBase returns 401/403**
- Check if your outbound IP is whitelisted
- Run `fly ips list` to get your dedicated IPv4

**Diretrix returns 400 for valid phones**
- This is normal for phones not in their database
- The API treats 400 same as 404 (not found)
- Will fallback to Work API tier 3

**Leads stuck in "processing"**
- Check if cron is enabled: `ENABLE_CRON=true`
- Check cron status in dashboard
- Manually trigger via `/enrich` endpoint

**High error rate alerts**
- Check external service health in dashboard
- Review logs: `fly logs`
- Check rate limiting on external APIs

### Logs

```bash
# View all logs
fly logs

# Filter by module
fly logs | grep "enrichment-cron"
fly logs | grep "cpf-discovery"
fly logs | grep "alerts"
```

## License

Private - MBRAS Internal Use Only
