/**
 * CourseCanvas Export Integration Tests
 * Tests the integration between CourseCanvas component and the enhanced export system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import CourseCanvasV2 from '../CourseCanvasV2.vue'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import { useWebSocketStore } from '@/stores/websocket'
import { useHistoryStore } from '@/stores/history'
import { useObstacleStore } from '@/stores/obstacle'

vi.mock('@/stores/course')
vi.mock('@/stores/user')
vi.mock('@/stores/websocket')
vi.mock('@/stores/history')
vi.mock('@/stores/obstacle')

vi.mock('element-plus', () => ({
  ElIcon: { name: 'ElIcon', template: '<div><slot /></div>' },
  ElButton: { name: 'ElButton', template: '<button><slot /></button>' },
  ElDialog: { name: 'ElDialog', template: '<div><slot /></div>' },
  ElForm: { name: 'ElForm', template: '<div><slot /></div>' },
  ElFormItem: { name: 'ElFormItem', template: '<div><slot /></div>' },
  ElInputNumber: { name: 'ElInputNumber', template: '<div><slot /></div>' },
  ElTooltip: { name: 'ElTooltip', template: '<div><slot /></div>' },
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
}))

interface CanvasExportVm {
  getCanvasElement: () => HTMLElement
  getCanvasInfo: () => {
    element: HTMLElement
    bounds: DOMRect
    obstacles: unknown[]
    pathData: { visible: boolean }
    fieldDimensions: { width: number; height: number }
    scaleFactor: number
  }
  prepareCanvasForExport: () => {
    canvas: HTMLElement
    restore: () => void
  }
  triggerExportEvent: (eventName: string, detail: Record<string, unknown>) => void
}

describe('CourseCanvas Export Integration', () => {
  let wrapper: VueWrapper<CanvasExportVm>
  let mockCourseStore: ReturnType<typeof useCourseStore>
  let mockUserStore: ReturnType<typeof useUserStore>
  let mockWebSocketStore: ReturnType<typeof useWebSocketStore>
  let mockHistoryStore: ReturnType<typeof useHistoryStore>
  let mockObstacleStore: ReturnType<typeof useObstacleStore>

  beforeEach(() => {
    mockCourseStore = {
      currentCourse: {
        id: 1,
        name: 'Test Course',
        obstacles: [
          { id: 1, type: 'SINGLE', position: { x: 100, y: 100 }, rotation: 0, poles: [] }
        ],
        fieldWidth: 80,
        fieldHeight: 60
      },
      coursePath: {
        visible: true,
        points: []
      },
      startPoint: { x: 50, y: 50, rotation: 0 },
      endPoint: { x: 150, y: 150, rotation: 0 },
      selectedObstacle: null,
      commitHistory: vi.fn(),
      updateCourse: vi.fn(),
      clearPath: vi.fn(),
      removeObstacle: vi.fn(),
      addObstacle: vi.fn(),
      hydrateFromSnapshot: vi.fn()
    } as unknown as ReturnType<typeof useCourseStore>

    mockUserStore = {
      currentUser: {
        id: 1,
        username: 'testuser'
      }
    } as unknown as ReturnType<typeof useUserStore>

    mockWebSocketStore = {
      collaborators: [],
      connectionStatus: 'DISCONNECTED',
      isCollaborating: false,
      sendAddObstacle: vi.fn(),
      sendObstacleUpdate: vi.fn(),
      sendRemoveObstacle: vi.fn(),
      sendPathUpdate: vi.fn(),
      sendSyncResponse: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      session: null,
      socket: null
    } as unknown as ReturnType<typeof useWebSocketStore>

    mockHistoryStore = {
      clear: vi.fn(),
      undo: vi.fn(),
      redo: vi.fn()
    } as unknown as ReturnType<typeof useHistoryStore>

    mockObstacleStore = {
      getObstacleById: vi.fn(),
      sharedObstacles: []
    } as unknown as ReturnType<typeof useObstacleStore>

    vi.mocked(useCourseStore).mockReturnValue(mockCourseStore)
    vi.mocked(useUserStore).mockReturnValue(mockUserStore)
    vi.mocked(useWebSocketStore).mockReturnValue(mockWebSocketStore)
    vi.mocked(useHistoryStore).mockReturnValue(mockHistoryStore)
    vi.mocked(useObstacleStore).mockReturnValue(mockObstacleStore)

    wrapper = mount(CourseCanvasV2, {
      global: {
        stubs: {
          'el-icon': true,
          'el-button': true,
          'el-dialog': true,
          'el-form': true,
          'el-form-item': true,
          'el-input-number': true,
          'el-tooltip': true
        }
      }
    }) as VueWrapper<CanvasExportVm>
  })

  it('should expose canvas element access method', () => {
    expect(typeof wrapper.vm.getCanvasElement).toBe('function')

    const canvasElement = wrapper.vm.getCanvasElement()
    expect(canvasElement).toBeTruthy()
  })

  it('should provide canvas information for export', () => {
    expect(typeof wrapper.vm.getCanvasInfo).toBe('function')

    const canvasInfo = wrapper.vm.getCanvasInfo()
    expect(canvasInfo).toHaveProperty('element')
    expect(canvasInfo).toHaveProperty('bounds')
    expect(canvasInfo).toHaveProperty('obstacles')
    expect(canvasInfo).toHaveProperty('pathData')
    expect(canvasInfo).toHaveProperty('fieldDimensions')
    expect(canvasInfo).toHaveProperty('scaleFactor')
  })

  it('should prepare canvas for export by hiding control elements', () => {
    expect(typeof wrapper.vm.prepareCanvasForExport).toBe('function')

    const preparation = wrapper.vm.prepareCanvasForExport()
    expect(preparation).toHaveProperty('canvas')
    expect(preparation).toHaveProperty('restore')
    expect(typeof preparation.restore).toBe('function')
  })

  it('should trigger export events on mounted canvas element', () => {
    expect(typeof wrapper.vm.triggerExportEvent).toBe('function')

    const canvasElement = wrapper.vm.getCanvasElement()
    const dispatchEventSpy = vi.spyOn(canvasElement, 'dispatchEvent')

    wrapper.vm.triggerExportEvent('test-event', { test: 'data' })
    expect(dispatchEventSpy).toHaveBeenCalled()
  })

  it('should maintain canvas state during export operations', () => {
    const canvasInfo = wrapper.vm.getCanvasInfo()

    expect(canvasInfo.obstacles).toEqual(mockCourseStore.currentCourse.obstacles)
    expect(canvasInfo.pathData.visible).toBe(mockCourseStore.coursePath.visible)
    expect(canvasInfo.fieldDimensions.width).toBe(mockCourseStore.currentCourse.fieldWidth)
    expect(canvasInfo.fieldDimensions.height).toBe(mockCourseStore.currentCourse.fieldHeight)
  })

  it('should handle collaboration events during export', () => {
    wrapper.vm.triggerExportEvent('started', { format: 'png', userId: 1 })
    expect(wrapper.vm.getCanvasInfo()).toBeTruthy()
  })
})
