import { NextRequest, NextResponse } from 'next/server'
import { GradeRequestSchema } from '@markov/types'
import { scrubPii, callSmartGrading, calculateWeightedTotal } from '@markov/core'
import { createLogger, generateCorrelationId } from '@markov/observability'
import { checkTeacherQuota } from '@markov/cache'

const logger = createLogger({ component: 'api:grade' })

const IdempotencyStore = new Map<string, { status: string; result: unknown }>()

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId()
  const startTime = Date.now()

  try {
    const body = await request.json()
    const parsed = GradeRequestSchema.safeParse(body)

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

    const { submissionId, rubricId, idempotencyKey } = parsed.data

    // Idempotency check
    const existing = IdempotencyStore.get(idempotencyKey)
    if (existing) {
      return NextResponse.json({ data: existing.result, correlationId, timestamp: new Date().toISOString() })
    }

    // Quota check
    const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
    const quota = await checkTeacherQuota(`grade:${ip}`)
    if (!quota.allowed) {
      return NextResponse.json(
        {
          error: { code: 'QUOTA_EXCEEDED', message: 'Rate limit exceeded for grading' },
          correlationId,
          timestamp: new Date().toISOString(),
        },
        { status: 429 },
      )
    }

    // In production: fetch submission and rubric from DB
    // For now, mock the data flow
    const studentText = 'Mock student submission text for grading'
    const criteria = [
      { name: 'Thesis', maxPoints: 25, instructions: 'Clarity and strength of thesis statement' },
      { name: 'Evidence', maxPoints: 30, instructions: 'Use of supporting evidence' },
      { name: 'Writing', maxPoints: 25, instructions: 'Grammar, spelling, and style' },
      { name: 'Structure', maxPoints: 20, instructions: 'Organization and flow' },
    ]

    // Scrub PII before AI call
    const { scrubbed } = await scrubPii(studentText)

    // Smart grading — searches Google for answers if no rubric provided
    const gradeResponse = await callSmartGrading({
      studentText: scrubbed,
      rubricTitle: 'Essay Grading Rubric',
      criteria,
      promptVersion: 'v3.0.0',
    })

    const scores = gradeResponse.scores.map((s) => {
      const matched = criteria.find((c) => c.name === s.criterionName)
      return {
        criterionId: crypto.randomUUID(),
        criterionName: s.criterionName,
        score: s.score,
        maxPoints: matched?.maxPoints ?? 100,
        weight: 1,
        feedback: s.feedback,
        confidence: s.confidence,
      }
    })

    const { totalScore, totalMaxPoints, percentage } = calculateWeightedTotal({ scores })

    const gradeResult = {
      id: crypto.randomUUID(),
      submissionId,
      scores,
      totalScore,
      totalMaxPoints,
      percentage,
      aiModel: 'llama-3.3-70b-versatile',
      aiProvider: gradeResponse.provider,
      promptVersion: 'v3.0.0',
      processingTimeMs: Date.now() - startTime,
      overallFeedback: gradeResponse.overallFeedback,
      createdAt: new Date().toISOString(),
      // Smart grading metadata
      usedAnswerScheme: gradeResponse.usedAnswerScheme,
      answerSource: gradeResponse.answerSource,
    }

    // Store idempotency result
    IdempotencyStore.set(idempotencyKey, { status: 'complete', result: { gradeResult } })

    logger.info('Grading complete', {
      correlationId,
      submissionId,
      provider: gradeResponse.provider,
      percentage,
      answerSource: gradeResponse.answerSource,
    })

    return NextResponse.json(
      { data: { gradeResult, processingTimeMs: gradeResult.processingTimeMs }, correlationId, timestamp: new Date().toISOString() },
      {
        status: 200,
        headers: { 'x-correlation-id': correlationId, 'Cache-Control': 'no-store' },
      },
    )
  } catch (error) {
    logger.error('Grading failed', error instanceof Error ? error : undefined, { correlationId })
    return NextResponse.json(
      {
        error: {
          code: 'GRADING_FAILED',
          message: error instanceof Error ? error.message : 'Internal server error',
        },
        correlationId,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
