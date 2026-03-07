import { config } from '@vue/test-utils'
import { afterEach, vi } from 'vitest'

afterEach(() => {
  document.body.innerHTML = ''
})

config.global.stubs = {
  ...(config.global.stubs ?? {}),
  'el-button': true,
  'el-card': true,
  'el-checkbox': true,
  'el-dialog': true,
  'el-dropdown': true,
  'el-dropdown-item': true,
  'el-dropdown-menu': true,
  'el-form': true,
  'el-form-item': true,
  'el-icon': true,
  'el-input': true,
  'el-input-number': true,
  'el-option': true,
  'el-progress': true,
  'el-radio': true,
  'el-radio-group': true,
  'el-select': true,
  'el-slider': true,
  'el-tooltip': true,
  AIGenerateDialog: true,
  CustomObstacleManager: true,
  ExportNotificationSystem: true,
}

Object.defineProperty(window, 'getComputedStyle', {
  value: vi.fn(() => ({
    getPropertyValue: vi.fn(() => ''),
  })),
})

Element.prototype.getBoundingClientRect = vi.fn(() => ({
  x: 0,
  y: 0,
  width: 800,
  height: 600,
  top: 0,
  left: 0,
  bottom: 600,
  right: 800,
  toJSON: () => ({}),
})) as any

Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get() {
    return Number.parseInt(this.style.width || '800', 10)
  },
})

Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get() {
    return Number.parseInt(this.style.height || '600', 10)
  },
})

Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', {
  configurable: true,
  value(callback: BlobCallback, type?: string) {
    callback(new Blob(['test'], { type: type ?? 'image/png' }))
  },
})


Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value() {
    return {
      getImageData: () => ({ data: new Uint8ClampedArray([255, 255, 255, 255]) }),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
    }
  },
})

Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: vi.fn(() => 'blob:test-url'),
})

Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  value: vi.fn(),
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: ResizeObserverMock,
})

document.createElementNS = vi.fn((namespace: string, tagName: string) => {
  const element = document.createElement(tagName)
  if (tagName === 'svg' || tagName === 'path' || tagName === 'circle' || tagName === 'line') {
    ;(element as any).getBBox = vi.fn(() => ({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    }))
  }
  return element as any
})

