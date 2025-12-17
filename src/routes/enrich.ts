import { Elysia, t } from "elysia";
import { container } from "../container";
import { apiLogger } from "../utils/logger";

export const enrichRoute = new Elysia({ prefix: "/enrich" }).post(
  "/",
  async ({ body }) => {
    apiLogger.info(
      { leadId: body.leadId, name: body.name },
      "Enrichment request received",
    );

    // Store the lead first
    await container.dbStorage.upsertGoogleAdsLead({
      leadId: body.leadId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      campaignId: body.campaignId,
      campaignName: body.campaignName,
      rawData: body.rawData,
      enrichmentStatus: "processing",
    });

    // Run enrichment
    const result = await container.enrichment.enrichLead({
      leadId: body.leadId,
      name: body.name,
      phone: body.phone,
      email: body.email,
      campaignId: body.campaignId,
      campaignName: body.campaignName,
      source: body.source,
      rawData: body.rawData,
    });

    return { data: result };
  },
  {
    body: t.Object({
      leadId: t.String(),
      name: t.String(),
      phone: t.Optional(t.String()),
      email: t.Optional(t.String()),
      campaignId: t.Optional(t.String()),
      campaignName: t.Optional(t.String()),
      source: t.Optional(t.String()),
      rawData: t.Optional(t.Record(t.String(), t.Unknown())),
    }),
  },
);
