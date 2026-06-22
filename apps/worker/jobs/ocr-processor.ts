import { callGoogleVision, scrubPii, normalizeOcrBlocks } from '@markov/core'
import { createLogger } from '@markov/observability'
import type { JobPayload } from '../index'

const logger = createLogger({ component: 'ocr-processor' })

export async function processOcrJob(payload: JobPayload): Promise<void> {
  const { submissionId, correlationId, data } = payload
  const imageBase64 = data['imageBase64'] as string

  if (!imageBase64) {
    throw new Error('imageBase64 is required for OCR job')
  }

  logger.info('Processing OCR job', { correlationId, submissionId })

  // Step 1: Call Google Vision (raw base64 — never scrub)
  const ocrResult = await callGoogleVision(imageBase64)

  // Step 2: PII scrub on OCR text output (after OCR, not before)
  const ocrText = ocrResult.blocks.map((b) => b.text).join('\n')
  const { hashes } = await scrubPii(ocrText)
  logger.info('PII scrub complete', { correlationId, piiHashes: Object.keys(hashes).length })

  // Step 3: Normalize blocks
  const normalizedBlocks = normalizeOcrBlocks(ocrResult.blocks, 1000, 1400)

  // Step 4: Update submission in DB
  // In production: await supabase.from('submissions').update({...}).eq('id', submissionId)

  logger.info('OCR job complete', {
    correlationId,
    submissionId,
    blocks: normalizedBlocks.length,
    requiresReview: ocrResult.requiresReview,
  })
}
