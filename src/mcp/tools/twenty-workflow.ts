/**
 * MCP Tools: Twenty CRM Workflow
 *
 * Tools for delegation management, intent signal calculation, and next action recommendations.
 * Part of Phase 3: Twenty Integration
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ServiceContainer } from "../../container";

// Tool definitions
export const twentyWorkflowTools: Tool[] = [
  {
    name: "twenty_check_delegation_expiry",
    description:
      "Find delegations that are expiring soon. Returns list of leads with delegation info and expiration dates.",
    inputSchema: {
      type: "object",
      properties: {
        daysAhead: {
          type: "number",
          description: "Look ahead X days for expiring delegations (default: 3)",
        },
        workspace: {
          type: "string",
          enum: ["WS-OPS", "WS-SENIOR", "WS-GENERAL"],
        },
        includeExpired: {
          type: "boolean",
          description: "Include already expired delegations (default: false)",
        },
      },
    },
  },
  {
    name: "twenty_calculate_intent_signal",
    description:
      "Calculate intent signal for a lead based on source, last contact, and next contact date. Returns low/medium/high.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "Lead ID to calculate (optional if providing data)",
        },
        source: {
          type: "string",
          enum: [
            "website",
            "google_ads",
            "meta_ads",
            "whatsapp",
            "portal",
            "referral",
            "ibvi",
            "other",
          ],
        },
        lastContactDate: {
          type: "string",
          description: "ISO datetime of last contact",
        },
        nextContactDate: {
          type: "string",
          description: "ISO datetime of next scheduled contact",
        },
        updateLead: {
          type: "boolean",
          description: "Update the lead's intentSignal field (default: false)",
        },
      },
    },
  },
  {
    name: "twenty_get_next_action",
    description:
      "Get recommended next action for a lead based on status, tier, and activity. Returns actionable suggestion.",
    inputSchema: {
      type: "object",
      properties: {
        leadId: {
          type: "string",
          description: "Lead ID",
        },
        leadStatus: {
          type: "string",
          enum: [
            "novo",
            "contato_inicial",
            "qualificado",
            "visita_agendada",
            "visita_realizada",
            "proposta_enviada",
            "negociacao",
            "fechado_ganho",
            "fechado_perdido",
            "nurturing",
          ],
        },
        tier: {
          type: "string",
          enum: ["S", "A", "B", "C", "RISK"],
        },
        lastContactDate: {
          type: "string",
          description: "ISO datetime of last contact",
        },
        nextContactDate: {
          type: "string",
          description: "ISO datetime of scheduled follow-up",
        },
        delegationExpiresAt: {
          type: "string",
          description: "Delegation expiration date if applicable",
        },
      },
      required: ["leadStatus"],
    },
  },
];

// Tool handlers
export async function handleTwentyWorkflowTool(
  name: string,
  args: Record<string, unknown>,
  container: ServiceContainer
): Promise<unknown> {
  switch (name) {
    case "twenty_check_delegation_expiry":
      return checkDelegationExpiry(args, container);
    case "twenty_calculate_intent_signal":
      return calculateIntentSignal(args, container);
    case "twenty_get_next_action":
      return getNextAction(args, container);
    default:
      throw new Error(`Unknown Twenty Workflow tool: ${name}`);
  }
}

async function checkDelegationExpiry(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const daysAhead = (args.daysAhead as number) || 3;
  
  const result = await container.twenty.findExpiringDelegations({
    daysAhead,
    workspace: args.workspace as any,
  });

  if (!result.success) {
    return result;
  }

  const delegations = result.delegations || [];
  const now = new Date();

  const formatted = delegations.map((d) => {
    const expires = new Date(d.expiresAt);
    const daysUntilExpiry = Math.ceil(
      (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    return {
      ...d,
      daysUntilExpiry,
      status: daysUntilExpiry <= 0 ? "expired" : daysUntilExpiry <= 2 ? "urgent" : "upcoming",
      expiresFormatted: expires.toLocaleDateString("pt-BR"),
    };
  });

  return {
    success: true,
    daysAhead,
    totalDelegations: delegations.length,
    delegations: formatted,
    summary: {
      expired: formatted.filter((d) => d.status === "expired").length,
      urgent: formatted.filter((d) => d.status === "urgent").length,
      upcoming: formatted.filter((d) => d.status === "upcoming").length,
    },
  };
}

async function calculateIntentSignal(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const signal = container.twenty.calculateIntentSignal({
    source: args.source as any,
    lastContactDate: args.lastContactDate as string | undefined,
    nextContactDate: args.nextContactDate as string | undefined,
  });

  const explanation = getIntentExplanation(signal, args);

  const result = {
    success: true,
    intentSignal: signal,
    explanation,
    factors: {
      source: args.source,
      lastContactDate: args.lastContactDate,
      nextContactDate: args.nextContactDate,
    },
  };

  // Optionally update the lead
  if (args.updateLead && args.leadId) {
    const updateResult = await container.twenty.updateLead({
      id: args.leadId as string,
      intentSignal: signal,
    });

    return {
      ...result,
      updated: updateResult.success,
      updateError: updateResult.error,
    };
  }

  return result;
}

function getIntentExplanation(
  signal: "low" | "medium" | "high",
  args: Record<string, unknown>
): string {
  switch (signal) {
    case "high":
      return "Lead from paid source, recent contact, and upcoming follow-up scheduled. High purchase intent.";
    case "medium":
      return args.nextContactDate
        ? "Lead has scheduled follow-up. Moderate intent."
        : "Recent contact within 14 days. Moderate intent.";
    case "low":
      return "No recent activity or scheduled follow-up. Lead may need nurturing.";
  }
}

async function getNextAction(
  args: Record<string, unknown>,
  container: ServiceContainer
) {
  const leadStatus = args.leadStatus as string;
  const tier = args.tier as string;
  const lastContactDate = args.lastContactDate as string | undefined;
  const nextContactDate = args.nextContactDate as string | undefined;
  const delegationExpiresAt = args.delegationExpiresAt as string | undefined;

  const now = new Date();
  const actions: Array<{ action: string; priority: "high" | "medium" | "low"; reason: string }> = [];

  // Check delegation expiry first
  if (delegationExpiresAt) {
    const expires = new Date(delegationExpiresAt);
    const daysUntil = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntil <= 2) {
      actions.push({
        action: "Revisar delegacao",
        priority: "high",
        reason: `Delegacao expira em ${daysUntil} dia(s). Decidir: renovar, transferir ou devolver.`,
      });
    }
  }

  // Status-based actions
  switch (leadStatus) {
    case "novo":
      if (!lastContactDate) {
        actions.push({
          action: "Fazer primeiro contato",
          priority: tier === "S" ? "high" : tier === "A" ? "high" : "medium",
          reason: `Lead ${tier} novo sem contato. SLA: ${getSlaText(tier)}.`,
        });
      }
      break;

    case "contato_inicial":
      if (nextContactDate) {
        const nextDate = new Date(nextContactDate);
        if (nextDate <= now) {
          actions.push({
            action: "Follow-up agendado para hoje",
            priority: "high",
            reason: "Follow-up agendado esta vencido ou e hoje.",
          });
        }
      } else {
        actions.push({
          action: "Agendar proximo contato",
          priority: "medium",
          reason: "Sem follow-up agendado apos contato inicial.",
        });
      }
      break;

    case "qualificado":
      const daysSinceContact = lastContactDate
        ? Math.floor((now.getTime() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24))
        : Infinity;

      if (daysSinceContact > 14) {
        actions.push({
          action: "Agendar visita",
          priority: "medium",
          reason: `Lead qualificado sem visita ha ${daysSinceContact} dias.`,
        });
      }
      break;

    case "visita_realizada":
      actions.push({
        action: "Enviar proposta",
        priority: "medium",
        reason: "Visita realizada. Proximo passo: proposta.",
      });
      break;

    case "proposta_enviada":
      const daysSinceProposal = lastContactDate
        ? Math.floor((now.getTime() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      if (daysSinceProposal > 7) {
        actions.push({
          action: "Follow-up da proposta",
          priority: "high",
          reason: `Proposta enviada ha ${daysSinceProposal} dias sem resposta.`,
        });
      }
      break;

    case "nurturing":
      actions.push({
        action: "Check-in mensal",
        priority: "low",
        reason: "Lead em nurturing. Manter contato periodico.",
      });
      break;
  }

  // Premium lead warning
  if (tier === "S" && lastContactDate) {
    const daysSince = Math.floor(
      (now.getTime() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince > 7) {
      actions.push({
        action: "Lead premium sem contato",
        priority: "high",
        reason: `Lead Tier S sem contato ha ${daysSince} dias. Priorizar!`,
      });
    }
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return {
    success: true,
    leadId: args.leadId,
    currentStatus: leadStatus,
    tier,
    recommendedActions: actions,
    primaryAction: actions[0] || { action: "Nenhuma acao urgente", priority: "low", reason: "Lead em dia." },
  };
}

function getSlaText(tier: string | undefined): string {
  switch (tier) {
    case "S": return "2 horas";
    case "A": return "24 horas";
    case "B": return "48 horas";
    case "C": return "72 horas";
    default: return "72 horas";
  }
}
