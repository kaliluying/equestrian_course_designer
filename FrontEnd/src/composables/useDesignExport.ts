import { ElMessage } from 'element-plus'
import { downloadDesign } from '@/api/design'
import { triggerDesignDownload } from '@/utils/designDownload'

export function buildTimestampedFileName(courseName: string, now = new Date()): string {
  const formattedDateTime = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  return `${courseName}-${formattedDateTime}`
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export async function exportSavedDesignPackage(designId: string | number, fileType: 'report' | 'zip') {
  const response = await downloadDesign(Number(designId), fileType)
  await triggerDesignDownload(response)
  ElMessage.success(fileType === 'report' ? '专业报告导出成功' : '批量导出包已下载')
}

export function useDesignExport() {
  return {
    buildTimestampedFileName,
    downloadBlob,
    exportSavedDesignPackage,
  }
}
