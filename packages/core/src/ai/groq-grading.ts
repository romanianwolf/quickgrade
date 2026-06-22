import { CircuitBreaker } from '@markov/cache/circuit-breaker';

const groqBreaker = new CircuitBreaker(3, 30000);
const geminiBreaker = new CircuitBreaker(3, 30000);

export interface SmartGradingRequest {
  studentText: string;
  rubricTitle?: string;
  criteria: Array<{ name: string; maxPoints: number; instructions?: string }>;
  gradingInstructions?: string;
  answerScheme?: string;
  promptVersion: string;
}

export interface SmartGradingResponse {
  scores: Array<{ criterionName: string; score: number; feedback: string; confidence: number }>;
  overallFeedback: string;
  provider: 'groq' | 'gemini';
  usedAnswerScheme: boolean;
  answerSource: 'provided' | 'ai-knowledge' | 'search';
}

export async function callSmartGrading(request: SmartGradingRequest): Promise<SmartGradingResponse> {
  let answerScheme = request.answerScheme;
  let answerSource: 'provided' | 'ai-knowledge' | 'search' = 'provided';

  if (!answerScheme) {
    try {
      const searchResults = await searchGoogle(buildSearchQuery(request));
      if (searchResults.length > 0) {
        answerScheme = searchResults.map((r) => r.snippet).join('\n\n');
        answerSource = 'search';
      } else {
        answerSource = 'ai-knowledge';
      }
    } catch {
      answerSource = 'ai-knowledge';
    }
  }

  const response = await callGroqGrading(request, answerScheme);

  return {
    ...response,
    usedAnswerScheme: !!answerScheme,
    answerSource,
  };
}

function buildSearchQuery(request: SmartGradingRequest): string {
  const parts: string[] = [];
  if (request.rubricTitle) parts.push(request.rubricTitle);
  const topics = request.criteria.map((c) => c.name).join(', ');
  if (topics) parts.push(`topics: ${topics}`);
  const hint = request.studentText.slice(0, 200).trim();
  if (hint) parts.push(`related to: ${hint}`);
  return parts.join(' ') || 'correct answers for student assessment';
}

async function searchGoogle(query: string): Promise<Array<{ title: string; snippet: string; url: string }>> {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error('GROQ_API_KEY not set');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'You are a knowledgeable assistant. Provide accurate, factual answers.' },
        { role: 'user', content: `Answer this question accurately:\n\n${query}` },
      ],
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) throw new Error(`Groq search error: ${response.status}`);
  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Empty search response');

  return [{ title: 'AI-Generated Answer', snippet: content, url: 'ai://generated' }];
}

export interface LlmGradingRequest {
  studentText: string;
  rubricTitle: string;
  criteria: Array<{ name: string; maxPoints: number; instructions?: string }>;
  gradingInstructions?: string;
  promptVersion: string;
}

export interface LlmGradingResponse {
  scores: Array<{ criterionName: string; score: number; feedback: string; confidence: number }>;
  overallFeedback: string;
  provider: 'groq' | 'gemini';
}

async function callGroqGrading(request: LlmGradingRequest, answerScheme?: string): Promise<LlmGradingResponse> {
  return groqBreaker.call(async () => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY not set');

    const prompt = buildGradingPrompt(request, answerScheme);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
    const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('Empty Groq response');

    return { ...JSON.parse(content), provider: 'groq' as const };
  }, async () => {
    return callGeminiGrading(request, answerScheme);
  });
}

async function callGeminiGrading(request: LlmGradingRequest, answerScheme?: string): Promise<LlmGradingResponse> {
  return geminiBreaker.call(async () => {
    const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
    if (!apiKey) throw new Error('GOOGLE_AI_STUDIO_KEY not set');

    const prompt = buildGradingPrompt(request, answerScheme);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
        }),
      }
    );

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
    const data = (await response.json()) as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
    const text = data.candidates[0]?.content?.parts[0]?.text;
    if (!text) throw new Error('Empty Gemini response');

    return { ...JSON.parse(text), provider: 'gemini' as const };
  });
}

function buildGradingPrompt(request: LlmGradingRequest, answerScheme?: string): string {
  const criteriaBlock = request.criteria
    .map((c) => `- "${c.name}" (max ${c.maxPoints} points)${c.instructions ? `: ${c.instructions}` : ''}`)
    .join('\n');

  let prompt = `You are an expert grader for student work. Grade the following submission accurately and fairly.

RUBRIC: ${request.rubricTitle}
CRITERIA:
${criteriaBlock}

${request.gradingInstructions ? `ADDITIONAL INSTRUCTIONS: ${request.gradingInstructions}` : ''}
`;

  if (answerScheme) {
    prompt += `\nCORRECT ANSWERS / REFERENCE MATERIAL:\n${answerScheme}\n\nUse these as ground truth for grading.\n`;
  } else {
    prompt += `\nNo answer scheme provided. Use your knowledge to determine correct answers and grade accordingly.\n`;
  }

  prompt += `\nSTUDENT SUBMISSION:\n${request.studentText}

Respond with a JSON object:
{
  "scores": [{ "criterionName": "string", "score": number, "feedback": "string (max 200 chars)", "confidence": number (0-1) }],
  "overallFeedback": "string (max 500 chars)"
}

Be fair, consistent, and provide constructive feedback.`;

  return prompt;
}