import { z } from 'zod'

// ─── User & Auth ───────────────────────────────────────────────
export const UserIdSchema = z.string().uuid()
export const EmailSchema = z.string().email().max(255).transform((s) => s.toLowerCase())
export const RoleSchema = z.enum(['student', 'teacher', 'admin'])

export const UserProfileSchema = z.object({
  id: UserIdSchema,
  email: EmailSchema,
  role: RoleSchema,
  displayName: z.string().min(1).max(100).optional(),
  schoolId: z.string().uuid().optional(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

// ─── Submission ────────────────────────────────────────────────
export const SubmissionStatusSchema = z.enum([
  'pending',
  'ocr_processing',
  'ocr_complete',
  'ocr_requires_review',
  'grading',
  'graded',
  'error',
])

export const OcrBlockSchema = z.object({
  id: z.string().uuid(),
  index: z.number().int().min(0),
  text: z.string().max(5000),
  confidence: z.number().min(0).max(1),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  isCorrected: z.boolean().default(false),
  correctedText: z.string().max(5000).optional(),
})

export const SubmissionSchema = z.object({
  id: z.string().uuid(),
  studentId: UserIdSchema,
  rubricId: z.string().uuid(),
  status: SubmissionStatusSchema,
  imageUrl: z.string().url(),
  imageHash: z.string().length(64), // SHA-256
  ocrBlocks: z.array(OcrBlockSchema).default([]),
  rawOcrText: z.string().max(50000).optional(),
  gradeResult: z.any().optional(), // GradeResultSchema defined in core
  requiresReview: z.boolean().default(false),
  reviewNotes: z.string().max(2000).optional(),
  idempotencyKey: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

// ─── Rubric ────────────────────────────────────────────────────
export const RubricCriterionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  maxPoints: z.number().int().positive(),
  weight: z.number().min(0).max(1).default(1),
  aiInstructions: z.string().max(2000).optional(),
})

export const RubricSchema = z.object({
  id: z.string().uuid(),
  teacherId: UserIdSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  criteria: z.array(RubricCriterionSchema).min(1).max(20),
  gradingInstructions: z.string().max(5000).optional(),
  totalPoints: z.number().int().positive(),
  isActive: z.boolean().default(true),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

// ─── Grade Result ──────────────────────────────────────────────
export const GradeScoreSchema = z.object({
  criterionId: z.string().uuid(),
  criterionName: z.string(),
  score: z.number().min(0),
  maxPoints: z.number().positive(),
  weight: z.number().min(0).max(1),
  feedback: z.string().max(1000),
  confidence: z.number().min(0).max(1),
})

export const GradeResultSchema = z.object({
  id: z.string().uuid(),
  submissionId: z.string().uuid(),
  scores: z.array(GradeScoreSchema),
  totalScore: z.number().min(0),
  totalMaxPoints: z.number().positive(),
  percentage: z.number().min(0).max(100),
  aiModel: z.string().max(100),
  aiProvider: z.enum(['groq', 'gemini', 'local']),
  promptVersion: z.string().max(50),
  processingTimeMs: z.number().int().positive(),
  overallFeedback: z.string().max(2000),
  createdAt: z.coerce.date(),
  usedAnswerScheme: z.boolean().optional(),
  answerSource: z.enum(['provided', 'ai-knowledge', 'search']).optional(),
})

// ─── API Request/Response ──────────────────────────────────────
export const ScanRequestSchema = z.object({
  imageBase64: z.string().max(10 * 1024 * 1024), // 10MB max
  studentId: UserIdSchema.optional(),
  idempotencyKey: z.string().uuid(),
})

export const ScanResponseSchema = z.object({
  submissionId: z.string().uuid(),
  status: SubmissionStatusSchema,
  ocrBlocks: z.array(OcrBlockSchema).optional(),
  requiresReview: z.boolean(),
  processingTimeMs: z.number().int(),
})

export const GradeRequestSchema = z.object({
  submissionId: z.string().uuid(),
  rubricId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
})

export const GradeResponseSchema = z.object({
  gradeResult: GradeResultSchema,
  processingTimeMs: z.number().int(),
})

export const ReviewAcceptRequestSchema = z.object({
  submissionId: z.string().uuid(),
  correctedBlocks: z.array(
    z.object({
      id: z.string().uuid(),
      correctedText: z.string().max(5000),
    }),
  ),
  idempotencyKey: z.string().uuid(),
})

// ─── Health ────────────────────────────────────────────────────
export const HealthResponseSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  version: z.string(),
  timestamp: z.coerce.date(),
  checks: z.record(
    z.object({
      status: z.enum(['up', 'down', 'slow']),
      latencyMs: z.number().optional(),
      message: z.string().optional(),
    }),
  ),
})

// ─── Audit ─────────────────────────────────────────────────────
export const AuditActionSchema = z.enum([
  'user.login',
  'user.logout',
  'submission.create',
  'submission.ocr_complete',
  'submission.ocr_requires_review',
  'submission.grade',
  'submission.review_accept',
  'rubric.create',
  'rubric.update',
  'rubric.delete',
  'image.upload',
  'image.delete',
  'ai.call',
  'ai.error',
  'system.health_check',
])

export const AuditLogSchema = z.object({
  id: z.string().uuid(),
  correlationId: z.string().uuid(),
  actorId: UserIdSchema.optional(),
  action: AuditActionSchema,
  entityType: z.string().max(50),
  entityId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
  ipHash: z.string().length(64).optional(),
  userAgentHash: z.string().length(64).optional(),
  createdAt: z.coerce.date(),
})
