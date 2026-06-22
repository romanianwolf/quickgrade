/**
 * Grading Math — weighted score calculation, percentage, and GPA mapping.
 */

import type { GradeScore } from '@markov/types'

export interface GradingInput {
  scores: Array<{
    criterionId: string
    criterionName: string
    score: number
    maxPoints: number
    weight: number
    feedback: string
    confidence: number
  }>
}

export function calculateWeightedTotal(input: GradingInput): {
  totalScore: number
  totalMaxPoints: number
  percentage: number
} {
  let weightedScoreSum = 0
  let weightedMaxSum = 0

  for (const score of input.scores) {
    const weighted = score.score * score.weight
    const weightedMax = score.maxPoints * score.weight
    weightedScoreSum += weighted
    weightedMaxSum += weightedMax
  }

  const totalScore = weightedScoreSum
  const totalMaxPoints = weightedMaxSum
  const percentage = weightedMaxSum > 0 ? (weightedScoreSum / weightedMaxSum) * 100 : 0

  return {
    totalScore,
    totalMaxPoints,
    percentage: Math.round(percentage * 100) / 100,
  }
}

export function mapPercentageToGpa(percentage: number): string {
  if (percentage >= 93) return 'A'
  if (percentage >= 90) return 'A-'
  if (percentage >= 87) return 'B+'
  if (percentage >= 83) return 'B'
  if (percentage >= 80) return 'B-'
  if (percentage >= 77) return 'C+'
  if (percentage >= 73) return 'C'
  if (percentage >= 70) return 'C-'
  if (percentage >= 67) return 'D+'
  if (percentage >= 60) return 'D'
  return 'F'
}

export function detectAnomalies(scores: GradeScore[]): string[] {
  if (scores.length === 0) return []

  const anomalies: string[] = []

  const confidences = scores.map((s) => s.confidence)
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length

  if (avgConfidence < 0.5) {
    anomalies.push('Low average AI confidence — manual review recommended')
  }

  const lowScores = scores.filter((s) => s.score / s.maxPoints < 0.2)
  if (lowScores.length > scores.length / 2) {
    anomalies.push('More than half of criteria scored below 20% — verify submission')
  }

  return anomalies
}
