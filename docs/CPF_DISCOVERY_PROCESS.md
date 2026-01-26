# Processo de Descoberta de CPF - ts-c2s-api

**Última atualização:** Janeiro 2026  
**Mantido por:** Ronaldo Lima + Claude AI

---

## Visão Geral

Este documento descreve em detalhes o processo completo de descoberta de CPF a partir de telefone/email de um lead, usado pela MBRAS para enriquecer leads do CRM C2S.

### Fluxo Resumido

```
Lead (telefone/email/nome) 
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│              CPF DISCOVERY (2 Métodos)                  │
│                                                         │
│  ┌─────────────────┐   ┌─────────────────────────────┐ │
│  │    Método 1     │   │         Método 2            │ │
│  │   Work API      │   │    DuckDB (223M CPFs)       │ │
│  │ (phone module)  │   │   (busca por nome)          │ │
│  └─────────────────┘   └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
    │
    ▼ (CPF encontrado)
┌─────────────────────────────────────────────────────────┐
│              ENRICHMENT (Work API CPF Module)           │
│  • Nome completo        • Renda/Patrimônio             │
│  • Data nascimento      • Profissão/Escolaridade       │
│  • Nome da mãe          • Telefones/Emails             │
│  • Sexo                 • Endereços                    │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│                    OUTPUT                               │
│  • Mensagem no C2S      • Alertas (leads alto valor)   │
│  • Storage PostgreSQL   • Insights automáticos         │
└─────────────────────────────────────────────────────────┘
```

---

## APIs Utilizadas

### 1. Work API - Phone Module (Descoberta de CPF por Telefone)

**Propósito:** Descobrir o CPF de uma pessoa a partir do número de telefone.

| Configuração | Valor |
|--------------|-------|
| **URL Base** | `https://completa.workbuscas.com/api` |
| **Método** | GET |
| **Autenticação** | Token como query parameter |
| **Timeout** | 15 segundos |
| **Rate Limit** | 2 segundos entre requests |
| **Taxa de Sucesso** | ~85-90% para telefones válidos |

**Variáveis de Ambiente:**
```bash
WORK_API=<token>
WORK_API_URL=https://completa.workbuscas.com/api
```

**Request:**
```bash
curl "https://completa.workbuscas.com/api?token=SEU_TOKEN&modulo=phone&consulta=11999999999"
```

**Response (sucesso):**
```json
{
  "msg": [
    {
      "cpf_cnpj": "00012345678901",
      "nome": "FULANO DA SILVA"
    }
  ]
}
```

**IMPORTANTE - Normalização do CPF:**
```typescript
// Work API retorna CPF com 14 caracteres (zeros à esquerda)
// SEMPRE normalizar para 11 dígitos:
let cpf = response.msg[0].cpf_cnpj;
if (cpf && cpf.length === 14) {
  cpf = cpf.slice(-11); // "00012345678901" → "12345678901"
}
```

**Response (não encontrado):**
```json
{
  "msg": []
}
```

**Response (erro de token):**
```json
{
  "status": 403,
  "reason": "Token vencido ou inválido"
}
```

---

### 2. DuckDB - CPF Lookup API (Descoberta de CPF por Nome)

**Propósito:** Buscar CPF a partir do nome completo da pessoa. Base com 223 milhões de CPFs.

| Configuração | Valor |
|--------------|-------|
| **URL Base** | `https://cpf-lookup-api.fly.dev` |
| **Método** | GET |
| **Autenticação** | Nenhuma (API interna) |
| **Timeout** | 10 segundos |
| **Base de Dados** | DuckDB com 223M+ registros |

**Variáveis de Ambiente:**
```bash
CPF_LOOKUP_API_URL=https://cpf-lookup-api.fly.dev
```

**Endpoints Disponíveis:**

#### 2.1. Busca por CPF (validação)
```bash
GET /cpf/:cpf
```

**Request:**
```bash
curl "https://cpf-lookup-api.fly.dev/cpf/12345678901"
```

**Response:**
```json
{
  "cpf": "12345678901",
  "nome_completo": "FULANO DA SILVA",
  "sexo": "M",
  "data_nascimento": "1990-01-15"
}
```

#### 2.2. Busca por Nome
```bash
GET /search/:name
```

**Request:**
```bash
curl "https://cpf-lookup-api.fly.dev/search/FULANO%20DA%20SILVA"
```

**Response:**
```json
{
  "count": 3,
  "results": [
    {
      "cpf": "12345678901",
      "nome_completo": "FULANO DA SILVA",
      "sexo": "M",
      "data_nascimento": "1990-01-15"
    },
    {
      "cpf": "98765432101",
      "nome_completo": "FULANO DA SILVA JUNIOR",
      "sexo": "M",
      "data_nascimento": "2015-03-20"
    }
  ]
}
```

**Nota:** Busca por nome é mais lenta (full scan). Retorna múltiplos resultados - usar matching de nome para selecionar o correto.

#### 2.3. Busca por CPF Mascarado
```bash
GET /masked/:masked
```

Útil quando você tem CPF parcial (ex: ***.123.456-**).

**Request:**
```bash
curl "https://cpf-lookup-api.fly.dev/masked/***.123.456-**"
```

**Response:**
```json
{
  "count": 15,
  "results": [
    {
      "cpf": "11112345678",
      "nome_completo": "PESSOA UM",
      "sexo": "F",
      "data_nascimento": "1985-07-22"
    }
  ]
}
```

#### 2.4. Health Check e Stats
```bash
GET /health   # Verifica se API está online
GET /stats    # Retorna total de registros
```

---

### 3. Work API - CPF Module (Enrichment)

**Propósito:** Após descobrir o CPF, buscar dados completos da pessoa.

| Configuração | Valor |
|--------------|-------|
| **URL Base** | `https://completa.workbuscas.com/api` |
| **Método** | GET |
| **Timeout** | 30 segundos |
| **Rate Limit** | 2 segundos entre requests |

**Request:**
```bash
curl "https://completa.workbuscas.com/api?token=SEU_TOKEN&modulo=cpf&consulta=12345678901"
```

**Response (sucesso):**
```json
{
  "DadosBasicos": {
    "nome": "FULANO DA SILVA",
    "dataNascimento": "01/01/1990",
    "sexo": "M - MASCULINO",
    "nomeMae": "MARIA DA SILVA"
  },
  "DadosEconomicos": {
    "renda": "5000.00",
    "rendaPresumida": "6500.00"
  },
  "telefones": [
    { "telefone": "11999999999", "tipo": "CELULAR" },
    { "telefone": "1133334444", "tipo": "FIXO" }
  ],
  "emails": [
    { "email": "fulano@email.com" }
  ],
  "enderecos": [
    {
      "logradouro": "RUA EXEMPLO",
      "numero": "123",
      "complemento": "APTO 45",
      "bairro": "JARDINS",
      "cidade": "SAO PAULO",
      "uf": "SP",
      "cep": "01310100"
    }
  ]
}
```

**Campos Retornados:**

| Campo | Descrição |
|-------|-----------|
| `DadosBasicos.nome` | Nome completo |
| `DadosBasicos.dataNascimento` | Data de nascimento (DD/MM/YYYY) |
| `DadosBasicos.sexo` | "M - MASCULINO" ou "F - FEMININO" |
| `DadosBasicos.nomeMae` | Nome da mãe |
| `DadosEconomicos.renda` | Renda mensal (string com decimais) |
| `DadosEconomicos.rendaPresumida` | Renda presumida |
| `telefones[]` | Lista de telefones |
| `emails[]` | Lista de emails |
| `enderecos[]` | Lista de endereços |

---

## Variáveis de Ambiente

### Mínimo Necessário

```bash
# Work API (Completa Buscas) - OBRIGATÓRIO
WORK_API=<seu_token_work_api>
WORK_API_URL=https://completa.workbuscas.com/api

# CPF Lookup API (DuckDB) - OPCIONAL (tem default)
CPF_LOOKUP_API_URL=https://cpf-lookup-api.fly.dev

# Database (para armazenar resultados)
DB_URL=postgresql://user:pass@host/db?sslmode=require

# C2S CRM (para enviar mensagens)
C2S_TOKEN=<token_c2s>
C2S_URL=https://c2s.com.br/api/v1
```

### Como Obter as Credenciais

| Serviço | Como Obter |
|---------|------------|
| **Work API** | Contato comercial: https://completa.workbuscas.com ou comercial@workbuscas.com |
| **CPF Lookup API** | API interna - deploy próprio no Fly.io |
| **C2S** | Admin do C2S gera token de API |

---

## Fluxo Detalhado do Código

### 1. Descoberta de CPF por Telefone (Work API)

```typescript
// src/services/cpf-discovery.service.ts

async findCpfByPhoneWorkApi(phone: string): Promise<{ cpf: string; name: string } | null> {
  const url = `${WORK_API_URL}?token=${WORK_API}&modulo=phone&consulta=${phone}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15000)
  });

  const data = await response.json();

  if (data.msg && Array.isArray(data.msg) && data.msg.length > 0) {
    let cpf = data.msg[0].cpf_cnpj;
    const name = data.msg[0].nome || "";

    // IMPORTANTE: Normalizar CPF de 14 para 11 dígitos
    if (cpf && cpf.length === 14) {
      cpf = cpf.slice(-11);
    }

    if (cpf && cpf.length === 11) {
      return { cpf, name };
    }
  }

  return null;
}
```

### 2. Descoberta de CPF por Nome (DuckDB)

```typescript
// src/services/cpf-lookup.service.ts

async searchByName(name: string): Promise<CpfLookupRecord[] | null> {
  const response = await fetch(
    `${CPF_LOOKUP_API_URL}/search/${encodeURIComponent(name)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10000)
    }
  );

  if (!response.ok) return null;

  const result = await response.json();
  return result.results || [];
}

// Uso com matching de nome
async findCpfByName(leadName: string): Promise<CpfDiscoveryResult | null> {
  const results = await this.searchByName(leadName);
  
  if (!results || results.length === 0) return null;

  // Se múltiplos resultados, usar matching de nome para selecionar
  let bestMatch = results[0];
  let bestScore = 0;

  for (const record of results) {
    const match = matchNames(leadName, record.nome_completo);
    if (match.score > bestScore) {
      bestScore = match.score;
      bestMatch = record;
    }
  }

  return {
    cpf: bestMatch.cpf,
    foundName: bestMatch.nome_completo,
    nameMatches: bestScore > 0.8,
    matchScore: bestScore,
    source: "duckdb-name-search"
  };
}
```

### 3. Enrichment com Work API

```typescript
// src/services/work-api.service.ts

async fetchByCpf(cpf: string): Promise<WorkApiPerson | null> {
  // Rate limiting: esperar 2s entre requests
  await this.enforceRateLimit();
  
  const url = `${WORK_API_URL}?token=${WORK_API}&modulo=cpf&consulta=${cpf}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30000)
  });

  const rawData = await response.json();

  // Verificar erro de token
  if (rawData.status === 403) {
    console.error("Work API token error:", rawData.reason);
    return null;
  }

  if (!rawData.DadosBasicos) {
    return null;
  }

  // Transformar para formato interno
  return {
    cpf,
    nome: rawData.DadosBasicos.nome,
    dataNascimento: rawData.DadosBasicos.dataNascimento,
    sexo: rawData.DadosBasicos.sexo?.charAt(0), // "M" ou "F"
    nomeMae: rawData.DadosBasicos.nomeMae,
    renda: parseFloat(rawData.DadosEconomicos?.renda?.replace(",", ".")) || undefined,
    rendaPresumida: parseFloat(rawData.DadosEconomicos?.rendaPresumida?.replace(",", ".")) || undefined,
    telefones: rawData.telefones?.map(t => ({ numero: t.telefone, tipo: t.tipo })),
    emails: rawData.emails?.map(e => ({ email: e.email })),
    enderecos: rawData.enderecos
  };
}
```

### 4. Fluxo Completo de Enrichment

```typescript
// src/services/enrichment.service.ts

async enrichLead(lead: LeadData): Promise<EnrichmentResult> {
  const { leadId, name, phone, email } = lead;

  // PASSO 1: Tentar descobrir CPF pelo telefone (Work API)
  let cpfResult = null;
  
  if (phone) {
    cpfResult = await this.findCpfByPhoneWorkApi(normalizePhone(phone));
  }

  // PASSO 2: Se não encontrou, tentar pelo nome (DuckDB)
  if (!cpfResult && name) {
    cpfResult = await this.cpfLookupService.findCpfByName(name);
  }

  // PASSO 3: Se não encontrou CPF, retornar como não enriquecido
  if (!cpfResult) {
    return {
      success: true,
      enriched: false,
      status: "unenriched",
      message: "CPF não encontrado"
    };
  }

  // PASSO 4: Buscar dados completos no Work API (módulo CPF)
  const personData = await this.workApiService.fetchByCpf(cpfResult.cpf);

  if (!personData) {
    return {
      success: true,
      cpf: cpfResult.cpf,
      enriched: false,
      status: "partial",
      message: "CPF encontrado mas sem dados de enriquecimento"
    };
  }

  // PASSO 5: Sucesso! Retornar dados completos
  return {
    success: true,
    cpf: cpfResult.cpf,
    enriched: true,
    status: "completed",
    data: personData,
    message: "Enriquecimento completo"
  };
}
```

---

## Rate Limiting

### Work API

A Work API exige intervalo mínimo de **2 segundos** entre requests:

```typescript
private static lastRequestTime: number = 0;
private static readonly RATE_LIMIT_MS = 2000; // 2 segundos

private async enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - WorkApiService.lastRequestTime;

  if (timeSinceLastRequest < WorkApiService.RATE_LIMIT_MS) {
    const waitTime = WorkApiService.RATE_LIMIT_MS - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  WorkApiService.lastRequestTime = Date.now();
}
```

---

## Multiplicador de Renda

A renda retornada pela Work API é multiplicada por **1.9x** para exibição:

```typescript
const INCOME_MULTIPLIER = 1.9;

// Work API retorna: R$ 5.000
const rawIncome = 5000;

// Exibimos: R$ 9.500
const displayIncome = rawIncome * INCOME_MULTIPLIER;
```

**Motivo:** Ajuste baseado em análise histórica de precisão dos dados.

---

## Status de Enriquecimento

| Status | Descrição | O que aconteceu |
|--------|-----------|-----------------|
| `completed` | Enriquecimento completo | CPF encontrado + dados Work API |
| `partial` | Enriquecimento parcial | CPF encontrado, sem dados Work API |
| `unenriched` | Não enriquecido | CPF não encontrado |

---

## Batch Enrichment

Para processar muitos leads de uma vez:

### Via API

```bash
# Endpoint direto para Work API
curl -X POST https://ts-c2s-api.fly.dev/batch/enrich-direct \
  -H "Content-Type: application/json" \
  -d '{"name": "Fulano da Silva", "phone": "11999999999"}'
```

### Via Script Local

```bash
cd /Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api

# Verificar status atual
bun run scripts/analysis/check-db-status.ts

# Rodar enrichment em batch
nohup bun run scripts/enrichment/enrich-via-api.ts > /tmp/enrich.log 2>&1 &

# Monitorar progresso
tail -f /tmp/enrich.log

# Controles
touch /tmp/enrich-pause   # Pausar
rm /tmp/enrich-pause      # Retomar
touch /tmp/enrich-stop    # Parar
```

---

## Troubleshooting

### Work API retorna CPF com 14 caracteres

**Causa:** API retorna CPF com zeros à esquerda.

**Solução:** 
```typescript
if (cpf.length === 14) {
  cpf = cpf.slice(-11);
}
```

### 0% de descoberta de CPF

**Debug:**
```bash
# Testar Work API diretamente
curl "https://completa.workbuscas.com/api?token=TOKEN&modulo=phone&consulta=11999999999"

# Verificar resposta
# Deve retornar: { "msg": [{ "cpf_cnpj": "...", "nome": "..." }] }
```

### Work API retorna status 403

**Causa:** Token expirado ou limite atingido.

**Solução:** Contatar fornecedor para renovar token.

### CPF Lookup API lenta

**Causa:** Busca por nome faz full scan em 223M registros.

**Solução:** Usar busca por nome apenas como fallback, preferir busca por telefone.

---

## Arquivos Principais

| Arquivo | Função |
|---------|--------|
| `src/services/cpf-discovery.service.ts` | Orquestrador de descoberta |
| `src/services/work-api.service.ts` | Integração Work API |
| `src/services/cpf-lookup.service.ts` | Integração DuckDB API |
| `src/services/enrichment.service.ts` | Orquestrador principal |
| `src/config/index.ts` | Variáveis de ambiente |
| `src/utils/phone.ts` | Normalização de telefone |
| `src/utils/name-matcher.ts` | Validação/matching de nomes |

---

## Deploy

### Fly.io

```bash
# Ver secrets atuais
fly secrets list

# Setar token Work API
fly secrets set WORK_API=novo_token

# Deploy
fly deploy

# Ver logs
fly logs
```

---

## Métricas

A API expõe métricas Prometheus em `/metrics`:

- `enrichment_total{status}` - Total por status (completed, partial, unenriched)
- `enrichment_duration_seconds` - Tempo de processamento
- `cpf_discovery_source{source}` - CPFs encontrados por fonte (work-api, duckdb)

---

## Contatos

| Serviço | Suporte |
|---------|---------|
| Work API (Completa Buscas) | comercial@workbuscas.com |
| C2S | suporte@c2s.com.br |

---

## Resumo Rápido

```
┌────────────────────────────────────────────────────────────┐
│                    CPF DISCOVERY                           │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  📱 Telefone → Work API (modulo=phone)                     │
│      • URL: completa.workbuscas.com/api                    │
│      • Taxa sucesso: ~85-90%                               │
│      • ⚠️ CPF vem com 14 chars, normalizar para 11         │
│                                                            │
│  👤 Nome → DuckDB (223M CPFs)                              │
│      • URL: cpf-lookup-api.fly.dev/search/:name            │
│      • Mais lento (full scan)                              │
│      • Usar matching de nome para múltiplos resultados     │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                    ENRICHMENT                              │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  📊 CPF → Work API (modulo=cpf)                            │
│      • Retorna: nome, renda, endereços, telefones, etc.    │
│      • Rate limit: 2s entre requests                       │
│      • Renda × 1.9 para display                            │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

**Documento criado em:** Janeiro 2026  
**Projeto:** ts-c2s-api  
**Repositório:** MBRAS/tools/ts-c2s-api
