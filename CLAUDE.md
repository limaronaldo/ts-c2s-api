# CLAUDE.md - ts-c2s-api

Este arquivo fornece orientação ao Claude Code para trabalhar neste repositório.

## Visão Geral do Projeto

**ts-c2s-api** - API de Enriquecimento de Leads em TypeScript para MBRAS (imobiliária).

- **Runtime:** Bun 1.1+ com Elysia framework
- **Database:** PostgreSQL (Drizzle ORM) no Neon
- **Deploy:** Fly.io em https://ts-c2s-api.fly.dev
- **Propósito:** Enriquecer leads do C2S (CRM) com CPF, renda, endereços

---

## Comandos Essenciais

```bash
# Desenvolvimento
bun dev                 # Hot reload
bun start               # Produção

# Database
bun db:generate         # Gerar migrations
bun db:migrate          # Rodar migrations

# Testes
bun test                # Rodar testes
bun typecheck           # TypeScript check

# Deploy
fly deploy              # Deploy para Fly.io
fly logs                # Ver logs produção
fly secrets set KEY=val # Setar env var
```

---

## Arquitetura

### Fluxo de Enriquecimento

```
Lead (webhook) → CPF Discovery → Work API → Storage → C2S Update → Alerts
```

1. **Webhook/Request** recebe lead (phone/email)
2. **CPF Discovery:** 4-tier fallback (DBase → Diretrix → Work API → DuckDB name lookup)
3. **Enrichment:** Work API CPF module → dados completos
4. **Storage:** PostgreSQL (parties, contacts)
5. **C2S Update:** Push mensagem enriquecida
6. **Alerts:** Slack + Email para leads alto valor

### Service Container

Todos os serviços em `src/container.ts` como singletons:

```typescript
import { container } from "./container";
container.workApi.fetchByCpf(cpf);
container.c2sService.createMessage(leadId, msg);
```

### Serviços Principais

| Serviço | Arquivo | Função |
|---------|---------|--------|
| WorkApiService | `services/work-api.service.ts` | Completa Buscas API |
| CpfDiscoveryService | `services/cpf-discovery.service.ts` | Descoberta de CPF (4 tiers) |
| EnrichmentService | `services/enrichment.service.ts` | Orquestrador principal |
| C2SService | `services/c2s.service.ts` | Integração CRM |
| AlertService | `services/alert.service.ts` | Slack + Email + Low rate alerts |
| DbStorageService | `services/db-storage.service.ts` | Persistência |
| CpfLookupService | `services/cpf-lookup.service.ts` | Busca CPF por nome (DuckDB 223M) + auto-scaling |
| FlyScaleService | `services/fly-scale.service.ts` | Auto-scaling Fly.io machines |
| BulkEnrichmentService | `services/bulk-enrichment.service.ts` | Enriquecimento em massa |
| ProfileReportService | `services/profile-report.service.ts` | Relatórios MD/HTML/PDF |
| EnrichmentMonitorService | `services/enrichment-monitor.service.ts` | Monitor de taxa (<80% alert) |

---

## Estrutura de Pastas

```
ts-c2s-api/
├── src/
│   ├── config/           # Validação Zod
│   ├── db/               # Drizzle client + schema
│   ├── middleware/       # Auth, rate limit, metrics
│   ├── routes/           # Endpoints Elysia
│   ├── services/         # Lógica de negócio
│   ├── utils/            # Helpers
│   └── container.ts      # DI container
├── scripts/
│   ├── enrichment/       # enrich-via-api.ts, retry-unenriched.ts
│   ├── export/           # export-c2s-psql.ts
│   ├── analysis/         # check-db-status.ts
│   ├── debug/            # test-work-api.ts
│   ├── reports/          # leads-by-seller.ts
│   └── utils/            # copy-enrichment-to-duplicates.ts
├── docs/                 # Documentação detalhada
├── tests/                # Testes
└── logs/                 # Logs (gitignored)
```

---

## Endpoints Principais

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Health check |
| `/dashboard` | GET | Dashboard HTML |
| `/metrics` | GET | Prometheus metrics |
| `/enrich` | POST | Enriquecer lead |
| `/batch/enrich-direct` | POST | Batch enrichment (4-tier CPF discovery) |
| `/webhook/c2s` | POST | Webhook C2S |
| `/webhook/google-ads` | POST | Webhook Google Ads |
| `/stats` | GET | Estatísticas de enriquecimento |
| `/stats/enrichment` | GET | Taxa de enriquecimento |
| `/stats/health` | GET | Health dos serviços |

### Discovery Routes (CPF Lookup & Bulk Enrichment)

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/discovery/cpf/health` | GET | Health check CPF Lookup API |
| `/discovery/cpf/search/:name` | GET | Busca CPF por nome (lento, 2+ min) |
| `/discovery/cpf/:cpf` | GET | Busca dados por CPF conhecido |
| `/discovery/cpf/best-match` | POST | Encontra melhor match de CPF |
| `/discovery/bulk/search-cpfs` | POST | Busca CPFs para lista de nomes |
| `/discovery/bulk/enrich` | POST | Enriquecimento em massa |
| `/discovery/report/generate` | POST | Gera relatório de CPFs (MD/HTML/PDF) |
| `/discovery/report/from-names` | POST | Pipeline completo: CPF → Enrich → Report |

---

## Databases

### Produção (Fly.io) - analytics schema

```
analytics.parties          - Pessoas/empresas com CPF, renda
analytics.party_contacts   - Telefones, emails
analytics.google_ads_leads - Tracking de leads
```

### Batch Enrichment (leads-mb) - c2s schema

**Connection:**
```
postgresql://neondb_owner:npg_quYSE3haoz2e@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb
```

```
c2s.leads           - 36k leads exportados do C2S
c2s.enriched_leads  - Resultados do enriquecimento
c2s.lead_duplicates - Tracking de duplicatas
```

---

## Batch Enrichment - CONCLUÍDO ✅ (Janeiro 2026)

### Resultados Finais (26/01/2026)

| Métrica | Valor |
|---------|-------|
| Total leads | 36,113 |
| Total enriched | 30,940 |
| Invalid phones | 361 |
| **CPF Rate** | **91.8%** |

### Distribuição por Status

| Status | Count | % |
|--------|-------|---|
| ✅ Completed | ~24,600 | 72% |
| ⚠️ Partial | ~6,300 | 18% |
| ❌ Unenriched | ~2,700 | 8% |
| 🚫 Invalid Phone | 361 | 1% |

### Cronograma

- **Jan 19:** Export 36,113 leads do C2S
- **Jan 20:** Início do batch enrichment
- **Jan 25:** Retry dos 3,386 unenriched (+321 CPFs)
- **Jan 26:** Normalização de 1,094 telefones com DDD 55 duplicado
- **Jan 26:** Marcação de 361 telefones inválidos
- **Jan 26:** ✅ **CONCLUÍDO** - Taxa: 91.8%

### Documentação Completa

Ver `docs/BATCH_ENRICHMENT_PROJECT.md` para detalhes completos.

---

## Padrões de Código Importantes

### CPF Normalization (14 → 11 chars)

Work API retorna CPF com 14 caracteres. Sempre normalizar:

```typescript
if (cpf && cpf.length === 14) {
  cpf = cpf.slice(-11);
}
```

### Income Multiplier

Renda raw multiplicada por 1.9 para display:

```typescript
const displayIncome = rawIncome * INCOME_MULTIPLIER; // 1.9
```

### Async Alerts

High-value detection roda async, não bloqueia:

```typescript
this.checkHighValueLeadAsync(leadId, name, data); // fire and forget
```

---

## External APIs

### Work API (Completa Buscas)

- **Endpoint:** https://completa.workbuscas.com/api
- **Modules:** `phone` (CPF lookup), `cpf` (full data)
- **Rate limit:** 2s entre requests
- **CPF Format:** 14 chars (normalizar para 11)
- **Documentação:** `docs/CPF_DISCOVERY_PROCESS.md`

### C2S API

- **Base URL:** via `C2S_URL` env
- **Auth:** Token via `C2S_TOKEN`
- **Uso:** list leads, create messages, update leads

### CPF Lookup API (DuckDB - 223M CPFs)

- **Endpoint:** https://cpf-lookup-api.fly.dev
- **Uso:** Busca por nome como Tier 2 fallback, validação de CPF
- **Endpoints:**
  - `GET /search/:name` - Busca CPF por nome (~1 min com 8GB RAM)
  - `GET /cpf/:cpf` - Busca dados por CPF conhecido
  - `GET /masked/:digits` - Busca por CPF mascarado (6 dígitos do meio)
  - `GET /health` - Health check
  - `GET /stats` - Estatísticas do banco
- **Auto-Scaling:** Escala automaticamente para 8GB durante buscas, volta para 256MB após 5 min idle
- **Machine ID:** `90807561f37668`

---

## CPF Discovery - 4 Tiers (UPDATED January 29, 2026)

O serviço de descoberta de CPF usa 4 camadas de fallback com **nova ordem de prioridade**:

| Tier | Serviço | Descrição | Velocidade |
|------|---------|-----------|------------|
| 1 | **Work API** | Módulo phone (mais confiável) | ~2s |
| 2 | **CPF Lookup (DuckDB)** | Busca por nome (223M registros) | ~2min |
| 3 | Diretrix | API externa por telefone | ~500ms |
| 4 | DBase | Busca local por telefone | ~100ms |

**Mudança de Prioridade (29/01/2026):**
- Work API movido para Tier 1 (era Tier 3)
- CPF Lookup movido para Tier 2 (era Tier 4)
- Diretrix movido para Tier 3 (era Tier 2)
- DBase movido para Tier 4 (era Tier 1)

**Tier 2 (CPF Lookup) só é acionado quando:**
- Tier 1 (Work API) falhou
- Lead tem nome com 5+ caracteres
- Name match score >= 0.7

---

## Monitoramento

### EnrichmentMonitorService

- Verifica taxa de enriquecimento a cada 6 horas
- Alerta via Slack + email quando taxa < 80%
- Endpoint `/stats` expõe métricas em tempo real

### Tipos de Alerta

| Tipo | Severidade | Descrição |
|------|------------|-----------|
| `high_value_lead` | critical | Lead de alto valor detectado |
| `high_error_rate` | critical | Taxa de erro alta |
| `service_down` | critical | Serviço indisponível |
| `low_enrichment_rate` | warning | Taxa de enriquecimento < 80% |
| `lead_max_retries` | warning | Lead falhou após max retries |

---

## Env Vars Essenciais

```bash
# Required
DB_URL              # PostgreSQL connection
C2S_TOKEN           # C2S API token
C2S_URL             # C2S base URL
WORK_API            # Completa Buscas key

# Alerts
ALERT_WEBHOOK_URL   # Slack webhook
RESEND_API_KEY      # Email alerts

# Dashboard Auth (RML-811)
DASHBOARD_USER      # Username para login do dashboard
DASHBOARD_PASSWORD  # Senha para login do dashboard

# CPF Lookup Auto-Scaling
FLY_API_TOKEN           # Fly.io API token for auto-scaling
CPF_LOOKUP_MACHINE_ID   # Machine ID: 90807561f37668
CPF_LOOKUP_AUTO_SCALE   # true/false (default: true)

# Optional
ENABLE_CRON=true    # Cron job
INCOME_MULTIPLIER=1.9
CPF_LOOKUP_API_URL  # DuckDB API (default: https://cpf-lookup-api.fly.dev)
```

---

## Dashboard Authentication (RML-811)

### Overview

O dashboard (`/dashboard`) é protegido por autenticação baseada em sessão com página de login customizada.

**URL:** https://ts-c2s-api.fly.dev/dashboard

### Configuração

Definir as variáveis de ambiente no Fly.io:

```bash
fly secrets set DASHBOARD_USER=admin
fly secrets set DASHBOARD_PASSWORD=sua_senha_segura
```

### Arquitetura

| Componente | Arquivo | Descrição |
|------------|---------|-----------|
| Login Page | `src/templates/login.html.ts` | Página HTML com branding MBRAS |
| Auth Logic | `src/routes/dashboard.ts` | Sessões + cookies |
| Logo | `public/icon-mbras.png` | Logo MBRAS (servida estaticamente) |

### Fluxo de Autenticação

```
1. Usuário acessa /dashboard
2. Se não autenticado → redirect para /dashboard/login
3. Usuário submete formulário de login
4. Se credenciais válidas:
   - Cria sessão com token único
   - Define cookie `dashboard_session` (24h, HttpOnly, Secure)
   - Redirect para /dashboard
5. Se inválidas → mostra erro na página de login
```

### Rotas de Autenticação

| Rota | Método | Descrição |
|------|--------|-----------|
| `/dashboard/login` | GET | Página de login |
| `/dashboard/login` | POST | Processar login (form-urlencoded) |
| `/dashboard/logout` | GET | Encerrar sessão |

### Sessões

- **Armazenamento:** In-memory Map (reinicia com deploy)
- **Duração:** 24 horas
- **Token:** UUID v4 gerado com `crypto.randomUUID()`
- **Cookie:** `dashboard_session` com flags HttpOnly, Secure, SameSite=Lax

### Branding

- **Cores:** Navy (#1a3a5c) + Gold (#b8a06a)
- **Fonte:** Cormorant Garamond (títulos) + Inter (corpo)
- **Logo:** `public/icon-mbras.png` servida via `@elysiajs/static`

### Arquivos Estáticos

Plugin `@elysiajs/static` configurado em `src/index.ts`:

```typescript
import { staticPlugin } from "@elysiajs/static";
app.use(staticPlugin({ assets: "public", prefix: "/" }));
```

A pasta `public/` é copiada no Dockerfile para produção.

### Troubleshooting

**Logo não aparece:**
- Verificar se `public/icon-mbras.png` existe
- Verificar se Dockerfile copia a pasta `public/`
- Verificar se plugin static está configurado

**Sessão expira imediatamente:**
- Verificar se cookie tem flag Secure (requer HTTPS)
- Verificar se SameSite está configurado corretamente

**Credenciais não funcionam:**
- Verificar secrets no Fly.io: `fly secrets list`
- Re-definir: `fly secrets set DASHBOARD_USER=x DASHBOARD_PASSWORD=y`

---

## Alertas High-Value

**Critérios:**
- Renda >= R$10.000/mês
- Bairro nobre (Jardins, Itaim, Leblon, etc.)
- Família notável (Safra, Lemann, Rudge)
- Múltiplas empresas (>= 2)

**Arquivos:**
- `src/utils/neighborhoods.ts` - Lista de bairros
- `src/utils/high-value-detector.ts` - Detecção
- `src/services/alert.service.ts` - Envio

---

## Troubleshooting

### Database connection drops

- **Causa:** Neon fecha conexões idle após ~5 min
- **Fix:** Script tem retry, apenas reiniciar se travar

### 0% CPF Discovery

- **Causa:** Work API retorna 14-char CPF, código esperava 11
- **Fix:** Adicionar `cpf.slice(-11)` normalização

### Work API retorna 403

- **Causa:** Token expirado ou limite atingido
- **Fix:** Renovar token com fornecedor

---

## Linear Issues

**Prefix:** RML-xxx

**Completed:**
- RML-795: Email alerts
- RML-796: Dashboard date filter
- RML-797: Prometheus metrics
- RML-809: Smart cron schedule
- RML-810: High-value alerts
- RML-811: Dashboard authentication

**Criar issue:** `/linear-issue <título>`

---

## Documentação

| Documento | Descrição |
|-----------|-----------|
| `docs/DISCOVERY_API.md` | **Discovery API completa** (CPF Lookup, Bulk Enrich, Reports) |
| `docs/CPF_DISCOVERY_PROCESS.md` | Processo completo de descoberta de CPF |
| `docs/BATCH_ENRICHMENT_PROJECT.md` | Projeto de enriquecimento em massa |
| `docs/MEMORA_KNOWLEDGE.md` | Knowledge base para Memora |

---

## Scripts Úteis

### Verificar Status do Banco

```bash
bun run scripts/analysis/check-db-status.ts
```

### Rodar Enrichment

```bash
# Background
nohup bun run scripts/enrichment/enrich-via-api.ts > /tmp/enrich-output.log 2>&1 &

# Monitorar
tail -f /tmp/enrich-output.log
```

### Retry Unenriched

```bash
nohup bun run scripts/enrichment/retry-unenriched.ts > /tmp/retry-output.log 2>&1 &
```

### Propagar Enriquecimento para Duplicatas

```bash
bun run scripts/utils/copy-enrichment-to-duplicates.ts
```

### Deploy

```bash
fly deploy
fly logs
fly status
```

---

## CPF Lookup Auto-Scaling (January 29, 2026)

### Overview

O CPF Lookup API (223M registros DuckDB) precisa de 8GB RAM para buscas eficientes, mas isso custa ~$0.05/hora. Para otimizar custos, implementamos auto-scaling que:

1. **Escala UP** automaticamente antes de buscas por nome
2. **Escala DOWN** após 5 minutos de inatividade

### Como Funciona

```
1. CpfLookupService.searchByName() chamado
   ↓
2. FlyScaleService.scaleUp() executado automaticamente
   - Escala para: performance-2x CPU + 8GB RAM
   - Aguarda máquina ficar pronta (~3s)
   ↓
3. Busca executa na máquina escalada (~1 min)
   ↓
4. scheduleScaleDown() agenda timer de 5 minutos
   ↓
5. Após 5 min idle → auto scale-down para 256MB
```

### Configuração de Custos

| Estado | CPU | RAM | Custo/hora |
|--------|-----|-----|------------|
| **Ativo** (durante buscas) | performance-2x | 8 GB | ~$0.05 |
| **Idle** (5 min após uso) | shared-cpu-1x | 256 MB | ~$0.003 |

**Economia:** ~94% quando idle

### Arquivos

| Arquivo | Função |
|---------|--------|
| `src/services/fly-scale.service.ts` | Serviço de auto-scaling via Fly.io API |
| `src/services/cpf-lookup.service.ts` | Integração com auto-scaling |
| `scripts/utils/cpf-lookup-scale.sh` | Script manual de scaling |

### Variáveis de Ambiente

```bash
FLY_API_TOKEN=fm2_...           # Token da API Fly.io
CPF_LOOKUP_MACHINE_ID=90807561f37668  # ID da máquina
CPF_LOOKUP_AUTO_SCALE=true      # Habilitar auto-scaling
```

### Script Manual

```bash
# Escalar manualmente
./scripts/utils/cpf-lookup-scale.sh up     # 8GB + performance CPU
./scripts/utils/cpf-lookup-scale.sh down   # 256MB + shared CPU
./scripts/utils/cpf-lookup-scale.sh status # Ver configuração atual
```

### Logs

O auto-scaling gera logs para monitoramento:

```json
{"level":"info","module":"fly-scale","msg":"Scaling machine","memory_mb":8192}
{"level":"info","module":"fly-scale","msg":"Machine scaled successfully"}
{"level":"debug","module":"fly-scale","msg":"Scheduling scale-down","delayMs":300000}
```

---

## January 29, 2026 Changes

### Overview

Comprehensive session to improve CPF discovery, add auto-scaling, and fix sync scripts.

### 1. CPF Discovery Priority Reorder

Changed from: DBase(1) → Diretrix(2) → Work API(3) → CPF Lookup(4)
Changed to: **Work API(1) → CPF Lookup(2) → Diretrix(3) → DBase(4)**

**Rationale:**
- Work API is most comprehensive and reliable
- CPF Lookup (223M records) provides excellent name-based fallback
- Diretrix and DBase moved to fallback positions

**File modified:** `src/services/cpf-discovery.service.ts`

### 2. Batch Endpoint Enhanced

Updated `/batch/enrich-direct` to use full 4-tier CPF discovery instead of just Work API.

**Before:** Only used Work API module
**After:** Uses complete `cpfDiscovery.findCpf()` with all 4 tiers

**New response fields:**
- `cpfSource`: Which tier found the CPF
- `nameMatches`: Array of potential name matches
- `matchScore`: Confidence score for name matching

**File modified:** `src/routes/batch.ts`

### 3. CPF Lookup Auto-Scaling

Implemented automatic scaling for CPF Lookup API to optimize costs:

- **Scale UP:** 8GB RAM + performance-2x CPU before name searches
- **Scale DOWN:** 256MB RAM + shared-cpu-1x after 5 min idle
- **Cost savings:** ~94% when idle

**Files created:**
- `src/services/fly-scale.service.ts` - Auto-scaling service
- `scripts/utils/cpf-lookup-scale.sh` - Manual scaling script

**Files modified:**
- `src/services/cpf-lookup.service.ts` - Integration with auto-scaling
- `src/config/index.ts` - New config options

### 4. Sync Script Fixed

Fixed `scripts/export/sync-recent-leads.ts` that was failing with `synced_at` column error.

**Problem:** Script expected `synced_at` column but table has `imported_at`
**Fix:** Changed column name and added `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`

### 5. New Scripts Created

| Script | Purpose |
|--------|---------|
| `scripts/workflows/enrich-new-leads.ts` | Full pipeline: Fetch → Identify new → Enrich → Store → Report |
| `scripts/export/sync-recent-leads.ts` | Sync recent leads from C2S to PostgreSQL |
| `scripts/debug/test-enrichment-single.ts` | Test enrichment for a single lead |
| `scripts/utils/cpf-lookup-scale.sh` | Manual CPF Lookup API scaling |

### 6. Production Stats

Current enrichment statistics (as of January 29, 2026):

| Metric | Value |
|--------|-------|
| Total leads | 36,186 |
| Enriched | 30,960 |
| Unenriched | 2,732 |
| Enrichment rate | **91.9%** |
| Status | Healthy |

### 7. Commits

```
3539ff1 feat: add auto-scaling for CPF Lookup API
58f37d5 feat: add CPF Lookup API scale script for cost optimization
3af1c38 fix: use imported_at instead of synced_at in sync script
8623f60 feat: add new enrichment and sync scripts
```

### Deployment

All changes deployed to Fly.io:
```bash
~/.fly/bin/fly deploy
```

**Secrets configured:**
```bash
fly secrets set FLY_API_TOKEN="..." -a ts-c2s-api
fly secrets set CPF_LOOKUP_MACHINE_ID="90807561f37668" -a ts-c2s-api
```

---

## Memora (Memória Persistente)

### Configuração

MCP configurado em `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "/Users/ronaldo/Projects/FORK/memora/.venv/bin/memora-server",
      "env": {
        "AWS_PROFILE": "memora",
        "AWS_ENDPOINT_URL": "https://20d8404d269c65aeeb3e08015a0fafb0.r2.cloudflarestorage.com",
        "MEMORA_STORAGE_URI": "s3://memories/memories.db"
      }
    }
  }
}
```

### Usar Memora

```
memory_create(content="...", tags=["ts-c2s-api"])
memory_hybrid_search(query="enrichment")
memory_list_compact(tags_all=["ts-c2s-api"])
```

---

## Engram (Local Memory - TF-IDF)

**Repository:** https://github.com/agentic-mcp-tools/engram
**Location:** /Users/ronaldo/Projects/FORK/engram/

### What is Engram?

Engram is a lightweight MCP server that provides persistent memory using **local TF-IDF embeddings** (no API required). It's a simpler, offline alternative to Memora for projects that don't need cloud sync or semantic search.

### Installation

**Location:** /Users/ronaldo/Projects/FORK/engram/
**Binary:** /Users/ronaldo/Projects/FORK/engram/target/release/engram-server
**Database:** /Users/ronaldo/.local/share/engram/memories.db

### MCP Configuration

**Config file:** /Users/ronaldo/.claude/mcp.json

```json
{
  "mcpServers": {
    "engram": {
      "command": "/Users/ronaldo/Projects/FORK/engram/target/release/engram-server",
      "args": [],
      "env": {
        "ENGRAM_DB_PATH": "/Users/ronaldo/.local/share/engram/memories.db",
        "ENGRAM_EMBEDDING_MODEL": "tfidf",
        "ENGRAM_CLEANUP_INTERVAL": "3600"
      }
    }
  }
}
```

### Key Features

- **No API Key Required:** Uses TF-IDF embeddings by default (works offline)
- **Local-Only Storage:** SQLite database, no cloud sync
- **Lightweight:** ~10 MCP tools for basic memory operations
- **Fast:** No network calls for embeddings

### Embedding Models

| Model | API Key Required? | Quality | Speed | Use Case |
|-------|------------------|---------|-------|----------|
| `tfidf` (default) | ❌ No | Good | Fast | Offline work, no API costs |
| `openai` | ✅ Yes | Excellent | Slower | Higher quality semantic search |

**To use OpenAI embeddings:**
```json
{
  "env": {
    "OPENAI_API_KEY": "sk-...",
    "ENGRAM_EMBEDDING_MODEL": "openai"
  }
}
```

### MCP Tools

Core tools (similar to Memora):
- `engram_create`, `engram_get`, `engram_update`, `engram_delete`
- `engram_list`, `engram_search`
- `engram_stats`

### When to Use Engram vs Memora

| Feature | Engram | Memora |
|---------|--------|--------|
| **API Key** | Not required | Required (OpenAI) |
| **Cloud Sync** | ❌ No | ✅ Yes (Cloudflare R2) |
| **Embedding Quality** | Good (TF-IDF) | Excellent (OpenAI) |
| **Tools Count** | ~10 | 72+ |
| **Advanced Features** | Basic | Workspaces, Identities, Sessions, Tiering |
| **Use Case** | Simple local memory | Production multi-agent systems |

**Recommendation:**
- Use **Engram** for personal projects, offline work, or when API costs are a concern
- Use **Memora** for production systems, multi-machine sync, or when you need advanced features

### Development

```bash
cd /Users/ronaldo/Projects/FORK/engram
cargo build --release
cargo test
```

---

## Manual Lead Lookups

### Myriam Monica Spiero (January 29, 2026)

**Request:** Check enrichment for phone 11 99951-6666

**Discovery Process:**
1. Work API phone module → Found CPF in response
2. CPF extracted: `28659500857` (from `00028659500857` format)
3. Work API CPF module → Full enrichment data

**Results:**

| Field | Value |
|-------|-------|
| Nome | MYRIAM MONICA SPIERO |
| CPF | 286.595.008-57 |
| Nascimento | 09/05/1951 (73 anos) |
| Sexo | Feminino |
| Mãe | MARIANNE SPIERO |
| Telefones | 13 registrados |
| Emails | 2 registrados |
| Endereços | 7 registrados |

**Endereços Principais:**
1. Rua Rocha Azevedo, S/N - Apto C9 - **Cerqueira César** - CEP 01410-003
2. Rua Inocêncio Nogueira, S/N - **Cidade Jardim** - CEP 05676-030
3. Rua Muribeca, S/N - **Cidade Jardim** - CEP 05676-080

**Análise:**
- **Perfil:** Lead de Alto Valor Potencial
- **Indicadores:** Endereços em bairros nobres (Cerqueira César, Cidade Jardim)
- **Limitação:** Renda não disponível na base
- **Recomendação:** Contato prioritário - perfil geográfico indica alto poder aquisitivo

**Observação sobre CPF 14 dígitos:**
Work API retorna CPF em formato de 14 caracteres com zeros à esquerda. 
Para normalizar: usar últimos 11 dígitos (`cpf.slice(-11)`).

---

## MCP Server (RML-815) - January 29, 2026

### Overview

MCP (Model Context Protocol) server that exposes ts-c2s-api's lead enrichment capabilities to AI assistants like Claude Code.

**Entry point:** `bun run mcp-server.ts`
**SDK:** `@modelcontextprotocol/sdk` v1.4.1

**Full Documentation:** See `docs/MCP_SERVER.md` for complete setup guide, troubleshooting, and development docs.

### MCP Tools Available

| Tool | Description |
|------|-------------|
| `find_and_save_person` | **NEW** Find person by phone, fetch full data, and save to PostgreSQL in one step |
| `enrich_lead` | Enrich single lead by phone/email/name with full 4-tier CPF discovery |
| `enrich_bulk` | Batch enrichment with rate limiting |
| `discover_cpf` | Find CPF using 4-tier discovery (Work API → CPF Lookup → Diretrix → DBase) |
| `lookup_cpf` | Get full data for known CPF from Work API |
| `search_cpf_by_name` | Search 223M CPF database by name |
| `validate_cpf` | Validate CPF format and check database existence |
| `get_lead` | Get lead details by ID or phone |
| `list_leads` | List leads with filters (status, seller, date range) |
| `get_c2s_lead_status` | Get full C2S lead record including messages |
| `get_enrichment_stats` | Enrichment statistics with grouping options |
| `get_service_health` | Health status of all services |
| `retry_failed` | Retry failed/partial enrichments |

### find_and_save_person Tool (January 30, 2026)

Complete workflow tool that discovers a person and saves to PostgreSQL in one call.

**Input:**
```json
{
  "phone": "11993579021",  // Required
  "name": "Larissa Rodrigues"  // Optional, helps validation
}
```

**Output:**
```json
{
  "success": true,
  "saved": true,
  "partyId": "f5feaf0c-6e6e-451a-add0-429d8e5ba2a4",
  "person": {
    "cpf": "403.752.098-24",
    "name": "LARISSA ALVES DE SOUZA RODRIGUES",
    "birthDate": "07/07/1991",
    "gender": "F - FEMININO",
    "motherName": "CARMINDA ALVES DE SOUZA RODRIGUES",
    "income": "R$ 3.500,00"
  },
  "contacts": {
    "phones": ["11993579021", "11981703839"],
    "emails": ["email@example.com"],
    "totalPhones": 7,
    "totalEmails": 2
  },
  "addresses": {
    "list": [{"street": "...", "neighborhood": "...", "city": "..."}],
    "total": 8
  },
  "summary": "Saved LARISSA... with 7 phones, 2 emails, 8 addresses"
}
```

**Workflow:**
1. Work API phone module → Find CPF associated with phone
2. Filter out companies (LTDA, S/A, etc.) → Get person CPF
3. Work API CPF module → Fetch full enrichment data
4. PostgreSQL → Save party, contacts, and addresses

### MCP Resources

| URI | Description |
|-----|-------------|
| `enrichment://stats` | Real-time enrichment metrics (last 7 days) |
| `enrichment://health` | Service health status |
| `enrichment://recent` | Recent leads summary |

### Claude Code Configuration

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "c2s-enrichment": {
      "command": "bun",
      "args": ["run", "mcp-server.ts"],
      "cwd": "/Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api",
      "env": {
        "DB_URL": "postgresql://...",
        "C2S_TOKEN": "...",
        "C2S_URL": "https://api.contact2sale.com",
        "WORK_API": "...",
        "CPF_LOOKUP_API_URL": "https://cpf-lookup-api.fly.dev"
      }
    }
  }
}
```

### File Structure

```
ts-c2s-api/
├── mcp-server.ts           # Entry point
└── src/mcp/
    ├── index.ts            # Server initialization
    ├── tools.ts            # Tool handlers (12 tools)
    ├── resources.ts        # Resource handlers (3 resources)
    └── prompts.ts          # Prompt templates
```

### Example Usage

After configuring, use in Claude Code:

```
"Check enrichment stats for the last 7 days"
→ Uses get_enrichment_stats tool

"Enrich this lead: phone 11999887766, name João Silva"
→ Uses enrich_lead tool with 4-tier CPF discovery

"Find CPF for Maria Santos"
→ Uses discover_cpf tool
```

### Linear Issues

- **RML-815:** Create MCP server for ts-c2s-api (parent)
- **RML-816:** Setup MCP server structure and entry point
- **RML-817:** Implement enrichment tools
- **RML-818:** Implement discovery tools
- **RML-819:** Implement lead and stats tools
- **RML-820:** Add MCP resources and configure Claude Code

---

## C2S Leads Auto-Save (January 29, 2026)

### Overview

All C2S webhook leads are now automatically saved to PostgreSQL on arrival, BEFORE enrichment starts. This ensures no lead is lost even if enrichment fails.

### Database Table: `analytics.c2s_leads`

```sql
CREATE TABLE analytics.c2s_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id VARCHAR(255) UNIQUE NOT NULL,
  internal_id INTEGER,
  customer_name VARCHAR(255),
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_phone_normalized VARCHAR(20),
  seller_id VARCHAR(100),
  seller_name VARCHAR(255),
  seller_email VARCHAR(255),
  lead_source VARCHAR(255),
  lead_status VARCHAR(100),
  product_description VARCHAR(500),
  hook_action VARCHAR(50),
  raw_payload JSONB,
  enrichment_status VARCHAR(20) DEFAULT 'pending',
  party_id UUID REFERENCES analytics.parties(id),
  cpf VARCHAR(14),
  enriched_at TIMESTAMP,
  retry_count INTEGER DEFAULT 0,
  last_retry_at TIMESTAMP,
  last_error TEXT,
  c2s_created_at TIMESTAMP,
  c2s_updated_at TIMESTAMP,
  received_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

### Enrichment Status Flow

```
pending → processing → completed (full enrichment)
                    → partial (CPF found, Work API timeout)
                    → failed (max retries exceeded)
```

### Webhook Flow

```
1. C2S webhook received (/webhook/c2s)
   ↓
2. Lead stored in analytics.c2s_leads (status: pending)
   ↓
3. Enrichment queued asynchronously (status: processing)
   ↓
4. Enrichment completes
   - Success → status: completed, cpf + party_id set
   - Partial → status: partial, cpf set
   - Error → retry_count incremented, last_error set
```

### DbStorageService Methods

```typescript
// Store lead on arrival
container.dbStorage.upsertC2SLead(data)

// Find by lead ID
container.dbStorage.findC2SLeadByLeadId(leadId)

// Update enrichment status
container.dbStorage.updateC2SLeadEnrichmentStatus(leadId, status, partyId?, cpf?, error?)

// Increment retry count on error
container.dbStorage.incrementC2SLeadRetryCount(leadId, error)

// Get leads by status for retry
container.dbStorage.getC2SLeadsByStatus(['failed', 'partial'], limit)

// Get statistics
container.dbStorage.getC2SLeadStats(dateFrom?, dateTo?)
```

### Benefits

1. **No lead loss:** Leads saved immediately, even if enrichment fails
2. **Retry tracking:** Failed leads can be retried with error history
3. **Full audit trail:** Raw payload preserved for debugging
4. **Seller tracking:** Seller info saved for reporting
5. **Status monitoring:** Query leads by enrichment status

---

**Última atualização:** Janeiro 29, 2026 (Session 3 - MCP Server + Auto-Save)  
**Mantido por:** Ronaldo Lima + Claude AI
