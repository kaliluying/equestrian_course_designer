/**
 * ToolBar Export Integration Tests
 * Tests the integration between ToolBar component and the enhanced export system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ElButton, ElDialog } from 'element-plus'
import ToolBar from '../ToolBar.vue'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import { ExportFormat } from '@/types/export'

// Mock the stores
vi.mock('@/stores/course')
vi.mock('@/stores/user')
vi.mock('@/utils/exportManager')

// Mock Element Plus components
vi.mock('element-plus', () => ({
  ElButton: { name: 'ElButton', template: '<button><slot /></button>' },
  ElDialog: { name: 'ElDialog', template: '<div><slot /></div>' },
  ElDropdown: { name: 'ElDropdown', template: '<div><slot /></div>' },
  ElDropdownMenu: { name: 'ElDropdownMenu', template: '<div><slot /></div>' },
  ElDropdownItem: { name: 'ElDropdownItem', template: '<div><slot /></div>' },
  ElForm: { name: 'ElForm', template: '<div><slot /></div>' },
  ElFormItem: { name: 'ElFormItem', template: '<div><slot /></div>' },
  ElSelect: { name: 'ElSelect', template: '<div><slot /></div>' },
  ElOption: { name: 'ElOption', template: '<div><slot /></div>' },
  ElSlider: { name: 'ElSlider', template: '<div><slot /></div>' },
  ElCheckbox: { name: 'ElCheckbox', template: '<div><slot /></div>' },
  ElInputNumber: { name: 'ElInputNumber', template: '<div><slot /></div>' },
  ElProgress: { name: 'ElProgress', template: '<div><slot /></div>' },
  ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  ElMessageBox: { confirm: vi.fn(), alert: vi.fn() },
  ElLoading: { service: vi.fn(() => ({ close: vi.fn() })) }
}))

describe('ToolBar Export Integration', () => {
  let wrapper: any
  let mockCourseStore: any
  let mockUserStore: any

  beforeEach(() => {
    // Setup mock stores
    mockCourseStore = {
      currentCourse: {
        name: 'Test Course',
        obstacles: [],
        fieldWidth: 80,
        fieldHeight: 60
      },
      exportCourse: vi.fn(() => ({ name: 'Test Course', obstacles: [] }))
    }

    mockUserStore = {
      currentUser: {
        id: 1,
        username: 'testuser'
      }
    }

    // Mock store functions
    vi.mocked(useCourseStore).mockReturnValue(mockCourseStore)
    vi.mocked(useUserStore).mockReturnValue(mockUserStore)

    // Mock DOM elements
    Object.defineProperty(document, 'querySelector', {
      value: vi.fn(() => ({
        getBoundingClientRect: () => ({ width: 800, height: 600 }),
        querySelectorAll: () => [],
        dispatchEvent: vi.fn()
      })),
      writable: true
    })

    wrapper = mount(ToolBar, {
      global: {
        components: {
          ElButton,
          ElDialog
        }
      }
    })
  })

  it('should render export dropdown with all format options', () => {
    expect(wrapper.find('.export-dropdown').exists()).toBe(true)
  })

  it('should show export options dialog when format is selected', async () => {
    // Simulate clicking PNG export
    await wrapper.vm.handleExport('png')

    expect(wrapper.vm.currentExportFormat).toBe(ExportFormat.PNG)
    expect(wrapper.vm.exportOptionsVisible).toBe(true)
  })

  it('should check user authentication before export', async () => {
    // Test with no user
    mockUserStore.currentUser = null

    const result = wrapper.vm.checkExportPermissions()
    expect(result).toBe(false)
  })

  it('should handle collaboration export correctly', async () => {
    // Mock canvas with collaboration methods
    const mockCanvas = {
      isCollaborating: vi.fn(() => true),
      triggerExportEvent: vi.fn()
    }

    document.querySelector = vi.fn(() => mockCanvas as any)

    const result = await wrapper.vm.handleCollaborationExport()
    expect(result).toBe(true)
    expect(mockCanvas.triggerExportEvent).toHaveBeenCalled()
  })

  it('should maintain export options for different formats', () => {
    const pngOptions = wrapper.vm.exportOptions[ExportFormat.PNG]
    const pdfOptions = wrapper.vm.exportOptions[ExportFormat.PDF]
    const jsonOptions = wrapper.vm.exportOptions[ExportFormat.JSON]

    expect(pngOptions).toHaveProperty('scale')
    expect(pngOptions).toHaveProperty('backgroundColor')
    expect(pdfOptions).toHaveProperty('paperSize')
    expect(pdfOptions).toHaveProperty('orientation')
    expect(jsonOptions).toHaveProperty('includeMetadata')
    expect(jsonOptions).toHaveProperty('prettyPrint')
  })

  it('should provide canvas access methods', () => {
    // Test that the component exposes necessary methods for export system integration
    expect(typeof wrapper.vm.handleExport).toBe('function')
    expect(typeof wrapper.vm.executeExport).toBe('function')
    expect(typeof wrapper.vm.checkExportPermissions).toBe('function')
    expect(typeof wrapper.vm.handleCollaborationExport).toBe('function')
  })
})
