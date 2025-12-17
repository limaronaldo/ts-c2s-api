import { Elysia } from 'elysia'

export const healthRoute = new Elysia().get('/health', () => ({
  status: 'ok',
  timestamp: new Date().toISOString(),
  version: process.env.npm_package_version || '1.0.0',
}))
