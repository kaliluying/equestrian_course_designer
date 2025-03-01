// 设计数据接口
export interface Design {
  id?: number
  title: string
  image: File | string
  create_time?: string
  update_time?: string
  author?: number
  download: File | string
}

// 设计保存响应接口
export interface DesignResponse {
  id: number
  title: string
  image: string
  create_time: string
  update_time: string
  author: number
  download: string
}

// 设计保存请求接口
export interface SaveDesignRequest {
  title: string
  image: File
  download: File
}
