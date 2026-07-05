import type { SaveDesignRequest } from '@/types/design'

export function sanitizeDesignFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || '未命名设计'
}

export function buildSaveDesignRequest(params: {
  title: string
  imageBlob: Blob
  designBlob: Blob
  designId?: string | null
}): SaveDesignRequest {
  const title = params.title || '未命名设计'
  const imageFileName = `${sanitizeDesignFileName(title)}.png`
  const request: SaveDesignRequest = {
    title,
    image: new File([params.imageBlob], imageFileName, { type: 'image/png' }),
    download: new File([params.designBlob], 'design.json', { type: 'application/json' }),
  }

  if (params.designId) {
    const parsedId = Number(params.designId)
    if (!Number.isFinite(parsedId)) {
      throw new Error('设计ID无效，无法更新')
    }
    request.id = parsedId
  }

  return request
}
