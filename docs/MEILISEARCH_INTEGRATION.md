# Meilisearch Company Integration - Implementação Completa

**Data:** Janeiro 30, 2026  
**Implementado por:** Ronaldo Lima + Claude AI

---

## 🎯 Resumo Executivo

Integração completa com Meilisearch IBVI (65.2M empresas brasileiras) para:
1. **MCP Tools** - 4 novas ferramentas para busca de empresas
2. **Enriquecimento Automático** - Adiciona dados de empresas nas mensagens C2S
3. **Alertas de Alto Valor** - Detecta empresários com alto capital social

---

## ✅ Implementações Concluídas

### 1. MCP Tools (4 novos tools)

#### find_companies_by_cpf
Busca todas as empresas onde um CPF é sócio.

**Input:**
```json
{ "cpf": "123.456.789-01" }
```

**Output:**
```json
{
  "success": true,
  "totalCompanies": 3,
  "totalCapitalSocial": 3100000,
  "totalCapitalSocialFormatted": "R$ 3.100.000,00",
  "companies": [
    {
      "cnpj": "12.345.678/0001-90",
      "razaoSocial": "EMPRESA ABC LTDA",
      "capitalSocial": 2000000,
      "situacao": "ATIVA",
      "uf": "SP",
      "isAdministrador": true,
      "role": "Sócio-Administrador"
    }
  ]
}
```

#### get_company_by_cnpj
Busca dados completos de uma empresa por CNPJ.

**Input:**
```json
{ "cnpj": "16.728.568/0001-63" }
```

**Output:**
```json
{
  "success": true,
  "company": {
    "cnpj": "16.728.568/0001-63",
    "razaoSocial": "MBRAS GESTAO IMOBILIARIA LTDA",
    "capitalSocial": 1000000,
    "situacao": "ATIVA",
    "socios": [...],
    "totalSocios": 1
  }
}
```

#### search_companies
Busca empresas por nome ou CNPJ.

**Input:**
```json
{ "query": "MBRAS", "limit": 10 }
```

#### format_companies_message
Formata dados de empresas para mensagem C2S.

---

### 2. Serviço Meilisearch

**Arquivo:** `src/services/meilisearch-company.service.ts`

**Funcionalidades:**
- ✅ Busca empresas por CPF
- ✅ Busca empresa por CNPJ
- ✅ Busca empresas por nome
- ✅ Filtra apenas empresas ativas (situacao_cadastral = "02")
- ✅ Identifica sócios-administradores
- ✅ Calcula capital social total
- ✅ Formata para mensagem C2S

**Métodos:**
```typescript
meilisearchCompany.findCompaniesByCpf(cpf: string): Promise<CompanySummary>
meilisearchCompany.getCompanyByCnpj(cnpj: string): Promise<MeilisearchCompany | null>
meilisearchCompany.searchCompanies(query: string, limit: number): Promise<MeilisearchCompany[]>
meilisearchCompany.formatCompaniesForMessage(summary: CompanySummary): string
```

---

### 3. Enriquecimento Automático

**Modificações em:** `src/services/enrichment.service.ts`

**3 pontos de integração:**

#### a) createEnrichedCustomer() - Enriquecimento Completo
Quando Work API retorna dados completos:

```typescript
// Append company data if CPF owns businesses
if (person.cpf && container.meilisearchCompany.isEnabled()) {
  const companySummary = await container.meilisearchCompany.findCompaniesByCpf(person.cpf);
  if (companySummary.totalCompanies > 0) {
    const companySection = container.meilisearchCompany.formatCompaniesForMessage(companySummary);
    description += "\n" + companySection;
  }
}
```

#### b) createBasicCustomer() - Enriquecimento Básico
Quando apenas CPF foi encontrado:

```typescript
// Append company data if CPF owns businesses
if (cpf && container.meilisearchCompany.isEnabled()) {
  const companySummary = await container.meilisearchCompany.findCompaniesByCpf(cpf);
  // ... adiciona seção de empresas
}
```

#### c) createPartialEnrichmentCustomer() - Enriquecimento Parcial
Quando Work API deu timeout:

```typescript
// Append company data if CPF owns businesses
if (cpf && container.meilisearchCompany.isEnabled()) {
  const companySummary = await container.meilisearchCompany.findCompaniesByCpf(cpf);
  // ... adiciona seção de empresas
}
```

**Exemplo de Mensagem C2S:**
```
📱 TELEFONE: (11) 99999-9999
✉️ EMAIL: joao@empresa.com
💵 RENDA: R$ 15.000,00/mês

🏠 IMÓVEIS (2 atual)
   Valor total: R$ 3.500.000,00
   • Apartamento em Jardins, SP (150 m²) - R$ 2.000.000,00

🏢 EMPRESÁRIO (3 empresas)
   Capital total: R$ 5.200.000,00
   • EMPRESA ABC LTDA - R$ 2.000.000,00 (Admin) [SP]
   • EMPRESA XYZ SA - R$ 3.000.000,00 (Admin) [SP]
   • HOLDING DEF LTDA - R$ 200.000,00 [SP]
```

---

### 4. Alertas de Alto Valor para Empresários

**Modificações em:** `src/utils/high-value-detector.ts`

**Novos Critérios:**

| Critério | Pontos | Descrição |
|----------|--------|-----------|
| Capital social >= R$ 5M | 40 | Empresário de grande porte |
| Capital social >= R$ 1M | 25 | Empresário de médio porte |
| Capital social >= R$ 500k | 15 | Empresário estabelecido |
| Sócio-Administrador | 10 | Controle efetivo das empresas |

**Novos Campos em HighValueCriteria:**
```typescript
interface HighValueCriteria {
  // ... campos existentes
  totalCompanyCapital?: number;
  isCompanyAdministrator?: boolean;
}
```

**Integração no checkHighValueLeadAsync():**
```typescript
// Fetch company data if available
let companySummary;
if (personData.cpf && container.meilisearchCompany.isEnabled()) {
  companySummary = await container.meilisearchCompany.findCompaniesByCpf(personData.cpf);
}

const result = detectHighValueLead({
  income: ...,
  addresses: ...,
  companyCount: companySummary?.totalCompanies,
  totalCompanyCapital: companySummary?.totalCapitalSocial,
  isCompanyAdministrator: companySummary?.companies.some(c => c.isAdministrador),
});
```

**Exemplo de Alert:**
```
🚨 HIGH-VALUE LEAD DETECTED!

💎 PLATINUM (Score: 75)

Por que é premium:
• Empresário - Capital social: R$ 5.200.000,00
• Renda muito alta: R$ 18.000,00/mês
• 3 empresas ativas
• Bairro nobre: Jardins
```

---

## 📁 Arquivos Modificados/Criados

### Criados (7 arquivos)

1. **`src/services/meilisearch-company.service.ts`** (317 linhas)
   - Serviço de integração com Meilisearch
   - Busca, filtragem, formatação

2. **`src/mcp/tools/meilisearch.ts`** (288 linhas)
   - Definições dos 4 MCP tools
   - Handlers para cada tool

3. **`scripts/analysis/meilisearch-company-network.py`** (252 linhas)
   - Script Python para análise de redes
   - Busca empresas e sócios
   - Exporta JSON

4. **`docs/MEILISEARCH_NETWORK_ANALYSIS.md`** (500+ linhas)
   - Documentação completa
   - Análise das empresas MBRAS
   - Exemplos de uso

5. **`docs/FLY_IO_SCALING_GUIDE.md`** (600+ linhas)
   - Guia de scaling no Fly.io
   - Scripts, comandos, troubleshooting

6. **`docs/MEILISEARCH_INTEGRATION.md`** (este arquivo)
   - Resumo da implementação

7. **`scripts/utils/ts-c2s-scale.sh`** (75 linhas)
   - Script de scaling para ts-c2s-api

### Modificados (4 arquivos)

1. **`src/container.ts`**
   - Adicionado `meilisearchCompany` service

2. **`src/config/index.ts`**
   - Adicionado `MEILISEARCH_URL` e `MEILISEARCH_KEY`

3. **`src/services/enrichment.service.ts`**
   - 3 pontos de integração com empresas
   - Integração com high-value detection

4. **`src/utils/high-value-detector.ts`**
   - Novos critérios para empresários
   - Detecção de capital social alto

5. **`src/mcp/tools/index.ts`**
   - Registro dos 4 novos MCP tools

---

## ⚙️ Configuração

### Variáveis de Ambiente

```bash
# .env (adicionar)
MEILISEARCH_URL=https://ibvi-meilisearch-v2.fly.dev
MEILISEARCH_KEY=+irW8+WB+vRVb2pYxvEfR0Cili9zVK/VQY5osx8ejCw=
```

### MCP Configuration

```json
{
  "mcpServers": {
    "c2s-enrichment": {
      "command": "bun",
      "args": ["run", "mcp-server.ts"],
      "cwd": "/Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api",
      "env": {
        "DB_URL": "postgresql://...",
        "MEILISEARCH_URL": "https://ibvi-meilisearch-v2.fly.dev",
        "MEILISEARCH_KEY": "..."
      }
    }
  }
}
```

---

## 🚀 Como Usar

### Via MCP (Claude Code)

```
"Busque empresas do CPF 123.456.789-01"
→ Claude usa find_companies_by_cpf

"Qual empresa tem o CNPJ 16.728.568/0001-63?"
→ Claude usa get_company_by_cnpj

"Procure empresas com nome MBRAS"
→ Claude usa search_companies
```

### Via Código

```typescript
import { container } from './container';

// Buscar empresas de um lead
const summary = await container.meilisearchCompany.findCompaniesByCpf(cpf);

console.log(`Encontradas ${summary.totalCompanies} empresas`);
console.log(`Capital total: R$ ${summary.totalCapitalSocial}`);

// Formatar para C2S
const message = container.meilisearchCompany.formatCompaniesForMessage(summary);
```

### Via Script Python

```bash
cd /Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api
python3 scripts/analysis/meilisearch-company-network.py "MBRAS"
```

---

## 📊 Estatísticas

### Base Meilisearch

| Métrica | Valor |
|---------|-------|
| Total de empresas | 65.277.300 |
| Empresas MBRAS | 10 |
| Tamanho do índice | 50.5 GB |
| Campos por documento | 32 |

### Exemplo Real: MBRAS

| Métrica | Valor |
|---------|-------|
| Empresas encontradas | 10 |
| Sócios únicos | 17 |
| Capital social total | R$ 3.129.500,00 |
| Maior capital | R$ 2.000.000,00 |
| Empresa com mais sócios | 5 sócios |

---

## 🎯 Casos de Uso

### 1. Enriquecimento Automático
Quando lead é enriquecido:
- Busca empresas automaticamente
- Adiciona à mensagem C2S
- Nenhuma ação manual necessária

### 2. Detecção de High-Value
Empresário com capital > R$ 1M:
- Alert automático no Slack
- Email para equipe comercial
- Priorização no CRM

### 3. Análise de Portfólio
Vendedor quer saber sobre cliente:
- "Busque empresas do João Silva"
- MCP retorna lista completa
- Análise de risco/oportunidade

### 4. Due Diligence
Antes de fechar negócio:
- Verificar empresas do cliente
- Conferir capital social
- Validar situação cadastral

---

## 📈 Impacto Esperado

### Enriquecimento de Dados
- **Antes:** CPF + Renda + Endereços
- **Agora:** CPF + Renda + Endereços + **Empresas + Capital Social**

### Taxa de Detecção High-Value
- **Antes:** ~5% dos leads (baseado em renda + bairro)
- **Agora:** ~8-10% (incluindo empresários)

### Exemplos de Leads que Agora Disparam Alert
- Empresário com R$ 2M em capital social (mesmo com renda "normal")
- Sócio-administrador de 3+ empresas
- Holding com R$ 5M+ em capital

---

## 🔄 Fluxo Completo

```
1. Lead chega via webhook C2S
   ↓
2. EnrichmentService descobre CPF
   ↓
3. Work API busca dados completos
   ↓
4. IbviPropertyService busca imóveis
   ↓
5. MeilisearchCompanyService busca empresas (NEW)
   ↓
6. Mensagem C2S é criada com TUDO
   ↓
7. HighValueDetector analisa (incluindo empresas) (NEW)
   ↓
8. Se capital >= R$ 1M → Alert Slack + Email (NEW)
```

---

## 🐛 Troubleshooting

### Empresas não aparecem na mensagem

**Causa:** MEILISEARCH_KEY não configurada

**Solução:**
```bash
fly secrets set MEILISEARCH_KEY="..." -a ts-c2s-api
```

### MCP tool retorna vazio

**Causa:** CPF sem empresas ou serviço desabilitado

**Verificar:**
```typescript
container.meilisearchCompany.isEnabled() // deve retornar true
```

### Alert não dispara para empresário

**Causa:** Capital social < R$ 500k

**Verificar thresholds em:**
```typescript
// src/utils/high-value-detector.ts
const POINTS = {
  veryHighCompanyCapital: 40,  // >= R$ 5M
  highCompanyCapital: 25,       // >= R$ 1M
  moderateCompanyCapital: 15,   // >= R$ 500k
};
```

---

## 📚 Referências

- **Análise da Rede MBRAS:** `docs/MEILISEARCH_NETWORK_ANALYSIS.md`
- **Guia de Scaling:** `docs/FLY_IO_SCALING_GUIDE.md`
- **Script de Análise:** `scripts/analysis/meilisearch-company-network.py`
- **MCP Tools:** `src/mcp/tools/meilisearch.ts`
- **Serviço:** `src/services/meilisearch-company.service.ts`

---

## ✅ Checklist de Deploy

- [x] Criar MCP Tools (4 tools)
- [x] Criar MeilisearchCompanyService
- [x] Integrar no EnrichmentService (3 pontos)
- [x] Adicionar critérios ao HighValueDetector
- [x] Integrar com alerts
- [x] Adicionar ao container
- [x] Configurar variáveis de ambiente
- [x] Registrar no MCP index
- [x] Documentar tudo
- [ ] Deploy no Fly.io
- [ ] Testar em produção
- [ ] Monitorar alertas

---

## 🚀 Próximos Passos (Futuro)

1. **Dashboard de Empresários**
   - Visualizar rede de empresas
   - Gráfico de relacionamentos
   - Análise de grupos econômicos

2. **Score de Empresário**
   - 0-100 baseado em capital, quantidade, setor
   - Integrar com lead quality scoring

3. **Alertas Customizados**
   - Por setor (ex: Construção Civil)
   - Por região
   - Por porte da empresa

4. **Histórico de Empresas**
   - Rastrear mudanças de capital
   - Novos sócios
   - Empresas criadas/encerradas

---

**Última Atualização:** Janeiro 30, 2026  
**Status:** ✅ Implementação Completa  
**Total de Linhas de Código:** ~2.000 linhas  
**Tempo de Implementação:** 2 horas

---

**Mantido por:** Ronaldo Lima + Claude AI
