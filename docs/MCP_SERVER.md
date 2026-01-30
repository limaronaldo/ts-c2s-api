# MCP Server Guide - ts-c2s-api

**Last Updated:** January 29, 2026  
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

The ts-c2s-api MCP server exposes **12 tools** and **3 resources** that enable Claude Code to:
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

The MCP server provides **12 tools** organized into 4 categories:

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
    ├── index.ts            # Server initialization
    ├── tools.ts            # Tool handlers (12 tools)
    ├── resources.ts        # Resource handlers (3 resources)
    └── prompts.ts          # Prompt templates (future)
```

### Adding New Tools

1. **Define tool in `src/mcp/tools.ts`:**

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

- **RML-815:** Create MCP server for ts-c2s-api (parent)
- **RML-816:** Setup MCP server structure and entry point ✅
- **RML-817:** Implement enrichment tools ✅
- **RML-818:** Implement discovery tools ✅
- **RML-819:** Implement lead and stats tools ✅
- **RML-820:** Add MCP resources and configure Claude Code ✅

---

## Additional Resources

- **MCP Protocol Spec:** https://modelcontextprotocol.io/
- **MCP SDK (TypeScript):** https://github.com/modelcontextprotocol/typescript-sdk
- **Claude Code Documentation:** https://docs.anthropic.com/claude-code
- **Bun Runtime:** https://bun.sh/

---

**Document Version:** 1.0  
**Last Updated:** January 29, 2026  
**Maintained By:** Ronaldo Lima + Claude AI
