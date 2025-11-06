<template>
  <div class="export-notification-system">
    <!-- 导出进度通知 -->
    <div
      v-if="currentNotification"
      class="export-notification"
      :class="[
        `notification-${currentNotification.type}`,
        { 'notification-dismissible': currentNotification.dismissible }
      ]"
    >
      <div class="notification-header">
        <div class="notification-icon">
          <el-icon v-if="currentNotification.type === 'success'"><Check /></el-icon>
          <el-icon v-else-if="currentNotification.type === 'error'"><Close /></el-icon>
          <el-icon v-else-if="currentNotification.type === 'warning'"><Warning /></el-icon>
          <el-icon v-else-if="currentNotification.type === 'info'"><InfoFilled /></el-icon>
          <el-icon v-else class="loading-icon"><Loading /></el-icon>
        </div>
        <div class="notification-title">{{ currentNotification.title }}</div>
        <el-button
          v-if="currentNotification.dismissible"
          type="text"
          size="small"
          @click="dismissNotification"
          class="dismiss-button"
        >
          <el-icon><Close /></el-icon>
        </el-button>
      </div>

      <div class="notification-content">
        <div class="notification-message">{{ currentNotification.message }}</div>

        <!-- 进度条 -->
        <div v-if="currentNotification.showProgress" class="progress-section">
          <el-progress
            :percentage="currentNotification.progress || 0"
            :status="getProgressStatus(currentNotification.type)"
            :show-text="true"
            :stroke-width="6"
          />
          <div v-if="currentNotification.estimatedTime" class="time-estimate">
            预计剩余时间: {{ formatTime(currentNotification.estimatedTime) }}
          </div>
        </div>

        <!-- 详细信息 -->
        <div v-if="currentNotification.details" class="notification-details">
          <el-collapse v-model="detailsExpanded">
            <el-collapse-item title="详细信息" name="details">
              <div class="details-content">{{ currentNotification.details }}</div>
            </el-collapse-item>
          </el-collapse>
        </div>

        <!-- 警告列表 -->
        <div v-if="currentNotification.warnings && currentNotification.warnings.length > 0" class="warnings-section">
          <div class="warnings-header">
            <el-icon><Warning /></el-icon>
            <span>警告 ({{ currentNotification.warnings.length }})</span>
          </div>
          <ul class="warnings-list">
            <li
              v-for="(warning, index) in currentNotification.warnings.slice(0, 3)"
              :key="index"
              :class="`warning-${warning.severity}`"
            >
              {{ warning.message }}
            </li>
            <li v-if="currentNotification.warnings.length > 3" class="more-warnings">
              还有 {{ currentNotification.warnings.length - 3 }} 个警告...
            </li>
          </ul>
        </div>

        <!-- 建议操作 -->
        <div v-if="currentNotification.actions && currentNotification.actions.length > 0" class="actions-section">
          <div class="actions-header">建议操作:</div>
          <div class="actions-list">
            <el-button
              v-for="(action, index) in currentNotification.actions"
              :key="index"
              :type="action.type || 'default'"
              :size="action.size || 'small'"
              @click="handleAction(action)"
              class="action-button"
            >
              {{ action.label }}
            </el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 通知历史 -->
    <div v-if="showHistory && notificationHistory.length > 0" class="notification-history">
      <div class="history-header">
        <span>导出历史</span>
        <el-button type="text" size="small" @click="clearHistory">清空</el-button>
      </div>
      <div class="history-list">
        <div
          v-for="(notification, index) in notificationHistory.slice(0, 5)"
          :key="index"
          class="history-item"
          :class="`history-${notification.type}`"
        >
          <div class="history-time">{{ formatTimestamp(notification.timestamp) }}</div>
          <div class="history-message">{{ notification.title }}: {{ notification.message }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { ElProgress, ElButton, ElIcon, ElCollapse, ElCollapseItem } from 'element-plus'
import { Check, Close, Warning, InfoFilled, Loading } from '@element-plus/icons-vue'
import type { ExportWarning } from '@/types/export'

// 通知类型定义
interface NotificationAction {
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default'
  size?: 'large' | 'default' | 'small'
  handler: () => void
}

interface ExportNotification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info' | 'progress'
  title: string
  message: string
  details?: string
  progress?: number
  estimatedTime?: number
  warnings?: ExportWarning[]
  actions?: NotificationAction[]
  dismissible: boolean
  autoClose?: number
  timestamp: number
  showProgress?: boolean
}

// Props
interface Props {
  showHistory?: boolean
  maxHistoryItems?: number
  autoCloseDelay?: number
}

const props = withDefaults(defineProps<Props>(), {
  showHistory: false,
  maxHistoryItems: 10,
  autoCloseDelay: 5000
})

// 响应式数据
const currentNotification = ref<ExportNotification | null>(null)
const notificationHistory = ref<ExportNotification[]>([])
const detailsExpanded = ref<string[]>([])
const autoCloseTimer = ref<number | null>(null)

// 计算属性
const getProgressStatus = computed(() => (type: string) => {
  switch (type) {
    case 'success': return 'success'
    case 'error': return 'exception'
    case 'warning': return 'warning'
    default: return undefined
  }
})

// 方法
const showNotification = (notification: Partial<ExportNotification>) => {
  const newNotification: ExportNotification = {
    id: `notification_${Date.now()}`,
    type: 'info',
    title: '通知',
    message: '',
    dismissible: true,
    timestamp: Date.now(),
    ...notification
  }

  currentNotification.value = newNotification

  // 添加到历史记录
  if (props.showHistory) {
    notificationHistory.value.unshift({ ...newNotification })
    if (notificationHistory.value.length > props.maxHistoryItems) {
      notificationHistory.value = notificationHistory.value.slice(0, props.maxHistoryItems)
    }
  }

  // 设置自动关闭
  if (newNotification.autoClose !== undefined) {
    setAutoClose(newNotification.autoClose)
  } else if (newNotification.type !== 'progress' && newNotification.type !== 'error') {
    setAutoClose(props.autoCloseDelay)
  }
}

const dismissNotification = () => {
  currentNotification.value = null
  clearAutoClose()
}

const setAutoClose = (delay: number) => {
  clearAutoClose()
  if (delay > 0) {
    autoCloseTimer.value = window.setTimeout(() => {
      dismissNotification()
    }, delay)
  }
}

const clearAutoClose = () => {
  if (autoCloseTimer.value) {
    clearTimeout(autoCloseTimer.value)
    autoCloseTimer.value = null
  }
}

const handleAction = (action: NotificationAction) => {
  try {
    action.handler()
  } catch (error) {
    console.error('Error executing notification action:', error)
  }
}

const clearHistory = () => {
  notificationHistory.value = []
}

const formatTime = (milliseconds: number): string => {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`
  } else if (milliseconds < 60000) {
    return `${Math.round(milliseconds / 1000)}秒`
  } else {
    const minutes = Math.floor(milliseconds / 60000)
    const seconds = Math.round((milliseconds % 60000) / 1000)
    return `${minutes}分${seconds}秒`
  }
}

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 导出通知方法
const showProgressNotification = (title: string, message: string, progress: number, estimatedTime?: number) => {
  showNotification({
    type: 'progress',
    title,
    message,
    progress,
    estimatedTime,
    showProgress: true,
    dismissible: false,
    autoClose: 0
  })
}

const showSuccessNotification = (title: string, message: string, details?: string, warnings?: ExportWarning[]) => {
  showNotification({
    type: 'success',
    title,
    message,
    details,
    warnings,
    dismissible: true,
    autoClose: warnings && warnings.length > 0 ? 8000 : 4000
  })
}

const showErrorNotification = (title: string, message: string, details?: string, actions?: NotificationAction[]) => {
  showNotification({
    type: 'error',
    title,
    message,
    details,
    actions,
    dismissible: true,
    autoClose: 0 // 错误通知不自动关闭
  })
}

const showWarningNotification = (title: string, message: string, warnings?: ExportWarning[], actions?: NotificationAction[]) => {
  showNotification({
    type: 'warning',
    title,
    message,
    warnings,
    actions,
    dismissible: true,
    autoClose: 6000
  })
}

const updateProgress = (progress: number, message?: string, estimatedTime?: number) => {
  if (currentNotification.value && currentNotification.value.type === 'progress') {
    currentNotification.value.progress = progress
    if (message) {
      currentNotification.value.message = message
    }
    if (estimatedTime !== undefined) {
      currentNotification.value.estimatedTime = estimatedTime
    }
  }
}

// 暴露方法给父组件
defineExpose({
  showNotification,
  showProgressNotification,
  showSuccessNotification,
  showErrorNotification,
  showWarningNotification,
  updateProgress,
  dismissNotification,
  clearHistory
})

// 生命周期
onUnmounted(() => {
  clearAutoClose()
})
</script>

<style scoped>
.export-notification-system {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 2000;
  max-width: 400px;
  min-width: 300px;
}

.export-notification {
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  margin-bottom: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
}

.notification-success {
  border-left: 4px solid #67c23a;
}

.notification-error {
  border-left: 4px solid #f56c6c;
}

.notification-warning {
  border-left: 4px solid #e6a23c;
}

.notification-info {
  border-left: 4px solid #409eff;
}

.notification-progress {
  border-left: 4px solid #409eff;
}

.notification-header {
  display: flex;
  align-items: center;
  padding: 12px 16px 8px;
  background: #f8f9fa;
}

.notification-icon {
  margin-right: 8px;
  font-size: 18px;
}

.notification-icon .loading-icon {
  animation: rotate 2s linear infinite;
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.notification-title {
  flex: 1;
  font-weight: 600;
  font-size: 14px;
  color: #303133;
}

.dismiss-button {
  padding: 4px;
  margin: -4px;
}

.notification-content {
  padding: 8px 16px 16px;
}

.notification-message {
  color: #606266;
  font-size: 13px;
  line-height: 1.4;
  margin-bottom: 8px;
}

.progress-section {
  margin: 12px 0;
}

.time-estimate {
  text-align: center;
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.notification-details {
  margin-top: 8px;
}

.details-content {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  white-space: pre-wrap;
}

.warnings-section {
  margin-top: 12px;
  padding: 8px;
  background: #fdf6ec;
  border-radius: 4px;
}

.warnings-header {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: #e6a23c;
  margin-bottom: 6px;
}

.warnings-header .el-icon {
  margin-right: 4px;
}

.warnings-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.warnings-list li {
  font-size: 12px;
  line-height: 1.3;
  margin-bottom: 4px;
  padding-left: 12px;
  position: relative;
}

.warnings-list li:before {
  content: '•';
  position: absolute;
  left: 0;
  color: #e6a23c;
}

.warning-high {
  color: #f56c6c;
}

.warning-medium {
  color: #e6a23c;
}

.warning-low {
  color: #909399;
}

.more-warnings {
  font-style: italic;
  color: #909399;
}

.actions-section {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #ebeef5;
}

.actions-header {
  font-size: 12px;
  font-weight: 600;
  color: #606266;
  margin-bottom: 8px;
}

.actions-list {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-button {
  font-size: 12px;
}

.notification-history {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  max-height: 300px;
  overflow-y: auto;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f8f9fa;
  border-bottom: 1px solid #ebeef5;
  font-size: 12px;
  font-weight: 600;
}

.history-list {
  padding: 4px 0;
}

.history-item {
  padding: 6px 12px;
  border-bottom: 1px solid #f5f7fa;
  font-size: 11px;
}

.history-item:last-child {
  border-bottom: none;
}

.history-time {
  color: #909399;
  margin-bottom: 2px;
}

.history-message {
  color: #606266;
  line-height: 1.3;
}

.history-success {
  border-left: 2px solid #67c23a;
}

.history-error {
  border-left: 2px solid #f56c6c;
}

.history-warning {
  border-left: 2px solid #e6a23c;
}

.history-info {
  border-left: 2px solid #409eff;
}
</style>
