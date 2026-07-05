import { request } from '@/utils/request'
import { AI_API } from '@/config/api'
import { getApiErrorMessage } from '@/utils/apiErrorMessage'
import type {
  LiverpoolProperties,
  ObstacleType,
  PathPoint,
  Pole,
  WallProperties,
  WaterProperties,
} from '@/types/obstacle'

export interface AIGenerateRequest {
  prompt: string
  config?: {
    field_width?: number
    field_height?: number
    obstacle_count?: number
    difficulty?: 'easy' | 'medium' | 'hard'
  }
}

export interface AIGenerateResponse {
  history_id: number
  obstacles: AIObstacle[]
  path: {
    visible: boolean
    points: Array<Pick<PathPoint, 'x' | 'y' | 'controlPoint1' | 'controlPoint2'>>
    startPoint: { x: number; y: number; rotation: number }
    endPoint: { x: number; y: number; rotation: number }
  }
  difficulty_score: number
  estimated_time: number
  explanation: string
  teaching_notes: string
  validation: AIGenerationValidation
  metrics?: AIRouteMetrics
  remaining_quota: number
}

export interface AIObstacle {
  id: string
  type: ObstacleType | string
  position: { x: number; y: number }
  rotation: number
  number: string
  poles: Pole[]
  wallProperties?: WallProperties
  liverpoolProperties?: LiverpoolProperties
  waterProperties?: WaterProperties
}

export interface AIGenerationValidation {
  is_valid: boolean
  issues: string[]
  warnings: string[]
  auto_fixed: string[]
  source: 'llm' | 'fallback'
  fallback_reason: string
}

export interface AIRouteMetrics {
  total_distance?: number
  avg_obstacle_distance?: number
  turn_count?: number
  difficulty_score?: number
}

export interface AIQuotaInfo {
  free_quota: number
  purchased_quota: number
  used_quota: number
  remaining_quota: number
}

export interface AIHistoryItem {
  id: number
  prompt: string
  status: 'pending' | 'success' | 'failed'
  token_used: number
  created_at: string
}



export interface AIEditCourseRequest {
  instruction: string
  course: {
    field_width?: number
    field_height?: number
    difficulty?: 'easy' | 'medium' | 'hard'
    obstacles: AIObstacle[]
    path?: unknown
  }
}

export interface AIEditCourseResponse {
  source: 'llm' | 'fallback'
  field_width: number
  field_height: number
  difficulty: 'easy' | 'medium' | 'hard'
  obstacles: AIObstacle[]
  path: AIGenerateResponse['path']
  change_summary: string[]
  validation: {
    score?: number
    is_valid: boolean
    issues: unknown[]
    warnings: unknown[]
    auto_fixed: string[]
    summary?: string
  }
}

export interface CoachNotesRequest {
  course: {
    obstacles: AIObstacle[]
    field_width?: number
    field_height?: number
    difficulty?: string
  }
  validation?: unknown
}

export interface CoachNotesResponse {
  source: 'llm' | 'fallback'
  training_goals: string[]
  rhythm_advice: string[]
  common_mistakes: string[]
  coach_commands: string[]
  risk_focus: string[]
}

export interface PurchaseRequest {
  quota: number
}

export interface PurchaseResponse {
  order_id: string
  amount: string
  quota_count: number
}

export const aiApi = {
  generate(data: AIGenerateRequest) {
    return request.post<{ code: number; message: string; data: AIGenerateResponse }>(
      AI_API.generate,
      data
    )
  },

  getQuota() {
    return request.get<{ code: number; data: AIQuotaInfo }>(AI_API.quota)
  },

  editCourse(data: AIEditCourseRequest) {
    return request.post<{ code: number; message: string; data: AIEditCourseResponse }>(
      AI_API.editCourse,
      data
    )
  },

  coachNotes(data: CoachNotesRequest) {
    return request.post<{ code: number; message: string; data: CoachNotesResponse }>(
      AI_API.coachNotes,
      data
    )
  },

  purchase(data: PurchaseRequest) {
    return request.post<{ code: number; message: string; data: PurchaseResponse }>(
      AI_API.purchase,
      data
    )
  },

  getHistory(limit?: number) {
    const url = limit ? `${AI_API.history}?limit=${limit}` : AI_API.history
    return request.get<{ code: number; data: { histories: AIHistoryItem[] } }>(url)
  }
}

export const getAIGenerateErrorMessage = (error: unknown): string => {
  return getApiErrorMessage(error, '生成失败，请稍后重试')
}
