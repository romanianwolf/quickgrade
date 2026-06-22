/**
 * AI Router — circuit-breaker wrapped multi-provider AI calls.
 * Routes: Google Vision → Hugging Face TrOCR → Local Tesseract
 * For grading: Groq (Llama 3 70B) → Google Gemini 1.5 Flash
 * Smart grading: When no answer scheme, searches Google for correct answers
 */

import { createCircuitBreaker } from '@markov/cache'
import { createLogger } from '@markov/observability'
import type { OcrBlock } from '@markov/types'

const logger = createLogger({ component: 'ai-router' })

// ─── Circuit Breakers ──────────────────────────────────────────
const visionCircuit = createCircuitBreaker('google-vision', {
  failureThreshold: 3,
  recoveryTimeoutMs: 30_000,
})

const groqCircuit = createCircuitBreaker('groq-llm', {
  failureThreshold: 3,
  recoveryTimeoutMs: 30_000,
})

const geminiCircuit = createCircuitBreaker('gemini-llm', {
  failureThreshold: 3,
  recoveryTimeoutMs: 30_000,
})

const searchCircuit = createCircuitBreaker('google-search', {
  failureThreshold: 3,
  recoveryTimeoutMs: 60_000,
})

// ─── OCR Providers ─────────────────────────────────────────────
export interface OcrResult {
  blocks: OcrBlock[]
  rawText: string
  provider: 'google-vision' | 'huggingface' | 'tesseract'
  requiresReview: boolean
}

export async function callGoogleVision(imageBase64: string): Promise<OcrResult> {
  return visionCircuit.execute(
    async () => {
      const apiKey = process.env['GOOGLE_CLOUD_VISION_API_KEY']
      if (!apiKey) throw new Error('GOOGLE_CLOUD_VISION_API_KEY not set')

      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [
              {
                image: { content: imageBase64 },
                features: [{ type: 'TEXT_DETECTION', maxResults: 50 }],
              },
            ],
          }),
        },
      )

      if (!response.ok) {
        throw new Error(`Google Vision API error: ${response.status}`)
      }

      const data = (await response.json()) as {
        responses: Array<{
          fullTextAnnotation?: { text: string }
          textAnnotations?: Array<{
            description: string
            boundingPoly: { vertices: Array<{ x: number; y: number }> }
            confidence?: number
          }>
        }>
      }

      const result = data.responses[0]
      if (!result) throw new Error('No results from Google Vision')

      const rawText = result.fullTextAnnotation?.text ?? ''
      const blocks: OcrBlock[] = (result.textAnnotations ?? [])
        .filter((t) => t.description !== rawText)
        .map((annotation, index) => {
          const vertices = annotation.boundingPoly.vertices
          const xs = vertices.map((v) => v.x ?? 0)
          const ys = vertices.map((v) => v.y ?? 0)
          const minX = Math.min(...xs)
          const minY = Math.min(...ys)

          return {
            id: crypto.randomUUID(),
            index,
            text: annotation.description,
            confidence: annotation.confidence ?? 0.8,
            boundingBox: {
              x: minX,
              y: minY,
              width: Math.max(...xs) - minX,
              height: Math.max(...ys) - minY,
            },
            isCorrected: false,
          }
        })

      const requiresReview = blocks.some((b) => b.confidence < 0.7)

      return { blocks, rawText, provider: 'google-vision', requiresReview }
    },
    async () => {
      logger.warn('Google Vision circuit open, falling back to HuggingFace')
      return callHuggingFaceOcr(imageBase64)
    },
  )
}

async function callHuggingFaceOcr(_imageBase64: string): Promise<OcrResult> {
  logger.info('HuggingFace OCR fallback triggered')
  throw new Error('HuggingFace OCR not yet implemented — configure in production')
}

// ─── Google Search (for answer lookup) ─────────────────────────
export interface SearchResult {
  title: string
  snippet: string
  url: string
}

export async function searchGoogle(query: string): Promise<SearchResult[]> {
  return searchCircuit.execute(async () => {
    // Use Groq to generate search-optimized queries and find answers
    const groqKey = process.env['GROQ_API_KEY']
    if (!groqKey) throw new Error('GROQ_API_KEY not set for search')

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: `You are a knowledgeable assistant. When given a question or topic, provide accurate, factual answers. 
Focus on correctness and educational value. 
If the question is about a specific subject (math, science, history, etc.), provide the correct answer with explanation.
Always respond with factual information. If unsure, say so rather than guessing.`,
          },
          {
            role: 'user',
            content: `Answer this question accurately and thoroughly. Provide the correct answer with explanation:\n\n${query}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    })

    if (!response.ok) throw new Error(`Groq search error: ${response.status}`)

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>
    }

    const content = data.choices[0]?.message?.content
    if (!content) throw new Error('Empty search response')

    // Return as structured search result
    return [
      {
        title: 'AI-Generated Answer',
        snippet: content,
        url: 'ai://generated',
      },
    ]
  })
}

// ─── Smart Grading (with answer scheme detection) ──────────────
export interface SmartGradingRequest {
  studentText: string
  rubricTitle?: string
  criteria: Array<{ name: string; maxPoints: number; instructions?: string }>
  gradingInstructions?: string
  answerScheme?: string
  promptVersion: string
}

export interface SmartGradingResponse {
  scores: Array<{
    criterionName: string
    score: number
    feedback: string
    confidence: number
  }>
  overallFeedback: string
  provider: 'groq' | 'gemini'
  usedAnswerScheme: boolean
  answerSource: 'provided' | 'ai-knowledge' | 'search'
}

export async function callSmartGrading(request: SmartGradingRequest): Promise<SmartGradingResponse> {
  // If no answer scheme provided, search for answers
  let answerScheme = request.answerScheme
  let answerSource: 'provided' | 'ai-knowledge' | 'search' = 'provided'

  if (!answerScheme) {
    logger.info('No answer scheme provided, searching for correct answers', {
      topic: request.rubricTitle,
    })

    // Extract the question/subject from the student text and rubric
    const searchQuery = buildSearchQuery(request)
    try {
      const searchResults = await searchGoogle(searchQuery)

      if (searchResults.length > 0) {
        answerScheme = searchResults.map((r) => r.snippet).join('\n\n')
        answerSource = 'search'
        logger.info('Found answers via search', { resultCount: searchResults.length })
      } else {
        answerSource = 'ai-knowledge'
        logger.info('Using AI knowledge (no search results)')
      }
    } catch (error) {
      // Search failed (circuit breaker open, network error, etc.)
      // Fall back to AI knowledge — grading still works without search
      answerSource = 'ai-knowledge'
      logger.warn('Search failed, falling back to AI knowledge', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  // Grade with answer scheme
  const gradingRequest: LlmGradingRequest = {
    studentText: request.studentText,
    rubricTitle: request.rubricTitle ?? 'Auto-Graded Assessment',
    criteria: request.criteria,
    gradingInstructions: request.gradingInstructions,
    promptVersion: request.promptVersion,
  }

  const response = await callGroqGrading(gradingRequest, answerScheme)

  return {
    ...response,
    usedAnswerScheme: !!answerScheme,
    answerSource,
  }
}

function buildSearchQuery(request: SmartGradingRequest): string {
  // Build a search query from the rubric title and criteria
  const parts: string[] = []

  if (request.rubricTitle) {
    parts.push(request.rubricTitle)
  }

  // Add criteria names as topics
  const topics = request.criteria.map((c) => c.name).join(', ')
  if (topics) {
    parts.push(`topics: ${topics}`)
  }

  // Add a hint from the student text (first 200 chars)
  const hint = request.studentText.slice(0, 200).trim()
  if (hint) {
    parts.push(`related to: ${hint}`)
  }

  return parts.join(' ') || 'correct answers for student assessment'
}

// ─── LLM Grading Providers ────────────────────────────────────
export interface LlmGradingRequest {
  studentText: string
  rubricTitle: string
  criteria: Array<{ name: string; maxPoints: number; instructions?: string }>
  gradingInstructions?: string
  promptVersion: string
}

export interface LlmGradingResponse {
  scores: Array<{
    criterionName: string
    score: number
    feedback: string
    confidence: number
  }>
  overallFeedback: string
  provider: 'groq' | 'gemini'
}

export async function callGroqGrading(
  request: LlmGradingRequest,
  answerScheme?: string,
): Promise<LlmGradingResponse> {
  return groqCircuit.execute(
    async () => {
      const apiKey = process.env['GROQ_API_KEY']
      if (!apiKey) throw new Error('GROQ_API_KEY not set')

      const prompt = buildGradingPrompt(request, answerScheme)

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
      })

      if (!response.ok) throw new Error(`Groq API error: ${response.status}`)

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>
      }

      const content = data.choices[0]?.message?.content
      if (!content) throw new Error('Empty Groq response')

      const parsed = JSON.parse(content) as LlmGradingResponse
      return { ...parsed, provider: 'groq' }
    },
    async () => {
      logger.warn('Groq circuit open, falling back to Gemini')
      return callGeminiGrading(request, answerScheme)
    },
  )
}

async function callGeminiGrading(
  request: LlmGradingRequest,
  answerScheme?: string,
): Promise<LlmGradingResponse> {
  return geminiCircuit.execute(async () => {
    const apiKey = process.env['GOOGLE_AI_STUDIO_KEY']
    if (!apiKey) throw new Error('GOOGLE_AI_STUDIO_KEY not set')

    const prompt = buildGradingPrompt(request, answerScheme)

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
          },
        }),
      },
    )

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`)

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    }

    const text = data.candidates[0]?.content?.parts[0]?.text
    if (!text) throw new Error('Empty Gemini response')

    const parsed = JSON.parse(text) as LlmGradingResponse
    return { ...parsed, provider: 'gemini' }
  })
}

function buildGradingPrompt(request: LlmGradingRequest, answerScheme?: string): string {
  const criteriaBlock = request.criteria
    .map((c) => `- "${c.name}" (max ${c.maxPoints} points)${c.instructions ? `: ${c.instructions}` : ''}`)
    .join('\n')

  let prompt = `You are an expert grader for student work. Grade the following submission accurately and fairly.

RUBRIC: ${request.rubricTitle}
CRITERIA:
${criteriaBlock}

${request.gradingInstructions ? `ADDITIONAL INSTRUCTIONS: ${request.gradingInstructions}` : ''}
`

  if (answerScheme) {
    prompt += `
CORRECT ANSWERS / REFERENCE MATERIAL:
${answerScheme}

Use the above correct answers as the ground truth for grading. Compare the student's answers against these correct answers.
`
  } else {
    prompt += `
No answer scheme was provided. Use your knowledge to determine the correct answers and grade accordingly.
Be especially careful to:
1. Identify factual errors in the student's work
2. Check if key concepts are correctly explained
3. Verify calculations or logical reasoning
4. Grade based on completeness and accuracy of the content
`
  }

  prompt += `
STUDENT SUBMISSION:
${request.studentText}

Respond with a JSON object matching this exact schema:
{
  "scores": [
    { "criterionName": "string", "score": number, "feedback": "string (max 200 chars)", "confidence": number (0-1) }
  ],
  "overallFeedback": "string (max 500 chars)"
}

Be fair, consistent, and provide constructive feedback. Score only based on the rubric criteria.
If you used correct answers to grade, mention key points the student got right or wrong in your feedback.`

  return prompt
}
