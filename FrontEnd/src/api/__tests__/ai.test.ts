import { describe, expect, it, vi } from 'vitest'
import type { AIGenerateResponse } from '@/api/ai'
import { aiApi, getAIGenerateErrorMessage } from '@/api/ai'

vi.mock('@/utils/request', () => ({
  request: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

describe('ai api 类型与错误消息', () => {
  it('生成响应包含校验、警告和自动修正反馈', () => {
    const response: AIGenerateResponse = {
      history_id: 1,
      obstacles: [],
      path: {
        visible: false,
        points: [],
        startPoint: { x: 0, y: 0, rotation: 0 },
        endPoint: { x: 0, y: 0, rotation: 180 },
      },
      difficulty_score: 3,
      estimated_time: 20,
      explanation: '测试说明',
      teaching_notes: '测试建议',
      remaining_quota: 2,
      validation: {
        is_valid: true,
        issues: [],
        warnings: ['建议增加左转弯'],
        auto_fixed: ['障碍物1位置已修正'],
        source: 'llm',
        fallback_reason: '',
      },
    }

    expect(response.validation.warnings).toContain('建议增加左转弯')
    expect(response.validation.auto_fixed).toContain('障碍物1位置已修正')
  })


  it('购买 AI 配额会请求下单接口并支持支付链接类型', async () => {
    const { request } = await import('@/utils/request')
    vi.mocked(request.post).mockResolvedValueOnce({
      success: true,
      code: 200,
      message: '订单创建成功',
      data: {
        order_id: 'AI123',
        amount: '24.90',
        quota_count: 30,
        payment_url: 'https://pay.example.com/order',
      },
    })

    const response = await aiApi.purchase({ quota: 30 })

    expect(request.post).toHaveBeenCalledWith('/user/ai/purchase/', { quota: 30 })
    expect(response.data?.payment_url).toBe('https://pay.example.com/order')
  })

  it('查询 AI 配额订单状态使用支付轮询接口', async () => {
    const { request } = await import('@/utils/request')
    vi.mocked(request.get).mockResolvedValueOnce({
      success: true,
      message: '支付成功',
      data: { order: { order_id: 'AI123', status: 'paid' } },
    })

    await aiApi.getQuotaOrderStatus('AI123')

    expect(request.get).toHaveBeenCalledWith('/user/api/payment/order-status/AI123/')
  })

  it.each([
    [{ response: { data: { message: { prompt: ['请输入设计需求描述'] } } } }, '请输入设计需求描述'],
    [{ response: { data: { detail: '认证已过期' } } }, '认证已过期'],
    [{ response: { data: { error: '模型服务不可用' } } }, '模型服务不可用'],
    [{ message: 'Network Error' }, '网络错误，请检查您的网络连接'],
    [{ message: 'timeout of 120000ms exceeded' }, '请求超时，请稍后重试'],
  ])('从异常响应中提取稳定文案 %#', (error, expected) => {
    expect(getAIGenerateErrorMessage(error)).toBe(expected)
  })
})
