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

vi.mock('@/stores/course')
vi.mock('@/stores/user')
vi.mock('@/utils/exportManager')

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
      },
      isAuthenticated: true
    }

    vi.mocked(useCourseStore).mockReturnValue(mockCourseStore)
    vi.mocked(useUserStore).mockReturnValue(mockUserStore)

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

  it('should show export options dialog when pdf format is selected', async () => {
    await wrapper.vm.handleUnifiedExport('pdf')

    expect(wrapper.vm.currentExportFormat).toBe(ExportFormat.PDF)
    expect(wrapper.vm.exportOptionsVisible).toBe(true)
  })

  it('should check user authentication before export', async () => {
    mockUserStore.currentUser = null

    const result = wrapper.vm.checkExportPermissions()
    expect(result).toBe(false)
  })

  it('should handle collaboration export correctly', async () => {
    const mockCanvas = {
      isCollaborating: vi.fn(() => true),
      triggerExportEvent: vi.fn()
    }

    document.querySelector = vi.fn(() => mockCanvas as any)

    const result = await wrapper.vm.handleCollaborationExport()
    expect(result).toBe(true)
    expect(mockCanvas.triggerExportEvent).toHaveBeenCalled()
  })

  it('should keep only pdf export options in component state', () => {
    const pdfOptions = wrapper.vm.exportOptions[ExportFormat.PDF]

    expect(Object.keys(wrapper.vm.exportOptions)).toEqual([ExportFormat.PDF])
    expect(pdfOptions).toHaveProperty('paperSize')
    expect(pdfOptions).toHaveProperty('orientation')
    expect(pdfOptions).toHaveProperty('margins')
    expect(pdfOptions).toHaveProperty('includeMetadata')
  })

  it('should provide current export integration methods', () => {
    expect(typeof wrapper.vm.handleUnifiedExport).toBe('function')
    expect(typeof wrapper.vm.executePDFExport).toBe('function')
    expect(typeof wrapper.vm.checkExportPermissions).toBe('function')
    expect(typeof wrapper.vm.handleCollaborationExport).toBe('function')
  })
})
