import { Receiver } from '@upstash/qstash'
import { createLogger, generateCorrelationId } from '@markov/observability'
import { processOcrJob } from './jobs/ocr-processor'
import { processGradingJob } from './jobs/ai-grader'

const logger = createLogger({ component: 'worker' })

const qstashReceiver = new Receiver({
  currentSigningKey: process.env['QSTASH_CURRENT_SIGNING_KEY'] ?? '',
  nextSigningKey: process.env['QSTASH_NEXT_SIGNING_KEY'] ?? '',
})

export interface JobPayload {
  type: 'ocr' | 'grading'
  submissionId: string
  correlationId: string
  data: Record<string, unknown>
}

async function handleRequest(request: Request): Promise<Response> {
  const correlationId = generateCorrelationId()

  try {
    const body = await request.text()
    const signature = request.headers.get('upstash-signature') ?? ''

    // Verify QStash signature
    const isValid = await qstashReceiver.verify({
      body,
      signature,
    })

    if (!isValid) {
      logger.warn('Invalid QStash signature', { correlationId })
      return new Response('Unauthorized', { status: 401 })
    }

    const payload = JSON.parse(body) as JobPayload
    logger.info('Processing job', { correlationId, type: payload.type, submissionId: payload.submissionId })

    switch (payload.type) {
      case 'ocr':
        await processOcrJob(payload)
        break
      case 'grading':
        await processGradingJob(payload)
        break
      default:
        logger.warn('Unknown job type', { correlationId, type: payload.type })
    }

    return new Response('OK', { status: 200 })
  } catch (error) {
    logger.error('Job processing failed', error instanceof Error ? error : undefined, { correlationId })
    return new Response('Error', { status: 500 })
  }
}

// Bun/Node server
const PORT = parseInt(process.env['WORKER_PORT'] ?? '3001', 10)

if (typeof Bun !== 'undefined') {
  Bun.serve({ port: PORT, fetch: handleRequest })
  logger.info(`Worker started on port ${PORT}`)
} else {
  const http = await import('node:http')
  const server = http.createServer(async (req, res) => {
    const body = await new Promise<string>((resolve) => {
      let data = ''
      req.on('data', (chunk: Buffer) => (data += chunk.toString()))
      req.on('end', () => resolve(data))
    })

    const request = new Request(`http://localhost:${PORT}${req.url ?? '/'}`, {
      method: req.method,
      headers: Object.fromEntries(
        Object.entries(req.headers)
          .filter(([k]) => typeof k === 'string')
          .map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v ?? ''] as [string, string])
      ),
      body: req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined,
    })

    const response = await handleRequest(request)
    res.writeHead(response.status, Object.fromEntries(response.headers))
    res.end(await response.text())
  })

  server.listen(PORT, () => {
    logger.info(`Worker started on port ${PORT}`)
  })
}
