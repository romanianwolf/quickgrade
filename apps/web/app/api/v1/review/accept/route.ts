import { NextRequest, NextResponse } from 'next/server'
import { ReviewAcceptRequestSchema } from '@markov/types'
import { createLogger, generateCorrelationId } from '@markov/observability'

const logger = createLogger({ component: 'api:review-accept' })

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId()

  try {
    const body = await request.json()
    const parsed = ReviewAcceptRequestSchema.safeParse(body)

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

    const { submissionId, correctedBlocks, idempotencyKey } = parsed.data

    // In production: verify idempotency key, update submission, trigger regrade
    logger.info('Review accepted', { correlationId, submissionId, blockCount: correctedBlocks.length })

    return NextResponse.json(
      {
        data: { submissionId, status: 'grading', message: 'Review accepted, regrade triggered' },
        correlationId,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'x-correlation-id': correlationId },
      },
    )
  } catch (error) {
    logger.error('Review accept failed', error instanceof Error ? error : undefined, { correlationId })
    return NextResponse.json(
      {
        error: { code: 'REVIEW_FAILED', message: 'Internal server error' },
        correlationId,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
