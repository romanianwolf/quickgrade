import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';
import { CircuitBreaker } from '@markov/cache/circuit-breaker';
import { TokenBucketLimiter } from '@markov/cache/rate-limiter';
import { encryptField, deriveFieldKey } from '@markov/core/crypto/field-encrypt';
import { scrubPII } from '@markov/core/security/pii-scrubber';
import { callGoogleVision, normalizeOCRBlocks } from '@markov/core/ai/google-vision';
import { generateCorrelationId, hashIP, hashUserAgent } from '@markov/observability/logger';

const ScanRequestSchema = z.object({
  imageBase64: z.string().min(1),
  metadata: z.object({
    studentId: z.string().uuid().optional(),
    assignmentId: z.string().uuid(),
    pageNumber: z.number().min(1).max(10).optional(),
  }).optional(),
});

export const runtime = 'nodejs';

const visionBreaker = new CircuitBreaker(5, 30000);
const limiter = new TokenBucketLimiter(
  Redis.fromEnv(),
  30,
  0.5 / 1000, // 30 req/min
  'rl:scan:'
);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  const correlationId = generateCorrelationId();
  const startTime = Date.now();

  try {
    const body = await request.json();
    const parsed = ScanRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: parsed.error.flatten() }, correlationId, timestamp: new Date().toISOString() },
        { status: 400 }
      );
    }

    const { imageBase64, metadata } = parsed.data;
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const ua = request.headers.get('user-agent') ?? 'unknown';

    const { allowed, remaining } = await limiter.consume(ip);
    if (!allowed) {
      return NextResponse.json(
        { error: { code: 'RATE_LIMITED', message: 'Too many scan requests' }, correlationId, timestamp: new Date().toISOString() },
        { status: 429, headers: { 'Retry-After': '60', 'x-correlation-id': correlationId } }
      );
    }

    const ocrResult = await visionBreaker.call(() => callGoogleVision(imageBase64));
    const normalizedBlocks = normalizeOCRBlocks(ocrResult.blocks);
    const fullText = normalizedBlocks.map(b => b.text).join('\n');
    const { scrubbed, redacted } = scrubPII(fullText);

    const fieldKey = await deriveFieldKey(process.env.FIELD_ENCRYPTION_KEY!, 'ocr_text');
    const encryptedText = await encryptField(scrubbed, fieldKey, `scan:${correlationId}`);

    const imageHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(imageBase64));
    const imageHashHex = Buffer.from(imageHash).toString('hex');

    const submissionId = crypto.randomUUID();

    const { error: dbError } = await supabase.from('submissions').insert({
      id: submissionId,
      assignment_id: metadata?.assignmentId,
      student_id: metadata?.studentId,
      page_number: metadata?.pageNumber ?? 1,
      image_hash: imageHashHex,
      ocr_text_encrypted: encryptedText,
      ocr_blocks: normalizedBlocks,
      requires_review: ocrResult.requiresReview,
      status: ocrResult.requiresReview ? 'ocr_requires_review' : 'ocr_complete',
      ip_hash: hashIP(ip),
      user_agent_hash: hashUserAgent(ua),
      correlation_id: correlationId,
    });

    if (dbError) throw dbError;

    await supabase.from('audit_logs').insert({
      action: 'scan',
      entity_type: 'submission',
      entity_id: submissionId,
      ip_hash: hashIP(ip),
      user_agent_hash: hashUserAgent(ua),
      correlation_id: correlationId,
      metadata: { blocks_count: normalizedBlocks.length, pii_redacted: redacted.length },
    });

    return NextResponse.json(
      {
        data: {
          submissionId,
          status: ocrResult.requiresReview ? 'ocr_requires_review' : 'ocr_complete',
          ocrBlocks: normalizedBlocks,
          requiresReview: ocrResult.requiresReview,
          processingTimeMs: Date.now() - startTime,
        },
        correlationId,
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: { 'x-correlation-id': correlationId, 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    console.error('[scan] error:', error);
    return NextResponse.json(
      { error: { code: 'SCAN_FAILED', message: error instanceof Error ? error.message : 'Internal server error' }, correlationId, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}