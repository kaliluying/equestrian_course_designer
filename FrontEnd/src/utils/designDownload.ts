import type { DesignDownloadResponse } from '@/types/design'

export const triggerDesignDownload = async (response: DesignDownloadResponse): Promise<void> => {
  const downloadUrl = response.download_url.trim()
  if (!downloadUrl) {
    throw new Error('服务器未返回有效的下载链接')
  }

  const filename = response.filename.trim() || `design.${response.file_type}`
  const fileResponse = await fetch(downloadUrl, { credentials: 'include' })
  if (!fileResponse.ok) {
    throw new Error(`下载文件失败，状态码: ${fileResponse.status}`)
  }

  const blob = await fileResponse.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  try {
    link.href = objectUrl
    link.download = filename
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
  } finally {
    document.body.removeChild(link)
    URL.revokeObjectURL(objectUrl)
  }
}
