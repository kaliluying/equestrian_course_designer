import { request } from '@/utils/request'
import { AI_API } from '@/config/api'

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
  obstacles: Obstacle[]
  path: {
    visible: boolean
    points: Array<{ x: number; y: number }>
    startPoint: { x: number; y: number; rotation: number }
    endPoint: { x: number; y: number; rotation: number }
  }
  difficulty_score: number
  estimated_time: number
  explanation: string
  teaching_notes: string
  remaining_quota: number
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

export interface PurchaseRequest {
  quota: number
}

export interface PurchaseResponse {
  order_id: string
  amount: string
  quota_count: number
}

// 障碍物类型定义
interface Obstacle {
  id: string
  type: string
  position: { x: number; y: number }
  rotation: number
  number: string
  poles: Array<{ height: number; width: number; color: string }>
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
