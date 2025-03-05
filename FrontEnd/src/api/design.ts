import type { DesignResponse, SaveDesignRequest } from '@/types/design'
import { request } from '@/utils/request'

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

  console.log('保存设计数据:', {
    id: data.id,
    title: data.title,
    imageSize: data.image.size,
    downloadSize: data.download.size,
    description: data.description,
    is_shared: data.is_shared,
  })

  try {
    // 如果有ID，则是更新操作
    if (data.id) {
      console.log(`执行更新操作，设计ID: ${data.id}`)
      const response = await request.put<DesignResponse>(`/user/designs/${data.id}/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      console.log('更新成功，响应:', response)
      return response
    }

    // 否则是创建操作
    console.log('执行创建操作')
    const response = await request.post<DesignResponse>('/user/designs/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
    console.log('创建成功，响应:', response)
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

// 定义分页响应接口
export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// 获取用户自己的设计列表
export const getUserDesigns = async (
  page: number = 1,
): Promise<PaginatedResponse<DesignResponse>> => {
  return request.get<PaginatedResponse<DesignResponse>>(`/user/designs/my/?page=${page}`)
}

// 获取公开分享的设计列表
export const getSharedDesigns = async (
  page: number = 1,
): Promise<PaginatedResponse<DesignResponse>> => {
  return request.get<PaginatedResponse<DesignResponse>>(`/user/designs/shared/?page=${page}`)
}

// 获取设计详情
export const getDesign = async (id: number): Promise<DesignResponse> => {
  return request.get<DesignResponse>(`/user/designs/${id}/`)
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
  fileType: 'json' | 'png' | 'pdf' = 'json',
): Promise<{
  message: string
  download_url: string
  filename: string
  file_type: string
  downloads_count: number
}> => {
  return request.get<{
    message: string
    download_url: string
    filename: string
    file_type: string
    downloads_count: number
  }>(`/user/designs/${id}/download/?type=${fileType}`)
}

// 删除设计
export const deleteDesign = async (id: number): Promise<void> => {
  return request.delete<void>(`/user/designs/${id}/`)
}
