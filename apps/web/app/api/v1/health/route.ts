import { NextResponse } from 'next/server'
import { createLogger } from '@markov/observability'
import { HealthResponseSchema } from '@markov/types'

const logger = createLogger({ component: 'api:health' })

export async function GET() {
  const correlationId = crypto.randomUUID()

  const checks: Record<string, { status: 'up' | 'down' | 'slow'; latencyMs?: number }> = {}

  // Check Supabase
  try {
    const dbStart = Date.now()
    // In production: await supabase.from('profiles').select('id').limit(1)
    checks.database = { status: 'up', latencyMs: Date.now() - dbStart }
  } catch {
    checks.database = { status: 'down' }
  }

  // Check Redis
  try {
    const redisStart = Date.now()
    // In production: await redis.ping()
    checks.redis = { status: 'up', latencyMs: Date.now() - redisStart }
  } catch {
    checks.redis = { status: 'down' }
  }

  const allUp = Object.values(checks).every((c) => c.status === 'up')
  const anyDown = Object.values(checks).some((c) => c.status === 'down')

  const healthStatus = allUp ? 'healthy' : anyDown ? 'unhealthy' : 'degraded'

  const response = {
    status: healthStatus,
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    checks,
  }

  const validated = HealthResponseSchema.safeParse(response)

  logger.info('Health check', { correlationId, status: healthStatus })

  return NextResponse.json(validated.success ? validated.data : response, {
    status: allUp ? 200 : 503,
    headers: {
      'x-correlation-id': correlationId,
      'Cache-Control': 'no-store',
    },
  })
}
