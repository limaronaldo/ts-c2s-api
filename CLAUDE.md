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
- **Testing**: Bun test (140 tests)

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
│   └── AlertService        - Slack webhook alerts
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

# Alerts
ALERT_WEBHOOK_URL=https://hooks.slack.com/...  # Slack webhook
ALERT_RATE_LIMIT_MINUTES=5   # Min time between same alert type
ALERT_ERROR_THRESHOLD=50     # Error rate % to trigger alert

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
| Type | Severity | Trigger |
|------|----------|---------|
| `lead_max_retries` | ⚠️ warning | Lead fails after 5 retries |
| `high_error_rate` | 🚨 critical | Error rate exceeds 50% |
| `service_down` | 🚨 critical | External service down for 5+ min |

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
- **Total tests**: 140
- **Test files**: 11
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
│   └── rate-limit.ts       # Rate limiting
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
│   ├── alert.service.ts    # Slack alerts
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
│   └── insight-formatter.ts # Insight message formatting
├── container.ts            # DI container
└── index.ts                # Entry point
```

## Changelog

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

## TODO

### Pending
- [ ] DBase IP whitelist for `37.16.3.251` - Requested Dec 20, follow up Dec 23
- [ ] Reportar bug do C2S PATCH API (is_favorite retorna 422)

### Future
- [ ] Add email alerts (complement Slack)
- [ ] Dashboard date range filtering
- [ ] Prometheus metrics endpoint

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
