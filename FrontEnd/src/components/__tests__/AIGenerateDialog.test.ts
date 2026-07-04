import { beforeEach, describe, expect, it, vi } from 'vitest'
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
}))

vi.mock('@/api/ai', () => ({
  aiApi: {
    generate: mocks.generate,
    getQuota: mocks.getQuota,
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
    },
  }
})

const passthroughStubs = {
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

  it('生成后展示校验警告和自动修正反馈', async () => {
    const userStore = useUserStore()
    userStore.isAuthenticated = true
    mocks.generate.mockResolvedValue({
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
})
