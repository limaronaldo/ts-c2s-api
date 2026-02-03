# Twenty CRM Integration - ts-c2s-api

**Date:** February 3, 2026  
**Commit:** f5b915b  
**Status:** ✅ Completed and Deployed

---

## Overview

Complete integration of Twenty CRM into ts-c2s-api for advanced lead management with tier-based routing, SLA tracking, and multi-workspace support.

**Base URL:** https://twenty-server-production-1c77.up.railway.app  
**MCP Tools:** 13 (6 CRUD + 4 Analytics + 3 Workflow)  
**Total API Tools:** 72 (expanded from 59)

---

## Features Implemented

### 1. TwentyService (845 lines)
**File:** `src/services/twenty.service.ts`

Complete GraphQL integration service with:
- Multi-workspace support (WS-OPS, WS-SENIOR, WS-GENERAL)
- Lead lifecycle management (create, update, route, delegate)
- Tier-based SLA tracking
- Intent signal calculation
- Delegation system with expiration
- Pipeline analytics
- Broker performance metrics

### 2. MCP Tools (13 tools)

#### CRUD Tools (6)
**File:** `src/mcp/tools/twenty.ts`

| Tool | Description |
|------|-------------|
| `twenty_create_lead` | Create lead with auto-routing by tier |
| `twenty_update_lead` | Update existing lead |
| `twenty_get_lead` | Fetch lead (multi-workspace) |
| `twenty_route_lead` | Route to appropriate workspace |
| `twenty_delegate_lead` | Delegate with expiration |
| `twenty_bulk_import` | Import multiple leads with dedup |

#### Analytics Tools (4)
**File:** `src/mcp/tools/twenty-analytics.ts`

| Tool | Description |
|------|-------------|
| `twenty_get_pipeline_stats` | Pipeline metrics by tier/status |
| `twenty_get_broker_stats` | Broker performance & SLA |
| `twenty_get_adoption_metrics` | Team adoption metrics |
| `twenty_check_sla_violations` | Find SLA breaches |

#### Workflow Tools (3)
**File:** `src/mcp/tools/twenty-workflow.ts`

| Tool | Description |
|------|-------------|
| `twenty_check_delegation_expiry` | Find expiring delegations |
| `twenty_calculate_intent_signal` | Calculate intent signal |
| `twenty_get_next_action` | Recommended next steps |

### 3. Configuration
**Modified:** `src/config/index.ts`

Environment variables:
```typescript
TWENTY_BASE_URL: string (required)
TWENTY_API_KEY: string (required)
TWENTY_ENABLED: boolean (default: false)
TWENTY_API_KEY_WS_OPS: string (optional)
TWENTY_API_KEY_WS_SENIOR: string (optional)
TWENTY_API_KEY_WS_GENERAL: string (optional)
```

### 4. Container Registration
**Modified:** `src/container.ts`

Registered TwentyService as singleton for dependency injection.

### 5. Tool Registry
**Modified:** `src/mcp/tools/index.ts`

Registered 13 new tools, expanded total from 59 to 72.

### 6. Documentation
**Modified:** `CLAUDE.md`  
**Created:** `docs/AI_MEMORY_SYSTEMS_GUIDE.md`

Complete documentation for:
- Workspace routing rules
- Lead tier system & SLA definitions
- Status flow diagram
- Delegation system
- Intent signal calculation
- Usage examples
- Environment setup

---

## Architecture

### Workspace Routing

| Workspace | Roles | Lead Tiers | Access |
|-----------|-------|------------|--------|
| `WS-OPS` | Admin, SuperManager | All | Global visibility |
| `WS-SENIOR` | Broker Senior, Manager | S, A | High-value leads |
| `WS-GENERAL` | Broker Jr, Assistants | B, C, Risk | Standard leads |

### Lead Tier System

| Tier | Label | SLA (First Contact) | Routing | Score Range |
|------|-------|---------------------|---------|-------------|
| **S** | Premium | 2 hours | WS-SENIOR | 90-100 |
| **A** | Alto Valor | 24 hours | WS-SENIOR | 75-89 |
| **B** | Qualificado | 48 hours | WS-GENERAL | 60-74 |
| **C** | Standard | 72 hours | WS-GENERAL | 40-59 |
| **RISK** | Risco | 72 hours | WS-GENERAL | 0-39 |

### Lead Status Flow

```
novo
  ↓
contato_inicial
  ↓
qualificado
  ↓
visita_agendada
  ↓
visita_realizada
  ↓
proposta_enviada
  ↓
negociacao
  ↓
├─→ fechado_ganho
├─→ fechado_perdido
└─→ nurturing
```

### Delegation System

**Rules:**
- Only S/A tier leads can be delegated from WS-SENIOR to WS-GENERAL
- Expiration tracking with automatic notifications
- Multiple delegation reasons

**Expiration Times:**
- S/A tier: 7 days
- Other tiers: 14 days
- Default: 30 days

**Delegation Reasons:**
- `training` - Training opportunity for junior broker
- `workload` - Senior broker overloaded
- `profile` - Better profile match for junior
- `coverage` - Coverage during senior absence

### Intent Signal Calculation

**High Intent:**
- Lead source is paid (google_ads, facebook_ads, etc.)
- Last contact within 14 days
- Follow-up scheduled

**Medium Intent:**
- Last contact within 14 days OR follow-up scheduled
- Not high intent

**Low Intent:**
- No recent contact (>14 days)
- No follow-up scheduled

---

## Environment Setup

### Required Variables

```bash
TWENTY_BASE_URL=https://twenty-server-production-1c77.up.railway.app
TWENTY_API_KEY=your_primary_api_key
TWENTY_ENABLED=true
```

### Optional Workspace Keys

```bash
TWENTY_API_KEY_WS_OPS=key_for_operations_workspace
TWENTY_API_KEY_WS_SENIOR=key_for_senior_workspace
TWENTY_API_KEY_WS_GENERAL=key_for_general_workspace
```

### Fly.io Deployment

```bash
fly secrets set TWENTY_BASE_URL="https://twenty-server-production-1c77.up.railway.app" -a ts-c2s-api
fly secrets set TWENTY_API_KEY="your_api_key" -a ts-c2s-api
fly secrets set TWENTY_ENABLED="true" -a ts-c2s-api
fly deploy
```

---

## Usage Examples

### Creating a Lead

```typescript
import { container } from "./container";

const result = await container.twenty.createLead({
  name: "João Silva",
  phone: "11999887766",
  email: "joao@example.com",
  source: "google_ads",
  tier: "A",
  score: 85,
  notes: "Lead qualificado via Google Ads"
});

// Lead automatically routed to WS-SENIOR (tier A)
// SLA: 24 hours for first contact
```

### Checking SLA Compliance

```typescript
const sla = container.twenty.isWithinSla("A", "2026-02-03T10:00:00Z");

console.log(sla);
// {
//   withinSla: true,
//   hoursElapsed: 5.2,
//   slaHours: 24,
//   remainingHours: 18.8
// }
```

### Calculating Intent Signal

```typescript
const intent = container.twenty.calculateIntentSignal({
  source: "google_ads",
  lastContactDate: "2026-02-01T14:00:00Z",
  nextContactDate: "2026-02-05T10:00:00Z",
});

console.log(intent); // "high"
```

### Delegating a Lead

```typescript
await container.twenty.delegateLead({
  leadId: "lead-uuid",
  fromWorkspace: "WS-SENIOR",
  toWorkspace: "WS-GENERAL",
  reason: "training",
  expiresAt: "2026-02-10T00:00:00Z",
  notes: "Delegado para treinamento do broker junior"
});
```

### Getting Pipeline Stats

```typescript
const stats = await container.twenty.getPipelineStats({
  workspace: "WS-SENIOR",
  dateFrom: "2026-02-01",
  dateTo: "2026-02-03"
});

console.log(stats);
// {
//   totalLeads: 150,
//   leadsByTier: { S: 20, A: 130 },
//   leadsByStatus: { novo: 40, qualificado: 60, ... },
//   totalValue: 15000000,
//   averageScore: 82
// }
```

---

## MCP Integration

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
        "TWENTY_BASE_URL": "https://twenty-server-production-1c77.up.railway.app",
        "TWENTY_API_KEY": "...",
        "TWENTY_ENABLED": "true"
      }
    }
  }
}
```

### Using MCP Tools

After configuration, use in Claude Code:

```
"Create a lead in Twenty CRM: name João Silva, phone 11999887766, tier A"
→ Uses twenty_create_lead tool

"Check SLA violations in WS-SENIOR workspace"
→ Uses twenty_check_sla_violations tool

"Get pipeline stats for last 7 days"
→ Uses twenty_get_pipeline_stats tool

"Find delegations expiring in next 3 days"
→ Uses twenty_check_delegation_expiry tool

"Calculate intent signal for lead with last contact 2026-02-01"
→ Uses twenty_calculate_intent_signal tool

"What's the next action for a qualificado lead?"
→ Uses twenty_get_next_action tool
```

---

## Testing

### Unit Tests

```bash
bun test src/services/twenty.service.test.ts
```

### Integration Tests via MCP

1. Start MCP server: `bun run mcp-server.ts`
2. Connect Claude Code
3. Test each tool:
   - Create test lead
   - Update lead
   - Check SLA
   - Calculate intent
   - Get analytics
   - Test delegation

### Manual Testing

```bash
# Test service directly
bun run scripts/debug/test-twenty-integration.ts

# Test GraphQL queries
curl -X POST https://twenty-server-production-1c77.up.railway.app/graphql \
  -H "Authorization: Bearer $TWENTY_API_KEY" \
  -d '{"query":"{ leads { edges { node { id name } } } }"}'
```

---

## Monitoring

### Key Metrics to Track

1. **SLA Compliance Rate**
   - Target: >95% for S tier, >90% for A tier
   - Monitor via `twenty_check_sla_violations`

2. **Delegation Expiry**
   - Alert 24h before expiration
   - Monitor via `twenty_check_delegation_expiry`

3. **Intent Signal Distribution**
   - High intent leads should be contacted first
   - Monitor via `twenty_get_pipeline_stats`

4. **Broker Performance**
   - Response time by tier
   - Conversion rate by tier
   - Monitor via `twenty_get_broker_stats`

### Alerts

Configure alerts in AlertService for:
- SLA violations (S: >2h, A: >24h)
- Delegations expiring in <24h
- Low adoption metrics (<50% follow-up rate)

---

## Troubleshooting

### Common Issues

**GraphQL errors:**
- Check API key is valid: `fly secrets list`
- Verify base URL is correct
- Check network connectivity to Railway

**Workspace routing not working:**
- Verify workspace exists in Twenty
- Check workspace-specific API keys
- Validate tier calculation logic

**SLA calculations incorrect:**
- Check timezone handling (all times in UTC)
- Verify lead creation timestamp
- Review SLA hour definitions

**Delegation not expiring:**
- Check expiration date is in future
- Verify cron job is running
- Review delegation tracking table

### Debug Commands

```bash
# Check Twenty service health
curl https://ts-c2s-api.fly.dev/stats/health

# Test GraphQL connection
bun run scripts/debug/test-twenty-connection.ts

# View Twenty logs
fly logs -a ts-c2s-api | grep "twenty"

# Check delegation expiry
bun run scripts/workflows/check-delegations.ts
```

---

## Performance Considerations

### GraphQL Query Optimization

- Use field selection to fetch only required fields
- Batch operations when possible
- Implement pagination for large result sets
- Cache workspace lookups

### Rate Limiting

- Twenty API has rate limits
- Implement exponential backoff on errors
- Queue bulk operations
- Monitor API usage

### Database Impact

- Lead creation/updates are async
- SLA checks run every hour
- Delegation expiry checks run daily
- Index on tier, workspace, status columns

---

## Security

### API Key Management

- Store keys in Fly.io secrets
- Use workspace-specific keys when possible
- Rotate keys quarterly
- Never commit keys to git

### Access Control

- Workspaces enforce role-based access
- Delegation requires proper permissions
- Audit all workspace changes
- Monitor suspicious activity

### Data Privacy

- PII handling per LGPD
- Secure GraphQL transport (HTTPS)
- Audit logs for all lead access
- Data retention policies

---

## Future Enhancements

### Planned Features

1. **Automated Lead Scoring**
   - ML-based tier assignment
   - Dynamic SLA adjustment
   - Intent signal prediction

2. **Advanced Analytics**
   - Conversion funnel analysis
   - Broker performance trends
   - Revenue forecasting

3. **Integration Extensions**
   - WhatsApp integration
   - Email automation
   - Calendar sync

4. **Workflow Automation**
   - Auto-delegation rules
   - SLA escalation
   - Follow-up reminders

### Technical Improvements

1. GraphQL subscription support
2. Real-time lead updates
3. Webhook notifications
4. Mobile app integration

---

## Team Training

### For Brokers

1. Understanding lead tiers (S/A/B/C/Risk)
2. SLA expectations and tracking
3. Using delegated leads
4. Intent signal prioritization
5. Status flow and progression

### For Managers

1. Pipeline analytics interpretation
2. Broker performance monitoring
3. Delegation management
4. SLA violation handling
5. Team adoption metrics

### For Admins

1. Workspace configuration
2. API key management
3. System monitoring
4. Troubleshooting
5. Integration maintenance

---

## Documentation References

- **CLAUDE.md:** Project-level documentation
- **MCP_SERVER.md:** Complete MCP setup guide
- **AI_MEMORY_SYSTEMS_GUIDE.md:** Memora/Engram reference
- **Twenty CRM Docs:** https://twenty.com/developers

---

## Commit History

```
f5b915b - feat(mcp): add Twenty CRM integration with 13 MCP tools (Feb 3, 2026)
├── New: src/services/twenty.service.ts (845 lines)
├── New: src/mcp/tools/twenty.ts (6 tools)
├── New: src/mcp/tools/twenty-analytics.ts (4 tools)
├── New: src/mcp/tools/twenty-workflow.ts (3 tools)
├── New: docs/AI_MEMORY_SYSTEMS_GUIDE.md
├── Modified: src/config/index.ts
├── Modified: src/container.ts
├── Modified: src/mcp/tools/index.ts
└── Modified: CLAUDE.md
```

---

## Changelog

### February 3, 2026 - v1.0.0

**Added:**
- Complete Twenty CRM integration service
- 13 MCP tools (6 CRUD + 4 Analytics + 3 Workflow)
- Multi-workspace support (WS-OPS, WS-SENIOR, WS-GENERAL)
- Tier-based lead routing (S/A/B/C/Risk)
- SLA tracking system (2h/24h/48h/72h)
- Delegation system with expiration
- Intent signal calculation
- Pipeline analytics
- Broker performance metrics

**Changed:**
- MCP tool count: 59 → 72
- Configuration expanded for Twenty CRM
- Container registered TwentyService

**Documentation:**
- Added comprehensive Twenty CRM section to CLAUDE.md
- Created AI_MEMORY_SYSTEMS_GUIDE.md
- Updated MCP tool documentation

---

**Last Updated:** February 3, 2026  
**Maintained By:** Ronaldo Lima + Claude AI  
**Status:** ✅ Production Ready
