import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { CircuitBreaker } from '@markov/cache/circuit-breaker';
import { callSmartGrading, buildGradingPrompt } from '@markov/core/ai/groq-grading';
import { calculateWeightedTotal } from '@markov/core/grading/calculate';
import { generateCorrelationId, hashIP, hashUserAgent } from '@markov/observability/logger';

const GradeRequestSchema = z.object({
  submissionId: z.string().uuid(),
  rubricId: z.string().uuid().optional(),
  idempotencyKey: z.string().uuid(),
});

export const runtime = 'nodejs';

const gradingBreaker = new CircuitBreaker(3, 30000);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const idempotencyStore = new Map<string, { status: string; result: unknown }>();

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  try {
    const body = await request.json();
    const parsed = GradeRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() }, correlationId, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const { submissionId, rubricId, idempotencyKey } = parsed.data;

    const existing = idempotencyStore.get(idempotencyKey);
    if (existing) {
      return NextResponse.json({ data: existing.result, correlationId, timestamp: new Date().toISOString() });
    }

    const { data: submission, error: subError } = await supabase
      .from('submissions')
      .select('*')
      .eq('id', submissionId)
      .single();

    if (subError || !submission) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Submission not found' }, correlationId, timestamp: new Date().toISOString() },
        { status: 404 }
      );
    }

    let criteria = [
      { name: 'Content Accuracy', maxPoints: 30, instructions: 'Factual correctness of answers' },
      { name: 'Completeness', maxPoints: 25, instructions: 'How thoroughly questions are answered' },
      { name: 'Clarity', maxPoints: 25, instructions: 'Clear and organized responses' },
      { name: 'Understanding', maxPoints: 20, instructions: 'Demonstrates grasp of concepts' },
    ];

    let rubricTitle = 'Auto-Graded Assessment';
    if (rubricId) {
      const { data: rubric } = await supabase.from('rubrics').select('*').eq('id', rubricId).single();
      if (rubric) {
        rubricTitle = rubric.title;
        criteria = rubric.criteria as typeof criteria;
      }
    }

    const studentText = submission.ocr_text_encrypted;

    const gradeResponse = await gradingBreaker.call(() =>
      callSmartGrading({
        studentText,
        rubricTitle,
        criteria: criteria.map(c => ({ name: c.name, maxPoints: c.maxPoints, instructions: c.instructions })),
        promptVersion: 'v3.0.0',
      })
    );

    const scores = gradeResponse.scores.map((s) => {
      const matched = criteria.find((c) => c.name === s.criterionName);
      return {
        criterionId: crypto.randomUUID(),
        criterionName: s.criterionName,
        score: s.score,
        maxPoints: matched?.maxPoints ?? 100,
        weight: 1,
        feedback: s.feedback,
        confidence: s.confidence,
      };
    });

    const { totalScore, totalMaxPoints, percentage } = calculateWeightedTotal({ scores });

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
      usedAnswerScheme: gradeResponse.usedAnswerScheme,
      answerSource: gradeResponse.answerSource,
      createdAt: new Date().toISOString(),
    };

    idempotencyStore.set(idempotencyKey, { status: 'complete', result: { gradeResult } });

    const { error: gradeError } = await supabase.from('grades').insert({
      id: gradeResult.id,
      submission_id: submissionId,
      scores: gradeResult.scores,
      total_score: totalScore,
      total_max_points: totalMaxPoints,
      percentage,
      ai_model: gradeResult.aiModel,
      ai_provider: gradeResult.aiProvider,
      prompt_version: gradeResult.promptVersion,
      processing_time_ms: gradeResult.processingTimeMs,
      overall_feedback: gradeResult.overallFeedback,
      used_answer_scheme: gradeResult.usedAnswerScheme,
      answer_source: gradeResult.answerSource,
    });

    if (gradeError) throw gradeError;

    await supabase.from('submissions').update({ status: 'graded' }).eq('id', submissionId);

    await supabase.from('audit_logs').insert({
      action: 'grade',
      entity_type: 'grade',
      entity_id: gradeResult.id,
      ip_hash: hashIP(request.headers.get('x-forwarded-for') ?? 'unknown'),
      user_agent_hash: hashUserAgent(request.headers.get('user-agent') ?? 'unknown'),
      correlation_id: correlationId,
      metadata: { submissionId, percentage, provider: gradeResult.aiProvider },
    });

    return NextResponse.json(
      { data: { gradeResult, processingTimeMs: gradeResult.processingTimeMs }, correlationId, timestamp: new Date().toISOString() },
      { status: 200, headers: { 'x-correlation-id': correlationId, 'Cache-Control': 'no-store' } }
    );
  } catch (error) {
    console.error('[grade] error:', error);
    return NextResponse.json(
      { error: { code: 'GRADING_FAILED', message: error instanceof Error ? error.message : 'Internal server error' }, correlationId, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}