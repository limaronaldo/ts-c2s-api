import { Elysia, t } from "elysia";
import { container } from "../container";
import { apiLogger } from "../utils/logger";

export const sellersRoute = new Elysia({ prefix: "/sellers" })
  .get("/", async () => {
    apiLogger.info("Fetching sellers list");

    const sellers = await container.c2s.getSellers();

    return sellers;
  })
  .get(
    "/:sellerId",
    async ({ params }) => {
      apiLogger.info({ sellerId: params.sellerId }, "Fetching seller by ID");

      // Get all sellers and find by ID (C2S doesn't have a get-by-id endpoint)
      const sellers = await container.c2s.getSellers();
      const seller = sellers.data?.find((s) => s.id === params.sellerId);

      if (!seller) {
        return {
          error: { code: "NOT_FOUND", message: "Seller not found" },
        };
      }

      return { data: seller };
    },
    {
      params: t.Object({
        sellerId: t.String(),
      }),
    },
  )
  .post(
    "/",
    async ({ body }) => {
      apiLogger.info(
        { name: body.name, email: body.email },
        "Creating new seller",
      );

      const seller = await container.c2s.createSeller({
        name: body.name,
        email: body.email,
      });

      return seller;
    },
    {
      body: t.Object({
        name: t.String(),
        email: t.String(),
      }),
    },
  )
  .put(
    "/:sellerId",
    async ({ params, body }) => {
      apiLogger.info({ sellerId: params.sellerId }, "Updating seller");

      const seller = await container.c2s.updateSeller(params.sellerId, {
        name: body.name,
        email: body.email,
      });

      return seller;
    },
    {
      params: t.Object({
        sellerId: t.String(),
      }),
      body: t.Object({
        name: t.Optional(t.String()),
        email: t.Optional(t.String()),
      }),
    },
  );
