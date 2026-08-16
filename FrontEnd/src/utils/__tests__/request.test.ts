import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const instance = vi.fn()
  instance.interceptors = {
    request: { use: vi.fn() },
    response: { use: vi.fn() },
  }
  instance.post = vi.fn()
  instance.get = vi.fn()
  instance.put = vi.fn()
  instance.patch = vi.fn()
  instance.delete = vi.fn()
  return {
    instance,
    axiosGet: vi.fn(),
  }
})

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => mocks.instance),
    get: mocks.axiosGet,
  },
}))

vi.mock('@/api/user', () => ({
  logout: vi.fn(),
}))

vi.mock('@/stores/user', () => ({
  useUserStore: vi.fn(() => ({ logout: vi.fn() })),
}))

vi.mock('@/router', () => ({
  default: {},
}))

vi.mock('element-plus', () => ({
  ElMessage: { error: vi.fn() },
}))

describe('request token refresh', () => {
  let rejectResponse: (error: unknown) => Promise<unknown>

  beforeEach(async () => {
    vi.clearAllMocks()
    mocks.instance.mockResolvedValue('retried')
    const requestInterceptor = (await import('@/utils/request')) as unknown
    void requestInterceptor
    const responseUse = mocks.instance.interceptors.response.use as ReturnType<typeof vi.fn>
    rejectResponse = responseUse.mock.calls[0][1] as (error: unknown) => Promise<unknown>
  })

  it('并发 401 只轮换一次 refresh token', async () => {
    let resolveRefresh: (() => void) | undefined
    mocks.instance.post.mockReturnValueOnce(new Promise<void>((resolve) => {
      resolveRefresh = resolve
    }))

    const error = (url: string) => ({
      message: 'access token expired',
      response: { status: 401 },
      config: { url, method: 'get' },
    })

    const first = rejectResponse(error('/first'))
    const second = rejectResponse(error('/second'))

    await Promise.resolve()
    expect(mocks.instance.post).toHaveBeenCalledTimes(1)

    resolveRefresh?.()
    await expect(Promise.all([first, second])).resolves.toEqual(['retried', 'retried'])
    expect(mocks.instance).toHaveBeenCalledTimes(2)
  })
})
