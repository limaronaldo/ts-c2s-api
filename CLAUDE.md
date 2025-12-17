# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript C2S Lead Enrichment API - a rewrite of the Rust-based `rust-c2s-api`. Provides lead enrichment services for Contact2Sale (C2S) CRM integration by discovering CPFs from contact info and fetching detailed person data from multiple external APIs.

## Tech Stack

- **Runtime**: Bun 1.1+
- **Framework**: Elysia (type-safe web framework)
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod (config) + Elysia's typebox (routes)
- **HTTP Client**: ky
- **Logging**: pino + pino-pretty

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
bun test                # Run tests
bun typecheck           # TypeScript check (tsc --noEmit)

# Docker
docker compose up       # Local dev with PostgreSQL
```

## Architecture

### Entry Point & Conditional Loading

The server (`src/index.ts`) supports two modes:
- **Minimal mode**: Only `/health` endpoint (when env vars missing)
- **Full mode**: All routes loaded when `DB_URL`, `C2S_TOKEN`, `WORK_API` are set

Routes requiring config are dynamically imported to allow health checks without full configuration.

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
│   └── EnrichmentService   - Main orchestrator
```

### Enrichment Flow

1. Webhook/request received with lead info (phone/email)
2. **CPF Discovery** (`CpfDiscoveryService`): Cache → DBase → Mimir → Diretrix
3. **Data Fetch** (`WorkApiService`): All modules for discovered CPF
4. **Storage** (`DbStorageService`): Upsert party + contacts
5. **C2S Update** (`C2SService`): Push enriched description back

### Caching Strategy

Four in-memory caches in `src/utils/cache.ts`:
- `contactToCpfCache` - phone/email → CPF mapping
- `recentCpfCache` - recently enriched CPFs (skip re-enrichment)
- `processingLeadsCache` - leads currently processing (prevent duplicates)
- `workApiCache` - Work API responses

### Database Schema

Uses `core` schema for parties/contacts (shared with IBVI ecosystem):
- `core.parties` - People/companies
- `core.people` - Person-specific fields
- `core.party_contacts` - Phones/emails with source tracking
- `core.addresses` / `core.party_addresses` - Address management
- `core.party_enrichments` - Raw enrichment payloads

Public schema for local data:
- `webhook_events` - C2S webhook audit trail
- `google_ads_leads` - Google Ads integration

## Environment Variables

Required:
- `DB_URL` / `DATABASE_URL` - PostgreSQL connection
- `C2S_TOKEN`, `C2S_BASE_URL` - CRM credentials
- `WORK_API` - Completa Buscas API key
- `DIRETRIX_BASE_URL`, `DIRETRIX_USER`, `DIRETRIX_PASS`
- `DBASE_KEY`, `MIMIR_TOKEN`

Optional:
- `WEBHOOK_SECRET` - Validate incoming webhooks
- `GOOGLE_ADS_WEBHOOK_KEY` - Google Ads auth
- `C2S_DEFAULT_SELLER_ID` - Default seller for new leads
- `INCOME_MULTIPLIER` - Business rule (default: 1.9)

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check (always available) |
| `GET /leads` | List leads from C2S |
| `POST /enrich/lead/:id` | Enrich single lead |
| `POST /enrich/batch` | Batch enrich (max 100, configurable concurrency) |
| `POST /webhook/c2s` | C2S webhook receiver |
| `POST /webhook/google-ads` | Google Ads lead capture |
| `GET /customer/:cpf` | Customer lookup |

## Deployment

Configured for Fly.io (`fly.toml`):
- Region: `gru` (São Paulo)
- Auto-scaling with min 1 machine
- Health checks on `/health`
