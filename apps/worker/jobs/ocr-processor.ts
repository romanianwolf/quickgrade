import { createClient } from '@supabase/supabase-js';
import { callGoogleVision, normalizeOCRBlocks } from '@markov/core/ai/google-vision';
import { CircuitBreaker } from '@markov/cache/circuit-breaker';
import { generateCorrelationId } from '@markov/observability/logger';

const visionBreaker = new CircuitBreaker(5, 30000);
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface OCRJobPayload {
  submissionId: string;
  imageBase64: string;
  correlationId: string;
}

export async function processOCRJob(payload: OCRJobPayload): Promise<void> {
  const { submissionId, imageBase64, correlationId } = payload;
  const startTime = Date.now();

  try {
    const ocrResult = await visionBreaker.call(() => callGoogleVision(imageBase64));
    const normalizedBlocks = normalizeOCRBlocks(ocrResult.blocks);
    const fullText = normalizedBlocks.map(b => b.text).join('\n');
    const { scrubbed } = scrubPII(fullText);

    const { error } = await supabase
      .from('submissions')
      .update({
        ocr_text_encrypted: scrubbed,
        ocr_blocks: normalizedBlocks,
        requires_review: ocrResult.requiresReview,
        status: ocrResult.requiresReview ? 'ocr_requires_review' : 'ocr_complete',
      })
      .eq('id', submissionId);

    if (error) throw error;

    await supabase.from('audit_logs').insert({
      action: 'scan',
      entity_type: 'submission',
      entity_id: submissionId,
      correlation_id: correlationId,
      metadata: { blocks_count: normalizedBlocks.length, processing_time_ms: Date.now() - startTime, async: true },
    });

    console.log(`[OCR Processor] Completed submission ${submissionId} in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error(`[OCR Processor] Failed for ${submissionId}:`, error);

    await supabase
      .from('submissions')
      .update({ status: 'ocr_failed', ocr_error: error instanceof Error ? error.message : 'Unknown error' })
      .eq('id', submissionId);

    await supabase.from('audit_logs').insert({
      action: 'scan',
      entity_type: 'submission',
      entity_id: submissionId,
      correlation_id: correlationId,
      metadata: { error: error instanceof Error ? error.message : 'Unknown error', async: true },
    });
  }
}

export async function handleQStashWebhook(body: unknown): Promise<void> {
  const jobs = Array.isArray(body) ? body : [body];

  for (const job of jobs) {
    if (job && typeof job === 'object' && 'submissionId' in job) {
      await processOCRJob(job as OCRJobPayload);
    }
  }
}