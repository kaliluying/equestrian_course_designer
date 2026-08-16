import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PropertiesPanel from '@/components/PropertiesPanel.vue'

const mocks = vi.hoisted(() => ({
  courseStore: {
    currentCourse: { fieldWidth: 80, fieldHeight: 60 },
    selectedObstacle: {
      id: 'obstacle-1',
      type: 'SINGLE',
      position: { x: 10, y: 10 },
      rotation: 0,
      poles: [{ height: 1, width: 3.5, color: '#8B4513' }],
    },
    coursePath: { visible: false, points: [] },
    startPoint: { x: 0, y: 0, rotation: 270 },
    endPoint: { x: 0, y: 0, rotation: 270 },
    updateObstacle: vi.fn(),
    updateStartRotation: vi.fn(),
    updateEndRotation: vi.fn(),
    removeObstacle: vi.fn(),
  },
  webSocketStore: {
    isCollaborating: false,
    sendObstacleUpdate: vi.fn(),
  },
}))

vi.mock('@/stores/course', () => ({
  useCourseStore: () => mocks.courseStore,
}))

vi.mock('@/stores/websocket', () => ({
  useWebSocketStore: () => mocks.webSocketStore,
}))

const passthroughStub = { template: '<div><slot /></div>' }
const sliderStub = {
  emits: ['update:modelValue'],
  template: '<button class="test-slider" @click="$emit(\'update:modelValue\', 90)">slider</button>',
}

describe('PropertiesPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.webSocketStore.isCollaborating = false
  })

  it('连接建立后仍会广播属性修改', async () => {
    const wrapper = mount(PropertiesPanel, {
      global: {
        stubs: {
          'el-button': passthroughStub,
          'el-checkbox': passthroughStub,
          'el-color-picker': passthroughStub,
          'el-empty': passthroughStub,
          'el-form': passthroughStub,
          'el-form-item': passthroughStub,
          'el-input': passthroughStub,
          'el-input-number': passthroughStub,
          'el-slider': sliderStub,
        },
      },
    })

    mocks.webSocketStore.isCollaborating = true
    await wrapper.get('.test-slider').trigger('click')

    expect(mocks.courseStore.updateObstacle).toHaveBeenCalledWith('obstacle-1', { rotation: 90 })
    expect(mocks.webSocketStore.sendObstacleUpdate).toHaveBeenCalledWith(
      'obstacle-1',
      { rotation: 90 },
    )
  })
})
