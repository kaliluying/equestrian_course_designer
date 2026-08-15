import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AIGenerateDialog from '@/components/AIGenerateDialog.vue'
import { useUserStore } from '@/stores/user'

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  getQuota: vi.fn(),
  importAIResult: vi.fn(),
  push: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  purchase: vi.fn(),
  getQuotaOrderStatus: vi.fn(),
}))

vi.mock('@/api/ai', () => ({
  aiApi: {
    generate: mocks.generate,
    getQuota: mocks.getQuota,
    purchase: mocks.purchase,
    getQuotaOrderStatus: mocks.getQuotaOrderStatus,
  },
  getAIGenerateErrorMessage: (error: unknown) => {
    const data = (error as { response?: { data?: { message?: string } } }).response?.data
    return data?.message ?? '生成失败，请稍后重试'
  },
}))

vi.mock('@/stores/course', () => ({
  useCourseStore: () => ({
    importAIResult: mocks.importAIResult,
  }),
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return {
    ...actual,
    useRouter: () => ({
      push: mocks.push,
    }),
  }

})
vi.mock('element-plus', async () => {
  const actual = await vi.importActual<typeof import('element-plus')>('element-plus')
  return {
    ...actual,
    ElMessage: {
      success: mocks.success,
      error: mocks.error,
      warning: mocks.warning,
    },
  }
})

const passthroughStubs = {
  'el-alert': { template: '<div>{{ title }}<slot /></div>', props: ['title'] },
  'el-button': { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  'el-card': { template: '<section><slot /></section>' },
  'el-col': { template: '<div><slot /></div>' },
  'el-dialog': {
    template: '<div><slot /><footer><slot name="footer" /></footer></div>',
    props: ['modelValue'],
  },
  'el-divider': { template: '<div><slot /></div>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-icon': { template: '<i><slot /></i>' },
  'el-input': { template: '<textarea />' },
  'el-radio-button': { template: '<span><slot /></span>' },
  'el-radio-group': { template: '<div><slot /></div>' },
  'el-row': { template: '<div><slot /></div>' },
  'el-slider': { template: '<div />' },
  'el-tag': { template: '<span><slot /></span>' },
}

describe('AIGenerateDialog', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mocks.getQuota.mockResolvedValue({
      data: {
        free_quota: 3,
        purchased_quota: 0,
        used_quota: 1,
        remaining_quota: 2,
      },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('生成后展示校验警告和自动修正反馈', async () => {
    const userStore = useUserStore()
    userStore.isAuthenticated = true
    mocks.generate.mockResolvedValue({
      success: true,
      code: 200,
      message: '生成成功',
      data: {
        history_id: 1,
        obstacles: [{ id: 'obs_1', type: 'SINGLE', position: { x: 10, y: 10 }, rotation: 0, number: '1', poles: [] }],
        path: {
          visible: true,
          points: [{ x: 10, y: 10 }],
          startPoint: { x: 10, y: 10, rotation: 0 },
          endPoint: { x: 20, y: 20, rotation: 180 },
        },
        difficulty_score: 4,
        estimated_time: 30,
        explanation: '测试路线',
        teaching_notes: '测试建议',
        remaining_quota: 1,
        validation: {
          is_valid: false,
          issues: ['障碍物1与2间距不足'],
          warnings: ['建议增加左转弯'],
          auto_fixed: ['障碍物1位置从(-20.0, 10.0)修正为(5.0, 10.0)'],
          source: 'llm',
          fallback_reason: '',
        },
      },
    })

    const wrapper = mount(AIGenerateDialog, {
      global: {
        stubs: passthroughStubs,
      },
    })

    wrapper.vm.open()
    await Promise.resolve()
    const vm = wrapper.vm as unknown as {
      form: { prompt: string }
      handleGenerate: () => Promise<void>
    }
    vm.form.prompt = '生成测试路线'
    await vm.handleGenerate()
    await Promise.resolve()
    await Promise.resolve()

    expect(wrapper.text()).toContain('校验反馈')
    expect(wrapper.text()).toContain('需注意')
    expect(wrapper.text()).toContain('障碍物1与2间距不足')
    expect(wrapper.text()).toContain('建议增加左转弯')
    expect(wrapper.text()).toContain('已自动修正')
    expect(wrapper.text()).toContain('障碍物1位置从(-20.0, 10.0)修正为(5.0, 10.0)')
  })

  it('配额不足时可直接购买次数并打开支付链接', async () => {
    const userStore = useUserStore()
    userStore.isAuthenticated = true
    mocks.getQuota.mockResolvedValueOnce({
      data: {
        free_quota: 3,
        purchased_quota: 0,
        used_quota: 3,
        remaining_quota: 0,
      },
    })
    mocks.purchase.mockResolvedValueOnce({
      success: true,
      code: 200,
      data: {
        order_id: 'AI123',
        amount: '9.90',
        quota_count: 10,
        payment_url: 'https://pay.example.com/order',
      },
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    const wrapper = mount(AIGenerateDialog, {
      global: { stubs: passthroughStubs },
    })
    wrapper.vm.open()
    await Promise.resolve()
    await Promise.resolve()

    const vm = wrapper.vm as unknown as {
      selectedQuota: number
      handlePurchase: () => Promise<void>
    }
    vm.selectedQuota = 10
    await vm.handlePurchase()

    expect(mocks.purchase).toHaveBeenCalledWith({ quota: 10 })
    expect(openSpy).toHaveBeenCalledWith('https://pay.example.com/order', '_blank')
    expect(wrapper.text()).toContain('正在等待支付结果')
    openSpy.mockRestore()
  })


  it('支付成功后轮询订单状态并刷新剩余配额', async () => {
    vi.useFakeTimers()
    const userStore = useUserStore()
    userStore.isAuthenticated = true
    mocks.getQuota
      .mockResolvedValueOnce({
        data: {
          free_quota: 3,
          purchased_quota: 0,
          used_quota: 3,
          remaining_quota: 0,
        },
      })
      .mockResolvedValueOnce({
        data: {
          free_quota: 3,
          purchased_quota: 10,
          used_quota: 3,
          remaining_quota: 10,
        },
      })
    mocks.purchase.mockResolvedValueOnce({
      success: true,
      code: 200,
      data: {
        order_id: 'AI123',
        amount: '9.90',
        quota_count: 10,
        payment_url: 'https://pay.example.com/order',
      },
    })
    mocks.getQuotaOrderStatus.mockResolvedValueOnce({
      success: true,
      message: '支付成功',
      data: { order: { order_id: 'AI123', status: 'paid' } },
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    const wrapper = mount(AIGenerateDialog, {
      global: { stubs: passthroughStubs },
    })
    wrapper.vm.open()
    await Promise.resolve()
    await Promise.resolve()

    const vm = wrapper.vm as unknown as { handlePurchase: () => Promise<void> }
    await vm.handlePurchase()
    await vi.advanceTimersByTimeAsync(3000)
    await Promise.resolve()

    expect(mocks.getQuotaOrderStatus).toHaveBeenCalledWith('AI123')
    expect(mocks.getQuota).toHaveBeenCalledTimes(2)
    expect(wrapper.text()).toContain('剩余次数: 10')
    openSpy.mockRestore()
  })

  it('支付轮询请求未完成时不会并发发起下一次查询', async () => {
    vi.useFakeTimers()
    const userStore = useUserStore()
    userStore.isAuthenticated = true
    mocks.purchase.mockResolvedValueOnce({
      success: true,
      code: 200,
      data: {
        order_id: 'AI-slow',
        amount: '9.90',
        quota_count: 10,
        payment_url: 'https://pay.example.com/order',
      },
    })
    let resolveStatus!: (value: {
      data: { order: { order_id: string; status: 'paid' } }
    }) => void
    mocks.getQuotaOrderStatus.mockReturnValueOnce(new Promise((resolve) => {
      resolveStatus = resolve
    }))
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    const wrapper = mount(AIGenerateDialog, {
      global: { stubs: passthroughStubs },
    })
    wrapper.vm.open()
    await Promise.resolve()
    await Promise.resolve()

    const vm = wrapper.vm as unknown as { handlePurchase: () => Promise<void> }
    await vm.handlePurchase()
    await vi.advanceTimersByTimeAsync(9000)

    expect(mocks.getQuotaOrderStatus).toHaveBeenCalledTimes(1)

    resolveStatus({ data: { order: { order_id: 'AI-slow', status: 'paid' } } })
    await Promise.resolve()
    await Promise.resolve()
    expect(mocks.getQuotaOrderStatus).toHaveBeenCalledTimes(1)
    openSpy.mockRestore()
  })


  it('支付长期未完成时停止轮询并提示用户', async () => {
    vi.useFakeTimers()
    const userStore = useUserStore()
    userStore.isAuthenticated = true
    mocks.getQuota.mockResolvedValueOnce({
      data: {
        free_quota: 3,
        purchased_quota: 0,
        used_quota: 3,
        remaining_quota: 0,
      },
    })
    mocks.purchase.mockResolvedValueOnce({
      success: true,
      code: 200,
      data: {
        order_id: 'AI-timeout',
        amount: '9.90',
        quota_count: 10,
        payment_url: 'https://pay.example.com/order',
      },
    })
    mocks.getQuotaOrderStatus.mockResolvedValue({
      success: true,
      message: '订单未支付或支付处理中',
      data: { order: { order_id: 'AI-timeout', status: 'pending' } },
      alipay_status: 'WAIT_BUYER_PAY',
    })
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)

    const wrapper = mount(AIGenerateDialog, {
      global: { stubs: passthroughStubs },
    })
    wrapper.vm.open()
    await Promise.resolve()
    await Promise.resolve()

    const vm = wrapper.vm as unknown as { handlePurchase: () => Promise<void> }
    await vm.handlePurchase()
    await vi.advanceTimersByTimeAsync(183000)
    await Promise.resolve()

    expect(mocks.getQuotaOrderStatus).toHaveBeenCalledTimes(60)
    expect(wrapper.text()).toContain('暂未确认支付结果')
    openSpy.mockRestore()
  })

  it('支付宝未配置时展示降级提示', async () => {
    const userStore = useUserStore()
    userStore.isAuthenticated = true
    mocks.purchase.mockRejectedValueOnce({
      response: { data: { message: '支付功能暂不可用：支付宝参数未配置' } },
    })

    const wrapper = mount(AIGenerateDialog, {
      global: { stubs: passthroughStubs },
    })
    wrapper.vm.open()
    await Promise.resolve()

    const vm = wrapper.vm as unknown as { handlePurchase: () => Promise<void> }
    await vm.handlePurchase()

    expect(mocks.warning).toHaveBeenCalledWith('支付功能暂不可用：支付宝参数未配置')
  })
})
