import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesignDownloadResponse, DesignDownloadType } from '@/types/design'

const mocks = vi.hoisted(() => ({
  cachedRequest: vi.fn(),
  invalidateCache: vi.fn(),
  requestDelete: vi.fn(),
  requestGet: vi.fn(),
  requestPost: vi.fn(),
  requestPut: vi.fn(),
}))

vi.mock('@/utils/request', () => ({
  request: {
    delete: mocks.requestDelete,
    get: mocks.requestGet,
    post: mocks.requestPost,
    put: mocks.requestPut,
  },
}))

vi.mock('@/utils/apiCache', () => ({
  cachedRequest: mocks.cachedRequest,
  invalidateCache: mocks.invalidateCache,
}))

describe('design api 下载', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['json', '路线.json'],
    ['png', '路线.png'],
    ['pdf', '路线.pdf'],
  ] satisfies Array<[DesignDownloadType, string]>)(
    '按 %s 格式请求下载并清理列表缓存',
    async (fileType, filename) => {
      const downloadResponse: DesignDownloadResponse = {
        success: true,
        message: '下载成功',
        download_url: `http://localhost:8000/media/user_1/designs/1/${filename}`,
        filename,
        file_type: fileType,
        downloads_count: 3,
      }
      mocks.requestGet.mockResolvedValue(downloadResponse)
      const { downloadDesign } = await import('@/api/design')

      const response = await downloadDesign(1, fileType)

      expect(response).toEqual(downloadResponse)
      expect(mocks.requestGet).toHaveBeenCalledWith(
        '/user/designs/1/download/',
        { params: { type: fileType } }
      )
      expect(mocks.invalidateCache).toHaveBeenCalledTimes(1)
    }
  )

  it('未指定格式时默认下载 JSON', async () => {
    const downloadResponse: DesignDownloadResponse = {
      success: true,
      message: '下载成功',
      download_url: 'http://localhost:8000/media/user_1/designs/1/design.json',
      filename: '路线.json',
      file_type: 'json',
      downloads_count: 1,
    }
    mocks.requestGet.mockResolvedValue(downloadResponse)
    const { downloadDesign } = await import('@/api/design')

    const response = await downloadDesign(1)

    expect(response).toEqual(downloadResponse)
    expect(mocks.requestGet).toHaveBeenCalledWith(
      '/user/designs/1/download/',
      { params: { type: 'json' } }
    )
  })
})
