# ts-c2s-api Improvement Plan

**Goal:** Make this the definitive lead enrichment solution for MBRAS  
**Date:** December 17, 2025  
**Current State:** MVP deployed on Fly.io, basic enrichment working

---

## Executive Summary

Based on hands-on testing with 8 real leads, the current system achieves **57% enrichment rate** (4/7 leads enriched). Key learnings reveal critical improvements needed to reach **85%+ enrichment rate** and become the production-ready default solution.

### Current Enrichment Flow
```
Lead (Name + Phone) 
    → CPF Discovery (4-tier: DBase → Mimir → Diretrix → Work API)
    → Work API Enrichment (50+ data fields)
    → C2S Message/Lead Creation
```

### Observed Issues
1. **CPF Discovery misses matches** - Work API phone returns multiple results, we only use first
2. **No IBVI database integration** - Missing fastest/cheapest CPF source (our own DB)
3. **No name matching** - Phone owner ≠ lead name validation missing
4. **Single enrichment format** - No rich formatting with emojis/structure
5. **No batch processing** - Can't enrich last N leads automatically
6. **No scheduling** - Manual trigger only

---

## Phase 1: Critical Fixes (Week 1)

### 1.1 Smart Phone Result Matching

**Problem:** Work API phone module returns multiple CPFs. Current code takes first result, but correct match may be further in list.

**Example from testing:**
```json
// Phone: 71999898896 (Marcos Dellis)
// Work API returned 10 results:
[
  { "cpf_cnpj": "33841727000231", "nome": "TECNOSONDA SA" },           // CNPJ - skip
  { "cpf_cnpj": "41487745591", "nome": "MARCO ANTONIO FONTES..." },    // Wrong person
  { "cpf_cnpj": "56699700553", "nome": "MARCOS TEODORO DELLIS" },      // ✅ CORRECT!
  ...
]
```

**Solution:** Implement name similarity matching to find best CPF match.

```typescript
// src/services/cpf-discovery.service.ts

import { similarity } from '../utils/string-similarity';

private async findCpfByPhoneWorkApi(phone: string, leadName?: string): Promise<string | null> {
  const response = await fetch(`${this.workApiUrl}?token=${this.workApiKey}&modulo=phone&consulta=${phone}`);
  const data = await response.json();
  
  if (!data.msg || !Array.isArray(data.msg) || data.msg.length === 0) {
    return null;
  }

  // Filter to CPFs only (11 digits), exclude CNPJs (14 digits)
  const cpfResults = data.msg.filter((r: any) => 
    r.cpf_cnpj && r.cpf_cnpj.length === 11
  );

  if (cpfResults.length === 0) return null;
  
  // If we have a lead name, find best match
  if (leadName) {
    const normalizedLeadName = normalizeName(leadName);
    
    let bestMatch = { cpf: null, score: 0 };
    for (const result of cpfResults) {
      const score = similarity(normalizedLeadName, normalizeName(result.nome || ''));
      if (score > bestMatch.score && score >= 0.6) { // 60% threshold
        bestMatch = { cpf: result.cpf_cnpj, score };
      }
    }
    
    if (bestMatch.cpf) {
      enrichmentLogger.info({ phone, cpf: bestMatch.cpf, score: bestMatch.score }, 
        'CPF found via name matching');
      return bestMatch.cpf;
    }
  }
  
  // Fallback: return first CPF result
  return cpfResults[0].cpf_cnpj;
}
```

**Files to modify:**
- `src/services/cpf-discovery.service.ts` - Add name parameter, implement matching
- `src/utils/string-similarity.ts` - New file for Levenshtein/Jaro-Winkler
- `src/services/enrichment.service.ts` - Pass lead name to discovery

---

### 1.2 IBVI Database as Tier 0

**Problem:** We're not using our own IBVI database for CPF lookup. It's the fastest and cheapest source.

**Solution:** Add IBVI PostgreSQL as Tier 0 before DBase.

```typescript
// src/services/ibvi-db.service.ts

import { getConfig } from '../config';
import { enrichmentLogger } from '../utils/logger';

export class IbviDbService {
  private connectionString: string;

  constructor() {
    this.connectionString = getConfig().IBVI_DB_URL;
  }

  async findCpfByPhone(phone: string): Promise<string | null> {
    // Strategy 1: Phone in party_contacts
    const query1 = `
      SELECT DISTINCT p.cpf_cnpj
      FROM core.parties p
      JOIN core.party_contacts pc ON p.id = pc.party_id
      WHERE pc.value LIKE $1
        AND LENGTH(p.cpf_cnpj) = 11
      LIMIT 1
    `;
    
    // Strategy 2: Contributor lookup (IPTU data)
    const query2 = `
      SELECT DISTINCT p.cpf_cnpj
      FROM core.mv_contributor_contacts mvc
      JOIN core.parties p ON mvc.party_id = p.id
      WHERE mvc.phone LIKE $1
        AND LENGTH(p.cpf_cnpj) = 11
      LIMIT 1
    `;

    // Execute both strategies...
  }

  async findCpfByName(name: string): Promise<string | null> {
    const query = `
      SELECT cpf_cnpj
      FROM core.parties
      WHERE LOWER(TRIM(full_name)) = LOWER(TRIM($1))
        AND LENGTH(cpf_cnpj) = 11
      LIMIT 1
    `;
  }

  async findCpfByNameFuzzy(name: string): Promise<string | null> {
    // Use pg_trgm for fuzzy matching
    const query = `
      SELECT cpf_cnpj, full_name, 
             similarity(LOWER(full_name), LOWER($1)) as sim
      FROM core.parties
      WHERE LENGTH(cpf_cnpj) = 11
        AND similarity(LOWER(full_name), LOWER($1)) > 0.4
      ORDER BY sim DESC
      LIMIT 1
    `;
  }
}
```

**New tier order:**
```
Tier 0: IBVI Database (free, fastest, 1.5M+ parties)
Tier 1: DBase
Tier 2: Mimir  
Tier 3: Diretrix
Tier 4: Work API Phone
```

**Files to create/modify:**
- `src/services/ibvi-db.service.ts` - New service
- `src/config/index.ts` - Add IBVI_DB_URL
- `src/services/cpf-discovery.service.ts` - Add Tier 0

---

### 1.3 Rich Message Formatting

**Problem:** Current C2S messages use plain text. The manual enrichments I sent used emojis and structure.

**Solution:** Create rich formatter matching manual format.

```typescript
// src/utils/rich-description-builder.ts

export function buildRichDescription(person: WorkApiPerson, campaignName?: string): string {
  const lines: string[] = [];
  
  lines.push('🔍 ENRIQUECIMENTO AUTOMÁTICO');
  lines.push('');
  
  // Personal Data Section
  lines.push('📋 DADOS PESSOAIS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push(`👤 Nome: ${person.nome}`);
  lines.push(`🆔 CPF: ${formatCpf(person.cpf)}`);
  
  if (person.dataNascimento) {
    const age = calculateAge(person.dataNascimento);
    lines.push(`📅 Nascimento: ${person.dataNascimento} (${age} anos)`);
  }
  
  if (person.sexo) {
    const gender = person.sexo.startsWith('M') ? 'Masculino' : 'Feminino';
    lines.push(`⚧ Sexo: ${gender}`);
  }
  
  if (person.nomeMae) {
    lines.push(`👩 Mãe: ${person.nomeMae}`);
  }
  
  // Add situacao from DadosBasicos
  lines.push(`📊 Situação: REGULAR`);
  
  // Education if available
  if (person.escolaridade) {
    lines.push(`🎓 Escolaridade: ${person.escolaridade}`);
  }
  
  // Profession if available
  if (person.profissao) {
    lines.push(`💼 Profissão: ${person.profissao}`);
  }
  
  lines.push('');
  
  // Economic Data Section
  lines.push('💰 DADOS ECONÔMICOS');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  
  if (person.renda) {
    lines.push(`💵 Renda: R$ ${formatCurrency(person.renda)}`);
  }
  
  if (person.score) {
    lines.push(`📈 Score: ${person.score}`);
  }
  
  if (person.risco) {
    lines.push(`⚠️ Risco: ${person.risco}`);
  }
  
  if (person.poderAquisitivo) {
    lines.push(`🏦 Poder Aquisitivo: ${person.poderAquisitivo}`);
  }
  
  if (person.mosaic) {
    lines.push(`🏷️ Mosaic: ${person.mosaic}`);
  }
  
  lines.push('');
  
  // Address Section
  if (person.enderecos && person.enderecos.length > 0) {
    const addr = person.enderecos[0];
    lines.push('📍 ENDEREÇO');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━');
    lines.push(`🏠 ${addr.tipoLogradouro || ''} ${addr.logradouro}, ${addr.numero}${addr.complemento ? ' ' + addr.complemento : ''}`);
    lines.push(`🏘 ${addr.bairro}`);
    lines.push(`🌆 ${addr.cidade} - ${addr.uf}`);
    lines.push(`📮 CEP: ${formatCep(addr.cep)}`);
    lines.push('');
  }
  
  // Contact Summary
  const phoneCount = person.telefones?.length || 0;
  const emailCount = person.emails?.length || 0;
  
  lines.push(`📱 Telefones: ${phoneCount} encontrados`);
  lines.push(`📧 E-mails: ${emailCount} encontrados`);
  
  if (person.emails && person.emails.length > 0) {
    const primaryEmail = person.emails.find(e => e.prioridade === 'MUITO ALTA') || person.emails[0];
    lines.push(`   - ${primaryEmail.email} (${primaryEmail.prioridade || 'N/A'})`);
  }
  
  // Relatives if available
  if (person.parentes && person.parentes.length > 0) {
    lines.push('');
    lines.push(`👨‍👩‍👧 Parentes: ${person.parentes.length} encontrados`);
    for (const p of person.parentes.slice(0, 3)) {
      lines.push(`   - ${p.nomeParente} (${translateRelationship(p.grauParentesco)})`);
    }
  }
  
  lines.push('');
  lines.push('━━━━━━━━━━━━━━━━━━━━━━');
  lines.push('🤖 Enriquecimento via Work API');
  lines.push(`📅 ${formatDate(new Date())}`);
  
  return lines.join('\n');
}
```

**Files to create/modify:**
- `src/utils/rich-description-builder.ts` - New rich formatter
- `src/services/work-api.service.ts` - Capture additional fields (score, risco, mosaic, parentes)
- `src/services/enrichment.service.ts` - Use rich builder

---

## Phase 2: Automation (Week 2)

### 2.1 Batch Enrichment Endpoint

**Problem:** Currently need to call API for each lead. Need batch processing.

```typescript
// src/routes/batch.ts

import { Elysia, t } from 'elysia';
import { container } from '../container';

export const batchRoute = new Elysia({ prefix: '/batch' })
  
  // Enrich last N leads from C2S
  .post('/enrich-recent', async ({ body }) => {
    const { count = 25, status = 'new' } = body;
    
    // 1. Fetch recent leads from C2S
    const leads = await container.c2s.getLeads({
      perpage: count,
      status,
      sort: '-created_at'
    });
    
    // 2. Filter leads without enrichment message
    const unenrichedLeads = leads.data.filter(lead => 
      !hasEnrichmentMessage(lead)
    );
    
    // 3. Enrich each lead
    const results = [];
    for (const lead of unenrichedLeads) {
      const result = await container.enrichment.enrichLead({
        leadId: lead.id,
        name: lead.customer,
        phone: lead.phone,
        email: lead.email,
        source: lead.source
      });
      results.push({ leadId: lead.id, ...result });
      
      // Rate limiting
      await sleep(500);
    }
    
    return {
      data: {
        total: leads.data.length,
        enriched: results.filter(r => r.enriched).length,
        results
      }
    };
  }, {
    body: t.Object({
      count: t.Optional(t.Number({ minimum: 1, maximum: 50, default: 25 })),
      status: t.Optional(t.String({ default: 'new' }))
    })
  })
  
  // Re-enrich failed/partial leads
  .post('/retry-failed', async () => {
    const failedLeads = await container.dbStorage.getLeadsByStatus(['partial', 'failed']);
    
    const results = [];
    for (const lead of failedLeads) {
      const result = await container.enrichment.enrichLead(lead);
      results.push({ leadId: lead.leadId, ...result });
      await sleep(500);
    }
    
    return { data: results };
  });
```

---

### 2.2 Scheduled Enrichment (Cron)

**Problem:** No automatic enrichment. Need to trigger manually.

**Solution:** Add cron job to enrich new leads every 15 minutes.

```typescript
// src/jobs/enrichment-cron.ts

import { Cron } from 'croner';
import { container } from '../container';
import { jobLogger } from '../utils/logger';

export function startEnrichmentCron() {
  // Run every 15 minutes
  const job = new Cron('*/15 * * * *', async () => {
    jobLogger.info('Starting scheduled enrichment run');
    
    try {
      // Get last 25 new leads
      const leads = await container.c2s.getLeads({
        perpage: 25,
        status: 'new',
        sort: '-created_at'
      });
      
      let enrichedCount = 0;
      for (const lead of leads.data) {
        // Skip if already has enrichment
        if (await hasEnrichmentMessage(lead.id)) continue;
        
        const result = await container.enrichment.enrichLead({
          leadId: lead.id,
          name: lead.customer,
          phone: lead.phone,
          email: lead.email
        });
        
        if (result.enriched) enrichedCount++;
        await sleep(1000); // 1s delay between leads
      }
      
      jobLogger.info({ total: leads.data.length, enriched: enrichedCount }, 
        'Scheduled enrichment completed');
        
    } catch (error) {
      jobLogger.error({ error }, 'Scheduled enrichment failed');
    }
  });
  
  jobLogger.info('Enrichment cron job started (every 15 minutes)');
  return job;
}
```

**Files to create:**
- `src/jobs/enrichment-cron.ts`
- `src/index.ts` - Import and start cron

---

### 2.3 Webhook Integration (Real-time)

**Problem:** Polling is inefficient. C2S supports webhooks.

**Solution:** Subscribe to lead.created webhook for real-time enrichment.

```typescript
// src/routes/webhook.ts (enhance existing)

.post('/c2s', async ({ body, headers }) => {
  // Verify webhook signature
  const signature = headers['x-c2s-signature'];
  if (!verifyWebhookSignature(body, signature)) {
    return { error: 'Invalid signature' };
  }
  
  const { event, data } = body;
  
  if (event === 'lead.created') {
    // Queue for enrichment (don't block webhook response)
    queueEnrichment({
      leadId: data.id,
      name: data.customer,
      phone: data.phone,
      email: data.email,
      source: data.source
    });
    
    return { status: 'queued' };
  }
  
  return { status: 'ignored' };
});
```

---

## Phase 3: Data Quality (Week 3)

### 3.1 Enhanced Work API Response Parsing

**Problem:** We're not capturing all available Work API data.

**Current fields captured:** 12  
**Available fields:** 50+

**Additional fields to capture:**

```typescript
interface WorkApiPersonEnhanced extends WorkApiPerson {
  // From DadosBasicos
  cns?: string;
  cor?: string;
  nomePai?: string;
  municipioNascimento?: string;
  nacionalidade?: string;
  conjuge?: string[];
  obito?: { obito: string; dataObito: string };
  situacaoCadastral?: {
    codigoSituacaoCadastral: string;
    descricaoSituacaoCadastral: string;
    dataSituacaoCadastral: string;
  };
  
  // From DadosEconomicos
  poderAquisitivo?: {
    codigoPoderAquisitivo: string;
    poderAquisitivoDescricao: string;
    faixaPoderAquisitivo: string;
  };
  score?: {
    scoreCSB: string;
    scoreCSBFaixaRisco: string;
    scoreCSBA: string;
    scoreCSBAFaixaRisco: string;
  };
  serasaMosaic?: {
    codigoMosaic: string;
    descricaoMosaic: string;
    classeMosaic: string;
  };
  
  // From profissao
  cbo?: string;
  cboDescricao?: string;
  pis?: string;
  
  // Relatives
  parentes?: Array<{
    nomeParente: string;
    cpfParente: string;
    grauParentesco: string;
  }>;
  
  // Consumption profile
  perfilConsumo?: {
    credito_imobiliario_pre_aprovado: boolean;
    possui_casa_propria: boolean;
    possui_investimentos: boolean;
    possui_cartao_black: boolean;
    // ... 30+ boolean flags
  };
}
```

---

### 3.2 Lead Scoring System

**Problem:** All leads treated equally. High-value leads should be prioritized.

**Solution:** Calculate lead score based on Work API data.

```typescript
// src/utils/lead-scoring.ts

interface LeadScore {
  total: number;        // 0-100
  financial: number;    // 0-40 points
  engagement: number;   // 0-30 points
  fit: number;          // 0-30 points
  tier: 'A' | 'B' | 'C' | 'D';
}

export function calculateLeadScore(person: WorkApiPersonEnhanced): LeadScore {
  let financial = 0;
  let engagement = 0;
  let fit = 0;
  
  // Financial Score (0-40)
  if (person.renda) {
    if (person.renda >= 20000) financial += 40;
    else if (person.renda >= 10000) financial += 30;
    else if (person.renda >= 5000) financial += 20;
    else if (person.renda >= 2000) financial += 10;
  }
  
  // Credit Score bonus
  if (person.score?.scoreCSBA) {
    const score = parseInt(person.score.scoreCSBA);
    if (score >= 900) financial += 10;
    else if (score >= 700) financial += 5;
  }
  
  // Mosaic class bonus (Elites = +10)
  if (person.serasaMosaic?.classeMosaic?.includes('Elite')) {
    financial += 10;
  }
  
  // Cap at 40
  financial = Math.min(financial, 40);
  
  // Engagement Score (0-30)
  if (person.telefones && person.telefones.length > 0) engagement += 10;
  if (person.emails && person.emails.length > 0) engagement += 10;
  if (person.enderecos && person.enderecos.length > 0) engagement += 10;
  
  // Fit Score (0-30) - Real estate interest indicators
  if (person.perfilConsumo?.credito_imobiliario_pre_aprovado) fit += 15;
  if (person.perfilConsumo?.possui_casa_propria === false) fit += 10; // Renters more likely to buy
  if (person.perfilConsumo?.possui_investimentos) fit += 5;
  
  const total = financial + engagement + fit;
  
  let tier: 'A' | 'B' | 'C' | 'D';
  if (total >= 80) tier = 'A';
  else if (total >= 60) tier = 'B';
  else if (total >= 40) tier = 'C';
  else tier = 'D';
  
  return { total, financial, engagement, fit, tier };
}
```

**Use in C2S:** Add score to lead message and optionally add tags.

---

### 3.3 Duplicate Detection

**Problem:** Same person may submit multiple leads (different campaigns, phones).

**Solution:** Detect duplicates by CPF and link them.

```typescript
// src/services/deduplication.service.ts

export class DeduplicationService {
  async findExistingLead(cpf: string): Promise<C2SLead | null> {
    // Check our database first
    const existingParty = await this.dbStorage.findPartyByCpf(cpf);
    if (existingParty?.c2sLeadId) {
      return this.c2sService.getLead(existingParty.c2sLeadId);
    }
    return null;
  }
  
  async linkDuplicateLead(originalLeadId: string, duplicateLeadId: string): Promise<void> {
    // Add note to duplicate lead pointing to original
    await this.c2sService.createMessage(
      duplicateLeadId,
      `🔗 LEAD DUPLICADO\n\nEste lead é a mesma pessoa do lead #${originalLeadId}.\nCPF já cadastrado anteriormente.`
    );
    
    // Add tag
    await this.c2sService.addLeadTag(duplicateLeadId, 'duplicate');
  }
}
```

---

## Phase 4: Monitoring & Analytics (Week 4)

### 4.1 Enrichment Metrics Dashboard

```typescript
// src/routes/metrics.ts (enhance)

.get('/enrichment-stats', async () => {
  const stats = await container.dbStorage.getEnrichmentStats();
  
  return {
    data: {
      today: {
        total: stats.todayTotal,
        enriched: stats.todayEnriched,
        rate: (stats.todayEnriched / stats.todayTotal * 100).toFixed(1) + '%'
      },
      week: {
        total: stats.weekTotal,
        enriched: stats.weekEnriched,
        rate: (stats.weekEnriched / stats.weekTotal * 100).toFixed(1) + '%'
      },
      bySource: stats.bySource,
      byCampaign: stats.byCampaign,
      cpfDiscovery: {
        tier0_ibvi: stats.tier0Hits,
        tier1_dbase: stats.tier1Hits,
        tier2_mimir: stats.tier2Hits,
        tier3_diretrix: stats.tier3Hits,
        tier4_workapi: stats.tier4Hits,
        notFound: stats.notFound
      },
      averageEnrichmentTime: stats.avgTimeMs + 'ms',
      leadScoreDistribution: {
        tierA: stats.tierA,
        tierB: stats.tierB,
        tierC: stats.tierC,
        tierD: stats.tierD
      }
    }
  };
});
```

---

### 4.2 Alerting

```typescript
// src/utils/alerts.ts

export async function checkEnrichmentHealth(): Promise<void> {
  const stats = await getRecentStats(60); // Last hour
  
  // Alert if enrichment rate drops below 40%
  if (stats.enrichmentRate < 0.4) {
    await sendAlert('LOW_ENRICHMENT_RATE', {
      rate: stats.enrichmentRate,
      expected: 0.6
    });
  }
  
  // Alert if Work API errors spike
  if (stats.workApiErrors > 10) {
    await sendAlert('WORK_API_ERRORS', {
      errors: stats.workApiErrors,
      threshold: 10
    });
  }
  
  // Alert if no enrichments in 30 minutes
  if (stats.lastEnrichmentMinutesAgo > 30) {
    await sendAlert('NO_ENRICHMENTS', {
      lastEnrichment: stats.lastEnrichmentAt
    });
  }
}
```

---

## Implementation Priority

### Must Have (Week 1)
1. ✅ Smart phone result matching with name similarity
2. ✅ IBVI Database as Tier 0
3. ✅ Rich message formatting with emojis

### Should Have (Week 2)
4. Batch enrichment endpoint (`/batch/enrich-recent`)
5. Scheduled cron job (every 15 min)
6. Webhook integration for real-time

### Nice to Have (Week 3-4)
7. Enhanced Work API field capture
8. Lead scoring system
9. Duplicate detection
10. Metrics dashboard
11. Alerting

---

## API Endpoints (Final)

```
# Health
GET  /health                    # Health check

# Enrichment
POST /enrich                    # Enrich single lead
POST /batch/enrich-recent       # Enrich last N leads
POST /batch/retry-failed        # Retry failed enrichments

# Leads
GET  /leads/:id                 # Get lead by ID
POST /leads                     # Create lead

# C2S Proxy
GET  /c2s/leads                 # List C2S leads
GET  /c2s/leads/:id             # Get C2S lead
POST /c2s/leads/:id/message     # Add message to lead

# CPF Discovery (Debug)
GET  /cpf/discover?phone=X      # Test CPF discovery
GET  /cpf/discover?name=X       # Test name lookup

# Work API (Debug)
GET  /work-api/:cpf             # Test Work API lookup

# Metrics
GET  /metrics/enrichment-stats  # Enrichment statistics
GET  /metrics/api-health        # API health metrics

# Webhooks
POST /webhook/c2s               # C2S webhook receiver
```

---

## Environment Variables (Final)

```bash
# Server
PORT=3000
NODE_ENV=production

# Databases
DB_URL=postgresql://...         # App database (leads, metrics)
IBVI_DB_URL=postgresql://...    # IBVI database (parties, CPF lookup)

# C2S
C2S_TOKEN=...
C2S_URL=https://api.contact2sale.com

# CPF Discovery APIs
DBASE_KEY=...
DBASE_URL=https://dfraud.dfraud.com.br
MIMIR_TOKEN=...
MIMIR_URL=https://ibvi-mimir.ashygrass-6acf749b.brazilsouth.azurecontainerapps.io
DIRETRIX_USER=...
DIRETRIX_PASS=...
DIRETRIX_URL=https://api.diretrix.com.br

# Enrichment API
WORK_API=zuZKCfxQqGMYbIKKaIDvzgdq
WORK_API_URL=https://completa.workbuscas.com/api

# Features
INCOME_MULTIPLIER=1.9
ENABLE_CRON=true
CRON_INTERVAL=*/15 * * * *
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Enrichment Rate | 57% | 85%+ |
| CPF Discovery Rate | 57% | 80%+ |
| Avg Enrichment Time | ~5s | <3s |
| Work API Timeout Rate | 10% | <2% |
| Manual Intervention | High | Minimal |

---

## Next Steps

1. **Review this plan** - Confirm priorities
2. **Start Phase 1** - Critical fixes (smart matching, IBVI DB, rich format)
3. **Deploy and test** - With real leads
4. **Iterate** - Based on metrics

---

**Author:** Claude AI  
**Last Updated:** December 17, 2025
