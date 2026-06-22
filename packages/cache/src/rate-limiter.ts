import { Redis } from '@upstash/redis';

export class TokenBucketLimiter {
  constructor(
    private redis: Redis,
    private maxTokens: number,
    private refillRatePerMs: number,
    private keyPrefix = 'rl:'
  ) {}

  async consume(key: string, tokens = 1): Promise<{ allowed: boolean; remaining: number }> {
    const bucketKey = `${this.keyPrefix}${key}`;
    const now = Date.now();

    const script = `
      local key = KEYS[1]
      local max = tonumber(ARGV[1])
      local rate = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local requested = tonumber(ARGV[4])
      
      local bucket = redis.call('HMGET', key, 'tokens', 'last_refill')
      local tokens = tonumber(bucket[1]) or max
      local last_refill = tonumber(bucket[2]) or now
      
      local elapsed = now - last_refill
      tokens = math.min(max, tokens + (elapsed * rate))
      
      local allowed = tokens >= requested
      if allowed then tokens = tokens - requested end
      
      redis.call('HMSET', key, 'tokens', tokens, 'last_refill', now)
      redis.call('EXPIRE', key, 3600)
      
      return { allowed and 1 or 0, math.floor(tokens) }
    `;

    const [allowed, remaining] = await this.redis.eval(
      script,
      [bucketKey],
      [this.maxTokens, this.refillRatePerMs, now, tokens]
    ) as [number, number];

    return { allowed: allowed === 1, remaining };
  }
}

export function createRateLimiter(redis: Redis) {
  return {
    scan: new TokenBucketLimiter(redis, 30, 0.5 / 1000, 'rl:scan:'),
    grade: new TokenBucketLimiter(redis, 20, 0.33 / 1000, 'rl:grade:'),
    general: new TokenBucketLimiter(redis, 100, 1 / 1000, 'rl:general:'),
  };
}