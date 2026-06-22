import { NextRequest, NextResponse } from 'next/server'
import { callGoogleVision, scrubPii, callSmartGrading, calculateWeightedTotal } from '@markov/core'
import { createLogger, generateCorrelationId } from '@markov/observability'

const logger = createLogger({ component: 'api:demo' })

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId()
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { imageBase64 } = body as { imageBase64?: string }

    if (!imageBase64) {
      return NextResponse.json(
        { success: false, error: 'imageBase64 is required' },
        { status: 400 },
      )
    }

    logger.info('Demo grading started', { correlationId })

    // Step 1: OCR with Google Vision
    const ocrResult = await callGoogleVision(imageBase64)
    const ocrText = ocrResult.rawText

    logger.info('OCR complete', { correlationId, blocks: ocrResult.blocks.length })

    // Step 2: PII scrub
    const { scrubbed } = await scrubPii(ocrText)

    // Step 3: Smart grading (searches Google if no rubric)
    const gradeResponse = await callSmartGrading({
      studentText: scrubbed,
      criteria: [
        { name: 'Content Accuracy', maxPoints: 30, instructions: 'Factual correctness of answers' },
        { name: 'Completeness', maxPoints: 25, instructions: 'How thoroughly questions are answered' },
        { name: 'Clarity', maxPoints: 25, instructions: 'Clear and organized responses' },
        { name: 'Understanding', maxPoints: 20, instructions: 'Demonstrates grasp of concepts' },
      ],
      promptVersion: 'v3.0.0',
    })

    // Step 4: Calculate totals
    const criteria = [
      { name: 'Content Accuracy', maxPoints: 30 },
      { name: 'Completeness', maxPoints: 25 },
      { name: 'Clarity', maxPoints: 25 },
      { name: 'Understanding', maxPoints: 20 },
    ]

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

    const processingTimeMs = Date.now() - startTime

    logger.info('Demo grading complete', {
      correlationId,
      percentage,
      answerSource: gradeResponse.answerSource,
      processingTimeMs,
    })

    return NextResponse.json({
      success: true,
      ocrText,
      grades: gradeResponse.scores.map((s, i) => ({
        criterionName: s.criterionName,
        score: s.score,
        maxPoints: criteria[i]?.maxPoints ?? 100,
        feedback: s.feedback,
        confidence: s.confidence,
      })),
      totalScore,
      totalMaxPoints,
      percentage,
      overallFeedback: gradeResponse.overallFeedback,
      answerSource: gradeResponse.answerSource,
      processingTimeMs,
    })
  } catch (error) {
    logger.error('Demo grading failed', error instanceof Error ? error : undefined, { correlationId })
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
