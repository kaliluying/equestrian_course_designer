<template>
  <transition name="fade">
    <div v-if="visible" class="autosave-indicator" :class="statusClass">
      <el-icon class="status-icon" :class="iconClass">
        <component :is="statusIcon" />
      </el-icon>
      <span class="status-text">{{ statusText }}</span>
      <span v-if="lastSavedTime" class="last-saved">{{ lastSavedTime }}</span>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Loading, Check, Warning } from '@element-plus/icons-vue'
import { useCourseStore } from '@/stores/course'

const courseStore = useCourseStore()

const visible = ref(false)
let hideTimer: ReturnType<typeof setTimeout> | null = null

// 保存状态类型
type SaveStatus = 'saving' | 'saved' | 'failed' | 'idle'

// 当前状态
const currentStatus = computed<SaveStatus>(() => {
  return courseStore.saveStatus || 'idle'
})

// 状态样式类
const statusClass = computed(() => {
  return `status-${currentStatus.value}`
})

// 状态图标
const statusIcon = computed(() => {
  switch (currentStatus.value) {
    case 'saving':
      return Loading
    case 'saved':
      return Check
    case 'failed':
      return Warning
    default:
      return Check
  }
})

// 图标样式类
const iconClass = computed(() => {
  return currentStatus.value === 'saving' ? 'rotating' : ''
})

// 状态文本
const statusText = computed(() => {
  switch (currentStatus.value) {
    case 'saving':
      return '保存中...'
    case 'saved':
      return '已保存'
    case 'failed':
      return '保存失败'
    default:
      return ''
  }
})

// 最后保存时间
const lastSavedTime = computed(() => {
  if (!courseStore.lastSavedAt || currentStatus.value !== 'saved') {
    return ''
  }
  
  const now = Date.now()
  const savedAt = courseStore.lastSavedAt
  const diff = now - savedAt
  
  if (diff < 60000) {
    return '刚刚'
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`
  } else {
    return new Date(savedAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }
})

// 监听状态变化
watch(currentStatus, (newStatus) => {
  if (newStatus === 'idle') {
    visible.value = false
    return
  }
  
  // 显示指示器
  visible.value = true
  
  // 清除之前的定时器
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  
  // 保存成功后 3 秒自动隐藏
  if (newStatus === 'saved') {
    hideTimer = setTimeout(() => {
      visible.value = false
    }, 3000)
  }
  
  // 保存失败后 5 秒自动隐藏
  if (newStatus === 'failed') {
    hideTimer = setTimeout(() => {
      visible.value = false
    }, 5000)
  }
})
</script>

<style scoped lang="scss">
.autosave-indicator {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  z-index: 2000;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }
}

.status-saving {
  background: rgba(64, 158, 255, 0.95);
  color: white;
  border: 1px solid rgba(64, 158, 255, 0.3);
}

.status-saved {
  background: rgba(16, 185, 129, 0.95);
  color: white;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.status-failed {
  background: rgba(239, 68, 68, 0.95);
  color: white;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.status-icon {
  font-size: 16px;
  flex-shrink: 0;
}

.rotating {
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.status-text {
  white-space: nowrap;
}

.last-saved {
  font-size: 12px;
  opacity: 0.9;
  margin-left: 4px;
  white-space: nowrap;
}

.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 768px) {
  .autosave-indicator {
    bottom: 16px;
    right: 16px;
    padding: 8px 12px;
    font-size: 13px;
  }
  
  .status-icon {
    font-size: 14px;
  }
  
  .last-saved {
    display: none;
  }
}
</style>
