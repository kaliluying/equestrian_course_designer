import { request } from '@/utils/request'

export interface CourseTemplate {
  id: number
  title: string
  description: string | null
  difficulty: 'easy' | 'medium' | 'hard'
  field_width: number
  field_height: number
  obstacle_count: number
  course_data: Record<string, unknown>
  cover_image?: string | null
  is_public: boolean
  is_official: boolean
  author: number
  author_username?: string | null
  copy_count: number
  favorite_count: number
  is_favorited: boolean
  created_at: string
  updated_at: string
}

export interface TemplateListParams {
  difficulty?: string
  obstacle_count?: number
  field_width?: number
  field_height?: number
  search?: string
  ordering?: 'latest' | 'popular'
}

export interface PaginatedTemplateResponse {
  count: number
  next: string | null
  previous: string | null
  results: CourseTemplate[]
}

const buildQuery = (params: TemplateListParams = {}) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value))
    }
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

export const getCourseTemplates = async (
  params: TemplateListParams = {},
): Promise<CourseTemplate[] | PaginatedTemplateResponse> => {
  return request.get<CourseTemplate[] | PaginatedTemplateResponse>(`/user/templates/${buildQuery(params)}`)
}

export const createCourseTemplate = async (
  data: Partial<CourseTemplate>,
): Promise<CourseTemplate> => {
  return request.post<CourseTemplate>('/user/templates/', data)
}

export const favoriteCourseTemplate = async (
  templateId: number,
): Promise<{ is_favorited: boolean; favorite_count: number }> => {
  return request.post<{ is_favorited: boolean; favorite_count: number }>(`/user/templates/${templateId}/favorite/`)
}

export const createDesignFromTemplate = async (
  templateId: number,
): Promise<{ id: number; title: string; template_id: number }> => {
  return request.post<{ id: number; title: string; template_id: number }>(`/user/templates/${templateId}/create-design/`)
}
