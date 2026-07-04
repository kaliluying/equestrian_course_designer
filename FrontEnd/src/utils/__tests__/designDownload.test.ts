import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesignDownloadResponse } from '@/types/design'
import { triggerDesignDownload } from '../designDownload'

const mocks = vi.hoisted(() => ({
  createObjectURL: vi.fn(),
  fetch: vi.fn(),
  revokeObjectURL: vi.fn(),
}))

const buildResponse = (
  overrides: Partial<DesignDownloadResponse> = {}
): DesignDownloadResponse => ({
  success: true,
  message: '下载成功',
  download_url: 'http://localhost:8000/media/user_1/designs/1/design.png',
  filename: '路线.png',
  file_type: 'png',
  downloads_count: 1,
  ...overrides,
})

describe('triggerDesignDownload', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mocks.fetch)
    vi.stubGlobal('URL', {
      createObjectURL: mocks.createObjectURL,
      revokeObjectURL: mocks.revokeObjectURL,
    })
    mocks.createObjectURL.mockReturnValue('blob:http://localhost:5173/design-download')
    mocks.fetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['design'], { type: 'image/png' })),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('拉取文件内容后创建临时链接并触发浏览器下载', async () => {
    const clickMock = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.href).toBe('blob:http://localhost:5173/design-download')
        expect(this.download).toBe('路线.png')
        expect(this.rel).toBe('noopener')
      })

    await triggerDesignDownload(buildResponse())

    expect(mocks.fetch).toHaveBeenCalledWith(
      'http://localhost:8000/media/user_1/designs/1/design.png',
      { credentials: 'include' }
    )
    expect(mocks.createObjectURL).toHaveBeenCalledTimes(1)
    expect(clickMock).toHaveBeenCalledTimes(1)
    expect(mocks.revokeObjectURL).toHaveBeenCalledWith(
      'blob:http://localhost:5173/design-download'
    )
    expect(document.body.querySelector('a')).toBeNull()
  })

  it('文件名为空时使用格式兜底', async () => {
    const clickMock = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        expect(this.download).toBe('design.pdf')
      })

    await triggerDesignDownload(buildResponse({ filename: '   ', file_type: 'pdf' }))

    expect(clickMock).toHaveBeenCalledTimes(1)
  })

  it('下载链接为空时抛出错误', async () => {
    await expect(
      triggerDesignDownload(buildResponse({ download_url: '' }))
    ).rejects.toThrow('服务器未返回有效的下载链接')
    expect(mocks.fetch).not.toHaveBeenCalled()
  })

  it('文件请求失败时抛出下载失败错误', async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      blob: () => Promise.resolve(new Blob()),
    })

    await expect(triggerDesignDownload(buildResponse())).rejects.toThrow(
      '下载文件失败，状态码: 404'
    )
    expect(mocks.createObjectURL).not.toHaveBeenCalled()
  })
})
