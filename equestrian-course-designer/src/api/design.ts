import type { DesignResponse, SaveDesignRequest } from '@/types/design'
import { request } from '@/utils/request'

// 保存设计
export const saveDesign = async (data: SaveDesignRequest): Promise<DesignResponse> => {
  // 创建 FormData 对象
  const formData = new FormData()
  formData.append('title', data.title)
  formData.append('image', data.image)
  formData.append('download', data.download)

  console.log('保存设计数据:', {
    id: data.id,
    title: data.title,
    imageSize: data.image.size,
    downloadSize: data.download.size,
  })

  try {
    // 如果有ID，则是更新操作
    if (data.id) {
      console.log(`执行更新操作，设计ID: ${data.id}`)
      const response = await request.put<DesignResponse>(`/designs/${data.id}/`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      console.log('更新成功，响应:', response)
      return response
    }

    // 否则是创建操作
    console.log('执行创建操作')
    const response = await request.post<DesignResponse>('/designs/', formData, {
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

// // 获取设计列表
// export const getDesigns = async (): Promise<DesignResponse[]> => {
//   return request.get<DesignResponse[]>('/designs/')
// }

// // 获取设计详情
// export const getDesign = async (id: number): Promise<DesignResponse> => {
//   return request.get<DesignResponse>(`/designs/${id}/`)
// }

// // 更新设计
// export const updateDesign = async (
//   id: number,
//   data: Partial<SaveDesignRequest>,
// ): Promise<DesignResponse> => {
//   // 创建 FormData 对象
//   const formData = new FormData()
//   if (data.title) formData.append('title', data.title)
//   if (data.image) formData.append('image', data.image)
//   if (data.download) formData.append('download', data.download)

//   return request.put<DesignResponse>(`/designs/${id}/`, formData, {
//     headers: {
//       'Content-Type': 'multipart/form-data',
//     },
//   })
// }

// // 删除设计
// export const deleteDesign = async (id: number): Promise<void> => {
//   return request.delete<void>(`/designs/${id}/`)
// }
