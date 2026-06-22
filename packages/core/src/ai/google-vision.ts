export interface OcrBlock {
  id: string;
  index: number;
  text: string;
  confidence: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  isCorrected: boolean;
}

export async function callGoogleVision(imageBase64: string): Promise<{ blocks: OcrBlock[]; rawText: string; requiresReview: boolean }> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_CLOUD_VISION_API_KEY not set');

  const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ image: { content: imageBase64 }, features: [{ type: 'TEXT_DETECTION', maxResults: 50 }] }],
    }),
  });

  if (!response.ok) throw new Error(`Google Vision API error: ${response.status}`);

  const data = (await response.json()) as {
    responses: Array<{
      fullTextAnnotation?: { text: string };
      textAnnotations?: Array<{
        description: string;
        boundingPoly: { vertices: Array<{ x?: number; y?: number }> };
        confidence?: number;
      }>;
    }>;
  };

  const result = data.responses[0];
  if (!result) throw new Error('No results from Google Vision');

  const rawText = result.fullTextAnnotation?.text ?? '';
  const blocks: OcrBlock[] = (result.textAnnotations ?? [])
    .filter((t) => t.description !== rawText)
    .map((annotation, index) => {
      const vertices = annotation.boundingPoly.vertices;
      const xs = vertices.map((v) => v.x ?? 0);
      const ys = vertices.map((v) => v.y ?? 0);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);

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
      };
    });

  const requiresReview = blocks.some((b) => b.confidence < 0.7);
  return { blocks, rawText, requiresReview };
}

export function normalizeOCRBlocks(blocks: OcrBlock[]): OcrBlock[] {
  return blocks.sort((a, b) => a.boundingBox.y - b.boundingBox.y || a.boundingBox.x - b.boundingBox.x);
}