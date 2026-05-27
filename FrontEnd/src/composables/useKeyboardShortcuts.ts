/**
 * @file useKeyboardShortcuts.ts
 * @description 键盘快捷键组合式函数
 * 提供全局键盘快捷键支持，包括撤销/重做、复制/粘贴、保存、删除等
 */

import { onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useCourseStore } from '@/stores/course'
import { useHistoryStore } from '@/stores/history'

export interface ShortcutConfig {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  description: string
  action: () => void | Promise<void>
  enabled?: () => boolean
}

export interface ShortcutCategory {
  name: string
  shortcuts: ShortcutConfig[]
}

export function useKeyboardShortcuts() {
  const courseStore = useCourseStore()
  const historyStore = useHistoryStore()

  const shortcuts: ShortcutCategory[] = [
    {
      name: '编辑',
      shortcuts: [
        {
          key: 'z',
          ctrl: true,
          description: '撤销',
          action: () => {
            if (historyStore.canUndo) {
              historyStore.undo()
              ElMessage.success('已撤销')
            } else {
              ElMessage.info('没有可撤销的操作')
            }
          },
          enabled: () => historyStore.canUndo
        },
        {
          key: 'y',
          ctrl: true,
          description: '重做',
          action: () => {
            if (historyStore.canRedo) {
              historyStore.redo()
              ElMessage.success('已重做')
            } else {
              ElMessage.info('没有可重做的操作')
            }
          },
          enabled: () => historyStore.canRedo
        },
        {
          key: 'z',
          ctrl: true,
          shift: true,
          description: '重做（备选）',
          action: () => {
            if (historyStore.canRedo) {
              historyStore.redo()
              ElMessage.success('已重做')
            }
          },
          enabled: () => historyStore.canRedo
        }
      ]
    },
    {
      name: '剪贴板',
      shortcuts: [
        {
          key: 'c',
          ctrl: true,
          description: '复制障碍物',
          action: () => {
            if (courseStore.selectedObstacle) {
              const success = courseStore.copyObstacle()
              if (success) {
                ElMessage.success('已复制障碍物')
              }
            } else {
              ElMessage.warning('请先选择一个障碍物')
            }
          },
          enabled: () => !!courseStore.selectedObstacle
        },
        {
          key: 'x',
          ctrl: true,
          description: '剪切障碍物',
          action: () => {
            if (courseStore.selectedObstacle) {
              const success = courseStore.cutObstacle()
              if (success) {
                ElMessage.success('已剪切障碍物')
              }
            } else {
              ElMessage.warning('请先选择一个障碍物')
            }
          },
          enabled: () => !!courseStore.selectedObstacle
        },
        {
          key: 'v',
          ctrl: true,
          description: '粘贴障碍物',
          action: () => {
            if (courseStore.clipboard) {
              const newObstacle = courseStore.pasteObstacle()
              if (newObstacle) {
                ElMessage.success('已粘贴障碍物')
              }
            } else {
              ElMessage.warning('剪贴板为空')
            }
          },
          enabled: () => !!courseStore.clipboard
        },
        {
          key: 'd',
          ctrl: true,
          description: '复制并粘贴',
          action: () => {
            if (courseStore.selectedObstacle) {
              courseStore.copyObstacle()
              courseStore.pasteObstacle()
              ElMessage.success('已复制并粘贴障碍物')
            } else {
              ElMessage.warning('请先选择一个障碍物')
            }
          },
          enabled: () => !!courseStore.selectedObstacle
        }
      ]
    },
    {
      name: '文件',
      shortcuts: [
        {
          key: 's',
          ctrl: true,
          description: '保存设计',
          action: async () => {
            try {
              courseStore.setSaveStatus('saving')
              courseStore.saveToLocalStorage()
              courseStore.setSaveStatus('saved')
              ElMessage.success('已保存到本地')
            } catch (error) {
              courseStore.setSaveStatus('failed', '保存失败')
              ElMessage.error('保存失败')
            }
          }
        }
      ]
    },
    {
      name: '删除',
      shortcuts: [
        {
          key: 'Delete',
          description: '删除选中障碍物',
          action: () => {
            if (courseStore.selectedObstacle) {
              const obstacleName = courseStore.selectedObstacle.number || '障碍物'
              courseStore.removeObstacle(courseStore.selectedObstacle.id)
              ElMessage.success(`已删除${obstacleName}`)
            } else {
              ElMessage.warning('请先选择一个障碍物')
            }
          },
          enabled: () => !!courseStore.selectedObstacle
        },
        {
          key: 'Backspace',
          description: '删除选中障碍物（备选）',
          action: () => {
            if (courseStore.selectedObstacle) {
              const obstacleName = courseStore.selectedObstacle.number || '障碍物'
              courseStore.removeObstacle(courseStore.selectedObstacle.id)
              ElMessage.success(`已删除${obstacleName}`)
            }
          },
          enabled: () => !!courseStore.selectedObstacle
        }
      ]
    },
    {
      name: '选择',
      shortcuts: [
        {
          key: 'a',
          ctrl: true,
          description: '全选障碍物',
          action: () => {
            ElMessage.info('全选功能开发中')
          }
        },
        {
          key: 'Escape',
          description: '取消选择',
          action: () => {
            if (courseStore.selectedObstacle) {
              courseStore.selectedObstacle = null
              ElMessage.info('已取消选择')
            }
          },
          enabled: () => !!courseStore.selectedObstacle
        }
      ]
    },
    {
      name: '帮助',
      shortcuts: [
        {
          key: '?',
          shift: true,
          description: '显示快捷键帮助',
          action: () => {
            window.dispatchEvent(new CustomEvent('show-shortcut-helper'))
          }
        }
      ]
    }
  ]

  const handleKeyDown = async (event: KeyboardEvent) => {
    const target = event.target as HTMLElement
    const isInputField = ['INPUT', 'TEXTAREA'].includes(target.tagName) || 
                        target.isContentEditable

    if (isInputField && !event.ctrlKey && !event.metaKey) {
      return
    }

    for (const category of shortcuts) {
      for (const shortcut of category.shortcuts) {
        const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const ctrlMatch = shortcut.ctrl ? (event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
        const altMatch = shortcut.alt ? event.altKey : !event.altKey

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          if (shortcut.enabled && !shortcut.enabled()) {
            continue
          }

          event.preventDefault()
          event.stopPropagation()

          try {
            await shortcut.action()
          } catch (error) {
            console.error('快捷键执行失败:', error)
            ElMessage.error('操作失败')
          }

          break
        }
      }
    }
  }

  const register = () => {
    window.addEventListener('keydown', handleKeyDown, true)
  }

  const unregister = () => {
    window.removeEventListener('keydown', handleKeyDown, true)
  }

  onMounted(() => {
    register()
  })

  onUnmounted(() => {
    unregister()
  })

  return {
    shortcuts,
    register,
    unregister
  }
}
