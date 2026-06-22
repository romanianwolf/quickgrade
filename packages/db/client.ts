import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createLogger } from '@markov/observability'

const logger = createLogger({ component: 'supabase' })

let supabaseInstance: SupabaseClient | null = null
let supabaseAnonInstance: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY']

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!serviceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

  supabaseInstance = createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  logger.info('Supabase service client initialized')
  return supabaseInstance
}

export function getSupabaseAnonClient(): SupabaseClient {
  if (supabaseAnonInstance) return supabaseAnonInstance

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL']
  const anonKey = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

  if (!url || !anonKey) throw new Error('Supabase URL and anon key are required')

  supabaseAnonInstance = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
    },
  })

  return supabaseAnonInstance
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          role: 'student' | 'teacher' | 'admin'
          display_name: string | null
          school_id: string | null
          created_at: string
          updated_at: string
        }
      }
      rubrics: {
        Row: {
          id: string
          teacher_id: string
          title: string
          description: string | null
          criteria: unknown
          grading_instructions: string | null
          total_points: number
          is_active: boolean
          created_at: string
          updated_at: string
        }
      }
      submissions: {
        Row: {
          id: string
          student_id: string
          rubric_id: string
          status: string
          image_url: string
          image_hash: string
          ocr_blocks: unknown
          raw_ocr_text: string | null
          grade_result: unknown
          requires_review: boolean
          review_notes: string | null
          idempotency_key: string
          created_at: string
          updated_at: string
        }
      }
      audit_logs: {
        Row: {
          id: string
          correlation_id: string
          actor_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          metadata: unknown
          ip_hash: string | null
          user_agent_hash: string | null
          created_at: string
        }
      }
    }
  }
}
