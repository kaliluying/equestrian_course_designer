// 设计数据接口
export interface Design {
  id?: number
  title: string
  image: File | string
  create_time?: string
  update_time?: string
  author?: number
  author_username?: string
  download: File | string
  is_shared?: boolean
  description?: string
  likes_count?: number
  downloads_count?: number
  is_liked?: boolean
}

// 设计保存响应接口
export interface DesignResponse {
  id: number
  title: string
  image: string
  create_time: string
  update_time: string
  author: number
  author_username: string
  download: string
  is_shared: boolean
  description: string | null
  likes_count: number
  downloads_count: number
  is_liked: boolean
}

// 设计保存请求接口
export interface SaveDesignRequest {
  id?: number
  title: string
  image: File
  download: File
  description?: string
  is_shared?: boolean
}
