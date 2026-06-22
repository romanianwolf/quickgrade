import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { generateCorrelationId, hashIP, hashUserAgent } from '@markov/observability/logger';

const ReviewAcceptSchema = z.object({
  gradeId: z.string().uuid(),
  adjustments: z.array(z.object({
    criterionId: z.string().uuid(),
    newScore: z.number().min(0),
    reviewerNote: z.string().max(500).optional(),
  })).optional(),
  accepted: z.boolean(),
  reviewerId: z.string().uuid(),
});

export const runtime = 'nodejs';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();

  try {
    const body = await request.json();
    const parsed = ReviewAcceptSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() }, correlationId, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const { gradeId, adjustments, accepted, reviewerId } = parsed.data;

    const { data: grade, error: gradeError } = await supabase
      .from('grades')
      .select('*')
      .eq('id', gradeId)
      .single();

    if (gradeError || !grade) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Grade not found' }, correlationId, timestamp: new Date().toISOString() },
        { status: 404 }
      );
    }

    let finalScores = grade.scores as Array<{ criterionId: string; score: number; maxPoints: number; feedback: string; confidence: number }>;

    if (adjustments && adjustments.length > 0) {
      for (const adj of adjustments) {
        const idx = finalScores.findIndex(s => s.criterionId === adj.criterionId);
        if (idx >= 0) {
          finalScores[idx] = { ...finalScores[idx], score: Math.min(adj.newScore, finalScores[idx].maxPoints) };
        }
      }
    }

    const { totalScore, totalMaxPoints, percentage } = finalScores.reduce(
      (acc, s) => ({ totalScore: acc.totalScore + s.score, totalMaxPoints: acc.totalMaxPoints + s.maxPoints, percentage: 0 }),
      { totalScore: 0, totalMaxPoints: 0, percentage: 0 }
    );
    const finalPercentage = totalMaxPoints > 0 ? (totalScore / totalMaxPoints) * 100 : 0;

    const { error: updateError } = await supabase
      .from('grades')
      .update({
        scores: finalScores,
        total_score: totalScore,
        total_max_points: totalMaxPoints,
        percentage: finalPercentage,
        reviewed: true,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', gradeId);

    if (updateError) throw updateError;

    await supabase.from('audit_logs').insert({
      action: 'review',
      entity_type: 'grade',
      entity_id: gradeId,
      ip_hash: hashIP(request.headers.get('x-forwarded-for') ?? 'unknown'),
      user_agent_hash: hashUserAgent(request.headers.get('user-agent') ?? 'unknown'),
      correlation_id: correlationId,
      metadata: { accepted, adjustments: adjustments?.length ?? 0, reviewerId },
    });

    return NextResponse.json(
      { data: { gradeId, accepted, finalPercentage: Math.round(finalPercentage * 100) / 100 }, correlationId, timestamp: new Date().toISOString() },
      { status: 200, headers: { 'x-correlation-id': correlationId } }
    );
  } catch (error) {
    console.error('[review] error:', error);
    return NextResponse.json(
      { error: { code: 'REVIEW_FAILED', message: error instanceof Error ? error.message : 'Internal server error' }, correlationId, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}