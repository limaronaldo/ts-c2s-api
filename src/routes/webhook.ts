import { Elysia, t } from "elysia";
import { container } from "../container";
import { webhookLogger } from "../utils/logger";
import { AppError } from "../errors/app-error";
import { getConfig } from "../config";

// C2S webhook payload structure
type C2SHookAction = "on_create_lead" | "on_update_lead" | "on_close_lead";

interface C2SWebhookPayload {
  hook_action: C2SHookAction;
  lead: {
    id: string;
    internal_id?: number;
    attributes?: {
      description?: string;
      observation?: string;
      customer?: {
        id: string;
        name: string;
        email?: string;
        phone?: string;
        phone2?: string;
      };
      seller?: {
        id: string;
        name: string;
        email?: string;
      };
      lead_source?: {
        id: number;
        name: string;
      };
      lead_status?: {
        id: number;
        alias: string;
        name: string;
      };
      product?: {
        id: string;
        description: string;
      };
      created_at?: string;
      updated_at?: string;
    };
  };
}

// Google Ads webhook payload structure
interface GoogleAdsWebhookPayload {
  lead_id: string;
  campaign_id?: string;
  campaign_name?: string;
  ad_group_id?: string;
  ad_group_name?: string;
  form_id?: string;
  form_name?: string;
  gclid?: string;
  user_column_data?: Array<{
    column_id: string;
    column_name: string;
    string_value?: string;
  }>;
}

function extractUserData(payload: GoogleAdsWebhookPayload): {
  name: string;
  phone?: string;
  email?: string;
} {
  let name = "Unknown";
  let phone: string | undefined;
  let email: string | undefined;

  if (payload.user_column_data) {
    for (const column of payload.user_column_data) {
      const columnName = column.column_name.toLowerCase();
      const value = column.string_value;

      if (!value) continue;

      if (columnName.includes("name") || columnName.includes("nome")) {
        name = value;
      } else if (
        columnName.includes("phone") ||
        columnName.includes("telefone") ||
        columnName.includes("celular")
      ) {
        phone = value;
      } else if (
        columnName.includes("email") ||
        columnName.includes("e-mail")
      ) {
        email = value;
      }
    }
  }

  return { name, phone, email };
}

export const webhookRoute = new Elysia({ prefix: "/webhook" })
  // C2S Webhook Handler - receives events when leads are created/updated in C2S
  .post(
    "/c2s",
    async ({ body, headers, set }) => {
      const startTime = Date.now();
      const payload = body as C2SWebhookPayload;
      const { hook_action, lead } = payload;

      webhookLogger.info(
        { hookAction: hook_action, leadId: lead.id },
        "C2S webhook received",
      );

      // Optional: Validate webhook secret if configured
      const config = getConfig();
      const webhookSecret = headers["x-webhook-secret"];
      if (config.WEBHOOK_SECRET && webhookSecret !== config.WEBHOOK_SECRET) {
        webhookLogger.warn({ leadId: lead.id }, "Invalid webhook secret");
        set.status = 401;
        return {
          success: false,
          message: "Invalid webhook secret",
        };
      }

      // Validate hook_action
      const validActions: C2SHookAction[] = [
        "on_create_lead",
        "on_update_lead",
        "on_close_lead",
      ];
      if (!validActions.includes(hook_action)) {
        set.status = 422;
        return {
          success: false,
          message: `Invalid hook_action: ${hook_action}`,
        };
      }

      // Extract lead data
      const customer = lead.attributes?.customer;
      const seller = lead.attributes?.seller;
      const leadId = lead.id;
      const name = customer?.name || "Unknown";
      const phone = customer?.phone?.replace(/\D/g, "") || undefined;
      const email = customer?.email || undefined;
      const source = lead.attributes?.lead_source?.name || "c2s_webhook";
      const campaignName = lead.attributes?.product?.description;

      // Store lead in database IMMEDIATELY on arrival (before enrichment)
      // This ensures no lead is lost even if enrichment fails
      try {
        await container.dbStorage.upsertC2SLead({
          leadId,
          internalId: lead.internal_id,
          customerName: name,
          customerEmail: email,
          customerPhone: customer?.phone,
          customerPhoneNormalized: phone,
          sellerId: seller?.id,
          sellerName: seller?.name,
          sellerEmail: seller?.email,
          leadSource: source,
          leadStatus: lead.attributes?.lead_status?.name,
          productDescription: campaignName,
          hookAction: hook_action,
          rawPayload: payload as unknown as Record<string, unknown>,
          enrichmentStatus: "pending",
          c2sCreatedAt: lead.attributes?.created_at
            ? new Date(lead.attributes.created_at)
            : undefined,
          c2sUpdatedAt: lead.attributes?.updated_at
            ? new Date(lead.attributes.updated_at)
            : undefined,
        });
        webhookLogger.info({ leadId }, "C2S lead stored in database");
      } catch (storeErr) {
        webhookLogger.error(
          { leadId, error: storeErr },
          "Failed to store C2S lead in database (continuing with enrichment)",
        );
        // Don't fail the webhook - continue with enrichment attempt
      }

      try {
        switch (hook_action) {
          case "on_create_lead":
            // Queue enrichment asynchronously (don't block webhook response)
            setImmediate(async () => {
              try {
                // Update status to processing
                await container.dbStorage.updateC2SLeadEnrichmentStatus(
                  leadId,
                  "processing",
                );

                webhookLogger.info(
                  { leadId, name, phone },
                  "Starting async enrichment for new C2S lead",
                );

                const result = await container.enrichment.enrichLead({
                  leadId,
                  name,
                  phone,
                  email,
                  source,
                  campaignName,
                });

                // Update enrichment status based on result
                if (result.enriched) {
                  await container.dbStorage.updateC2SLeadEnrichmentStatus(
                    leadId,
                    "completed",
                    result.partyId,
                    result.cpf,
                  );
                } else {
                  await container.dbStorage.updateC2SLeadEnrichmentStatus(
                    leadId,
                    "partial",
                    result.partyId,
                    result.cpf,
                  );
                }

                webhookLogger.info(
                  { leadId, enriched: result.enriched, cpf: result.cpf },
                  "C2S lead enrichment completed",
                );
              } catch (err) {
                // Update status to failed and increment retry count
                const errorMsg =
                  err instanceof Error ? err.message : "Unknown error";
                await container.dbStorage.incrementC2SLeadRetryCount(
                  leadId,
                  errorMsg,
                );
                webhookLogger.error(
                  { leadId, error: err },
                  "C2S lead enrichment failed",
                );
              }
            });
            break;

          case "on_update_lead":
            // Check if lead needs enrichment (may have updated phone/email)
            webhookLogger.info(
              { leadId },
              "Lead updated - checking if enrichment needed",
            );

            // Queue for re-enrichment attempt
            setImmediate(async () => {
              try {
                // Check current status - skip if already completed
                const existingLead =
                  await container.dbStorage.findC2SLeadByLeadId(leadId);
                if (existingLead?.enrichmentStatus === "completed") {
                  webhookLogger.info(
                    { leadId },
                    "Lead already enriched, skipping re-enrichment",
                  );
                  return;
                }

                // Update status to processing
                await container.dbStorage.updateC2SLeadEnrichmentStatus(
                  leadId,
                  "processing",
                );

                const result = await container.enrichment.enrichLead({
                  leadId,
                  name,
                  phone,
                  email,
                  source,
                  campaignName,
                });

                // Update enrichment status based on result
                if (result.enriched) {
                  await container.dbStorage.updateC2SLeadEnrichmentStatus(
                    leadId,
                    "completed",
                    result.partyId,
                    result.cpf,
                  );
                } else {
                  await container.dbStorage.updateC2SLeadEnrichmentStatus(
                    leadId,
                    "partial",
                    result.partyId,
                    result.cpf,
                  );
                }

                webhookLogger.info(
                  { leadId, enriched: result.enriched },
                  "C2S lead update enrichment completed",
                );
              } catch (err) {
                // Update status to failed and increment retry count
                const errorMsg =
                  err instanceof Error ? err.message : "Unknown error";
                await container.dbStorage.incrementC2SLeadRetryCount(
                  leadId,
                  errorMsg,
                );
                webhookLogger.error(
                  { leadId, error: err },
                  "C2S lead update enrichment failed",
                );
              }
            });
            break;

          case "on_close_lead":
            // Log for analytics, no enrichment needed
            webhookLogger.info(
              {
                leadId,
                status: lead.attributes?.lead_status?.name,
              },
              "C2S lead closed",
            );
            break;
        }

        const duration = Date.now() - startTime;
        webhookLogger.info({ leadId, duration }, "C2S webhook processed");

        return {
          success: true,
          message: "Webhook received",
          lead_id: leadId,
          enrichment_status:
            hook_action === "on_close_lead" ? undefined : "queued",
        };
      } catch (error) {
        webhookLogger.error({ leadId, error }, "C2S webhook processing error");
        set.status = 500;
        return {
          success: false,
          message: "Internal server error",
          lead_id: leadId,
        };
      }
    },
    {
      body: t.Object({
        hook_action: t.String(),
        lead: t.Object({
          id: t.String(),
          internal_id: t.Optional(t.Number()),
          attributes: t.Optional(
            t.Object({
              description: t.Optional(t.String()),
              observation: t.Optional(t.String()),
              customer: t.Optional(
                t.Object({
                  id: t.String(),
                  name: t.String(),
                  email: t.Optional(t.String()),
                  phone: t.Optional(t.String()),
                  phone2: t.Optional(t.String()),
                }),
              ),
              seller: t.Optional(
                t.Object({
                  id: t.String(),
                  name: t.String(),
                  email: t.Optional(t.String()),
                }),
              ),
              lead_source: t.Optional(
                t.Object({
                  id: t.Number(),
                  name: t.String(),
                }),
              ),
              lead_status: t.Optional(
                t.Object({
                  id: t.Number(),
                  alias: t.String(),
                  name: t.String(),
                }),
              ),
              product: t.Optional(
                t.Object({
                  id: t.String(),
                  description: t.String(),
                }),
              ),
              created_at: t.Optional(t.String()),
              updated_at: t.Optional(t.String()),
            }),
          ),
        }),
      }),
    },
  )
  // Google Ads Webhook Handler
  .post(
    "/google-ads",
    async ({ body, headers }) => {
      const payload = body as GoogleAdsWebhookPayload;

      webhookLogger.info(
        { leadId: payload.lead_id, campaignName: payload.campaign_name },
        "Google Ads webhook received",
      );

      // Check for idempotency
      const existingEvent = await container.dbStorage.findWebhookEvent(
        payload.lead_id,
      );
      if (existingEvent) {
        webhookLogger.info(
          { leadId: payload.lead_id },
          "Webhook event already processed",
        );
        return {
          data: {
            status: "already_processed",
            eventId: existingEvent.id,
          },
        };
      }

      // Create webhook event record
      const event = await container.dbStorage.createWebhookEvent({
        externalId: payload.lead_id,
        source: "google_ads",
        eventType: "lead",
        payload: payload as unknown as Record<string, unknown>,
        status: "processing",
      });

      try {
        // Extract user data from columns
        const { name, phone, email } = extractUserData(payload);

        // Store the lead
        await container.dbStorage.upsertGoogleAdsLead({
          leadId: payload.lead_id,
          name,
          phone,
          email,
          campaignId: payload.campaign_id,
          campaignName: payload.campaign_name,
          adGroupId: payload.ad_group_id,
          adGroupName: payload.ad_group_name,
          formId: payload.form_id,
          formName: payload.form_name,
          gclidValue: payload.gclid,
          rawData: payload as unknown as Record<string, unknown>,
          enrichmentStatus: "processing",
        });

        // Run enrichment
        const result = await container.enrichment.enrichLead({
          leadId: payload.lead_id,
          name,
          phone,
          email,
          campaignId: payload.campaign_id,
          campaignName: payload.campaign_name,
          source: "google_ads",
          rawData: payload as unknown as Record<string, unknown>,
        });

        // Update webhook event status
        await container.dbStorage.updateWebhookEventStatus(
          event.id,
          "completed",
        );

        webhookLogger.info(
          { leadId: payload.lead_id, enriched: result.enriched },
          "Webhook processed successfully",
        );

        return {
          data: {
            status: "processed",
            eventId: event.id,
            enrichmentResult: result,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        await container.dbStorage.updateWebhookEventStatus(
          event.id,
          "failed",
          errorMessage,
        );

        webhookLogger.error(
          { leadId: payload.lead_id, error },
          "Webhook processing failed",
        );

        throw AppError.internal("Failed to process webhook");
      }
    },
    {
      body: t.Object({
        lead_id: t.String(),
        campaign_id: t.Optional(t.String()),
        campaign_name: t.Optional(t.String()),
        ad_group_id: t.Optional(t.String()),
        ad_group_name: t.Optional(t.String()),
        form_id: t.Optional(t.String()),
        form_name: t.Optional(t.String()),
        gclid: t.Optional(t.String()),
        user_column_data: t.Optional(
          t.Array(
            t.Object({
              column_id: t.String(),
              column_name: t.String(),
              string_value: t.Optional(t.String()),
            }),
          ),
        ),
      }),
    },
  );
