# MCP Server Guide - ts-c2s-api

**Last Updated:** January 30, 2026  
**Project:** ts-c2s-api - Lead Enrichment API for MBRAS

---

## Table of Contents

- [What is MCP?](#what-is-mcp)
- [Architecture Overview](#architecture-overview)
- [Installation & Configuration](#installation--configuration)
- [Available Tools](#available-tools)
- [Available Resources](#available-resources)
- [Usage Examples](#usage-examples)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## What is MCP?

**MCP (Model Context Protocol)** is a standard protocol that allows AI assistants like Claude Code to interact with external tools and data sources.

The ts-c2s-api MCP server exposes **55 tools** and **3 resources** that enable Claude Code to:
- Enrich leads with CPF discovery
- Search the 223M CPF database
- Query enrichment statistics
- Monitor service health
- Retry failed enrichments

---

## Architecture Overview

```
Claude Code
    ↓
~/.claude/mcp.json (config)
    ↓
bun run mcp-server.ts (stdio)
    ↓
MCP SDK (@modelcontextprotocol/sdk)
    ↓
ts-c2s-api services (EnrichmentService, CpfDiscoveryService, etc.)
    ↓
External APIs (Work API, CPF Lookup, C2S)
```

### How It Works

1. **Claude Code reads** `~/.claude/mcp.json` on startup
2. **Spawns MCP server** as subprocess with stdio communication
3. **Tools & resources** become available to the AI assistant
4. **Claude Code sends** JSON-RPC requests when tools are invoked
5. **MCP server responds** with structured data

---

## Installation & Configuration

### Prerequisites

- **Bun runtime:** 1.1+
- **Claude Code:** Latest version
- **ts-c2s-api:** Clone and set up environment variables

### Step 1: Verify Project Setup

```bash
cd /Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api

# Ensure dependencies are installed
bun install

# Ensure environment variables are set
cat .env
```

### Step 2: Configure MCP in Claude Code

**File:** `~/.claude/mcp.json`

```json
{
  "mcpServers": {
    "c2s-enrichment": {
      "command": "bun",
      "args": ["run", "mcp-server.ts"],
      "cwd": "/Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api",
      "env": {
        "DB_URL": "postgresql://neondb_owner:xxx@ep-wandering-smoke-achvvk2d.sa-east-1.aws.neon.tech/neondb",
        "C2S_TOKEN": "your-c2s-token",
        "C2S_URL": "https://api.contact2sale.com",
        "WORK_API": "your-work-api-key",
        "CPF_LOOKUP_API_URL": "https://cpf-lookup-api.fly.dev",
        "FLY_API_TOKEN": "your-fly-token",
        "CPF_LOOKUP_MACHINE_ID": "90807561f37668"
      }
    }
  }
}
```

**Important:** Replace placeholder values with actual credentials from your `.env` file.

### Step 3: Restart Claude Code

After updating `mcp.json`, **restart Claude Code** for the changes to take effect.

### Step 4: Verify MCP Server is Loaded

In Claude Code, run:

```
/mcp
```

You should see `c2s-enrichment` in the list of connected servers.

---

## Available Tools

The MCP server provides **55 tools** organized into 16 categories:

### Tool Summary

| Category | Tools | Description |
|----------|-------|-------------|
| **Enrichment** | `enrich_lead`, `enrich_bulk`, `retry_failed` | Lead enrichment with 4-tier CPF discovery |
| **Discovery** | `find_and_save_person`, `discover_cpf`, `lookup_cpf`, `search_cpf_by_name`, `validate_cpf` | CPF lookup and validation |
| **Leads** | `get_lead`, `list_leads`, `get_c2s_lead_status` | Lead management |
| **Stats** | `get_enrichment_stats`, `get_service_health` | System and enrichment statistics |
| **Property** | `get_properties_by_cpf`, `get_property_summary`, `format_property_message` | Property intelligence from IBVI (3.69M properties) |
| **Quality** | `score_lead_quality`, `batch_score_quality` | Lead quality scoring (0-100 with grades A-F) |
| **Reports** | `generate_profile_report`, `generate_report_from_cpfs`, `generate_report_pdf` | Report generation (MD/HTML/PDF) |
| **Risk** | `assess_risk`, `quick_risk_check`, `analyze_text_risk` | Risk detection and assessment |
| **Analysis** | `analyze_lead`, `get_lead_analysis`, `check_lead_alert` | Deep lead analysis with tier classification |
| **C2S** | `fetch_c2s_leads`, `get_c2s_sellers`, `send_c2s_message`, `forward_c2s_lead`, `search_c2s_by_phone`, `search_c2s_by_email`, `mark_c2s_interacted`, `get_c2s_tags`, `add_c2s_lead_tag` | Direct C2S CRM operations |
| **Domain** | `analyze_email_domain`, `get_domain_trust_score`, `identify_company_from_email` | Email domain analysis and trust scoring |
| **CNPJ** | `lookup_cnpj`, `find_companies_by_name`, `analyze_company_portfolio` | Company lookup and portfolio analysis |
| **Insights** | `generate_web_insights`, `detect_family_connection`, `identify_notable_surname`, `analyze_lead_name` | Web insights and surname analysis |
| **Tier** | `calculate_lead_tier`, `get_tier_recommendation` | Tier calculation and recommendations |
| **Search** | `search_web`, `search_person`, `search_news`, `find_linkedin_profile` | Web search utilities |
| **Monitor** | `get_enrichment_rate`, `get_enrichment_health`, `get_enrichment_breakdown` | Enrichment monitoring and alerts |

### 1. Enrichment Tools

#### `enrich_lead`

Enrich a single lead with full 4-tier CPF discovery.

**Input:**
```json
{
  "phone": "11999887766",
  "email": "joao@example.com",
  "name": "João Silva",
  "leadId": "optional-lead-id"
}
```

**Output:**
```json
{
  "success": true,
  "cpf": "12345678901",
  "cpfSource": "work_api",
  "data": { /* full enrichment data */ },
  "matchScore": 0.95
}
```

#### `enrich_bulk`

Batch enrichment with rate limiting.

**Input:**
```json
{
  "leads": [
    {"phone": "11999887766", "name": "João Silva"},
    {"phone": "11888776655", "name": "Maria Santos"}
  ],
  "maxConcurrent": 5
}
```

**Output:**
```json
{
  "total": 2,
  "successful": 2,
  "failed": 0,
  "results": [ /* enrichment results */ ]
}
```

### 2. Discovery Tools

#### `discover_cpf`

Find CPF using 4-tier discovery (Work API → CPF Lookup → Diretrix → DBase).

**Input:**
```json
{
  "phone": "11999887766",
  "name": "João Silva"
}
```

**Output:**
```json
{
  "cpf": "12345678901",
  "source": "work_api",
  "confidence": 0.95,
  "nameMatches": [ /* potential matches */ ]
}
```

#### `lookup_cpf`

Get full data for a known CPF from Work API.

**Input:**
```json
{
  "cpf": "12345678901"
}
```

**Output:**
```json
{
  "success": true,
  "data": {
    "nome": "João Silva",
    "nascimento": "01/01/1980",
    "renda": 5000,
    "enderecos": [ /* addresses */ ],
    "telefones": [ /* phones */ ]
  }
}
```

#### `search_cpf_by_name`

Search 223M CPF database by name (auto-scales to 8GB RAM).

**Input:**
```json
{
  "name": "João Silva",
  "minScore": 0.7
}
```

**Output:**
```json
{
  "results": [
    {
      "cpf": "12345678901",
      "name": "JOÃO SILVA",
      "score": 0.95
    }
  ],
  "count": 1
}
```

#### `validate_cpf`

Validate CPF format and check database existence.

**Input:**
```json
{
  "cpf": "12345678901"
}
```

**Output:**
```json
{
  "valid": true,
  "formatted": "123.456.789-01",
  "exists": true
}
```

### 3. Lead & Stats Tools

#### `get_lead`

Get lead details by ID or phone.

**Input:**
```json
{
  "leadId": "lead-123",
  "phone": "11999887766"
}
```

**Output:**
```json
{
  "lead": {
    "id": "lead-123",
    "name": "João Silva",
    "phone": "11999887766",
    "enrichmentStatus": "completed",
    "cpf": "12345678901"
  }
}
```

#### `list_leads`

List leads with filters.

**Input:**
```json
{
  "status": "completed",
  "seller": "Seller Name",
  "dateFrom": "2026-01-01",
  "dateTo": "2026-01-31",
  "limit": 50
}
```

**Output:**
```json
{
  "leads": [ /* lead list */ ],
  "count": 42
}
```

#### `get_c2s_lead_status`

Get full C2S lead record including messages.

**Input:**
```json
{
  "leadId": "lead-123"
}
```

**Output:**
```json
{
  "lead": { /* C2S lead data */ },
  "messages": [ /* timeline */ ],
  "enrichmentData": { /* our enrichment */ }
}
```

#### `get_enrichment_stats`

Enrichment statistics with grouping options.

**Input:**
```json
{
  "dateFrom": "2026-01-01",
  "dateTo": "2026-01-31",
  "groupBy": "seller"
}
```

**Output:**
```json
{
  "total": 1000,
  "enriched": 920,
  "rate": 0.92,
  "bySeller": {
    "Seller A": {"total": 500, "enriched": 460},
    "Seller B": {"total": 500, "enriched": 460}
  }
}
```

#### `get_service_health`

Health status of all services.

**Input:** None

**Output:**
```json
{
  "database": "healthy",
  "workApi": "healthy",
  "cpfLookup": "healthy",
  "c2sApi": "healthy",
  "uptime": 3600
}
```

#### `retry_failed`

Retry failed/partial enrichments.

**Input:**
```json
{
  "statuses": ["failed", "partial"],
  "limit": 100
}
```

**Output:**
```json
{
  "queued": 42,
  "message": "Queued 42 leads for retry"
}
```

### 5. Property Intelligence Tools

Access property data from IBVI database (3.69M properties).

#### `get_properties_by_cpf`

Find all properties owned by a CPF.

**Input:**
```json
{
  "cpf": "12345678901"
}
```

**Output:**
```json
{
  "success": true,
  "cpf": "12345678901",
  "ownerName": "JOÃO SILVA",
  "summary": {
    "totalProperties": 3,
    "totalMarketValue": 2500000,
    "totalBuiltArea": 450
  },
  "properties": [
    {
      "address": "Rua Augusta, 1500 - Consolação",
      "type": "Apartamento",
      "builtArea": 150,
      "marketValue": 1200000
    }
  ]
}
```

#### `get_property_summary`

Get aggregated property portfolio for a CPF.

**Input:**
```json
{
  "cpf": "12345678901"
}
```

**Output:**
```json
{
  "success": true,
  "cpf": "12345678901",
  "ownerName": "JOÃO SILVA",
  "portfolio": {
    "totalProperties": 3,
    "totalMarketValue": 2500000,
    "totalBuiltArea": 450,
    "avgPropertyValue": 833333,
    "propertyTypes": {
      "Apartamento": 2,
      "Casa": 1
    },
    "neighborhoods": ["Consolação", "Jardins"]
  }
}
```

#### `format_property_message`

Format property data as a message for C2S.

**Input:**
```json
{
  "cpf": "12345678901",
  "format": "detailed"
}
```

**Output:**
```json
{
  "success": true,
  "message": "🏠 Patrimônio Imobiliário - JOÃO SILVA\n\n📊 Resumo:\n- 3 imóveis cadastrados\n- Valor total: R$ 2.500.000\n- Área construída: 450 m²\n\n📍 Imóveis:\n1. Rua Augusta, 1500 - Consolação\n   Apartamento - 150 m² - R$ 1.200.000\n..."
}
```

### 6. Quality Scoring Tools

Score leads based on data completeness, income, and other factors.

#### `score_lead_quality`

Calculate quality score (0-100) with breakdown.

**Input:**
```json
{
  "cpf": "12345678901",
  "name": "João Silva",
  "phone": "11999887766",
  "email": "joao@empresa.com.br",
  "income": 15000,
  "neighborhood": "Jardins"
}
```

**Output:**
```json
{
  "success": true,
  "score": 85,
  "grade": "A",
  "breakdown": {
    "dataCompleteness": 28,
    "incomeScore": 25,
    "locationScore": 15,
    "contactValidity": 17,
    "enrichmentBonus": 0
  },
  "maxScores": {
    "dataCompleteness": 30,
    "incomeScore": 25,
    "locationScore": 15,
    "contactValidity": 20,
    "enrichmentBonus": 10
  },
  "recommendation": "High quality lead - prioritize contact"
}
```

**Grading Scale:**
- **A (90-100):** Excellent quality
- **B (75-89):** Good quality
- **C (60-74):** Average quality
- **D (40-59):** Below average
- **F (0-39):** Poor quality

#### `batch_score_quality`

Score multiple leads at once.

**Input:**
```json
{
  "leads": [
    {"cpf": "12345678901", "name": "João Silva", "income": 15000},
    {"cpf": "98765432109", "name": "Maria Santos", "income": 8000}
  ]
}
```

**Output:**
```json
{
  "success": true,
  "total": 2,
  "results": [
    {"cpf": "12345678901", "score": 85, "grade": "A"},
    {"cpf": "98765432109", "score": 72, "grade": "C"}
  ],
  "summary": {
    "avgScore": 78.5,
    "distribution": {"A": 1, "C": 1}
  }
}
```

### 7. Report Generation Tools

Generate profile reports in various formats.

#### `generate_profile_report`

Generate report from person data.

**Input:**
```json
{
  "personData": {
    "cpf": "12345678901",
    "nome": "João Silva",
    "nascimento": "01/01/1980",
    "renda": 15000,
    "enderecos": [...],
    "telefones": [...]
  },
  "format": "markdown"
}
```

**Output:**
```json
{
  "success": true,
  "format": "markdown",
  "content": "# Perfil: JOÃO SILVA\n\n## Dados Pessoais\n- **CPF:** 123.456.789-01\n- **Nascimento:** 01/01/1980\n- **Renda Estimada:** R$ 15.000/mês\n\n## Endereços\n...",
  "wordCount": 450
}
```

**Supported formats:** `markdown`, `html`, `text`

#### `generate_report_from_cpfs`

Lookup CPFs, enrich, and generate consolidated report.

**Input:**
```json
{
  "cpfs": ["12345678901", "98765432109"],
  "format": "html",
  "includeProperties": true
}
```

**Output:**
```json
{
  "success": true,
  "format": "html",
  "content": "<html><head>...</head><body>...</body></html>",
  "profiles": [
    {"cpf": "12345678901", "name": "JOÃO SILVA", "enriched": true},
    {"cpf": "98765432109", "name": "MARIA SANTOS", "enriched": true}
  ]
}
```

#### `generate_report_pdf`

Generate PDF report (returns base64).

**Input:**
```json
{
  "cpfs": ["12345678901"],
  "template": "detailed"
}
```

**Output:**
```json
{
  "success": true,
  "format": "pdf",
  "base64": "JVBERi0xLjQKJeLjz9MKMSAwIG9iago...",
  "filename": "profile_12345678901_20260130.pdf",
  "sizeKb": 125
}
```

### 8. Risk Assessment Tools

Detect and assess risks associated with leads.

#### `assess_risk`

Full risk assessment with negative news search.

**Input:**
```json
{
  "name": "Fernando Oliveira Lima",
  "cpf": "12345678901",
  "searchWeb": true
}
```

**Output:**
```json
{
  "success": true,
  "riskScore": 85,
  "riskLevel": "critical",
  "alerts": [
    {
      "type": "investigation",
      "severity": "critical",
      "title": "CPI das Bets",
      "description": "Investigado na CPI das Bets por lavagem de dinheiro",
      "source": "known_risks_database"
    }
  ],
  "categories": {
    "criminal": 0,
    "investigation": 85,
    "financial": 0,
    "reputation": 0,
    "legal": 0
  },
  "recommendation": "RISCO CRÍTICO: NÃO PROSSEGUIR - Investigado em CPI"
}
```

**Risk Levels:**
- **critical (80-100):** Do not proceed
- **high (60-79):** Proceed with extreme caution
- **medium (40-59):** Review carefully
- **low (20-39):** Minor concerns
- **none (0-19):** No significant risks

#### `quick_risk_check`

Fast check against known risks (no web search).

**Input:**
```json
{
  "name": "Fernando Oliveira Lima"
}
```

**Output:**
```json
{
  "success": true,
  "hasKnownRisks": true,
  "riskLevel": "critical",
  "matchedRisks": [
    {
      "name": "Fernando Oliveira Lima",
      "type": "investigation",
      "description": "CPI das Bets - investigado por lavagem de dinheiro"
    }
  ]
}
```

#### `analyze_text_risk`

Check any text for risk keywords.

**Input:**
```json
{
  "text": "Cliente mencionou que foi indiciado por fraude bancária em 2023"
}
```

**Output:**
```json
{
  "success": true,
  "riskScore": 75,
  "detectedKeywords": [
    {"keyword": "indiciado", "category": "legal", "weight": 30},
    {"keyword": "fraude", "category": "criminal", "weight": 40}
  ],
  "categories": {
    "criminal": 40,
    "legal": 30
  }
}
```

### 9. Lead Analysis Tools

Deep analysis with tier classification and recommendations.

#### `analyze_lead`

Comprehensive lead analysis with web search.

**Input:**
```json
{
  "name": "Carlos Eduardo Medeiros",
  "cpf": "12345678901",
  "email": "carlos@construtora.com.br",
  "phone": "11999887766",
  "enableWebSearch": true
}
```

**Output:**
```json
{
  "success": true,
  "tier": "platinum",
  "score": 92,
  "discovered": {
    "company": "Construtora Medeiros Ltda",
    "role": "Sócio-Diretor",
    "linkedIn": "https://linkedin.com/in/carlosmedeiros",
    "companyRevenue": "R$ 50M+",
    "employees": 120
  },
  "portfolio": {
    "properties": 5,
    "totalValue": 8500000
  },
  "risk": {
    "level": "none",
    "score": 5
  },
  "recommendation": {
    "action": "priority",
    "title": "Lead Premium - Alta Prioridade",
    "message": "Sócio de construtora com patrimônio significativo. Potencial comprador de imóveis de alto padrão.",
    "suggestedProducts": ["Imóveis acima de R$ 2M", "Investimentos imobiliários"]
  }
}
```

**Tier Classification:**
- **platinum (90-100):** Ultra-high value, priority contact
- **gold (75-89):** High value, fast track
- **silver (50-74):** Standard quality
- **bronze (25-49):** Basic lead
- **risk (<25 or has critical alerts):** Do not pursue

#### `get_lead_analysis`

Retrieve cached analysis from database.

**Input:**
```json
{
  "cpf": "12345678901"
}
```

**Output:**
```json
{
  "success": true,
  "cached": true,
  "analyzedAt": "2026-01-29T15:30:00Z",
  "analysis": {
    "tier": "platinum",
    "score": 92,
    "discovered": {...},
    "recommendation": {...}
  }
}
```

#### `check_lead_alert`

Check if lead triggers premium or risk alerts.

**Input:**
```json
{
  "name": "João Safra",
  "income": 50000,
  "neighborhood": "Jardins"
}
```

**Output:**
```json
{
  "success": true,
  "hasAlerts": true,
  "alerts": [
    {
      "type": "high_value",
      "severity": "info",
      "reason": "notable_surname",
      "details": "Sobrenome Safra identificado - família de alta relevância no mercado financeiro"
    },
    {
      "type": "high_value",
      "severity": "info",
      "reason": "premium_neighborhood",
      "details": "Endereço em bairro premium: Jardins"
    },
    {
      "type": "high_value",
      "severity": "info",
      "reason": "high_income",
      "details": "Renda acima de R$ 30.000/mês"
    }
  ],
  "recommendation": "Lead de alto valor - contato prioritário recomendado"
}
```

---

## Available Resources

Resources provide real-time data that Claude Code can read without explicit tool calls.

### 1. `enrichment://stats`

Real-time enrichment metrics for the last 7 days.

**Data:**
```json
{
  "total": 1000,
  "enriched": 920,
  "rate": 0.92,
  "avgResponseTime": 2.5,
  "lastUpdate": "2026-01-29T12:00:00Z"
}
```

### 2. `enrichment://health`

Service health status.

**Data:**
```json
{
  "database": "healthy",
  "workApi": "healthy",
  "cpfLookup": "healthy",
  "c2sApi": "healthy"
}
```

### 3. `enrichment://recent`

Recent leads summary (last 24 hours).

**Data:**
```json
{
  "count": 50,
  "enriched": 45,
  "pending": 3,
  "failed": 2,
  "leads": [ /* top 10 recent */ ]
}
```

---

## Usage Examples

### Example 1: Enrich a Single Lead

**User:** "Enrich this lead: phone 11999887766, name João Silva"

**Claude Code uses:** `enrich_lead` tool

**Result:**
```
✅ Lead enriched successfully!

CPF: 123.456.789-01 (found via Work API)
Name: JOÃO SILVA
Income: R$ 5,000/month
Addresses: 3 found
Phones: 5 found
Match Score: 0.95
```

### Example 2: Check Enrichment Stats

**User:** "Show me enrichment stats for the last week"

**Claude Code uses:** `get_enrichment_stats` tool

**Result:**
```
📊 Enrichment Statistics (Last 7 Days)

Total Leads: 1,000
Enriched: 920 (92%)
Pending: 50 (5%)
Failed: 30 (3%)

By Seller:
- Seller A: 500 leads, 460 enriched (92%)
- Seller B: 500 leads, 460 enriched (92%)
```

### Example 3: Find CPF for Unknown Lead

**User:** "Find CPF for Maria Santos, phone 11888776655"

**Claude Code uses:** `discover_cpf` tool

**Result:**
```
🔍 CPF Discovery Results

CPF: 987.654.321-09
Source: CPF Lookup (Tier 2)
Confidence: 0.88

Name Matches:
1. MARIA SANTOS (score: 0.95)
2. MARIA DOS SANTOS (score: 0.88)
```

### Example 4: Search CPF Database by Name

**User:** "Search for all 'João Silva' in the CPF database"

**Claude Code uses:** `search_cpf_by_name` tool

**Result:**
```
🔍 CPF Database Search: "João Silva"

Found 15 results:

1. JOÃO SILVA - 123.456.789-01 (score: 0.95)
2. JOÃO SILVA SANTOS - 234.567.890-12 (score: 0.88)
3. JOÃO DA SILVA - 345.678.901-23 (score: 0.85)
...

Note: Auto-scaled CPF Lookup API to 8GB RAM for this search.
```

### Example 5: Retry Failed Enrichments

**User:** "Retry all failed enrichments"

**Claude Code uses:** `retry_failed` tool

**Result:**
```
🔄 Retry Queue

Queued 42 leads for retry:
- 30 failed enrichments
- 12 partial enrichments

Processing will start immediately.
```

---

## Troubleshooting

### MCP Server Not Loading

**Symptoms:**
- `/mcp` command doesn't show `c2s-enrichment`
- Tools are not available

**Solutions:**

1. **Check mcp.json location:**
   ```bash
   cat ~/.claude/mcp.json
   ```
   Should show `c2s-enrichment` configuration.

2. **Verify project path:**
   Ensure `cwd` in `mcp.json` points to correct directory:
   ```
   /Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api
   ```

3. **Check Bun installation:**
   ```bash
   which bun
   bun --version
   ```

4. **Restart Claude Code** after config changes.

### Tools Return Errors

**Symptoms:**
- Tools execute but return error messages

**Solutions:**

1. **Check environment variables:**
   Ensure all required env vars are set in `mcp.json`:
   - `DB_URL`
   - `C2S_TOKEN`
   - `C2S_URL`
   - `WORK_API`
   - `CPF_LOOKUP_API_URL`

2. **Verify database connection:**
   ```bash
   cd /Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api
   bun run scripts/debug/test-db-connection.ts
   ```

3. **Check Work API key:**
   ```bash
   bun run scripts/debug/test-work-api.ts
   ```

### Manual Testing

Test the MCP server standalone:

```bash
cd /Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api

# Start server in stdio mode
bun run mcp-server.ts

# You'll see it waiting for input (normal behavior)
# Press Ctrl+C to exit
```

**Expected output:**
```
MCP Server running on stdio
```

### Check Logs

MCP server logs are visible in Claude Code's developer console:

1. Open Claude Code
2. Go to View → Developer → Toggle Developer Tools
3. Check Console tab for MCP-related messages

---

## Development

### File Structure

```
ts-c2s-api/
├── mcp-server.ts           # Entry point
└── src/mcp/
    ├── README.md           # MCP module documentation
    ├── index.ts            # Main exports
    ├── server.ts           # Server setup and handlers
    ├── types.ts            # Type definitions
    ├── tools/              # Tool implementations (55 tools)
    │   ├── index.ts        # Tool routing
    │   ├── enrichment.ts   # Enrichment (3)
    │   ├── discovery.ts    # Discovery (5)
    │   ├── leads.ts        # Lead management (3)
    │   ├── stats.ts        # Statistics (2)
    │   ├── property.ts     # Property intelligence (3)
    │   ├── quality.ts      # Quality scoring (2)
    │   ├── reports.ts      # Report generation (3)
    │   ├── risk.ts         # Risk assessment (3)
    │   ├── analysis.ts     # Lead analysis (3)
    │   ├── c2s.ts          # C2S CRM integration (9)
    │   ├── domain.ts       # Domain analysis (3)
    │   ├── cnpj.ts         # CNPJ lookup (3)
    │   ├── insights.ts     # Web insights (4)
    │   ├── tier.ts         # Tier calculator (2)
    │   ├── search.ts       # Web search (4)
    │   └── monitor.ts      # Enrichment monitor (3)
    ├── resources/          # Resource implementations (3)
    │   ├── index.ts        # Resource routing
    │   └── stats.ts        # Statistics resources
    └── prompts/            # Prompt templates (future)
        └── index.ts        # Prompt definitions
```

### Adding New Tools

1. **Define tool in `src/mcp/tools/<category>.ts`:**

```typescript
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ... existing tools
    {
      name: "my_new_tool",
      description: "Description of what it does",
      inputSchema: {
        type: "object",
        properties: {
          param1: { type: "string", description: "Param description" }
        },
        required: ["param1"]
      }
    }
  ]
}));
```

2. **Implement handler:**

```typescript
if (name === "my_new_tool") {
  const { param1 } = args as { param1: string };
  const result = await container.someService.someMethod(param1);
  
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
}
```

3. **Restart Claude Code** to load new tool.

### Adding New Resources

1. **Define resource in `src/mcp/resources.ts`:**

```typescript
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    // ... existing resources
    {
      uri: "enrichment://my-data",
      name: "My Data Resource",
      description: "Description of the data",
      mimeType: "application/json"
    }
  ]
}));
```

2. **Implement handler:**

```typescript
if (uri === "enrichment://my-data") {
  const data = await container.someService.getData();
  
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2)
      }
    ]
  };
}
```

3. **Restart Claude Code** to load new resource.

### Testing Changes

1. **Stop Claude Code**

2. **Make changes** to MCP server code

3. **Test standalone:**
   ```bash
   bun run mcp-server.ts
   ```

4. **Restart Claude Code** and verify changes

---

## Best Practices

### 1. Error Handling

Always return structured errors:

```typescript
try {
  const result = await container.service.method();
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
} catch (error) {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ error: error.message }, null, 2)
    }],
    isError: true
  };
}
```

### 2. Input Validation

Validate inputs before processing:

```typescript
if (!phone && !email) {
  throw new Error("Either phone or email is required");
}

if (phone && !/^\d{10,11}$/.test(phone)) {
  throw new Error("Invalid phone format");
}
```

### 3. Rate Limiting

Use rate limiting for external API calls:

```typescript
const results = [];
for (const lead of leads) {
  const result = await enrichLead(lead);
  results.push(result);
  await delay(2000); // 2s between requests
}
```

### 4. Structured Output

Return consistent JSON structures:

```typescript
{
  "success": true,
  "data": { /* actual data */ },
  "metadata": {
    "timestamp": "2026-01-29T12:00:00Z",
    "duration": 2.5
  }
}
```

---

## Security Considerations

### 1. Environment Variables

**NEVER** commit sensitive env vars to git. Use `.env` file (gitignored).

### 2. MCP Configuration

Store credentials in `~/.claude/mcp.json`, which is:
- Outside the project directory
- Not committed to version control
- Readable only by your user

### 3. Database Access

- Use read-only database users when possible
- Limit access to only required tables
- Never expose raw SQL in tool outputs

### 4. API Keys

- Rotate API keys regularly
- Monitor usage for anomalies
- Set up rate limiting

---

## FAQ

### Q: How do I update the MCP server?

**A:** 
1. Make changes to `mcp-server.ts` or `src/mcp/*`
2. Restart Claude Code
3. Changes take effect immediately

### Q: Can multiple Claude Code instances use the same MCP server?

**A:** Yes, but each instance spawns its own server process. They share the same database and APIs.

### Q: How do I debug MCP server issues?

**A:**
1. Check Claude Code developer console
2. Test server standalone: `bun run mcp-server.ts`
3. Check logs in `logs/` directory
4. Verify environment variables

### Q: Can I use the MCP server from other AI tools?

**A:** Yes, any tool that supports MCP protocol can connect. Update the tool's MCP configuration file accordingly.

### Q: What happens if the MCP server crashes?

**A:** Claude Code will automatically restart it on the next tool invocation.

---

## Linear Issues

### Phase 0: Initial MCP Server (January 29, 2026)
- **RML-815:** Create MCP server for ts-c2s-api (parent)
- **RML-816:** Setup MCP server structure and entry point ✅
- **RML-817:** Implement enrichment tools ✅
- **RML-818:** Implement discovery tools ✅
- **RML-819:** Implement lead and stats tools ✅
- **RML-820:** Add MCP resources and configure Claude Code ✅

### Phase 1: Feature Expansion (January 30, 2026)
- **RML-987:** Property Intelligence Tools (3 tools) ✅
- **RML-988:** Quality Scoring Tools (2 tools) ✅
- **RML-989:** Report Generation Tools (3 tools) ✅
- **RML-990:** Risk Assessment Tools (3 tools) ✅
- **RML-991:** Lead Analysis Tools (3 tools) ✅

**Total:** **55 tools**

---

## Additional Resources

- **MCP Protocol Spec:** https://modelcontextprotocol.io/
- **MCP SDK (TypeScript):** https://github.com/modelcontextprotocol/typescript-sdk
- **Claude Code Documentation:** https://docs.anthropic.com/claude-code
- **Bun Runtime:** https://bun.sh/

---

**Document Version:** 2.0  
**Last Updated:** January 30, 2026  
**Maintained By:** Ronaldo Lima + Claude AI
