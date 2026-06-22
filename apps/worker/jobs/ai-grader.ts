import { callGroqGrading, calculateWeightedTotal, scrubPii } from '@markov/core'
import { createLogger } from '@markov/observability'
import type { JobPayload } from '../index'

const logger = createLogger({ component: 'ai-grader' })

export async function processGradingJob(payload: JobPayload): Promise<void> {
  const { submissionId, correlationId, data } = payload
  const studentText = data['studentText'] as string
  const rubricTitle = data['rubricTitle'] as string
  const criteria = data['criteria'] as Array<{ name: string; maxPoints: number; instructions?: string }>
  const gradingInstructions = data['gradingInstructions'] as string | undefined

  if (!studentText || !criteria) {
    throw new Error('studentText and criteria are required for grading job')
  }

  logger.info('Processing grading job', { correlationId, submissionId })

  // Step 1: PII scrub
  const { scrubbed } = await scrubPii(studentText)

  // Step 2: Call AI grading
  const gradeResponse = await callGroqGrading({
    studentText: scrubbed,
    rubricTitle,
    criteria,
    gradingInstructions,
    promptVersion: 'v3.0.0',
  })

  // Step 3: Calculate scores
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

  const { totalScore, totalMaxPoints, percentage } = calculateWeightedTotal({
    scores,
  })

  // Step 4: Update submission in DB
  // In production: await supabase.from('submissions').update({ grade_result: {...}, status: 'graded' }).eq('id', submissionId)

  logger.info('Grading job complete', {
    correlationId,
    submissionId,
    percentage,
    provider: gradeResponse.provider,
  })
}
