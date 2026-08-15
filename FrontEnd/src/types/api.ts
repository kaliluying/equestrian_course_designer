// 通用 API 类型
export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
}

export interface ApiCodeResponse<T = unknown> extends ApiResponse<T> {
  code: number
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}
