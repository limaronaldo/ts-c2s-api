# Análise de Rede de Empresas e Sócios - Meilisearch IBVI

**Data:** Janeiro 30, 2026  
**Base:** Meilisearch IBVI (65.2M empresas)  
**Query Inicial:** MBRAS

---

## 📊 Resumo Executivo

| Métrica | Valor |
|---------|-------|
| **Total de Empresas no Meilisearch** | 65,277,300 |
| **Empresas MBRAS Analisadas** | 10 |
| **Sócios Únicos** | 17 |
| **Total de Conexões** | 19 |

---

## 🏢 Empresas MBRAS Encontradas

### Por Capital Social (Maior → Menor)

| # | Razão Social | CNPJ | Capital Social | Sócios |
|---|--------------|------|----------------|--------|
| 1 | MBRAS SOLUCOES IMOBILIARIAS LTDA | 07.885.055/0001-90 | R$ 2.000.000,00 | 1 |
| 2 | **MBRAS GESTAO IMOBILIARIA LTDA** | **16.728.568/0001-63** | **R$ 1.000.000,00** | **1** |
| 3 | MBRAS LOCADORA E TRANSPORTE LTDA | 15.645.149/0001-03 | R$ 76.500,00 | 1 |
| 4 | MBRAS TECNOLOGIA DA INFORMACAO LTDA | 29.854.945/0001-69 | R$ 20.000,00 | 1 |
| 5 | MBRAS MANUTENCAO E MONTAGEM INDUSTRIAL LTDA | 03.203.314/0001-80 | R$ 10.000,00 | 2 |
| 6 | MBRAS PARTICIPACOES E EMPREENDIMENTOS IMOBILIARIOS LTDA | 39.900.732/0001-73 | R$ 10.000,00 | 5 |
| 7 | MBRAS HOLDING LTDA | 22.563.942/0001-23 | R$ 10.000,00 | 2 |
| 8 | MBRAS ASSOCIADOS SOLUCOES LTDA | 28.394.663/0001-82 | R$ 10.000,00 | 2 |
| 9 | MBRAS INTELIGENCIA EDUCACIONAL E SISTEMA DE ENSINO VIRTUAL LTDA | 15.353.533/0001-24 | R$ 3.000,00 | 2 |
| 10 | MBRAS AUTOMACAO INDUSTRIAL LTDA | 04.893.367/0001-32 | R$ 0,00 | 2 |

**Total de Capital Social:** R$ 3.129.500,00

---

## 👥 Sócios com Múltiplas Empresas

### Sócios com 2+ Empresas MBRAS

| Nome | CPF | Empresas |
|------|-----|----------|
| **DEIVISON MAYNART PINHEIRO** | 025.XXX.XXX-16 | 2 |
| **PEDRO HENRIQUE STUDART DE OLIVEIRA** | 336.XXX.XXX-00 | 2 |

---

## 🔍 Detalhamento das Principais Empresas

### 1. MBRAS Gestão Imobiliária LTDA ⭐

**CNPJ:** 16.728.568/0001-63  
**Capital Social:** R$ 1.000.000,00  
**Endereço:** Av. Magalhães de Castro, 4800, Conj 232 - Cidade Jardim, São Paulo - SP  
**CEP:** 05676-120  
**CNAE Principal:** 6821801 (Corretagem na compra e venda de imóveis)  
**Situação:** Ativa  
**Data de Abertura:** 10/08/2012

**Sócia:**
- **ROSELY LIRA MELO DE OLIVEIRA** (CPF: 120.XXX.XXX-04)
  - Qualificação: 49 (Sócio-Administrador)
  - Data de Entrada: 10/08/2012

**Contato:**
- Email: cristino@cknconsultoria.com.br
- Telefone: (11) 3213-5707

---

### 2. MBRAS Participações e Empreendimentos Imobiliários LTDA

**CNPJ:** 39.900.732/0001-73  
**Capital Social:** R$ 10.000,00  
**Sócios:** 5 (maior número)

**Quadro de Sócios:**
1. **MARIA AYDIL STUDART DE OLIVEIRA** (CPF: 248.XXX.XXX-68)
   - Qualificação: 22 (Sócio)

2. **PAULO ANDRE STUDART DE OLIVEIRA** (CPF: 363.XXX.XXX-66)
   - Qualificação: 22 (Sócio)

3. **MARIA ANTONIETA STUDART DE CARVALHO** (CPF: 193.XXX.XXX-68)
   - Qualificação: 22 (Sócio)

4. **JOAO GUILHERME BITTENCOURT STUDART** (CPF: 488.XXX.XXX-15)
   - Qualificação: 22 (Sócio)

5. **PEDRO HENRIQUE STUDART DE OLIVEIRA** (CPF: 336.XXX.XXX-00)
   - Qualificação: 49 (Sócio-Administrador)

**Observação:** Família Studart de Oliveira com controle societário.

---

### 3. MBRAS Soluções Imobiliárias LTDA

**CNPJ:** 07.885.055/0001-90  
**Capital Social:** R$ 2.000.000,00 (maior capital)  
**Sócios:** 1

---

## 🌐 Mapa de Conexões

```
MBRAS GESTÃO IMOBILIÁRIA (16.728.568/0001-63)
└── ROSELY LIRA MELO DE OLIVEIRA (120.XXX.XXX-04)

MBRAS PARTICIPAÇÕES (39.900.732/0001-73)
├── MARIA AYDIL STUDART DE OLIVEIRA (248.XXX.XXX-68)
├── PAULO ANDRE STUDART DE OLIVEIRA (363.XXX.XXX-66)
├── MARIA ANTONIETA STUDART DE CARVALHO (193.XXX.XXX-68)
├── JOAO GUILHERME BITTENCOURT STUDART (488.XXX.XXX-15)
└── PEDRO HENRIQUE STUDART DE OLIVEIRA (336.XXX.XXX-00) ★ 2 empresas

MBRAS HOLDING (22.563.942/0001-23)
├── DEIVISON MAYNART PINHEIRO (025.XXX.XXX-16) ★ 2 empresas
└── PEDRO HENRIQUE STUDART DE OLIVEIRA (336.XXX.XXX-00) ★ 2 empresas

MBRAS ASSOCIADOS SOLUÇÕES (28.394.663/0001-82)
├── DEIVISON MAYNART PINHEIRO (025.XXX.XXX-16) ★ 2 empresas
└── Outro sócio
```

---

## 📈 Estrutura do Meilisearch

### Índices Disponíveis

| Índice | Documentos | Descrição |
|--------|------------|-----------|
| `companies` | 65,277,300 | Empresas (CNPJ) |
| `parties` | - | Pessoas e empresas |
| `people` | - | Pessoas físicas |
| `party_contacts` | - | Contatos (telefone, email) |
| `property_search` | - | Imóveis |
| `immobiles` | - | Propriedades |
| `transactions` | - | Transações |
| `market_reports` | - | Relatórios de mercado |

### Schema do Índice `companies`

```json
{
  "id": "CNPJ",
  "cnpj": "00000000000191",
  "cnpj_basico": "00000000",
  "razao_social": "EMPRESA LTDA",
  "nome_fantasia": "FANTASIA",
  "capital_social": 1000000.0,
  "porte": "03",
  "natureza_juridica": "2062",
  "data_abertura": "20120810",
  "situacao_cadastral": "02",
  "cnae_principal": "6821801",
  "cnaes_secundarios": ["6821802"],
  "endereco_completo": "RUA X, 100",
  "uf": "SP",
  "municipio_nome": "SAO PAULO",
  "email": "contato@empresa.com",
  "telefone": "1133334444",
  "socios": [
    {
      "cpf": "12345678901",
      "nome": "FULANO",
      "qualificacao": "49",
      "data_entrada": "20120810",
      "percentual": null,
      "faixa_etaria": "5"
    }
  ],
  "socios_cpfs": ["12345678901"],
  "socios_nomes": ["FULANO"]
}
```

---

## 🔧 Como Usar os Dados

### 1. Via Script Python

```bash
cd /Users/ronaldo/Projects/MBRAS/tools/ts-c2s-api
python3 scripts/analysis/meilisearch-company-network.py "NOME DA EMPRESA"
```

### 2. Via curl (API REST)

```bash
# Buscar empresas
curl -s -H "Authorization: Bearer KEY" \
  -X POST "https://ibvi-meilisearch-v2.fly.dev/indexes/companies/search" \
  -H "Content-Type: application/json" \
  -d '{"q": "MBRAS", "limit": 10}' | jq '.'

# Buscar por CNPJ específico
curl -s -H "Authorization: Bearer KEY" \
  -X POST "https://ibvi-meilisearch-v2.fly.dev/indexes/companies/search" \
  -H "Content-Type: application/json" \
  -d '{"filter": "cnpj = 16728568000163"}' | jq '.'

# Buscar por sócio (CPF)
curl -s -H "Authorization: Bearer KEY" \
  -X POST "https://ibvi-meilisearch-v2.fly.dev/indexes/companies/search" \
  -H "Content-Type: application/json" \
  -d '{"q": "12096865204", "attributesToSearchOn": ["socios_cpfs"]}' | jq '.'
```

### 3. Integração com ts-c2s-api

Podemos criar um novo serviço:

```typescript
// src/services/meilisearch-company.service.ts

export class MeilisearchCompanyService {
  private readonly url = "https://ibvi-meilisearch-v2.fly.dev";
  private readonly key = process.env.MEILISEARCH_KEY!;

  async searchCompanies(query: string, limit = 100) {
    const response = await fetch(`${this.url}/indexes/companies/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ q: query, limit })
    });
    
    const data = await response.json();
    return data.hits;
  }

  async getCompanyByCnpj(cnpj: string) {
    const response = await fetch(`${this.url}/indexes/companies/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ filter: `cnpj = ${cnpj}`, limit: 1 })
    });
    
    const data = await response.json();
    return data.hits[0];
  }

  async findCompaniesBySocio(cpf: string) {
    const response = await fetch(`${this.url}/indexes/companies/search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ 
        q: cpf, 
        attributesToSearchOn: ["socios_cpfs"],
        limit: 100
      })
    });
    
    const data = await response.json();
    return data.hits;
  }
}
```

---

## 💡 Casos de Uso

### 1. Enriquecimento de Leads

Quando um lead menciona ser empresário:
1. Buscar empresas pelo CPF do lead
2. Identificar empresas ativas
3. Calcular patrimônio total (soma de capitais sociais)
4. Adicionar à mensagem C2S

### 2. Due Diligence

Antes de fechar negócio:
1. Buscar todas as empresas do cliente
2. Verificar situação cadastral
3. Mapear sócios e outras empresas
4. Identificar red flags

### 3. Identificação de Grupos Econômicos

1. Buscar empresa principal
2. Mapear sócios
3. Buscar outras empresas dos sócios
4. Construir grafo de relacionamentos

### 4. Descoberta de CNPJ por Nome

Diferente do CPF Lookup (223M pessoas), agora temos **65.2M empresas**:

```python
# Buscar empresas por nome
companies = meilisearch.searchCompanies("JOSE DA SILVA")
# Retorna todas as empresas onde José da Silva é sócio
```

---

## 🎯 Próximos Passos

### Implementações Sugeridas

1. **MCP Tool: `find_companies_by_cpf`**
   - Input: CPF do lead
   - Output: Lista de empresas + capital total
   - Integração: Auto-adicionar à mensagem C2S

2. **MCP Tool: `enrich_with_cnpj`**
   - Input: CNPJ
   - Output: Dados completos da empresa
   - Uso: Quando lead menciona ser empresário

3. **Service: Company Network Graph**
   - Visualização interativa das conexões
   - Neo4j ou D3.js
   - Dashboard para análise

4. **Alert: High-Value Company Owner**
   - Capital social > R$ 1M
   - Múltiplas empresas
   - Slack alert automático

---

## 📊 Estatísticas da Base

| Métrica | Valor |
|---------|-------|
| Total de empresas | 65.277.300 |
| Tamanho do índice | 50.5 GB |
| Tamanho médio por doc | 766 bytes |
| Campos por documento | 32 |
| Indexação | Completa ✅ |

---

## 🔐 Credenciais

```bash
# .env
MEILISEARCH_URL=https://ibvi-meilisearch-v2.fly.dev
MEILISEARCH_KEY=+irW8+WB+vRVb2pYxvEfR0Cili9zVK/VQY5osx8ejCw=
```

**Nota:** Estas credenciais estão em `/Users/ronaldo/Projects/FORK/twenty/.env.local`

---

## 📚 Referências

- **Meilisearch API:** https://ibvi-meilisearch-v2.fly.dev
- **Script de Análise:** `scripts/analysis/meilisearch-company-network.py`
- **Dados Exportados:** `company_network_MBRAS.json`

---

**Última Atualização:** Janeiro 30, 2026  
**Mantido por:** Ronaldo Lima + Claude AI
