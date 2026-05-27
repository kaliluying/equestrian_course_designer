<template>
  <el-dialog
    v-model="visible"
    title="键盘快捷键"
    width="600px"
    :close-on-click-modal="true"
    destroy-on-close
  >
    <div class="shortcut-helper">
      <div v-for="category in shortcuts" :key="category.name" class="shortcut-category">
        <h3 class="category-title">{{ category.name }}</h3>
        <div class="shortcut-list">
          <div
            v-for="(shortcut, index) in category.shortcuts"
            :key="index"
            class="shortcut-item"
            :class="{ disabled: shortcut.enabled && !shortcut.enabled() }"
          >
            <div class="shortcut-keys">
              <kbd v-if="shortcut.ctrl" class="key">{{ isMac ? '⌘' : 'Ctrl' }}</kbd>
              <kbd v-if="shortcut.shift" class="key">{{ isMac ? '⇧' : 'Shift' }}</kbd>
              <kbd v-if="shortcut.alt" class="key">{{ isMac ? '⌥' : 'Alt' }}</kbd>
              <kbd class="key">{{ formatKey(shortcut.key) }}</kbd>
            </div>
            <div class="shortcut-description">{{ shortcut.description }}</div>
          </div>
        </div>
      </div>

      <div class="shortcut-tips">
        <el-icon><InfoFilled /></el-icon>
        <span>提示：在输入框中时，部分快捷键可能不可用</span>
      </div>
    </div>

    <template #footer>
      <el-button @click="visible = false">关闭</el-button>
      <el-button type="primary" @click="printShortcuts">打印快捷键</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { InfoFilled } from '@element-plus/icons-vue'
import { useKeyboardShortcuts } from '@/composables/useKeyboardShortcuts'

const visible = ref(false)
const { shortcuts } = useKeyboardShortcuts()

const isMac = computed(() => {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
})

const formatKey = (key: string): string => {
  const keyMap: Record<string, string> = {
    'Delete': 'Del',
    'Backspace': '⌫',
    'Escape': 'Esc',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    ' ': 'Space'
  }
  
  return keyMap[key] || key.toUpperCase()
}

const handleShowHelper = () => {
  visible.value = true
}

const printShortcuts = () => {
  const content = shortcuts.map(category => {
    const items = category.shortcuts.map(shortcut => {
      const keys = []
      if (shortcut.ctrl) keys.push(isMac.value ? '⌘' : 'Ctrl')
      if (shortcut.shift) keys.push(isMac.value ? '⇧' : 'Shift')
      if (shortcut.alt) keys.push(isMac.value ? '⌥' : 'Alt')
      keys.push(formatKey(shortcut.key))
      return `${keys.join(' + ')}: ${shortcut.description}`
    }).join('\n')
    return `${category.name}\n${items}`
  }).join('\n\n')

  const printWindow = window.open('', '_blank')
  if (printWindow) {
    printWindow.document.write(`
      <html>
        <head>
          <title>键盘快捷键 - 马术障碍赛路线设计器</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              padding: 40px;
              max-width: 800px;
              margin: 0 auto;
            }
            h1 {
              color: #3a6af8;
              border-bottom: 2px solid #3a6af8;
              padding-bottom: 10px;
            }
            h2 {
              color: #2c3e50;
              margin-top: 30px;
            }
            pre {
              background: #f5f7fa;
              padding: 20px;
              border-radius: 8px;
              line-height: 1.8;
            }
            @media print {
              body { padding: 20px; }
            }
          </style>
        </head>
        <body>
          <h1>键盘快捷键</h1>
          <pre>${content}</pre>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }
}

onMounted(() => {
  window.addEventListener('show-shortcut-helper', handleShowHelper)
})

onUnmounted(() => {
  window.removeEventListener('show-shortcut-helper', handleShowHelper)
})

defineExpose({
  show: () => { visible.value = true },
  hide: () => { visible.value = false }
})
</script>

<style scoped lang="scss">
.shortcut-helper {
  max-height: 60vh;
  overflow-y: auto;
}

.shortcut-category {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.category-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #e4e7ed;
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.shortcut-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background: #ebeef5;
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;

    &:hover {
      background: #f5f7fa;
    }
  }
}

.shortcut-keys {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 28px;
  padding: 0 8px;
  font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
  font-size: 13px;
  font-weight: 600;
  color: #606266;
  background: white;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  box-shadow: 0 2px 0 #dcdfe6;
  text-transform: uppercase;
}

.shortcut-description {
  flex: 1;
  margin-left: 16px;
  font-size: 14px;
  color: #606266;
  text-align: right;
}

.shortcut-tips {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 24px;
  padding: 12px;
  background: #ecf5ff;
  border: 1px solid #d9ecff;
  border-radius: 6px;
  color: #409eff;
  font-size: 13px;

  .el-icon {
    flex-shrink: 0;
    font-size: 16px;
  }
}

:deep(.el-dialog__header) {
  padding: 16px 20px;
  border-bottom: 1px solid #e4e7ed;
}

:deep(.el-dialog__body) {
  padding: 20px;
}

:deep(.el-dialog__footer) {
  padding: 12px 20px;
  border-top: 1px solid #e4e7ed;
}

@media (max-width: 768px) {
  .shortcut-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .shortcut-description {
    margin-left: 0;
    text-align: left;
  }
}
</style>
