import { z } from 'zod'

const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DB_URL: z.string().min(1, 'DB_URL is required'),

  // C2S API
  C2S_TOKEN: z.string().min(1, 'C2S_TOKEN is required'),
  C2S_URL: z.string().url().default('https://c2s.com.br/api/v1'),

  // Work API (Completa Buscas)
  WORK_API: z.string().min(1, 'WORK_API is required'),
  WORK_API_URL: z.string().url().default('https://api.completabuscas.com.br'),

  // Diretrix API
  DIRETRIX_USER: z.string().min(1, 'DIRETRIX_USER is required'),
  DIRETRIX_PASS: z.string().min(1, 'DIRETRIX_PASS is required'),
  DIRETRIX_URL: z.string().url().default('https://api.diretrix.com.br'),

  // DBase API (fallback)
  DBASE_TOKEN: z.string().min(1, 'DBASE_TOKEN is required'),
  DBASE_URL: z.string().url().default('https://dfraud.dfraud.com.br'),

  // Mimir API (Azure IBVI fallback)
  MIMIR_TOKEN: z.string().min(1, 'MIMIR_TOKEN is required'),
  MIMIR_URL: z.string().url().default('https://ibvi-mimir.azurewebsites.net'),

  // Webhook secret for verification
  WEBHOOK_SECRET: z.string().optional(),

  // Income multiplier (default 1.9x as per Rust implementation)
  INCOME_MULTIPLIER: z.coerce.number().default(1.9),
})

export type Config = z.infer<typeof configSchema>

let cachedConfig: Config | null = null

export function getConfig(): Config {
  if (cachedConfig) return cachedConfig

  const result = configSchema.safeParse(process.env)

  if (!result.success) {
    const errors = result.error.format()
    console.error('Configuration validation failed:', JSON.stringify(errors, null, 2))
    throw new Error(`Invalid configuration: ${result.error.message}`)
  }

  cachedConfig = result.data
  return cachedConfig
}

export function hasFullConfig(): boolean {
  const required = ['DB_URL', 'C2S_TOKEN', 'WORK_API', 'DIRETRIX_USER', 'DIRETRIX_PASS', 'DBASE_TOKEN', 'MIMIR_TOKEN']
  return required.every((key) => process.env[key])
}
