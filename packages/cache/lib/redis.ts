import { Redis } from '@upstash/redis'
import { createLogger } from '@markov/observability'

const logger = createLogger({ component: 'redis' })

let redisInstance: Redis | null = null

export function getRedis(): Redis {
  if (redisInstance) return redisInstance

  const url = process.env['UPSTASH_REDIS_REST_URL']
  const token = process.env['UPSTASH_REDIS_REST_TOKEN']

  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required')
  }

  redisInstance = new Redis({ url, token })
  logger.info('Redis client initialized')
  return redisInstance
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const redis = getRedis()
    const value = await redis.get<T>(key)
    return value
  } catch (error) {
    logger.warn('Cache get failed', { key, error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number = 3600,
): Promise<void> {
  try {
    const redis = getRedis()
    await redis.set(key, value, { ex: ttlSeconds })
  } catch (error) {
    logger.warn('Cache set failed', { key, error: error instanceof Error ? error.message : String(error) })
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    const redis = getRedis()
    await redis.del(key)
  } catch (error) {
    logger.warn('Cache delete failed', { key, error: error instanceof Error ? error.message : String(error) })
  }
}

export function buildCacheKey(...parts: string[]): string {
  return `markov:${parts.join(':')}`
}

export function buildContentHashKey(prefix: string, content: string): string {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)
  let hash = 0
  for (let i = 0; i < data.length; i++) {
    const char = data[i] ?? 0
    hash = ((hash << 5) - hash + char) | 0
  }
  return buildCacheKey(prefix, Math.abs(hash).toString(36))
}
