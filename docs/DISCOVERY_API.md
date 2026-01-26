# Discovery API - Documentação Completa

**Data:** Janeiro 26, 2026  
**Versão:** 1.0.0  
**Autor:** Claude AI + Ronaldo Lima

---

## Visão Geral

A Discovery API é um conjunto de endpoints e serviços para:

1. **CPF Lookup** - Descobrir CPFs a partir de nomes usando banco DuckDB com 223M registros
2. **Bulk Enrichment** - Enriquecer múltiplas pessoas em massa via Work API
3. **Profile Reports** - Gerar relatórios de perfis em Markdown, HTML ou PDF

### Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Discovery API                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌────────────────────┐    ┌─────────────────┐  │
│  │ CPF Lookup   │    │ Bulk Enrichment    │    │ Profile Report  │  │
│  │ Service      │───▶│ Service            │───▶│ Service         │  │
│  └──────────────┘    └────────────────────┘    └─────────────────┘  │
│         │                     │                        │            │
│         ▼                     ▼                        ▼            │
│  ┌──────────────┐    ┌────────────────────┐    ┌─────────────────┐  │
│  │ DuckDB API   │    │ Work API           │    │ PostgreSQL      │  │
│  │ (223M CPFs)  │    │ (Completa Buscas)  │    │ (parties)       │  │
│  └──────────────┘    └────────────────────┘    └─────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Serviços

### 1. CpfLookupService

**Arquivo:** `src/services/cpf-lookup.service.ts`

Serviço para descoberta de CPF por nome usando o banco DuckDB com 223 milhões de registros.

#### Configuração

```typescript
// src/config/index.ts
CPF_LOOKUP_API_URL: "https://cpf-lookup-api.fly.dev"  // default
CPF_LOOKUP_TIMEOUT_MS: 120000  // 2 minutos (default)
```

#### Métodos

##### `healthCheck()`

Verifica se a API está online.

```typescript
const health = await container.cpfLookup.healthCheck();
// { ok: true, database: "cpf_223m.duckdb", total_records: 223000000 }
```

##### `searchByName(name: string)`

Busca CPFs por nome completo. **ATENÇÃO:** Pode demorar 2+ minutos.

```typescript
const result = await container.cpfLookup.searchByName("JOAO SILVA");
// {
//   success: true,
//   count: 5,
//   results: [
//     { cpf: "12345678901", nome_completo: "JOAO SILVA SANTOS", ... },
//     ...
//   ]
// }
```

##### `getByCpf(cpf: string)`

Busca dados por CPF conhecido.

```typescript
const person = await container.cpfLookup.getByCpf("12345678901");
// { cpf: "12345678901", nome_completo: "JOAO SILVA", sexo: "M", ... }
```

##### `findBestMatch(name: string)`

Encontra o melhor match de CPF para um nome (primeiro resultado ou match exato).

```typescript
const match = await container.cpfLookup.findBestMatch("MARIA OLIVEIRA");
// { cpf: "98765432109", nome_completo: "MARIA OLIVEIRA SANTOS", ... }
```

##### `lookupByCpf(cpf: string)`

Alias para `getByCpf()` - compatibilidade com CpfDiscoveryService.

##### `lookupByMasked(maskedCpf: string)`

Busca CPF por formato mascarado (ex: `***.123.456-**`).

```typescript
const result = await container.cpfLookup.lookupByMasked("***.123.456-**");
// { count: 3, results: [...] }
```

##### `searchMultipleByName(names: string[], options?)`

Busca CPFs para múltiplos nomes em série.

```typescript
const results = await container.cpfLookup.searchMultipleByName(
  ["JOAO SILVA", "MARIA SANTOS"],
  { delayMs: 1000, onProgress: (current, total, result) => console.log(current, total) }
);
// Map { "JOAO SILVA" => {...}, "MARIA SANTOS" => {...} }
```

---

### 2. BulkEnrichmentService

**Arquivo:** `src/services/bulk-enrichment.service.ts`

Serviço para enriquecimento em massa combinando descoberta de CPF + Work API + armazenamento.

#### Interfaces

```typescript
interface PersonInput {
  name?: string;
  cpf?: string;
  phone?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

interface EnrichedPerson {
  input: PersonInput;
  cpf?: string;
  cpfSource?: "input" | "duckdb" | "work-api-phone";
  workApiData?: WorkApiPerson;
  partyId?: string;
  status: "completed" | "partial" | "cpf_only" | "not_found" | "error";
  error?: string;
  phones: string[];
  emails: string[];
  income?: number;
  address?: { street, number, neighborhood, city, state };
}

interface BulkEnrichmentResult {
  success: boolean;
  total: number;
  completed: number;
  partial: number;
  cpfOnly: number;
  notFound: number;
  errors: number;
  results: EnrichedPerson[];
  durationMs: number;
}
```

#### Métodos

##### `enrichBulk(persons: PersonInput[], options?)`

Enriquece uma lista de pessoas.

```typescript
const result = await container.bulkEnrichment.enrichBulk(
  [
    { name: "JOAO SILVA", phone: "11999999999" },
    { cpf: "12345678901" },
    { name: "MARIA SANTOS" }
  ],
  {
    delayMs: 2000,           // delay entre requests (default: 2000)
    saveToDb: true,          // salvar no banco (default: true)
    discoverCpfByName: true, // descobrir CPF por nome (default: true)
    discoverCpfByPhone: true, // descobrir CPF por telefone (default: true)
    onProgress: (current, total, result) => console.log(`${current}/${total}`)
  }
);

// {
//   success: true,
//   total: 3,
//   completed: 2,
//   partial: 0,
//   cpfOnly: 0,
//   notFound: 1,
//   errors: 0,
//   results: [...],
//   durationMs: 12500
// }
```

##### `enrichByCpfs(cpfs: string[], options?)`

Enriquece a partir de uma lista de CPFs conhecidos.

```typescript
const result = await container.bulkEnrichment.enrichByCpfs(
  ["12345678901", "98765432109"],
  { saveToDb: true, delayMs: 2000 }
);
```

##### `enrichByNames(names: string[], options?)`

Enriquece a partir de uma lista de nomes (descobre CPF primeiro).

```typescript
const result = await container.bulkEnrichment.enrichByNames(
  ["JOAO SILVA", "MARIA SANTOS"],
  { saveToDb: true, delayMs: 2000 }
);
```

#### Fluxo de Enriquecimento

```
1. Recebe PersonInput
   │
   ├─ Se tem CPF → usa diretamente
   │
   ├─ Se tem telefone → Work API phone module → CPF
   │
   └─ Se tem nome → DuckDB API → CPF
   │
2. Com CPF descoberto
   │
   └─ Work API CPF module → dados completos
   │
3. Se saveToDb=true
   │
   └─ Upsert em analytics.parties + party_contacts
   │
4. Retorna EnrichedPerson
```

---

### 3. ProfileReportService

**Arquivo:** `src/services/profile-report.service.ts`

Serviço para geração de relatórios de perfis em Markdown, HTML ou PDF.

#### Interfaces

```typescript
interface ReportPerson {
  cpf: string;
  name: string;
  occupation?: string;
  company?: string;
  birthDate?: string;
  gender?: string;
  income?: number;
  phones: string[];
  emails: string[];
  address?: { street, number, neighborhood, city, state };
}

interface ReportOptions {
  title: string;
  subtitle?: string;
  classification?: string;  // default: "Confidencial - Uso Interno"
  includeContacts?: boolean; // default: true
  includeIncome?: boolean;   // default: true
  outputDir?: string;        // default: ./reports
}

interface ReportResult {
  success: boolean;
  format: "md" | "html" | "pdf";
  filePath?: string;   // para PDF
  content?: string;    // para MD/HTML
  error?: string;
}
```

#### Métodos

##### `generateMarkdown(persons: ReportPerson[], options)`

Gera relatório em Markdown.

```typescript
const result = await container.profileReport.generateMarkdown(persons, {
  title: "Relatório de Executivos",
  subtitle: "Ultrapar Holdings S.A."
});
// { success: true, format: "md", content: "# Relatório de Executivos\n..." }
```

##### `generateHtml(persons: ReportPerson[], options)`

Gera relatório em HTML com CSS inline.

```typescript
const result = await container.profileReport.generateHtml(persons, {
  title: "Relatório de Executivos"
});
// { success: true, format: "html", content: "<!DOCTYPE html>..." }
```

##### `generatePdf(persons: ReportPerson[], options)`

Gera relatório em PDF (usa `npx md-to-pdf`).

```typescript
const result = await container.profileReport.generatePdf(persons, {
  title: "Relatório de Executivos",
  outputDir: "/tmp/reports"
});
// { success: true, format: "pdf", filePath: "/tmp/reports/Relatorio_2026-01-26.pdf" }
```

##### `generateFromCpfs(cpfs: string[], options)`

Gera relatório buscando dados do banco por CPFs.

```typescript
const result = await container.profileReport.generateFromCpfs(
  ["12345678901", "98765432109"],
  { title: "Meu Relatório", format: "pdf" }
);
```

##### `generateFromPartyIds(partyIds: string[], options)`

Gera relatório buscando dados do banco por party IDs.

```typescript
const result = await container.profileReport.generateFromPartyIds(
  ["uuid-1", "uuid-2"],
  { title: "Meu Relatório", format: "md" }
);
```

#### Estrutura do Relatório

```markdown
# {title}

**{subtitle}**

**Data do Relatório:** 26/01/2026
**Classificação:** Confidencial - Uso Interno
**Total de Registros:** 9

---

## Sumário Executivo

| Métrica | Valor |
|---------|-------|
| Total de Pessoas | 9 |
| Com Renda Informada | 7 |
| Renda Média | R$ 45.000,00 |
| Total de Telefones | 146 |
| Total de Emails | 61 |

---

## Perfis Detalhados

### 1. JOAO SILVA SANTOS
**Cargo:** Diretor Financeiro
**Empresa:** Ultrapar Holdings

| Campo | Valor |
|-------|-------|
| **CPF** | 123.456.789-01 |
| **Data de Nascimento** | 15/03/1970 |
| **Gênero** | Masculino |
| **Renda Estimada** | R$ 85.000,00/mês |

**Endereço:** Av. Paulista, 1000, Jardins, São Paulo/SP

**Contatos:**

| Tipo | Contato |
|------|---------|
| 📱 Telefone | (11) 99999-9999 |
| 📧 Email | joao@email.com |

---

[... mais perfis ...]

---

## Informações do Relatório

- **Gerado em:** 26/01/2026 14:30:00
- **Sistema:** ts-c2s-api
- **Fonte dos dados:** Work API (Completa Buscas) + CPF Lookup API (DuckDB)

---

*Este documento contém informações confidenciais protegidas pela LGPD.*
```

---

## Endpoints REST

### Base URL

- **Produção:** `https://ts-c2s-api.fly.dev/discovery`
- **Desenvolvimento:** `http://localhost:3000/discovery`

### Autenticação

Todos os endpoints requerem API key no header (se configurada):

```bash
curl -H "X-API-Key: your-api-key" https://ts-c2s-api.fly.dev/discovery/cpf/health
```

---

### CPF Lookup Endpoints

#### GET /discovery/cpf/health

Verifica se a CPF Lookup API está online.

**Response:**
```json
{
  "success": true,
  "data": {
    "ok": true,
    "database": "cpf_223m.duckdb",
    "total_records": 223000000
  }
}
```

---

#### GET /discovery/cpf/search/:name

Busca CPFs por nome. **ATENÇÃO:** Pode demorar 2+ minutos.

**Parâmetros:**
- `name` (path, required): Nome para buscar (min 3 caracteres)

**Exemplo:**
```bash
curl "https://ts-c2s-api.fly.dev/discovery/cpf/search/JOAO%20SILVA"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "query": "JOAO SILVA",
    "count": 5,
    "results": [
      {
        "cpf": "12345678901",
        "nome_completo": "JOAO SILVA SANTOS",
        "sexo": "M",
        "data_nascimento": "1970-03-15"
      }
    ]
  }
}
```

---

#### GET /discovery/cpf/:cpf

Busca dados por CPF conhecido.

**Parâmetros:**
- `cpf` (path, required): CPF (11-14 caracteres)

**Exemplo:**
```bash
curl "https://ts-c2s-api.fly.dev/discovery/cpf/12345678901"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cpf": "12345678901",
    "nome_completo": "JOAO SILVA SANTOS",
    "sexo": "M",
    "data_nascimento": "1970-03-15"
  }
}
```

---

#### POST /discovery/cpf/best-match

Encontra o melhor match de CPF para um nome.

**Body:**
```json
{
  "name": "JOAO SILVA SANTOS"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cpf": "12345678901",
    "nome_completo": "JOAO SILVA SANTOS",
    "sexo": "M",
    "data_nascimento": "1970-03-15"
  }
}
```

---

### Bulk Enrichment Endpoints

#### POST /discovery/bulk/search-cpfs

Busca CPFs para múltiplos nomes.

**Body:**
```json
{
  "names": ["JOAO SILVA", "MARIA SANTOS", "PEDRO OLIVEIRA"],
  "delayMs": 1000
}
```

**Parâmetros:**
- `names` (required): Array de nomes (1-50 itens, min 3 chars cada)
- `delayMs` (optional): Delay entre buscas (500-5000ms, default: 1000)

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "total": 3,
      "found": 2,
      "notFound": 1,
      "elapsedMs": 125000
    },
    "results": [
      { "name": "JOAO SILVA", "found": true, "cpf": "12345678901", "fullName": "JOAO SILVA SANTOS" },
      { "name": "MARIA SANTOS", "found": true, "cpf": "98765432109", "fullName": "MARIA SANTOS LIMA" },
      { "name": "PEDRO OLIVEIRA", "found": false, "error": "No match found" }
    ]
  }
}
```

---

#### POST /discovery/bulk/enrich

Enriquecimento em massa de pessoas.

**Body:**
```json
{
  "persons": [
    { "name": "JOAO SILVA", "phone": "11999999999" },
    { "cpf": "12345678901" },
    { "name": "MARIA SANTOS" }
  ],
  "delayMs": 2000,
  "saveToDb": true
}
```

**Parâmetros:**
- `persons` (required): Array de pessoas (1-100 itens)
  - `name` (optional): Nome da pessoa
  - `cpf` (optional): CPF conhecido
  - `phone` (optional): Telefone para descoberta
  - `email` (optional): Email
- `delayMs` (optional): Delay entre requests (1000-10000ms, default: 2000)
- `saveToDb` (optional): Salvar no banco (default: true)

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "total": 3,
    "completed": 2,
    "partial": 0,
    "cpfOnly": 0,
    "notFound": 1,
    "errors": 0,
    "durationMs": 12500,
    "results": [
      {
        "input": { "name": "JOAO SILVA", "phone": "11999999999" },
        "cpf": "12345678901",
        "cpfSource": "work-api-phone",
        "partyId": "uuid-123",
        "status": "completed",
        "phones": ["11999999999", "11988888888"],
        "emails": ["joao@email.com"],
        "income": 85000
      }
    ]
  }
}
```

---

### Report Endpoints

#### POST /discovery/report/generate

Gera relatório a partir de CPFs (dados devem estar no banco).

**Body:**
```json
{
  "cpfs": ["12345678901", "98765432109"],
  "title": "Relatório de Executivos",
  "format": "pdf"
}
```

**Parâmetros:**
- `cpfs` (required): Array de CPFs (1-50 itens, 11-14 chars cada)
- `title` (optional): Título do relatório (default: "Relatório de Perfis")
- `format` (optional): Formato de saída - "md", "html" ou "pdf" (default: "md")

**Response (MD/HTML):**
```json
{
  "success": true,
  "data": {
    "format": "md",
    "content": "# Relatório de Executivos\n\n..."
  }
}
```

**Response (PDF):**
```json
{
  "success": true,
  "data": {
    "format": "pdf",
    "filePath": "/app/reports/Relatorio_2026-01-26.pdf",
    "message": "PDF generated successfully"
  }
}
```

---

#### POST /discovery/report/from-names

Pipeline completo: CPF Discovery → Enrichment → Report.

**Body:**
```json
{
  "names": ["JOAO SILVA SANTOS", "MARIA OLIVEIRA LIMA"],
  "title": "Relatório de Executivos",
  "format": "pdf",
  "saveToDb": true
}
```

**Parâmetros:**
- `names` (required): Array de nomes (1-20 itens, min 3 chars cada)
- `title` (optional): Título do relatório (default: "Relatório de Perfis")
- `format` (optional): Formato - "md", "html" ou "pdf" (default: "md")
- `saveToDb` (optional): Salvar no banco (default: true)

**Response:**
```json
{
  "success": true,
  "data": {
    "pipeline": {
      "namesProvided": 2,
      "cpfsFound": 2,
      "completed": 2,
      "partial": 0,
      "failed": 0
    },
    "cpfMapping": [
      { "name": "JOAO SILVA SANTOS", "cpf": "12345678901" },
      { "name": "MARIA OLIVEIRA LIMA", "cpf": "98765432109" }
    ],
    "report": {
      "format": "pdf",
      "filePath": "/app/reports/Relatorio_2026-01-26.pdf"
    }
  }
}
```

---

## Exemplos de Uso

### Exemplo 1: Descobrir CPFs de Executivos

```bash
# 1. Buscar CPFs para lista de nomes
curl -X POST "https://ts-c2s-api.fly.dev/discovery/bulk/search-cpfs" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "names": [
      "MARCOS LUTZ",
      "RODRIGO PIZZINATTO",
      "TABAJARA BERTELI"
    ],
    "delayMs": 1000
  }'
```

### Exemplo 2: Enriquecer e Salvar no Banco

```bash
# 2. Enriquecer com CPFs conhecidos
curl -X POST "https://ts-c2s-api.fly.dev/discovery/bulk/enrich" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "persons": [
      { "cpf": "12345678901" },
      { "cpf": "98765432109" },
      { "name": "OUTRO EXECUTIVO", "phone": "11999999999" }
    ],
    "saveToDb": true,
    "delayMs": 2000
  }'
```

### Exemplo 3: Gerar Relatório PDF

```bash
# 3. Gerar relatório PDF dos CPFs
curl -X POST "https://ts-c2s-api.fly.dev/discovery/report/generate" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "cpfs": ["12345678901", "98765432109"],
    "title": "Relatório de Executivos - Ultrapar",
    "format": "pdf"
  }'
```

### Exemplo 4: Pipeline Completo (Nomes → PDF)

```bash
# 4. Pipeline completo: nomes → CPF → enrich → PDF
curl -X POST "https://ts-c2s-api.fly.dev/discovery/report/from-names" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "names": [
      "MARCOS LUTZ",
      "RODRIGO PIZZINATTO",
      "TABAJARA BERTELI"
    ],
    "title": "Relatório de Executivos - Ultrapar Holdings",
    "format": "pdf",
    "saveToDb": true
  }'
```

---

## Considerações de Performance

### CPF Lookup por Nome

- **Tempo esperado:** 1-3 minutos por busca
- **Requisito de RAM:** 16GB na máquina Fly.io
- **Rate limit:** 1 busca por vez (série)

Para aumentar a RAM temporariamente:
```bash
fly scale memory 16384 -a cpf-lookup-api
# Depois de usar, reduzir para economizar:
fly scale memory 4096 -a cpf-lookup-api
```

### Work API

- **Rate limit:** 2 segundos entre requests
- **Timeout:** 30 segundos por request
- **CPF format:** Retorna 14 chars (normalizado para 11)

### Recomendações

1. **Descoberta em lote:** Use `delayMs >= 1000` para CPF lookup
2. **Enriquecimento:** Use `delayMs >= 2000` para Work API
3. **Relatórios grandes:** Limite a 20-50 perfis por relatório
4. **Produção:** Prefira horários de baixa para operações em massa

---

## Variáveis de Ambiente

```bash
# CPF Lookup API
CPF_LOOKUP_API_URL=https://cpf-lookup-api.fly.dev  # default
CPF_LOOKUP_TIMEOUT_MS=120000                        # 2 minutos, default

# Work API (já existentes)
WORK_API=<token>
WORK_API_URL=https://completa.workbuscas.com/api

# Database (já existente)
DB_URL=<postgresql connection string>

# Income multiplier (já existente)
INCOME_MULTIPLIER=1.9
```

---

## Troubleshooting

### CPF Lookup timeout

**Problema:** Busca por nome retorna timeout após 2 minutos.

**Solução:** Aumentar a RAM da máquina cpf-lookup-api para 16GB:
```bash
fly scale memory 16384 -a cpf-lookup-api --vm-cpu-kind performance
```

### Work API 403

**Problema:** Work API retorna 403 Forbidden.

**Solução:** Verificar se o token WORK_API está válido e não expirou.

### CPF com 14 caracteres

**Problema:** CPF retornado tem 14 caracteres ao invés de 11.

**Solução:** O sistema já normaliza automaticamente:
```typescript
if (cpf.length === 14) {
  cpf = cpf.slice(-11);
}
```

### Relatório PDF não gerado

**Problema:** PDF não é criado, retorna apenas MD.

**Solução:** Verificar se `npx md-to-pdf` está funcionando:
```bash
npx md-to-pdf --version
```

---

## Changelog

### v1.0.0 (2026-01-26)

- ✅ Criado `CpfLookupService` para busca por nome
- ✅ Criado `BulkEnrichmentService` para enriquecimento em massa
- ✅ Criado `ProfileReportService` para geração de relatórios
- ✅ Adicionados endpoints `/discovery/*`
- ✅ Documentação completa

---

**Última atualização:** Janeiro 26, 2026  
**Mantido por:** Ronaldo Lima + Claude AI
