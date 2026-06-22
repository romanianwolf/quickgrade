/**
 * PII Scrubber — strips personally identifiable information before AI/OCR calls.
 * Logs SHA-256 hashes, never raw PII.
 */

import { hashSHA256 } from './crypto'

export interface PiiScrubResult {
  scrubbed: string
  hashes: Record<string, string>
  wasModified: boolean
}

const PII_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[EMAIL]' },
  {
    name: 'phone',
    pattern: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
    replacement: '[PHONE]',
  },
  {
    name: 'ssn',
    pattern: /\b\d{3}[-]?\d{2}[-]?\d{4}\b/g,
    replacement: '[SSN]',
  },
  {
    name: 'student_id',
    pattern: /\b[A-Z]{2,3}[-]?\d{4,8}\b/g,
    replacement: '[STUDENT_ID]',
  },
  {
    name: 'name_pattern',
    pattern: /\b(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]+\b/g,
    replacement: '[NAME]',
  },
]

export async function scrubPii(text: string): Promise<PiiScrubResult> {
  let scrubbed = text
  const hashes: Record<string, string> = {}
  let wasModified = false

  for (const { name, pattern, replacement } of PII_PATTERNS) {
    const matches = text.match(pattern)
    if (matches) {
      wasModified = true
      for (const match of matches) {
        const hash = await hashSHA256(match)
        hashes[`${name}:${hash.slice(0, 8)}`] = hash
      }
      scrubbed = scrubbed.replace(pattern, replacement)
    }
  }

  return { scrubbed, hashes, wasModified }
}

export async function hashIp(ip: string): Promise<string> {
  const secret = process.env['SUPABASE_JWT_SECRET']
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is required for IP hashing')
  return hashSHA256(`ip:${ip}:${secret}`)
}

export async function hashUserAgent(ua: string): Promise<string> {
  return hashSHA256(`ua:${ua}`)
}
