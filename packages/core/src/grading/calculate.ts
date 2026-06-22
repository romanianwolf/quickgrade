export interface GradeScore {
  criterionId: string;
  criterionName: string;
  score: number;
  maxPoints: number;
  weight: number;
  feedback: string;
  confidence: number;
}

export interface WeightedTotalResult {
  totalScore: number;
  totalMaxPoints: number;
  percentage: number;
}

export function calculateWeightedTotal(input: { scores: GradeScore[] }): WeightedTotalResult {
  if (!input.scores || input.scores.length === 0) {
    return { totalScore: 0, totalMaxPoints: 0, percentage: 0 };
  }

  const totalWeight = input.scores.reduce((sum, s) => sum + (s.weight || 1), 0);
  if (totalWeight === 0) return { totalScore: 0, totalMaxPoints: 0, percentage: 0 };

  const weightedScore = input.scores.reduce((sum, s) => sum + (s.score / s.maxPoints) * (s.weight || 1), 0);
  const totalScore = input.scores.reduce((sum, s) => sum + s.score, 0);
  const totalMaxPoints = input.scores.reduce((sum, s) => sum + s.maxPoints, 0);
  const percentage = totalMaxPoints > 0 ? Math.round((weightedScore / totalWeight) * 10000) / 100 : 0;

  return { totalScore, totalMaxPoints, percentage };
}

export function mapToGPA(percentage: number): string {
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 77) return 'C+';
  if (percentage >= 73) return 'C';
  if (percentage >= 70) return 'C-';
  if (percentage >= 67) return 'D+';
  if (percentage >= 60) return 'D';
  return 'F';
}

export function detectAnomalies(scores: GradeScore[]): string[] {
  const anomalies: string[] = [];

  if (scores.length === 0) return anomalies;

  const confidences = scores.map((s) => s.confidence);
  const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  const lowConfidenceScores = scores.filter((s) => s.confidence < 0.5);
  if (lowConfidenceScores.length > 0) {
    anomalies.push(`Low confidence on: ${lowConfidenceScores.map((s) => s.criterionName).join(', ')}`);
  }

  const percentages = scores.map((s) => (s.score / s.maxPoints) * 100);
  const allVeryHigh = percentages.every((p) => p > 95);
  const allVeryLow = percentages.every((p) => p < 10);
  if (allVeryHigh && scores.length > 1) anomalies.push('All criteria scored unusually high');
  if (allVeryLow && scores.length > 1) anomalies.push('All criteria scored unusually low');

  return anomalies;
}