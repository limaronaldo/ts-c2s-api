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
| CpfDiscoveryService | `services/cpf-discovery.service.ts` | Descoberta de CPF |
| EnrichmentService | `services/enrichment.service.ts` | Orquestrador principal |
| C2SService | `services/c2s.service.ts` | Integração CRM |
| AlertService | `services/alert.service.ts` | Slack + Email |
| DbStorageService | `services/db-storage.service.ts` | Persistência |
| CpfLookupService | `services/cpf-lookup.service.ts` | Busca CPF por nome (DuckDB 223M) |
| BulkEnrichmentService | `services/bulk-enrichment.service.ts` | Enriquecimento em massa |
| ProfileReportService | `services/profile-report.service.ts` | Relatórios MD/HTML/PDF |

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
| `/batch/enrich-direct` | POST | Batch enrichment (Work API only) |
| `/webhook/c2s` | POST | Webhook C2S |
| `/webhook/google-ads` | POST | Webhook Google Ads |

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

### Resultados Finais (25/01/2026)

| Métrica | Valor |
|---------|-------|
| Total leads | 36,113 |
| Total enriched | 34,053 |
| **CPF Rate** | **90.9%** |

### Distribuição por Status

| Status | Count | % |
|--------|-------|---|
| ✅ Completed | 24,629 | 72.2% |
| ⚠️ Partial | 6,311 | 18.5% |
| ❌ Unenriched | 3,113 | 9.1% |

### Cronograma

- **Jan 19:** Export 36,113 leads do C2S
- **Jan 20:** Início do batch enrichment
- **Jan 25:** Retry dos 3,386 unenriched (+321 CPFs)
- **Jan 25:** ✅ **CONCLUÍDO**

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
- **Uso:** Busca por nome como fallback, validação de CPF
- **Endpoints:**
  - `GET /search/:name` - Busca CPF por nome (lento, pode demorar 2+ min)
  - `GET /cpf/:cpf` - Busca dados por CPF conhecido
  - `GET /masked/:digits` - Busca por CPF mascarado (6 dígitos do meio)
  - `GET /health` - Health check
  - `GET /stats` - Estatísticas do banco
- **RAM:** Requer 16GB para buscas por nome (upgrade temporário via `fly scale memory 16384`)
- **Documentação:** `docs/CPF_DISCOVERY_PROCESS.md`

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

# Optional
ENABLE_CRON=true    # Cron job
INCOME_MULTIPLIER=1.9
CPF_LOOKUP_API_URL  # DuckDB API (default: https://cpf-lookup-api.fly.dev)
```

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

**Pending:**
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

**Última atualização:** Janeiro 25, 2026  
**Mantido por:** Ronaldo Lima + Claude AI
