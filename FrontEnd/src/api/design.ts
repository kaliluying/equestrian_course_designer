import type {
  DesignDownloadResponse,
  DesignDownloadType,
  DesignResponse,
  SaveDesignRequest
} from '@/types/design'
import type { ApiResponse, PaginatedResponse } from '@/types/api'
import { request } from '@/utils/request'
import { cachedRequest, invalidateCache } from '@/utils/apiCache'

// 保存设计
export const saveDesign = async (data: SaveDesignRequest): Promise<DesignResponse> => {
  // 创建 FormData 对象
  const formData = new FormData()
  formData.append('title', data.title)
  formData.append('image', data.image)
  formData.append('download', data.download)

  // 添加描述字段
  if (data.description) {
    formData.append('description', data.description)
  }

  // 添加分享状态
  if (data.is_shared !== undefined) {
    formData.append('is_shared', data.is_shared.toString())
  }

  try {
    if (data.id) {
      invalidateCache()
      const response = await request.put<DesignResponse>(`/user/designs/${data.id}/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })

      return response
    }

    invalidateCache()
    const response = await request.post<DesignResponse>('/user/designs/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })

    return response
  } catch (error) {
    console.error('保存设计失败:', error)
    throw error
  }
}

// 获取设计列表
export const getDesigns = async (): Promise<DesignResponse[]> => {
  return request.get<DesignResponse[]>('/user/designs/')
}

// 获取用户自己的设计列表
export const getUserDesigns = async (
  page: number = 1,
): Promise<PaginatedResponse<DesignResponse>> => {
  return cachedRequest<PaginatedResponse<DesignResponse>>(
    `/user/designs/my/?page=${page}`,
    undefined,
    300000
  )
}

// 获取公开分享的设计列表
export const getSharedDesigns = async (
  page: number = 1,
): Promise<PaginatedResponse<DesignResponse>> => {
  return cachedRequest<PaginatedResponse<DesignResponse>>(
    `/user/designs/shared/?page=${page}`,
    undefined,
    300000
  )
}

// 获取设计详情
export const getDesign = async (id: number): Promise<DesignResponse> => {
  return cachedRequest<DesignResponse>(`/user/designs/${id}/`, undefined, 300000)
}

// 点赞/取消点赞设计
export const likeDesign = async (
  id: number,
): Promise<{
  message: string
  likes_count: number
  is_liked: boolean
}> => {
  return request.post<{
    message: string
    likes_count: number
    is_liked: boolean
  }>(`/user/designs/${id}/like/`)
}

// 分享/取消分享设计
export const shareDesign = async (
  id: number,
): Promise<{
  message: string
  is_shared: boolean
}> => {
  return request.post<{
    message: string
    is_shared: boolean
  }>(`/user/designs/${id}/share/`)
}

// 切换设计的分享状态
export const toggleDesignSharing = async (
  id: number,
): Promise<{
  message: string
  is_shared: boolean
}> => {
  return request.post<{
    message: string
    is_shared: boolean
  }>(`/user/designs/${id}/toggle-share/`)
}

// 下载设计
export const downloadDesign = async (
  id: number,
  fileType: DesignDownloadType = 'json',
): Promise<DesignDownloadResponse> => {
  const response = await request.get<DesignDownloadResponse>(
    `/user/designs/${id}/download/`,
    { params: { type: fileType } }
  )
  invalidateCache()

  return response
}

// 删除设计
export const deleteDesign = async (id: number): Promise<void> => {
  return request.delete<void>(`/user/designs/${id}/`)
}


export interface RouteValidationIssue {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  obstacle_ids: string[]
  suggested_action: string
  auto_fixable: boolean
}

export interface RouteValidationResult {
  score: number
  is_valid: boolean
  issues: RouteValidationIssue[]
  warnings: RouteValidationIssue[]
  auto_fixed: string[]
  summary: string
}

export interface RouteValidationRequest {
  obstacles: unknown[]
  field_width: number
  field_height: number
  difficulty?: 'easy' | 'medium' | 'hard'
  path?: Record<string, unknown>
}

export interface RouteFixPatch {
  code: string
  obstacle_ids: string[]
  message: string
}

export interface RouteFixResult {
  patches: RouteFixPatch[]
  updated_obstacles: unknown[]
  updated_path: Record<string, unknown> | null
  validation: RouteValidationResult
  explanation: string
}

export const validateCourse = async (
  data: RouteValidationRequest,
): Promise<RouteValidationResult> => {
  const response = await request.post<ApiResponse<RouteValidationResult>>(
    '/user/designs/validate-course/',
    data,
  )
  if (!response.data) {
    throw new Error('路线校验响应缺少数据')
  }
  return response.data
}


export interface DesignVersion {
  id: number
  design: number
  version_number: number
  source: 'manual' | 'autosave' | 'ai' | 'restore'
  title: string
  description: string | null
  remark?: string | null
  course_data: Record<string, unknown>
  created_at: string
}

export const getDesignVersions = async (designId: number): Promise<DesignVersion[]> => {
  return request.get<DesignVersion[]>(`/user/designs/${designId}/versions/`)
}

export const getDesignVersion = async (
  designId: number,
  versionId: number,
): Promise<DesignVersion> => {
  return request.get<DesignVersion>(`/user/designs/${designId}/versions/${versionId}/`)
}

export const restoreDesignVersion = async (
  designId: number,
  versionId: number,
): Promise<DesignResponse> => {
  invalidateCache()
  return request.post<DesignResponse>(`/user/designs/${designId}/versions/${versionId}/restore/`)
}

export const copyDesignVersion = async (
  designId: number,
  versionId: number,
): Promise<DesignResponse> => {
  invalidateCache()
  return request.post<DesignResponse>(`/user/designs/${designId}/versions/${versionId}/copy/`)
}


export const fixCourse = async (
  data: RouteValidationRequest,
): Promise<RouteFixResult> => {
  const response = await request.post<ApiResponse<RouteFixResult>>(
    '/user/designs/fix-course/',
    data,
  )
  if (!response.data) {
    throw new Error('路线修复响应缺少数据')
  }
  return response.data
}


export const updateDesignVersion = async (
  designId: number,
  versionId: number,
  data: { title?: string; remark?: string | null },
): Promise<DesignVersion> => {
  return request.patch<DesignVersion>(`/user/designs/${designId}/versions/${versionId}/`, data)
}


export interface DesignComment {
  id: number
  design: number
  user: number
  user_username: string | null
  content: string
  obstacle_id: string | null
  x: number | null
  y: number | null
  is_resolved: boolean
  created_at: string
  updated_at: string
}

export interface CollaborationEvent {
  id: number
  design: number
  user: number | null
  user_username: string | null
  event_type: string
  object_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

export interface ShareLinkOptions {
  role?: 'editor' | 'viewer' | 'commenter'
  expires_in_seconds?: number
  password?: string
}

export interface ShareLinkResponse {
  success: boolean
  message: string
  data: {
    shareUrl: string
    shareToken: string
    expiresAt: string
    ttlSeconds: number
    role: 'editor' | 'viewer' | 'commenter'
    passwordProtected: boolean
  }
}

export const generateDesignShareLink = async (
  designId: number | string,
  options: ShareLinkOptions = {},
): Promise<ShareLinkResponse> => {
  return request.post<ShareLinkResponse>(`/user/designs/${designId}/share-link/`, options)
}

export const getDesignComments = async (designId: number | string): Promise<DesignComment[]> => {
  return request.get<DesignComment[]>(`/user/designs/${designId}/comments/`)
}

export const createDesignComment = async (
  designId: number | string,
  data: { content: string; obstacle_id?: string | null; x?: number | null; y?: number | null },
): Promise<DesignComment> => {
  return request.post<DesignComment>(`/user/designs/${designId}/comments/`, data)
}

export const resolveDesignComment = async (
  designId: number | string,
  commentId: number,
): Promise<DesignComment> => {
  return request.post<DesignComment>(`/user/designs/${designId}/comments/${commentId}/resolve/`)
}

export const getCollaborationEvents = async (
  designId: number | string,
  userId?: number | string,
): Promise<CollaborationEvent[]> => {
  const query = userId ? `?user=${userId}` : ''
  return request.get<CollaborationEvent[]>(`/user/designs/${designId}/collaboration-events/${query}`)
}
