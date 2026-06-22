/**
 * OCR Parser — normalizes raw OCR output into structured blocks.
 * Handles Google Vision, Tesseract, and HuggingFace formats.
 */

import type { OcrBlock } from '@markov/types'

export interface RawOcrOutput {
  text: string
  confidence?: number
  words?: Array<{
    text: string
    confidence?: number
    bbox?: { x: number; y: number; width: number; height: number }
  }>
}

export function normalizeOcrBlocks(
  blocks: OcrBlock[],
  imageWidth: number,
  imageHeight: number,
): OcrBlock[] {
  return blocks
    .filter((block) => block.text.trim().length > 0)
    .map((block, index) => ({
      ...block,
      index,
      boundingBox: clampBoundingBox(block.boundingBox, imageWidth, imageHeight),
      text: cleanOcrText(block.text),
      confidence: Math.min(1, Math.max(0, block.confidence)),
    }))
    .sort((a, b) => {
      const yDiff = a.boundingBox.y - b.boundingBox.y
      if (Math.abs(yDiff) > 10) return yDiff
      return a.boundingBox.x - b.boundingBox.x
    })
}

function clampBoundingBox(
  bbox: OcrBlock['boundingBox'],
  width: number,
  height: number,
): OcrBlock['boundingBox'] {
  return {
    x: Math.max(0, Math.min(bbox.x, width)),
    y: Math.max(0, Math.min(bbox.y, height)),
    width: Math.max(1, Math.min(bbox.width, width - bbox.x)),
    height: Math.max(1, Math.min(bbox.height, height - bbox.y)),
  }
}

function cleanOcrText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\n+/g, '\n')
    .trim()
}

export function mergeAdjacentBlocks(blocks: OcrBlock[], yTolerance: number = 15): OcrBlock[] {
  if (blocks.length === 0) return []

  const merged: OcrBlock[] = []
  let current = blocks[0]
  if (!current) return []

  for (let i = 1; i < blocks.length; i++) {
    const next = blocks[i]
    if (!next) continue

    const yDiff = Math.abs(current.boundingBox.y - next.boundingBox.y)
    const gap = next.boundingBox.x - (current.boundingBox.x + current.boundingBox.width)

    if (yDiff < yTolerance && gap < 50) {
      current = {
        ...current,
        text: `${current.text} ${next.text}`,
        confidence: Math.min(current.confidence, next.confidence),
        boundingBox: {
          x: Math.min(current.boundingBox.x, next.boundingBox.x),
          y: Math.min(current.boundingBox.y, next.boundingBox.y),
          width:
            Math.max(
              current.boundingBox.x + current.boundingBox.width,
              next.boundingBox.x + next.boundingBox.width,
            ) - Math.min(current.boundingBox.x, next.boundingBox.x),
          height: Math.max(current.boundingBox.height, next.boundingBox.height),
        },
      }
    } else {
      merged.push(current)
      current = next
    }
  }

  merged.push(current)
  return merged.map((block, index) => ({ ...block, index }))
}
