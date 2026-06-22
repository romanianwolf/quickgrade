import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    const body = await request.json()
    const { imageBase64 } = body as { imageBase64?: string }

    if (!imageBase64) {
      return NextResponse.json(
        { success: false, error: 'imageBase64 is required' },
        { status: 400 },
      )
    }

    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'Google Vision API key not configured. Add GOOGLE_CLOUD_VISION_API_KEY to .env.local' },
        { status: 503 },
      )
    }

    const groqKey = process.env.GROQ_API_KEY
    if (!groqKey) {
      return NextResponse.json(
        { success: false, error: 'Groq API key not configured. Add GROQ_API_KEY to .env.local' },
        { status: 503 },
      )
    }

    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [{ image: { content: imageBase64 }, features: [{ type: 'TEXT_DETECTION', maxResults: 50 }] }],
        }),
      }
    )

    if (!visionResponse.ok) {
      const errText = await visionResponse.text()
      return NextResponse.json(
        { success: false, error: `Google Vision API error: ${visionResponse.status} - ${errText}` },
        { status: 502 },
      )
    }

    const visionData = await visionResponse.json()
    const ocrText = visionData.responses?.[0]?.fullTextAnnotation?.text ?? ''

    if (!ocrText.trim()) {
      return NextResponse.json(
        { success: false, error: 'No text detected in the image. Try a clearer photo.' },
        { status: 200 },
      )
    }

    const gradingPrompt = `You are an expert grader. Grade this student submission fairly.

STUDENT SUBMISSION:
${ocrText}

Grade on these criteria:
- "Content Accuracy" (max 30 points): Factual correctness of answers
- "Completeness" (max 25 points): How thoroughly questions are answered
- "Clarity" (max 25 points): Clear and organized responses
- "Understanding" (max 20 points): Demonstrates grasp of concepts

Respond with ONLY a JSON object:
{
  "scores": [
    { "criterionName": "Content Accuracy", "score": <number>, "feedback": "<string max 200 chars>", "confidence": <0-1> },
    { "criterionName": "Completeness", "score": <number>, "feedback": "<string>", "confidence": <0-1> },
    { "criterionName": "Clarity", "score": <number>, "feedback": "<string>", "confidence": <0-1> },
    { "criterionName": "Understanding", "score": <number>, "feedback": "<string>", "confidence": <0-1> }
  ],
  "overallFeedback": "<string max 500 chars>"
}`

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: gradingPrompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    })

    if (!groqResponse.ok) {
      const errText = await groqResponse.text()
      return NextResponse.json(
        { success: false, error: `Groq API error: ${groqResponse.status} - ${errText}` },
        { status: 502 },
      )
    }

    const groqData = await groqResponse.json()
    const content = groqData.choices?.[0]?.message?.content
    if (!content) {
      return NextResponse.json(
        { success: false, error: 'Empty response from grading AI' },
        { status: 502 },
      )
    }

    const parsed = JSON.parse(content)
    const criteria = [
      { name: 'Content Accuracy', maxPoints: 30 },
      { name: 'Completeness', maxPoints: 25 },
      { name: 'Clarity', maxPoints: 25 },
      { name: 'Understanding', maxPoints: 20 },
    ]

    const grades = (parsed.scores || []).map((s: { criterionName: string; score: number; feedback: string; confidence: number }) => {
      const matched = criteria.find((c) => c.name === s.criterionName)
      return {
        criterionName: s.criterionName,
        score: Math.min(s.score, matched?.maxPoints ?? 100),
        maxPoints: matched?.maxPoints ?? 100,
        feedback: s.feedback ?? '',
        confidence: s.confidence ?? 0.8,
      }
    })

    const totalScore = grades.reduce((sum: number, g: { score: number }) => sum + g.score, 0)
    const totalMaxPoints = grades.reduce((sum: number, g: { maxPoints: number }) => sum + g.maxPoints, 0)
    const percentage = totalMaxPoints > 0 ? Math.round((totalScore / totalMaxPoints) * 10000) / 100 : 0

    return NextResponse.json({
      success: true,
      ocrText,
      grades,
      totalScore,
      totalMaxPoints,
      percentage,
      overallFeedback: parsed.overallFeedback ?? '',
      answerSource: 'ai-knowledge',
      processingTimeMs: Date.now() - startTime,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    )
  }
}
