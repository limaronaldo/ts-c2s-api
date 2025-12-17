import { getConfig } from "../config";
import { c2sLogger } from "../utils/logger";
import { AppError } from "../errors/app-error";
import { withRetry, isRetryableError } from "../utils/retry";

// C2S Lead format (matching /integration/leads API)
// See: https://api.contact2sale.com/integration/leads
export interface C2SLeadCreate {
  customer: string; // Customer name (required)
  phone?: string;
  email?: string;
  product?: string;
  description?: string;
  source?: string;
  seller_id?: string;
}

export interface C2SLeadUpdate {
  customer?: string;
  phone?: string;
  email?: string;
  product?: string;
  description?: string;
  source?: string;
  status?: string;
}

export interface C2SLead {
  id: string;
  customer: string;
  phone?: string;
  email?: string;
  product?: string;
  description?: string;
  source?: string;
  status: string;
  seller_id?: string;
  created_at: string;
  updated_at: string;
}

export interface C2SLeadResponse {
  data: C2SLead;
}

export interface C2SLeadsResponse {
  data: C2SLead[];
  meta?: {
    total: number;
    page: number;
    perpage: number;
  };
}

export interface C2SMessageCreate {
  message: string;
  type?: string;
}

export interface C2SDoneDeal {
  value: number;
  description?: string;
}

export interface C2SVisitCreate {
  visit_date: string;
  description?: string;
}

export interface C2SActivityCreate {
  type: string;
  description: string;
  date?: string;
}

/**
 * C2S API Service
 * Uses /integration/* endpoints as documented
 * Port of c2s-gateway Python client to TypeScript
 *
 * Rate Limiting: Enforces 0.5s delay between requests to avoid C2S API throttling
 * Reference: Lead Operations Guide - "minimum 0.5s delay between sequential requests"
 */
export class C2SService {
  private readonly token: string;
  private readonly baseUrl: string;

  // Rate limiting - prevents C2S API throttling
  private lastRequestTime: number = 0;
  private readonly RATE_LIMIT_MS = 500; // 0.5 seconds minimum between requests

  constructor() {
    const config = getConfig();
    this.token = config.C2S_TOKEN;
    this.baseUrl = config.C2S_URL;
  }

  /**
   * Enforces rate limiting by waiting if needed before making a request
   * This prevents C2S API from throttling our requests
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.RATE_LIMIT_MS) {
      const waitTime = this.RATE_LIMIT_MS - timeSinceLastRequest;
      c2sLogger.debug(
        { waitTime },
        "Rate limiting: waiting before next request",
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  private getHeaders(): HeadersInit {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(
    method: string,
    endpoint: string,
    params?: Record<string, string>,
    body?: unknown,
  ): Promise<T> {
    // Enforce rate limiting before each request
    await this.enforceRateLimit();

    let url = `${this.baseUrl}${endpoint}`;

    if (params && Object.keys(params).length > 0) {
      const searchParams = new URLSearchParams(params);
      url += `?${searchParams.toString()}`;
    }

    c2sLogger.debug({ method, url, body }, "C2S API request");

    // Use retry logic with exponential backoff for transient failures
    // Reference: Lead Operations Guide - "3 retries max, exponential backoff: 1s, 2s, 4s"
    return withRetry(
      async () => {
        const response = await fetch(url, {
          method,
          headers: this.getHeaders(),
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          c2sLogger.error(
            { status: response.status, body: errorBody, url },
            "C2S API error",
          );
          throw new Error(`C2S returned ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        return data as T;
      },
      {
        maxRetries: 3,
        baseDelayMs: 1000,
        shouldRetry: isRetryableError,
        onRetry: (error, attempt, delayMs) => {
          c2sLogger.warn(
            {
              url,
              attempt,
              delayMs,
              error: error instanceof Error ? error.message : String(error),
            },
            "Retrying C2S API request",
          );
        },
      },
    ).catch((error) => {
      c2sLogger.error({ error, url }, "C2S API request failed after retries");
      throw AppError.serviceUnavailable("C2S");
    });
  }

  // ========== LEADS MANAGEMENT ==========

  async getLeads(
    options: {
      page?: number;
      perpage?: number;
      sort?: string;
      created_gte?: string;
      created_lt?: string;
      updated_gte?: string;
      updated_lt?: string;
      status?: string;
      phone?: string;
      email?: string;
      tags?: string;
    } = {},
  ): Promise<C2SLeadsResponse> {
    const params: Record<string, string> = {};

    if (options.page) params.page = String(options.page);
    if (options.perpage) params.perpage = String(Math.min(options.perpage, 50));
    if (options.sort) params.sort = options.sort;
    if (options.created_gte) params.created_gte = options.created_gte;
    if (options.created_lt) params.created_lt = options.created_lt;
    if (options.updated_gte) params.updated_gte = options.updated_gte;
    if (options.updated_lt) params.updated_lt = options.updated_lt;
    if (options.status) params.status = options.status;
    if (options.phone) params.phone = options.phone;
    if (options.email) params.email = options.email;
    if (options.tags) params.tags = options.tags;

    return this.request<C2SLeadsResponse>("GET", "/integration/leads", params);
  }

  async getLead(leadId: string): Promise<C2SLeadResponse> {
    return this.request<C2SLeadResponse>("GET", `/integration/leads/${leadId}`);
  }

  async createLead(lead: C2SLeadCreate): Promise<C2SLeadResponse> {
    c2sLogger.info(
      { customer: lead.customer, phone: lead.phone },
      "Creating lead in C2S",
    );

    const response = await this.request<C2SLeadResponse>(
      "POST",
      "/integration/leads",
      undefined,
      lead,
    );
    c2sLogger.info(
      { leadId: response.data.id, customer: lead.customer },
      "Successfully created lead in C2S",
    );

    return response;
  }

  async updateLead(
    leadId: string,
    lead: C2SLeadUpdate,
  ): Promise<C2SLeadResponse> {
    c2sLogger.info({ leadId }, "Updating lead in C2S");
    return this.request<C2SLeadResponse>(
      "PATCH",
      `/integration/leads/${leadId}`,
      undefined,
      lead,
    );
  }

  async forwardLead(
    leadId: string,
    sellerId: string,
  ): Promise<C2SLeadResponse> {
    c2sLogger.info({ leadId, sellerId }, "Forwarding lead in C2S");
    return this.request<C2SLeadResponse>(
      "PATCH",
      `/integration/leads/${leadId}/forward`,
      undefined,
      { seller_id: sellerId },
    );
  }

  // ========== LEAD TAGS ==========

  async getLeadTags(
    leadId: string,
  ): Promise<{ data: Array<{ id: string; name: string }> }> {
    return this.request("GET", `/integration/leads/${leadId}/tags`);
  }

  async addLeadTag(leadId: string, tagId: string): Promise<unknown> {
    return this.request(
      "POST",
      `/integration/leads/${leadId}/create_tag`,
      undefined,
      { tag_id: tagId },
    );
  }

  // ========== LEAD INTERACTIONS ==========

  async markLeadAsInteracted(leadId: string): Promise<unknown> {
    c2sLogger.info({ leadId }, "Marking lead as interacted");
    return this.request(
      "POST",
      `/integration/leads/${leadId}/mark_as_interacted`,
    );
  }

  async createMessage(
    leadId: string,
    message: string,
    type?: string,
  ): Promise<unknown> {
    c2sLogger.info({ leadId }, "Adding message to lead");
    const body: C2SMessageCreate = { message };
    if (type) body.type = type;
    return this.request(
      "POST",
      `/integration/leads/${leadId}/create_message`,
      undefined,
      body,
    );
  }

  async markDoneDeal(
    leadId: string,
    value: number,
    description?: string,
  ): Promise<unknown> {
    c2sLogger.info({ leadId, value }, "Marking lead as done deal");
    const body: C2SDoneDeal = { value };
    if (description) body.description = description;
    return this.request(
      "POST",
      `/integration/leads/${leadId}/done_deal`,
      undefined,
      body,
    );
  }

  async createVisit(
    leadId: string,
    visitDate: string,
    description?: string,
  ): Promise<unknown> {
    c2sLogger.info({ leadId, visitDate }, "Creating visit for lead");
    const body: C2SVisitCreate = { visit_date: visitDate };
    if (description) body.description = description;
    return this.request(
      "POST",
      `/integration/leads/${leadId}/create_visit`,
      undefined,
      body,
    );
  }

  async createActivity(
    leadId: string,
    activityType: string,
    description: string,
    date?: string,
  ): Promise<unknown> {
    c2sLogger.info({ leadId, activityType }, "Creating activity for lead");
    const body: C2SActivityCreate = { type: activityType, description };
    if (date) body.date = date;
    return this.request(
      "POST",
      `/integration/leads/${leadId}/create_activity`,
      undefined,
      body,
    );
  }

  // ========== TAGS MANAGEMENT ==========

  async getTags(
    name?: string,
    autofill?: boolean,
  ): Promise<{ data: Array<{ id: string; name: string }> }> {
    const params: Record<string, string> = {};
    if (name) params.name = name;
    if (autofill !== undefined) params.autofill = String(autofill);
    return this.request("GET", "/integration/tags", params);
  }

  async createTag(tagData: { name: string; color?: string }): Promise<unknown> {
    return this.request("POST", "/integration/tags", undefined, tagData);
  }

  // ========== SELLERS MANAGEMENT ==========

  async getSellers(): Promise<{
    data: Array<{ id: string; name: string; email: string }>;
  }> {
    return this.request("GET", "/integration/sellers");
  }

  async createSeller(sellerData: {
    name: string;
    email: string;
  }): Promise<unknown> {
    return this.request("POST", "/integration/sellers", undefined, sellerData);
  }

  async updateSeller(
    sellerId: string,
    sellerData: { name?: string; email?: string },
  ): Promise<unknown> {
    return this.request(
      "PUT",
      `/integration/sellers/${sellerId}`,
      undefined,
      sellerData,
    );
  }

  // ========== DISTRIBUTION QUEUES ==========

  async getDistributionQueues(): Promise<{
    data: Array<{ id: string; name: string }>;
  }> {
    return this.request("GET", "/integration/distribution_queues");
  }

  async redistributeLead(
    queueId: string,
    leadId: string,
    sellerId: string,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/integration/distribution_queues/${queueId}/redistribute`,
      undefined,
      {
        lead_id: leadId,
        seller_id: sellerId,
      },
    );
  }

  async getQueueSellers(
    queueId: string,
  ): Promise<{ data: Array<{ id: string; name: string; priority: number }> }> {
    return this.request(
      "GET",
      `/integration/distribution_queues/${queueId}/sellers`,
    );
  }

  async updateSellerPriority(
    queueId: string,
    sellerId: string,
    priority: number,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/integration/distribution_queues/${queueId}/priority`,
      undefined,
      {
        seller_id: sellerId,
        priority,
      },
    );
  }

  async setNextSeller(queueId: string, sellerId: string): Promise<unknown> {
    return this.request(
      "POST",
      `/integration/distribution_queues/${queueId}/next_seller`,
      undefined,
      {
        seller_id: sellerId,
      },
    );
  }

  async createDistributionRule(
    ruleData: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request(
      "POST",
      "/integration/distribution_rules",
      undefined,
      ruleData,
    );
  }

  // ========== COMPANY INFO ==========

  async getCompanyInfo(): Promise<{ data: Record<string, unknown> }> {
    return this.request("GET", "/integration/me");
  }

  // ========== WEBHOOKS ==========

  async subscribeWebhook(
    webhookUrl: string,
    events: string[],
  ): Promise<unknown> {
    return this.request(
      "POST",
      "/integration/webhook/leads/subscribe",
      undefined,
      {
        url: webhookUrl,
        events,
      },
    );
  }

  async unsubscribeWebhook(webhookUrl: string): Promise<unknown> {
    return this.request(
      "POST",
      "/integration/webhook/leads/unsubscribe",
      undefined,
      {
        url: webhookUrl,
      },
    );
  }

  // ========== LEGACY COMPATIBILITY ==========
  // These methods maintain backward compatibility with the old service interface

  async findLeadByPhone(phone: string): Promise<C2SLead | null> {
    try {
      const response = await this.getLeads({ phone, perpage: 1 });
      return response.data?.[0] || null;
    } catch {
      return null;
    }
  }

  async findLeadByEmail(email: string): Promise<C2SLead | null> {
    try {
      const response = await this.getLeads({ email, perpage: 1 });
      return response.data?.[0] || null;
    } catch {
      return null;
    }
  }
}
