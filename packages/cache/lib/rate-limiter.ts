import { Ratelimit } from '@upstash/ratelimit'
import { getRedis } from './redis'
import { createLogger } from '@markov/observability'

const logger = createLogger({ component: 'rate-limiter' })

const limiters = new Map<string, Ratelimit>()

function getLimiter(
  windowMs: number,
  maxRequests: number,
): Ratelimit {
  const key = `${windowMs}:${maxRequests}`
  if (limiters.has(key)) return limiters.get(key)!

  const limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
    analytics: true,
    prefix: 'markov:ratelimit',
  })

  limiters.set(key, limiter)
  return limiter
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  reset: number
  limit: number
}

export async function checkRateLimit(
  identifier: string,
  windowMs: number = 60_000,
  maxRequests: number = 5,
): Promise<RateLimitResult> {
  try {
    const limiter = getLimiter(windowMs, maxRequests)
    const result = await limiter.limit(identifier)

    if (!result.success) {
      logger.warn('Rate limit exceeded', { identifier, limit: maxRequests })
    }

    return {
      allowed: result.success,
      remaining: result.remaining,
      reset: result.reset,
      limit: maxRequests,
    }
  } catch (error) {
    logger.error('Rate limit check failed', error instanceof Error ? error : undefined)
    return { allowed: true, remaining: maxRequests, reset: Date.now() + windowMs, limit: maxRequests }
  }
}

export async function checkStudentQuota(
  studentId: string,
  dailyLimit: number = 100,
): Promise<RateLimitResult> {
  const today = new Date().toISOString().split('T')[0]
  const key = `student:${studentId}:${today}`
  return checkRateLimit(key, 86_400_000, dailyLimit)
}

export async function checkTeacherQuota(
  teacherId: string,
  minuteLimit: number = 5,
): Promise<RateLimitResult> {
  const key = `teacher:${teacherId}`
  return checkRateLimit(key, 60_000, minuteLimit)
}
