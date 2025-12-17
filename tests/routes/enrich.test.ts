/**
 * Enrich Endpoint Integration Tests
 * TSC-29: Integration tests for /enrich endpoints
 */
import { describe, expect, test, mock, beforeEach } from 'bun:test'
import { Elysia } from 'elysia'

// Mock the container before importing the route
const mockEnrichmentService = {
  enrichLead: mock(() => Promise.resolve({
    leadId: 'lead-123',
    success: true,
    cpf: '12345678909',
    cpfSource: 'dbase',
    enriched: true,
    skipped: false,
    descriptionLength: 500
  }))
}

const mockC2SService = {
  fetchLead: mock(() => Promise.resolve({
    id: 'lead-123',
    type: 'leads',
    attributes: {
      name: 'João Silva',
      phone: '11987654321',
      email: 'joao@example.com'
    }
  }))
}

// Mock the container module
mock.module('../../src/container', () => ({
  getContainer: () => ({
    enrichment: mockEnrichmentService,
    c2s: mockC2SService
  })
}))

describe('POST /enrich/lead/:id', () => {
  beforeEach(() => {
    mockEnrichmentService.enrichLead.mockReset()
    mockC2SService.fetchLead.mockReset()

    mockC2SService.fetchLead.mockResolvedValue({
      id: 'lead-123',
      type: 'leads',
      attributes: {
        name: 'João Silva',
        phone: '11987654321'
      }
    })

    mockEnrichmentService.enrichLead.mockResolvedValue({
      leadId: 'lead-123',
      success: true,
      cpf: '12345678909',
      cpfSource: 'dbase',
      enriched: true,
      skipped: false,
      descriptionLength: 500
    })
  })

  test('enriches a valid lead successfully', async () => {
    // Import route after mocking
    const { enrichRoute } = await import('../../src/routes/enrich')
    const app = new Elysia().use(enrichRoute)

    const response = await app.handle(
      new Request('http://localhost/enrich/lead/lead-123', {
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data.enriched).toBe(true)
  })

  test('returns 404 for non-existent lead', async () => {
    mockC2SService.fetchLead.mockResolvedValueOnce(null)

    const { enrichRoute } = await import('../../src/routes/enrich')
    const app = new Elysia().use(enrichRoute)

    const response = await app.handle(
      new Request('http://localhost/enrich/lead/nonexistent', {
        method: 'POST'
      })
    )

    expect(response.status).toBe(404)
  })

  test('returns enrichment details in response', async () => {
    const { enrichRoute } = await import('../../src/routes/enrich')
    const app = new Elysia().use(enrichRoute)

    const response = await app.handle(
      new Request('http://localhost/enrich/lead/lead-123', {
        method: 'POST'
      })
    )

    const body = await response.json()
    expect(body.data).toHaveProperty('leadId')
    expect(body.data).toHaveProperty('cpf')
    expect(body.data).toHaveProperty('cpfSource')
    expect(body.data).toHaveProperty('enriched')
    expect(body.data).toHaveProperty('descriptionLength')
  })
})

describe('POST /enrich/batch', () => {
  beforeEach(() => {
    mockEnrichmentService.enrichLead.mockReset()
    mockC2SService.fetchLead.mockReset()
  })

  test('validates request body structure', async () => {
    const { enrichRoute } = await import('../../src/routes/enrich')
    const app = new Elysia().use(enrichRoute)

    // Missing leadIds array
    const response = await app.handle(
      new Request('http://localhost/enrich/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
    )

    // Should fail validation
    expect(response.status).toBe(422)
  })

  test('accepts valid batch request', async () => {
    mockC2SService.fetchLead.mockResolvedValue({
      id: 'lead-1',
      type: 'leads',
      attributes: { name: 'Test', phone: '11987654321' }
    })

    mockEnrichmentService.enrichLead.mockResolvedValue({
      leadId: 'lead-1',
      success: true,
      enriched: true,
      skipped: false
    })

    const { enrichRoute } = await import('../../src/routes/enrich')
    const app = new Elysia().use(enrichRoute)

    const response = await app.handle(
      new Request('http://localhost/enrich/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadIds: ['lead-1', 'lead-2'],
          concurrency: 2
        })
      })
    )

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body).toHaveProperty('summary')
    expect(body).toHaveProperty('results')
  })

  test('enforces max 100 leads limit', async () => {
    const { enrichRoute } = await import('../../src/routes/enrich')
    const app = new Elysia().use(enrichRoute)

    const leadIds = Array(101).fill(null).map((_, i) => `lead-${i}`)

    const response = await app.handle(
      new Request('http://localhost/enrich/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds })
      })
    )

    expect(response.status).toBe(422) // Validation error
  })

  test('returns summary with counts', async () => {
    mockC2SService.fetchLead.mockResolvedValue({
      id: 'lead-1',
      type: 'leads',
      attributes: { name: 'Test', phone: '11987654321' }
    })

    mockEnrichmentService.enrichLead
      .mockResolvedValueOnce({ leadId: 'lead-1', success: true, enriched: true, skipped: false })
      .mockResolvedValueOnce({ leadId: 'lead-2', success: true, enriched: false, skipped: true, skipReason: 'recently_enriched' })

    const { enrichRoute } = await import('../../src/routes/enrich')
    const app = new Elysia().use(enrichRoute)

    const response = await app.handle(
      new Request('http://localhost/enrich/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: ['lead-1', 'lead-2'] })
      })
    )

    const body = await response.json()
    expect(body.summary).toHaveProperty('total')
    expect(body.summary).toHaveProperty('enriched')
    expect(body.summary).toHaveProperty('skipped')
    expect(body.summary).toHaveProperty('failed')
  })
})
