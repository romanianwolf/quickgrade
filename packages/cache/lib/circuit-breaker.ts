import { createLogger } from '@markov/observability'

const logger = createLogger({ component: 'circuit-breaker' })

export type CircuitState = 'closed' | 'open' | 'half-open'

export interface CircuitBreakerOptions {
  failureThreshold: number
  recoveryTimeoutMs: number
  monitorIntervalMs?: number
}

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failureCount = 0
  private lastFailureTime = 0
  private readonly failureThreshold: number
  private readonly recoveryTimeoutMs: number

  constructor(private name: string, options: CircuitBreakerOptions) {
    this.failureThreshold = options.failureThreshold
    this.recoveryTimeoutMs = options.recoveryTimeoutMs
  }

  getState(): CircuitState {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime
      if (elapsed >= this.recoveryTimeoutMs) {
        this.state = 'half-open'
        logger.info(`Circuit breaker ${this.name} transitioning to half-open`)
      }
    }
    return this.state
  }

  async execute<T>(fn: () => Promise<T>, fallback?: () => Promise<T>): Promise<T> {
    const state = this.getState()

    if (state === 'open') {
      logger.warn(`Circuit breaker ${this.name} is OPEN, rejecting call`)
      if (fallback) return fallback()
      throw new Error(`Circuit breaker ${this.name} is open`)
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      if (fallback) {
        logger.info(`Circuit breaker ${this.name} call failed, using fallback`)
        return fallback()
      }
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0
    if (this.state === 'half-open') {
      this.state = 'closed'
      logger.info(`Circuit breaker ${this.name} recovered, state: closed`)
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open'
      logger.warn(`Circuit breaker ${this.name} tripped after ${this.failureCount} failures, state: open`)
    }
  }

  reset(): void {
    this.state = 'closed'
    this.failureCount = 0
  }
}

export function createCircuitBreaker(
  name: string,
  options: CircuitBreakerOptions = {
    failureThreshold: 5,
    recoveryTimeoutMs: 60_000,
  },
): CircuitBreaker {
  return new CircuitBreaker(name, options)
}
