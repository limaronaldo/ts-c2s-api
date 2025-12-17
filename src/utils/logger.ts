import pino from 'pino'

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug')

export const logger = pino({
  level,
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
})

// Child loggers for different modules
export const dbLogger = logger.child({ module: 'db' })
export const apiLogger = logger.child({ module: 'api' })
export const enrichmentLogger = logger.child({ module: 'enrichment' })
export const webhookLogger = logger.child({ module: 'webhook' })
export const workApiLogger = logger.child({ module: 'work-api' })
export const diretrixLogger = logger.child({ module: 'diretrix' })
export const dbaseLogger = logger.child({ module: 'dbase' })
export const mimirLogger = logger.child({ module: 'mimir' })
export const c2sLogger = logger.child({ module: 'c2s' })
