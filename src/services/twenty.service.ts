/**
 * Twenty CRM Service
 *
 * GraphQL client for Twenty CRM with multi-workspace support.
 * Handles lead CRUD, routing, and analytics.
 *
 * Workspaces:
 * - WS-OPS: Admin, SuperManager (global visibility)
 * - WS-SENIOR: Broker Senior, Manager (Tier S/A)
 * - WS-GENERAL: Broker Jr, Assistants (Tier B/C/Risk)
 *
 * @see https://twenty.com/developers
 */

import { enrichmentLogger } from "../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

export type Workspace = "WS-OPS" | "WS-SENIOR" | "WS-GENERAL";
export type Tier = "S" | "A" | "B" | "C" | "RISK";
export type IntentSignal = "low" | "medium" | "high";
export type DelegationReason = "training" | "workload" | "profile" | "coverage";

export type LeadSource =
  | "website"
  | "google_ads"
  | "meta_ads"
  | "whatsapp"
  | "portal"
  | "referral"
  | "ibvi"
  | "other";

export type LeadStatus =
  | "novo"
  | "contato_inicial"
  | "qualificado"
  | "visita_agendada"
  | "visita_realizada"
  | "proposta_enviada"
  | "negociacao"
  | "fechado_ganho"
  | "fechado_perdido"
  | "nurturing";

export interface TwentyLead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  cpf?: string;
  tier?: Tier;
  score?: number;
  income?: number;
  patrimony?: number;
  source?: LeadSource;
  leadStatus?: LeadStatus;
  lastContactDate?: string;
  nextContactDate?: string;
  assignedBroker?: string;
  intentSignal?: IntentSignal;
  delegatedBy?: string;
  delegatedAt?: string;
  delegatedReason?: DelegationReason;
  delegationExpiresAt?: string;
  dataQuality?: "completed" | "partial" | "unenriched";
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateLeadInput {
  name: string;
  email?: string;
  phone: string;
  cpf?: string;
  tier?: Tier;
  score?: number;
  income?: number;
  patrimony?: number;
  source: LeadSource;
  leadStatus?: LeadStatus;
  assignedBroker?: string;
  dataQuality?: "completed" | "partial" | "unenriched";
}

export interface UpdateLeadInput {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  tier?: Tier;
  score?: number;
  income?: number;
  patrimony?: number;
  source?: LeadSource;
  leadStatus?: LeadStatus;
  lastContactDate?: string;
  nextContactDate?: string;
  assignedBroker?: string;
  intentSignal?: IntentSignal;
  delegatedBy?: string;
  delegatedAt?: string;
  delegatedReason?: DelegationReason;
  delegationExpiresAt?: string;
  dataQuality?: "completed" | "partial" | "unenriched";
}

export interface RouteLeadResult {
  workspace: Workspace;
  reason: string;
  isDelegation: boolean;
  expiresAt?: string;
}

export interface PipelineStats {
  totalLeads: number;
  byTier: Record<Tier, number>;
  byStatus: Record<LeadStatus, number>;
  totalPipelineValue: number;
}

export interface BrokerStats {
  brokerId: string;
  brokerName: string;
  totalLeads: number;
  byTier: Record<Tier, number>;
  slaCompliance: number;
  avgTimeToFirstContact: number;
}

export interface SlaViolation {
  leadId: string;
  leadName: string;
  tier: Tier;
  createdAt: string;
  hoursElapsed: number;
  slaHours: number;
  assignedBroker?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const DEFAULT_ROUTING: Record<Tier, Workspace> = {
  S: "WS-SENIOR",
  A: "WS-SENIOR",
  B: "WS-GENERAL",
  C: "WS-GENERAL",
  RISK: "WS-GENERAL",
};

export const SLA_FIRST_CONTACT_HOURS: Record<Tier, number> = {
  S: 2,
  A: 24,
  B: 48,
  C: 72,
  RISK: 72,
};

export const DELEGATION_EXPIRATION = {
  SA_TO_GENERAL: 7,
  A_TO_SENIOR: 14,
  DEFAULT: 30,
};

// =============================================================================
// SERVICE
// =============================================================================

export class TwentyService {
  private readonly baseUrl: string;
  private readonly apiKeys: Record<Workspace, string>;
  private readonly enabled: boolean;

  constructor() {
    this.baseUrl =
      process.env.TWENTY_BASE_URL ||
      "https://twenty-server-production-1c77.up.railway.app";

    const defaultKey = process.env.TWENTY_API_KEY || "";
    this.apiKeys = {
      "WS-OPS": process.env.TWENTY_API_KEY_WS_OPS || defaultKey,
      "WS-SENIOR": process.env.TWENTY_API_KEY_WS_SENIOR || defaultKey,
      "WS-GENERAL": process.env.TWENTY_API_KEY_WS_GENERAL || defaultKey,
    };

    this.enabled = !!defaultKey || !!this.apiKeys["WS-OPS"];

    if (!this.enabled) {
      enrichmentLogger.warn("Twenty Service disabled - no API key configured");
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private async graphql<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
    workspace: Workspace = "WS-OPS"
  ): Promise<{ data?: T; errors?: Array<{ message: string }> }> {
    const apiKey = this.apiKeys[workspace];

    if (!apiKey) {
      throw new Error(`No API key configured for workspace: ${workspace}`);
    }

    const response = await fetch(`${this.baseUrl}/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(
        `Twenty API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json();
  }

  async createLead(
    input: CreateLeadInput,
    workspace?: Workspace
  ): Promise<{ success: boolean; lead?: TwentyLead; error?: string }> {
    if (!this.enabled) {
      return { success: false, error: "Twenty Service is disabled" };
    }

    const targetWorkspace =
      workspace || (input.tier ? DEFAULT_ROUTING[input.tier] : "WS-GENERAL");

    const mutation = `
      mutation CreatePerson($input: PersonCreateInput!) {
        createPerson(data: $input) {
          id
          name { firstName lastName }
          emails { primaryEmail }
          phones { primaryPhoneNumber }
        }
      }
    `;

    const nameParts = input.name.split(" ");
    const firstName = nameParts[0] || "";
    const lastName = nameParts.slice(1).join(" ") || "";

    try {
      const result = await this.graphql<{
        createPerson: { id: string; name: { firstName: string; lastName: string } };
      }>(
        mutation,
        {
          input: {
            name: { firstName, lastName },
            emails: input.email ? { primaryEmail: input.email } : undefined,
            phones: { primaryPhoneNumber: input.phone },
          },
        },
        targetWorkspace
      );

      if (result.errors) {
        return {
          success: false,
          error: result.errors.map((e) => e.message).join(", "),
        };
      }

      const created = result.data?.createPerson;
      if (!created) {
        return { success: false, error: "No data returned from Twenty" };
      }

      enrichmentLogger.info(
        { workspace: targetWorkspace, name: input.name, leadId: created.id },
        "Created lead in Twenty"
      );

      return {
        success: true,
        lead: {
          id: created.id,
          name: input.name,
          email: input.email,
          phone: input.phone,
          tier: input.tier,
          source: input.source,
        },
      };
    } catch (error) {
      enrichmentLogger.error({ error }, "Failed to create lead in Twenty");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async updateLead(
    input: UpdateLeadInput,
    workspace: Workspace = "WS-OPS"
  ): Promise<{ success: boolean; lead?: TwentyLead; error?: string }> {
    if (!this.enabled) {
      return { success: false, error: "Twenty Service is disabled" };
    }

    const mutation = `
      mutation UpdatePerson($id: ID!, $input: PersonUpdateInput!) {
        updatePerson(id: $id, data: $input) {
          id
          name { firstName lastName }
          updatedAt
        }
      }
    `;

    try {
      const updateData: Record<string, unknown> = {};

      if (input.name) {
        const nameParts = input.name.split(" ");
        updateData.name = {
          firstName: nameParts[0] || "",
          lastName: nameParts.slice(1).join(" ") || "",
        };
      }
      if (input.email) {
        updateData.emails = { primaryEmail: input.email };
      }
      if (input.phone) {
        updateData.phones = { primaryPhoneNumber: input.phone };
      }

      const result = await this.graphql<{
        updatePerson: { id: string; updatedAt: string };
      }>(mutation, { id: input.id, input: updateData }, workspace);

      if (result.errors) {
        return {
          success: false,
          error: result.errors.map((e) => e.message).join(", "),
        };
      }

      enrichmentLogger.info({ leadId: input.id }, "Updated lead in Twenty");

      return {
        success: true,
        lead: { ...input } as TwentyLead,
      };
    } catch (error) {
      enrichmentLogger.error({ error }, "Failed to update lead in Twenty");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async getLead(
    id: string,
    workspace: Workspace = "WS-OPS"
  ): Promise<{ success: boolean; lead?: TwentyLead; error?: string }> {
    if (!this.enabled) {
      return { success: false, error: "Twenty Service is disabled" };
    }

    const query = `
      query GetPerson($id: ID!) {
        person(filter: { id: { eq: $id } }) {
          id
          name { firstName lastName }
          emails { primaryEmail }
          phones { primaryPhoneNumber }
          createdAt
          updatedAt
        }
      }
    `;

    try {
      const result = await this.graphql<{
        person: {
          id: string;
          name: { firstName: string; lastName: string };
          emails: { primaryEmail: string };
          phones: { primaryPhoneNumber: string };
          createdAt: string;
          updatedAt: string;
        };
      }>(query, { id }, workspace);

      if (result.errors) {
        return {
          success: false,
          error: result.errors.map((e) => e.message).join(", "),
        };
      }

      const person = result.data?.person;
      if (!person) {
        return { success: false, error: "Lead not found" };
      }

      return {
        success: true,
        lead: {
          id: person.id,
          name: `${person.name.firstName} ${person.name.lastName}`.trim(),
          email: person.emails?.primaryEmail,
          phone: person.phones?.primaryPhoneNumber,
          createdAt: person.createdAt,
          updatedAt: person.updatedAt,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  routeLead(params: {
    tier: Tier;
    delegatedBy?: string;
    delegatedReason?: DelegationReason;
  }): RouteLeadResult {
    const { tier, delegatedBy, delegatedReason } = params;
    const defaultWorkspace = DEFAULT_ROUTING[tier];

    if (!delegatedBy) {
      return {
        workspace: defaultWorkspace,
        reason: `Default routing: ${tier} -> ${defaultWorkspace}`,
        isDelegation: false,
      };
    }

    if (tier === "S" || tier === "A") {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + DELEGATION_EXPIRATION.SA_TO_GENERAL);

      return {
        workspace: "WS-GENERAL",
        reason: `Delegation: ${tier} -> WS-GENERAL by ${delegatedBy} (${delegatedReason || "unspecified"})`,
        isDelegation: true,
        expiresAt: expiresAt.toISOString(),
      };
    }

    return {
      workspace: defaultWorkspace,
      reason: `Reassignment within ${defaultWorkspace} by ${delegatedBy}`,
      isDelegation: true,
    };
  }

  calculateIntentSignal(params: {
    source?: LeadSource;
    lastContactDate?: string;
    nextContactDate?: string;
  }): IntentSignal {
    const { source, lastContactDate, nextContactDate } = params;
    const now = new Date();

    const paidSources: LeadSource[] = ["google_ads", "meta_ads"];
    const isPaidSource = source && paidSources.includes(source);

    const daysSinceContact = lastContactDate
      ? (now.getTime() - new Date(lastContactDate).getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    const daysToNextContact = nextContactDate
      ? (new Date(nextContactDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      : Infinity;

    if (isPaidSource && daysSinceContact <= 7 && daysToNextContact <= 3) {
      return "high";
    }

    if (daysSinceContact <= 14 || nextContactDate) {
      return "medium";
    }

    return "low";
  }

  isWithinSla(
    tier: Tier,
    createdAt: string,
    contactedAt?: string
  ): { withinSla: boolean; hoursElapsed: number; slaHours: number } {
    const slaHours = SLA_FIRST_CONTACT_HOURS[tier];
    const createdDate = new Date(createdAt);
    const now = new Date();

    if (!contactedAt) {
      const hoursElapsed = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
      return {
        withinSla: hoursElapsed <= slaHours,
        hoursElapsed: Math.round(hoursElapsed * 10) / 10,
        slaHours,
      };
    }

    const contactDate = new Date(contactedAt);
    const hoursToContact = (contactDate.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

    return {
      withinSla: hoursToContact <= slaHours,
      hoursElapsed: Math.round(hoursToContact * 10) / 10,
      slaHours,
    };
  }

  async getPipelineStats(
    workspace: Workspace = "WS-OPS"
  ): Promise<{ success: boolean; stats?: PipelineStats; error?: string }> {
    if (!this.enabled) {
      return { success: false, error: "Twenty Service is disabled" };
    }

    // TODO: Implement actual query to Twenty
    return {
      success: true,
      stats: {
        totalLeads: 0,
        byTier: { S: 0, A: 0, B: 0, C: 0, RISK: 0 },
        byStatus: {
          novo: 0, contato_inicial: 0, qualificado: 0, visita_agendada: 0,
          visita_realizada: 0, proposta_enviada: 0, negociacao: 0,
          fechado_ganho: 0, fechado_perdido: 0, nurturing: 0,
        },
        totalPipelineValue: 0,
      },
    };
  }

  async findSlaViolations(params: {
    workspace?: Workspace;
    tierFilter?: Tier | "all";
    limit?: number;
  }): Promise<{ success: boolean; violations?: SlaViolation[]; error?: string }> {
    if (!this.enabled) {
      return { success: false, error: "Twenty Service is disabled" };
    }

    // TODO: Implement actual query to Twenty
    return { success: true, violations: [] };
  }

  async findExpiringDelegations(params: {
    daysAhead?: number;
    workspace?: Workspace;
  }): Promise<{
    success: boolean;
    delegations?: Array<{
      leadId: string;
      leadName: string;
      expiresAt: string;
      delegatedBy: string;
    }>;
    error?: string;
  }> {
    if (!this.enabled) {
      return { success: false, error: "Twenty Service is disabled" };
    }

    // TODO: Implement actual query to Twenty
    return { success: true, delegations: [] };
  }
}
