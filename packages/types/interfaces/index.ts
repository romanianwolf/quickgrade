import type { z } from 'zod'
import type {
  UserProfileSchema,
  SubmissionSchema,
  RubricSchema,
  RubricCriterionSchema,
  GradeResultSchema,
  GradeScoreSchema,
  AuditLogSchema,
  AuditActionSchema,
  OcrBlockSchema,
  HealthResponseSchema,
} from '../schemas'

export type UserProfile = z.infer<typeof UserProfileSchema>
export type Submission = z.infer<typeof SubmissionSchema>
export type Rubric = z.infer<typeof RubricSchema>
export type RubricCriterion = z.infer<typeof RubricCriterionSchema>
export type GradeResult = z.infer<typeof GradeResultSchema>
export type GradeScore = z.infer<typeof GradeScoreSchema>
export type AuditLog = z.infer<typeof AuditLogSchema>
export type AuditAction = z.infer<typeof AuditActionSchema>
export type OcrBlock = z.infer<typeof OcrBlockSchema>
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export type SubmissionStatus = Submission['status']
export type UserRole = UserProfile['role']

export interface ApiResponse<T> {
  data: T
  correlationId: string
  timestamp: string
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: Record<string, unknown>
  }
  correlationId: string
  timestamp: string
}

export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  correlationId: string
}
