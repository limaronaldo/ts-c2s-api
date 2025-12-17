/**
 * Enrich Endpoint Integration Tests
 * Tests for POST /enrich endpoint
 */
import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { enrichRoute } from "../../src/routes/enrich";

describe("POST /enrich", () => {
  test("validates required fields", async () => {
    const app = new Elysia().use(enrichRoute);

    // Missing required fields
    const response = await app.handle(
      new Request("http://localhost/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    // Should fail validation (422)
    expect(response.status).toBe(422);
  });

  test("requires leadId field", async () => {
    const app = new Elysia().use(enrichRoute);

    const response = await app.handle(
      new Request("http://localhost/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test User",
          phone: "11999999999",
        }),
      }),
    );

    expect(response.status).toBe(422);
  });

  test("requires name field", async () => {
    const app = new Elysia().use(enrichRoute);

    const response = await app.handle(
      new Request("http://localhost/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: "lead-123",
          phone: "11999999999",
        }),
      }),
    );

    expect(response.status).toBe(422);
  });

  test("accepts valid request body structure", async () => {
    const app = new Elysia().use(enrichRoute);

    // This will fail at runtime because DB isn't configured,
    // but it should pass validation (not 422)
    const response = await app.handle(
      new Request("http://localhost/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: "lead-123",
          name: "Test User",
          phone: "11999999999",
          email: "test@example.com",
          campaignId: "campaign-1",
          campaignName: "Test Campaign",
        }),
      }),
    );

    // Should not be a validation error (422)
    // May be 500 if DB not configured, but not 422
    expect(response.status).not.toBe(422);
  });

  test("accepts optional fields", async () => {
    const app = new Elysia().use(enrichRoute);

    // Minimal valid request - only required fields
    const response = await app.handle(
      new Request("http://localhost/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: "lead-123",
          name: "Test User",
        }),
      }),
    );

    // Should pass validation
    expect(response.status).not.toBe(422);
  });
});
