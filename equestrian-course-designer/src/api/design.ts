import type { DesignResponse, SaveDesignRequest } from '@/types/design'
import { request } from '@/utils/request'

// 保存设计
export const saveDesign = async (data: SaveDesignRequest): Promise<DesignResponse> => {
  // 创建 FormData 对象
  const formData = new FormData()
  formData.append('title', data.title)
  formData.append('image', data.image)
  formData.append('download', data.download)

  return request.post<DesignResponse>('/designs/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

// 获取设计列表
export const getDesigns = async (): Promise<DesignResponse[]> => {
  return request.get<DesignResponse[]>('/designs/')
}

// 获取设计详情
export const getDesign = async (id: number): Promise<DesignResponse> => {
  return request.get<DesignResponse>(`/designs/${id}/`)
}

// 更新设计
export const updateDesign = async (
  id: number,
  data: Partial<SaveDesignRequest>,
): Promise<DesignResponse> => {
  // 创建 FormData 对象
  const formData = new FormData()
  if (data.title) formData.append('title', data.title)
  if (data.image) formData.append('image', data.image)
  if (data.download) formData.append('download', data.download)

  return request.put<DesignResponse>(`/designs/${id}/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

// 删除设计
export const deleteDesign = async (id: number): Promise<void> => {
  return request.delete<void>(`/designs/${id}/`)
}
