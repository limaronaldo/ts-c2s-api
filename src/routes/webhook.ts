import { Elysia, t } from "elysia";
import { container } from "../container";
import { webhookLogger } from "../utils/logger";
import { AppError } from "../errors/app-error";

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

export const webhookRoute = new Elysia({ prefix: "/webhook" }).post(
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
      await container.dbStorage.updateWebhookEventStatus(event.id, "completed");

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
