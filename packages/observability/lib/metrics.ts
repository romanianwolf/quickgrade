export interface MetricEntry {
  name: string
  value: number
  tags?: Record<string, string>
  timestamp: number
}

class MetricsCollector {
  private buffer: MetricEntry[] = []
  private flushInterval: ReturnType<typeof setInterval> | null = null

  increment(name: string, tags?: Record<string, string>): void {
    this.record(name, 1, tags)
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.record(name, value, tags)
  }

  timing(name: string, durationMs: number, tags?: Record<string, string>): void {
    this.record(name, durationMs, tags)
  }

  private record(name: string, value: number, tags?: Record<string, string>): void {
    this.buffer.push({
      name,
      value,
      tags,
      timestamp: Date.now(),
    })
  }

  async flush(): Promise<MetricEntry[]> {
    const entries = this.buffer.splice(0)
    return entries
  }

  startAutoFlush(intervalMs: number = 30_000): void {
    if (this.flushInterval) return
    this.flushInterval = setInterval(() => {
      void this.flush()
    }, intervalMs)
  }

  stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
      this.flushInterval = null
    }
  }
}

export const metrics = new MetricsCollector()
