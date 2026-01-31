# Lead × Meilisearch Company Intersection

**Date:** January 30, 2026  
**Author:** Ronaldo Lima + Claude AI

---

## Overview

Intersected 31,613 leads from the C2S database with Meilisearch's 65.2M Brazilian company database to identify business owners among our leads.

---

## Results Summary

| Metric | Value |
|--------|-------|
| Total leads with CPF | **31,613** |
| Leads with companies | **11,267 (35.6%)** |
| Leads without companies | 20,346 (64.4%) |
| Max companies per lead | 49 |

---

## Infrastructure

### Meilisearch Configuration

| Setting | Value |
|---------|-------|
| URL | https://ibvi-meilisearch-v2.fly.dev |
| Index | `companies` |
| Documents | 65,277,300 |
| Size | 50.5 GB |

**Index Update Required:**
- Added `socios_cpfs` as filterable attribute
- Task #29125 took ~37 minutes to complete
- Temporarily scaled to **32GB RAM / 16 cores** for indexing

### Processing Performance

| Method | Speed | Notes |
|--------|-------|-------|
| Sequential | ~10 leads/sec | Original script |
| Parallel (30 concurrent) | **~200 leads/sec** | 20x faster |

**Total processing time:** ~3 minutes for 31,613 leads

---

## Scripts Created

### 1. intersect-leads-meilisearch.ts

Sequential intersection script.

```bash
bun run scripts/enrichment/intersect-leads-meilisearch.ts [--limit N] [--min-income N] [--dry-run]
```

### 2. intersect-leads-parallel.ts

Parallel intersection for faster processing.

```bash
bun run scripts/enrichment/intersect-leads-parallel.ts [--concurrency N] [--batch N] [--limit N] [--dry-run]
```

**Recommended settings:**
- `--concurrency=30` - 30 parallel Meilisearch requests
- `--batch=500` - Process 500 leads per batch

### 3. rescore-leads.ts

Rescore leads with new company weighting.

```bash
bun run scripts/enrichment/rescore-leads.ts [--dry-run]
```

---

## Scoring System

### Point Breakdown (0-100)

| Category | Points | Criteria |
|----------|--------|----------|
| **Income** | 0-25 | R$50k+=25, R$30k+=20, R$20k+=15, R$10k+=10, R$5k+=5 |
| **Properties** | 0-25 | Count (3-10 pts) + Patrimony value (3-15 pts) |
| **Companies** | 0-30 | 20+=30, 10+=25, 5+=20, 3+=15, 2+=10, 1+=5 |
| **Completeness** | 0-20 | CPF, name, income, phones, emails, addresses |

### Tier Classification

| Tier | Criteria |
|------|----------|
| **S (Super)** | Score ≥80 OR 20+ companies OR R$10M+ patrimony OR (R$50k+ income AND 5+ companies) |
| **A** | Score ≥60 |
| **B** | Score ≥40 |
| **C** | Score ≥20 |
| **D** | Score <20 |

---

## Final Tier Distribution

| Tier | Leads | % | Avg Score | Avg Income | Avg Companies | Max Companies |
|------|-------|---|-----------|------------|---------------|---------------|
| **S** | 832 | 2.6% | 54.3 | R$ 17,623 | 5.5 | 49 |
| **A** | 413 | 1.3% | 65.1 | R$ 23,380 | 5.4 | 18 |
| **B** | 3,709 | 11.7% | 45.8 | R$ 16,482 | 3.1 | 19 |
| **C** | 16,182 | 51.2% | 27.0 | R$ 5,916 | 0.7 | 17 |
| **D** | 10,477 | 33.1% | 10.5 | R$ 3,242 | 0.1 | 2 |

---

## Top S-Tier Leads

| Name | Income | Companies | Properties | Patrimony | Score |
|------|--------|-----------|------------|-----------|-------|
| Silvio Manoel Lapa Miglio | R$ 32,553 | 5 | 11 | R$ 18.1M | 85 |
| Roberto Mounir Maalouli | R$ 33,178 | 5 | 24 | R$ 25.3M | 85 |
| Renata Lane De Souza Ramos | R$ 38,356 | 21 | 4 | R$ 23.0M | 83 |
| João Carlos Freitas De Camargo | R$ 24,428 | 20 | 1 | R$ 21.8M | 83 |
| Rubens Takano Parreira | R$ 44,631 | 47 | 1 | R$ 4.5M | 82 |
| Marcos Lima Monteiro | R$ 32,081 | 47 | 1 | R$ 3.0M | 82 |
| Guilherme Fontes Ribeiro | R$ 30,899 | 28 | 1 | R$ 3.5M | 82 |

---

## Data Quality Issue Fixed

### Problem

Old enrichment script stored incorrect `num_companies` values (e.g., 5,004 instead of 5).

### Root Cause

Bug in original script likely stored Meilisearch metadata instead of actual filtered results.

### Fix Applied

```sql
UPDATE c2s.enriched_leads
SET num_companies = COALESCE(jsonb_array_length(company_names), 0)
WHERE company_names IS NOT NULL 
  AND num_companies != jsonb_array_length(company_names);
```

**Result:** 1,015 leads corrected. Max companies now correctly shows 49 (was falsely 5,004).

---

## Database Schema

### c2s.enriched_leads (relevant columns)

| Column | Type | Description |
|--------|------|-------------|
| `num_companies` | integer | Count of companies owned |
| `company_names` | jsonb | Array of company names |
| `ibvi_score` | numeric(5,1) | Quality score (0-100) |
| `ibvi_tier` | varchar(2) | Tier classification (S/A/B/C/D) |
| `ibvi_enriched_at` | timestamp | When company data was added |

---

## Meilisearch Query

Filter companies by CPF:

```bash
curl -X POST "https://ibvi-meilisearch-v2.fly.dev/indexes/companies/search" \
  -H "Authorization: Bearer $MEILISEARCH_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "",
    "filter": "socios_cpfs = \"12345678901\"",
    "limit": 50
  }'
```

**Note:** Only returns active companies (`situacao_cadastral = "02"`).

---

## Cost Optimization

### Meilisearch Scaling

| State | CPU | RAM | Cost/hour |
|-------|-----|-----|-----------|
| **Indexing** | performance-16x | 32 GB | ~$0.50 |
| **Normal operation** | shared-cpu-4x | 8 GB | ~$0.05 |

**After processing:** Scaled down to 8GB to save costs.

---

## Future Improvements

1. **Incremental sync** - Only process new leads daily
2. **Capital social tracking** - Store total capital per lead
3. **Company details** - Store CNAE, founding date, etc.
4. **Alert integration** - Trigger Slack alerts for high-value business owners

---

## Files

| File | Description |
|------|-------------|
| `scripts/enrichment/intersect-leads-meilisearch.ts` | Sequential intersection |
| `scripts/enrichment/intersect-leads-parallel.ts` | Parallel intersection (recommended) |
| `scripts/enrichment/rescore-leads.ts` | Rescore with company weighting |
| `docs/LEAD_COMPANY_INTERSECTION.md` | This documentation |

---

**Last Updated:** January 30, 2026
