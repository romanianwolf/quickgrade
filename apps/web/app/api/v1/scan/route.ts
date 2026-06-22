import { NextRequest, NextResponse } from 'next/server'
import { ScanRequestSchema } from '@markov/types'
import { scrubPii, callGoogleVision, hashSHA256 } from '@markov/core'
import { createLogger, generateCorrelationId } from '@markov/observability'
import { checkTeacherQuota } from '@markov/cache'

const logger = createLogger({ component: 'api:scan' })

const IdempotencyStore = new Map<string, { status: string; result: unknown }>()

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId()
  const startTime = Date.now()

  try {
    const body = await request.json()
    const parsed = ScanRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() },
          correlationId,
          timestamp: new Date().toISOString(),
        },
        { status: 400 },
      )
    }

    const { imageBase64, idempotencyKey } = parsed.data

    // Idempotency check
    const existing = IdempotencyStore.get(idempotencyKey)
    if (existing) {
      return NextResponse.json({ data: existing.result, correlationId, timestamp: new Date().toISOString() })
    }

    // Quota check
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    const quota = await checkTeacherQuota(`scan:${ip}`)
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: { code: 'QUOTA_EXCEEDED', message: 'Rate limit exceeded for scan requests' },
          correlationId,
          timestamp: new Date().toISOString(),
        },
        { status: 429 },
      )
    }

    // Call OCR
    logger.info('Starting OCR', { correlationId })
    const ocrResult = await callGoogleVision(imageBase64)

    // Scrub PII from OCR output
    const { hashes: piiHashes } = await scrubPii(ocrResult.blocks.map((b) => b.text).join('\n'))

    // Hash image for deduplication
    const imageHash = await hashSHA256(imageBase64)

    const submissionId = crypto.randomUUID()

    const response = {
      submissionId,
      status: ocrResult.requiresReview ? 'ocr_requires_review' : 'ocr_complete',
      ocrBlocks: ocrResult.blocks,
      requiresReview: ocrResult.requiresReview,
      processingTimeMs: Date.now() - startTime,
    }

    // Store idempotency result
    IdempotencyStore.set(idempotencyKey, { status: 'complete', result: response })

    // Audit log
    logger.info('OCR complete', {
      correlationId,
      submissionId,
      provider: ocrResult.provider,
      blockCount: ocrResult.blocks.length,
      piiDetected: Object.keys(piiHashes).length > 0,
    })

    return NextResponse.json(
      { data: response, correlationId, timestamp: new Date().toISOString() },
      {
        status: 200,
        headers: {
          'x-correlation-id': correlationId,
          'Cache-Control': 'no-store',
        },
      },
    )
  } catch (error) {
    logger.error('Scan failed', error instanceof Error ? error : undefined, { correlationId })
    return NextResponse.json(
      {
        error: {
          code: 'SCAN_FAILED',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
