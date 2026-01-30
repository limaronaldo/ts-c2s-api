# MCP Server - ts-c2s-api

Model Context Protocol server exposing lead enrichment capabilities to AI assistants.

## Structure

```
src/mcp/
├── index.ts          # Main exports
├── server.ts         # MCP server setup and handlers
├── types.ts          # Type definitions
├── tools/            # Tool implementations (55 tools)
│   ├── index.ts      # Tool routing
│   │
│   │ # Phase 0: Core
│   ├── enrichment.ts # Lead enrichment (3)
│   ├── discovery.ts  # CPF discovery (5)
│   ├── leads.ts      # Lead management (3)
│   ├── stats.ts      # Statistics (2)
│   │
│   │ # Phase 1: Intelligence
│   ├── property.ts   # Property intelligence (3)
│   ├── quality.ts    # Quality scoring (2)
│   ├── reports.ts    # Report generation (3)
│   ├── risk.ts       # Risk assessment (3)
│   ├── analysis.ts   # Lead analysis (3)
│   ├── c2s.ts        # C2S CRM integration (9)
│   │
│   │ # Phase 2: Advanced
│   ├── domain.ts     # Domain analyzer (3)
│   ├── cnpj.ts       # CNPJ company lookup (3)
│   ├── insights.ts   # Web insights (4)
│   ├── tier.ts       # Tier calculator (2)
│   ├── search.ts     # Web search (4)
│   └── monitor.ts    # Enrichment monitor (3)
│
├── resources/        # Resource implementations (3)
│   ├── index.ts      # Resource routing
│   └── stats.ts      # Statistics resources
└── prompts/          # Prompt templates (future)
    └── index.ts      # Prompt definitions
```

## Tools by Category

### Phase 0: Core (13 tools)

| Category | Count | Tools |
|----------|-------|-------|
| Enrichment | 3 | `enrich_lead`, `enrich_bulk`, `retry_failed` |
| Discovery | 5 | `find_and_save_person`, `discover_cpf`, `lookup_cpf`, `search_cpf_by_name`, `validate_cpf` |
| Leads | 3 | `get_lead`, `list_leads`, `get_c2s_lead_status` |
| Stats | 2 | `get_enrichment_stats`, `get_service_health` |

### Phase 1: Intelligence (23 tools)

| Category | Count | Tools |
|----------|-------|-------|
| Property | 3 | `get_properties_by_cpf`, `get_property_summary`, `format_property_message` |
| Quality | 2 | `score_lead_quality`, `batch_score_quality` |
| Reports | 3 | `generate_profile_report`, `generate_report_from_cpfs`, `generate_report_pdf` |
| Risk | 3 | `assess_risk`, `quick_risk_check`, `analyze_text_risk` |
| Analysis | 3 | `analyze_lead`, `get_lead_analysis`, `check_lead_alert` |
| C2S | 9 | `fetch_c2s_leads`, `get_c2s_sellers`, `send_c2s_message`, `forward_c2s_lead`, `search_c2s_by_phone`, `search_c2s_by_email`, `mark_c2s_interacted`, `get_c2s_tags`, `add_c2s_lead_tag` |

### Phase 2: Advanced (19 tools)

| Category | Count | Tools |
|----------|-------|-------|
| Domain | 3 | `analyze_email_domain`, `get_domain_trust_score`, `identify_company_from_email` |
| CNPJ | 3 | `lookup_cnpj`, `find_companies_by_name`, `analyze_company_portfolio` |
| Insights | 4 | `generate_web_insights`, `detect_family_connection`, `identify_notable_surname`, `analyze_lead_name` |
| Tier | 2 | `calculate_lead_tier`, `get_tier_recommendation` |
| Search | 4 | `search_web`, `search_person`, `search_news`, `find_linkedin_profile` |
| Monitor | 3 | `get_enrichment_rate`, `get_enrichment_health`, `get_enrichment_breakdown` |

**Total: 55 tools**

## Resources

| URI | Description |
|-----|-------------|
| `enrichment://stats` | Real-time enrichment metrics (7 days) |
| `enrichment://health` | Service health status |
| `enrichment://recent` | Recent leads summary (24h) |

## Usage

### Start Server

```bash
bun run mcp-server.ts
```

### Configure Claude Code

Add to `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "c2s-enrichment": {
      "command": "bun",
      "args": ["run", "mcp-server.ts"],
      "cwd": "/path/to/ts-c2s-api"
    }
  }
}
```

## Adding New Tools

1. Create or edit file in `tools/` directory
2. Define tool with Zod schema validation
3. Export from `tools/index.ts`
4. Handler receives `(name, args, container)`

Example:

```typescript
// tools/my-category.ts
export const myTools: Tool[] = [{
  name: "my_tool",
  description: "What it does",
  inputSchema: {
    type: "object",
    properties: {
      param: { type: "string", description: "Param description" }
    },
    required: ["param"]
  }
}];

export async function handleMyTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer
): Promise<unknown> {
  if (name === "my_tool") {
    const { param } = args as { param: string };
    return container.someService.doSomething(param);
  }
  throw new Error(`Unknown tool: ${name}`);
}
```

## Documentation

Full documentation: `docs/MCP_SERVER.md`
