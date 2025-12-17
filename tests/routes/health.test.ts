/**
 * Health Endpoint Integration Tests
 * TSC-29: Integration tests for /health endpoint
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { healthRoute } from "../../src/routes/health";

describe("GET /health", () => {
  let app: Elysia;

  beforeAll(() => {
    app = new Elysia().use(healthRoute);
  });

  test("returns 200 OK", async () => {
    const response = await app.handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
  });

  test("returns correct JSON structure", async () => {
    const response = await app.handle(new Request("http://localhost/health"));

    const body = await response.json();

    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("service");
    expect(body).toHaveProperty("timestamp");
  });

  test("status is healthy", async () => {
    const response = await app.handle(new Request("http://localhost/health"));

    const body = await response.json();

    expect(body.status).toBe("healthy");
  });

  test("service name is correct", async () => {
    const response = await app.handle(new Request("http://localhost/health"));

    const body = await response.json();

    expect(body.service).toBe("ts-c2s-api");
  });

  test("timestamp is valid ISO string", async () => {
    const response = await app.handle(new Request("http://localhost/health"));

    const body = await response.json();
    const timestamp = new Date(body.timestamp);

    expect(timestamp.toString()).not.toBe("Invalid Date");
  });

  test("content-type is application/json", async () => {
    const response = await app.handle(new Request("http://localhost/health"));

    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });
});
