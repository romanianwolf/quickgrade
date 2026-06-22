'use client'

import { useState, useRef, useCallback } from 'react'

interface GradeResult {
  criterionName: string
  score: number
  maxPoints: number
  feedback: string
  confidence: number
}

interface DemoResult {
  success: boolean
  ocrText?: string
  grades?: GradeResult[]
  totalScore?: number
  totalMaxPoints?: number
  percentage?: number
  overallFeedback?: string
  answerSource?: string
  processingTimeMs?: number
  error?: string
}

export default function DemoPage() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DemoResult | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    if (!f.type.startsWith('image/')) {
      alert('Please upload an image file')
      return
    }
    setFile(f)
    setResult(null)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(f)
  }, [])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  const runDemo = async () => {
    if (!file) return
    setLoading(true)
    setResult(null)

    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1])
        }
        reader.readAsDataURL(file)
      })

      const res = await fetch('/api/v1/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      })

      const data = await res.json()
      setResult(data)
    } catch (err) {
      setResult({ success: false, error: err instanceof Error ? err.message : 'Unknown error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <nav className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center font-bold text-sm">M</div>
            <span className="text-lg font-bold">Markov Demo</span>
          </a>
          <span className="text-sm text-gray-500">No login required</span>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-2">Grade an Answer Sheet</h1>
        <p className="text-gray-400 mb-8">Upload a photo of a handwritten or printed answer sheet. AI will OCR the text and grade it automatically.</p>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Upload Side */}
          <div>
            <div
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer min-h-[300px] flex flex-col items-center justify-center ${
                dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-500'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
            >
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />

              {preview ? (
                <img src={preview} alt="Preview" className="max-h-[280px] rounded-lg shadow-lg" />
              ) : (
                <>
                  <svg className="w-12 h-12 text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <p className="text-gray-400 mb-1">Drag & drop an answer sheet image</p>
                  <p className="text-sm text-gray-600">or click to browse</p>
                </>
              )}
            </div>

            {file && (
              <button
                onClick={runDemo}
                disabled={loading}
                className="mt-4 w-full py-3 rounded-xl font-semibold text-lg transition-all disabled:opacity-50 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>
                    Grading...
                  </span>
                ) : (
                  'Grade This Sheet'
                )}
              </button>
            )}
          </div>

          {/* Results Side */}
          <div>
            {result?.success ? (
              <div className="space-y-4">
                {/* Score Card */}
                <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Grade Result</h2>
                    <span className="text-3xl font-extrabold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                      {result.percentage?.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-400 mb-4">
                    <span>{result.totalScore}/{result.totalMaxPoints} points</span>
                    <span>&bull;</span>
                    <span>{result.processingTimeMs}ms</span>
                    {result.answerSource && (
                      <>
                        <span>&bull;</span>
                        <span className="capitalize">{result.answerSource.replace('-', ' ')}</span>
                      </>
                    )}
                  </div>
                  {result.overallFeedback && (
                    <p className="text-sm text-gray-300 bg-gray-800/50 rounded-lg p-3">{result.overallFeedback}</p>
                  )}
                </div>

                {/* Criteria Breakdown */}
                {result.grades && result.grades.length > 0 && (
                  <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                    <h3 className="font-semibold mb-4">Criteria Breakdown</h3>
                    <div className="space-y-3">
                      {result.grades.map((g, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-300">{g.criterionName}</span>
                            <span className="font-medium">{g.score}/{g.maxPoints}</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-2 mb-1">
                            <div
                              className="h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${(g.score / g.maxPoints) * 100}%`,
                                backgroundColor: g.score / g.maxPoints > 0.8 ? '#22c55e' : g.score / g.maxPoints > 0.5 ? '#eab308' : '#ef4444',
                              }}
                            />
                          </div>
                          <p className="text-xs text-gray-500">{g.feedback}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* OCR Text */}
                {result.ocrText && (
                  <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                    <h3 className="font-semibold mb-2">Extracted Text (OCR)</h3>
                    <pre className="text-sm text-gray-400 whitespace-pre-wrap font-mono max-h-[200px] overflow-y-auto">{result.ocrText}</pre>
                  </div>
                )}
              </div>
            ) : result?.error ? (
              <div className="bg-red-950/50 border border-red-800 rounded-2xl p-6">
                <h3 className="text-red-400 font-semibold mb-2">Error</h3>
                <p className="text-sm text-red-300">{result.error}</p>
              </div>
            ) : (
              <div className="bg-gray-900 rounded-2xl p-8 border border-gray-800 flex flex-col items-center justify-center min-h-[300px] text-center">
                <svg className="w-16 h-16 text-gray-700 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-gray-500">Upload an image to see results</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
