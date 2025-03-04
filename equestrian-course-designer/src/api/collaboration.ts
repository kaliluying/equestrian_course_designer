import { request } from '@/utils/request'
import type { CollaborationSession } from '@/utils/websocket'

// 创建协作会话
export const createCollaborationSession = async (
  designId: string,
): Promise<CollaborationSession> => {
  return request.post<CollaborationSession>('/collaboration/sessions/', { designId })
}

// 获取协作会话信息
export const getCollaborationSession = async (sessionId: string): Promise<CollaborationSession> => {
  return request.get<CollaborationSession>(`/collaboration/sessions/${sessionId}/`)
}

// 加入协作会话
export const joinCollaborationSession = async (
  sessionId: string,
): Promise<CollaborationSession> => {
  return request.post<CollaborationSession>(`/collaboration/sessions/${sessionId}/join/`)
}

// 离开协作会话
export const leaveCollaborationSession = async (sessionId: string): Promise<void> => {
  return request.post<void>(`/collaboration/sessions/${sessionId}/leave/`)
}

// 获取用户的所有协作会话
export const getUserCollaborationSessions = async (): Promise<CollaborationSession[]> => {
  return request.get<CollaborationSession[]>('/collaboration/sessions/user/')
}

// 结束协作会话（仅会话所有者可操作）
export const endCollaborationSession = async (sessionId: string): Promise<void> => {
  return request.delete<void>(`/collaboration/sessions/${sessionId}/`)
}
