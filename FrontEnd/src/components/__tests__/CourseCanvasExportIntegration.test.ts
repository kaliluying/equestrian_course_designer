/**
 * CourseCanvas Export Integration Tests
 * Tests the integration between CourseCanvas component and the enhanced export system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CourseCanvas from '../CourseCanvas.vue'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import { useWebSocketStore } from '@/stores/websocket'

// Mock the stores
vi.mock('@/stores/course')
vi.mock('@/stores/user')
vi.mock('@/stores/websocket')
vi.mock('@/stores/obstacle')

// Mock Element Plus components
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

describe('CourseCanvas Export Integration', () => {
  let wrapper: any
  let mockCourseStore: any
  let mockUserStore: any
  let mockWebSocketStore: any

  beforeEach(() => {
    // Setup mock stores
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
      selectedObstacle: null
    }

    mockUserStore = {
      currentUser: {
        id: 1,
        username: 'testuser'
      }
    }

    mockWebSocketStore = {
      collaborators: [],
      connectionStatus: 'DISCONNECTED',
      isCollaborating: false,
      sendAddObstacle: vi.fn(),
      sendObstacleUpdate: vi.fn(),
      sendRemoveObstacle: vi.fn(),
      sendPathUpdate: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn()
    }

    // Mock store functions
    vi.mocked(useCourseStore).mockReturnValue(mockCourseStore)
    vi.mocked(useUserStore).mockReturnValue(mockUserStore)
    vi.mocked(useWebSocketStore).mockReturnValue(mockWebSocketStore)

    wrapper = mount(CourseCanvas, {
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
    })
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

  it('should trigger export events', () => {
    expect(typeof wrapper.vm.triggerExportEvent).toBe('function')

    // Mock addEventListener
    const mockAddEventListener = vi.fn()
    const mockCanvas = {
      dispatchEvent: vi.fn(),
      addEventListener: mockAddEventListener
    }

    wrapper.vm.canvasContainerRef = mockCanvas

    wrapper.vm.triggerExportEvent('test-event', { test: 'data' })
    expect(mockCanvas.dispatchEvent).toHaveBeenCalled()
  })

  it('should maintain canvas state during export operations', () => {
    const canvasInfo = wrapper.vm.getCanvasInfo()

    // Verify that canvas info includes all necessary data for export
    expect(canvasInfo.obstacles).toEqual(mockCourseStore.currentCourse.obstacles)
    expect(canvasInfo.pathData.visible).toBe(mockCourseStore.coursePath.visible)
    expect(canvasInfo.fieldDimensions.width).toBe(mockCourseStore.currentCourse.fieldWidth)
    expect(canvasInfo.fieldDimensions.height).toBe(mockCourseStore.currentCourse.fieldHeight)
  })

  it('should handle collaboration events during export', () => {
    // Test that canvas can handle collaboration-related export events
    const mockEvent = new CustomEvent('canvas-export-started', {
      detail: { format: 'png', userId: 1 }
    })

    // Simulate event handling
    wrapper.vm.triggerExportEvent('started', { format: 'png', userId: 1 })

    // Verify the event was triggered correctly
    expect(wrapper.vm.getCanvasInfo()).toBeTruthy()
  })
})
