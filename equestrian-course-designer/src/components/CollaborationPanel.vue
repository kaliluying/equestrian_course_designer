<template>
  <div class="collaboration-panel" :class="{ 'is-collapsed': isCollapsed }">
    <div class="panel-header">
      <h3>协作面板</h3>
      <div class="panel-actions">
        <el-button link :icon="isCollapsed ? 'el-icon-arrow-left' : 'el-icon-arrow-right'" @click="toggleCollapse" />
      </div>
    </div>

    <div v-if="!isCollapsed" class="panel-content">
      <!-- 连接状态 -->
      <div class="connection-status">
        <el-tag :type="connectionStatusType">
          {{ connectionStatusText }}
        </el-tag>
        <el-button v-if="connectionStatus === ConnectionStatus.CONNECTED" type="danger" size="small"
          @click="handleDisconnect">
          离开协作
        </el-button>
      </div>

      <!-- 邀请链接 -->
      <div v-if="connectionStatus === ConnectionStatus.CONNECTED" class="invite-section">
        <h4>邀请他人</h4>
        <div class="invite-link-container">
          <div class="invite-link-display">
            <span class="invite-link-text">{{ inviteLink }}</span>
            <el-button type="primary" size="small" @click="copyInviteLink">
              <el-icon class="copy-icon">
                <Document />
              </el-icon>
              复制
            </el-button>
          </div>
          <div v-if="copySuccess" class="copy-success-tip">
            <el-icon>
              <Check />
            </el-icon> 链接已复制到剪贴板
          </div>
        </div>
      </div>

      <!-- 协作者列表 -->
      <div class="collaborators-list">
        <h4>当前协作者 ({{ collaborators.length }})</h4>
        <ul>
          <li v-for="collaborator in collaborators" :key="collaborator.id">
            <div class="collaborator-avatar" :style="{ backgroundColor: collaborator.color }">
              {{ collaborator.username.charAt(0).toUpperCase() }}
            </div>
            <div class="collaborator-info">
              <span class="collaborator-name">{{ collaborator.username }}</span>
              <span class="collaborator-status">
                {{ isActive(collaborator) ? '活跃' : '空闲' }}
              </span>
            </div>
          </li>
        </ul>
      </div>

      <!-- 聊天区域 -->
      <div class="chat-area">
        <h4>聊天</h4>
        <div class="chat-messages" ref="chatMessagesRef">
          <div v-for="message in chatMessages" :key="message.id" class="chat-message" :class="{
            'system-message': message.senderId === 'system',
            'self-message': message.senderId === String(currentUser?.id)
          }">
            <div v-if="message.senderId !== 'system'" class="message-sender">
              {{ message.senderId === String(currentUser?.id) ? '我' : message.senderName }}:
            </div>
            <div class="message-content">{{ message.content }}</div>
            <div class="message-time">
              {{ formatTime(message.timestamp) }}
            </div>
          </div>
        </div>

        <div class="chat-input">
          <el-input v-model="chatInput" placeholder="输入消息..." @keyup.enter="sendMessage">
            <template #append>
              <el-button @click="sendMessage">发送</el-button>
            </template>
          </el-input>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '@/stores/user'
import {
  useWebSocketConnection,
  ConnectionStatus,
  type CollaboratorInfo
} from '@/utils/websocket'
import { ElMessage } from 'element-plus'
import { Document, Check } from '@element-plus/icons-vue'

const props = defineProps({
  designId: {
    type: String,
    required: true
  }
})

const userStore = useUserStore()

// 使用WebSocket连接
const {
  connectionStatus,
  collaborators,
  chatMessages,
  socket,
  disconnect,
  sendChatMessage
} = useWebSocketConnection(props.designId)

// 当前用户
const currentUser = computed(() => userStore.currentUser)

// 面板折叠状态
const isCollapsed = ref(false)
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

// 邀请链接
const inviteLink = computed(() => {
  if (!props.designId) {
    console.error('设计ID不存在，无法生成邀请链接')
    return ''
  }

  // 使用查询参数构建URL
  const url = new URL(window.location.origin)
  url.pathname = window.location.pathname
  url.searchParams.set('collaboration', 'true')
  url.searchParams.set('designId', props.designId)

  const link = url.toString()
  console.log('生成邀请链接:', link, '设计ID:', props.designId)
  return link
})

// 复制邀请链接
const copyInviteLink = () => {
  console.log('复制邀请链接:', inviteLink.value)
  if (!props.designId) {
    ElMessage.error('设计ID不存在，无法生成邀请链接')
    return
  }

  navigator.clipboard.writeText(inviteLink.value)
    .then(() => {
      copySuccess.value = true
      setTimeout(() => {
        copySuccess.value = false
      }, 3000)
      ElMessage.success('邀请链接已复制到剪贴板')
    })
    .catch((err) => {
      console.error('复制失败:', err)
      ElMessage.error('复制失败，请手动复制')
    })
}

// 复制成功状态
const copySuccess = ref(false)

// 聊天输入
const chatInput = ref('')
const chatMessagesRef = ref<HTMLElement | null>(null)

// 发送消息
const sendMessage = () => {
  console.log('尝试发送聊天消息:', chatInput.value)

  // 检查消息是否为空
  if (!chatInput.value.trim()) {
    console.log('消息为空，不发送')
    return
  }

  // 检查WebSocket连接状态
  if ((connectionStatus.value as string) !== 'connected') {
    console.error('WebSocket未连接，无法发送消息，当前状态:', connectionStatus.value)
    ElMessage.error('未连接到协作服务器，无法发送消息')
    return
  }

  // 检查socket实例是否存在
  if (!socket || !socket.value) {
    console.error('WebSocket实例不存在，无法发送消息')
    ElMessage.error('协作连接异常，请尝试重新连接')

    // 确保状态为DISCONNECTED
    if ((connectionStatus.value as string) !== 'disconnected') {
      console.log('状态不一致，更新为DISCONNECTED')
      connectionStatus.value = ConnectionStatus.DISCONNECTED

      // 触发断开连接事件，确保所有组件同步状态
      try {
        const event = new CustomEvent('collaboration-stopped', {
          bubbles: true,
          detail: {
            timestamp: new Date().toISOString(),
            error: true,
            reason: 'WebSocket实例不存在',
          },
        })
        document.dispatchEvent(event)
      } catch (error) {
        console.error('发送状态不一致的collaboration-stopped事件失败:', error)
      }
    }
    return
  }

  try {
    console.log('发送聊天消息:', chatInput.value)
    sendChatMessage(chatInput.value)
    console.log('聊天消息已发送')

    // 清空输入框
    chatInput.value = ''
  } catch (error) {
    console.error('发送聊天消息失败:', error)
    ElMessage.error('发送消息失败，请稍后重试')

    // 如果是因为WebSocket未连接导致的错误，更新状态
    if (error instanceof Error &&
      (error.message.includes('WebSocket未连接') ||
        error.message.includes('WebSocket实例不存在'))) {
      console.log('因WebSocket连接问题更新状态为DISCONNECTED')
      connectionStatus.value = ConnectionStatus.DISCONNECTED

      // 触发断开连接事件
      try {
        const event = new CustomEvent('collaboration-stopped', {
          bubbles: true,
          detail: {
            timestamp: new Date().toISOString(),
            error: true,
            reason: 'WebSocket连接问题',
          },
        })
        document.dispatchEvent(event)
      } catch (eventError) {
        console.error('发送WebSocket连接问题事件失败:', eventError)
      }

      // 尝试重新初始化状态
      nextTick(() => {
        console.log('尝试重新初始化WebSocket状态')
        if (socket && socket.value) {
          // 如果socket存在但状态不一致，尝试关闭它
          try {
            socket.value.close()
            console.log('已关闭不一致的WebSocket连接')
          } catch (closeError) {
            console.error('关闭不一致的WebSocket连接失败:', closeError)
          }
        }
      })
    }
  }
}

// 滚动到最新消息
const scrollToBottom = async () => {
  await nextTick()
  if (chatMessagesRef.value) {
    chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
  }
}

// 监听消息变化，自动滚动
watch(chatMessages, () => {
  scrollToBottom()
})

// 连接状态类型
const connectionStatusType = computed(() => {
  console.log('计算connectionStatusType，当前状态:', connectionStatus.value)
  switch (connectionStatus.value) {
    case ConnectionStatus.CONNECTED:
      return 'success'
    case ConnectionStatus.CONNECTING:
      return 'warning'
    case ConnectionStatus.DISCONNECTING:
      return 'warning'
    case ConnectionStatus.ERROR:
      return 'danger'
    default:
      return 'info'
  }
})

// 连接状态文本
const connectionStatusText = computed(() => {
  // 强制刷新计算属性
  console.log('计算connectionStatusText，当前状态:', connectionStatus.value)
  switch (connectionStatus.value) {
    case ConnectionStatus.CONNECTED:
      return '已连接'
    case ConnectionStatus.CONNECTING:
      return '连接中...'
    case ConnectionStatus.DISCONNECTING:
      return '断开中...'
    case ConnectionStatus.ERROR:
      return '连接错误'
    default:
      return '未连接'
  }
})

// 检查协作者是否活跃（最近30秒内有活动）
const isActive = (collaborator: CollaboratorInfo) => {
  const now = new Date()
  const lastActive = new Date(collaborator.lastActive)
  return now.getTime() - lastActive.getTime() < 30000 // 30秒
}

// 格式化时间
const formatTime = (date: Date) => {
  const now = new Date()
  const messageDate = new Date(date)

  // 如果是今天的消息，只显示时间
  if (
    now.getFullYear() === messageDate.getFullYear() &&
    now.getMonth() === messageDate.getMonth() &&
    now.getDate() === messageDate.getDate()
  ) {
    return messageDate.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 否则显示日期和时间
  return messageDate.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 在组件挂载时自动连接WebSocket
onMounted(() => {
  console.log('CollaborationPanel组件已挂载，设计ID:', props.designId)
  // 不在组件挂载时自动连接，而是等待父组件通过协作状态控制
  console.log('CollaborationPanel组件不会自动连接WebSocket，将由父组件控制')
  console.log('当前连接状态:', connectionStatus.value)

  // 监听连接状态变化
  watch(() => connectionStatus.value, (newStatus, oldStatus) => {
    console.log('连接状态变化:', oldStatus, '->', newStatus)

    // 如果状态变为已连接，尝试获取会话信息
    if (newStatus === ConnectionStatus.CONNECTED) {
      console.log('WebSocket已连接，尝试获取会话信息')
      // 这里可以添加获取会话信息的逻辑
    }
  })

  // 立即检查一次连接状态
  nextTick(() => {
    console.log('初始检查WebSocket连接状态')
    if (socket && socket.value && socket.value.readyState === WebSocket.OPEN) {
      console.log('WebSocket已连接，更新状态为CONNECTED')
      connectionStatus.value = ConnectionStatus.CONNECTED

      // 触发一次连接成功事件，确保UI状态同步
      try {
        console.log('发送确认collaboration-connected事件')
        const event = new CustomEvent('collaboration-connected', {
          bubbles: true,
          detail: { timestamp: new Date().toISOString(), confirmed: true },
        })
        document.dispatchEvent(event)
      } catch (error) {
        console.error('发送确认collaboration-connected事件失败:', error)
      }
    } else {
      console.log('WebSocket未连接，确保状态为DISCONNECTED')
      if ((connectionStatus.value as string) !== 'disconnected') {
        connectionStatus.value = ConnectionStatus.DISCONNECTED
      }
    }
  })

  // 设置定时器，定期检查连接状态
  const statusCheckInterval = setInterval(() => {
    console.log('定时检查WebSocket连接状态')

    // 先检查socket变量是否存在
    if (!socket) {
      console.error('socket变量不存在，确保状态为DISCONNECTED')
      if ((connectionStatus.value as string) !== 'disconnected') {
        console.log('状态不一致，更新为DISCONNECTED')
        connectionStatus.value = ConnectionStatus.DISCONNECTED

        // 触发断开连接事件
        try {
          const event = new CustomEvent('collaboration-stopped', {
            bubbles: true,
            detail: {
              timestamp: new Date().toISOString(),
              reason: 'socket变量不存在',
            },
          })
          document.dispatchEvent(event)
        } catch (error) {
          console.error('发送socket变量不存在事件失败:', error)
        }
      }
      return
    }

    // 检查socket实例是否存在
    if (!socket.value) {
      console.log('WebSocket实例不存在，确保状态为DISCONNECTED')
      if ((connectionStatus.value as string) !== 'disconnected') {
        console.log('状态不一致，更新为DISCONNECTED')
        connectionStatus.value = ConnectionStatus.DISCONNECTED

        // 触发断开连接事件
        try {
          const event = new CustomEvent('collaboration-stopped', {
            bubbles: true,
            detail: {
              timestamp: new Date().toISOString(),
              reason: 'WebSocket实例不存在',
            },
          })
          document.dispatchEvent(event)
        } catch (error) {
          console.error('发送WebSocket实例不存在事件失败:', error)
        }
      }
      return
    }

    console.log('WebSocket实例存在，当前readyState:', socket.value.readyState)

    // 根据WebSocket的readyState更新连接状态
    if (socket.value.readyState === WebSocket.OPEN) {
      if ((connectionStatus.value as string) !== 'connected') {
        console.log('WebSocket已连接但状态不一致，更新为CONNECTED')
        connectionStatus.value = ConnectionStatus.CONNECTED
      }
    } else if (socket.value.readyState === WebSocket.CONNECTING) {
      if ((connectionStatus.value as string) !== 'connecting') {
        console.log('WebSocket正在连接但状态不一致，更新为CONNECTING')
        connectionStatus.value = ConnectionStatus.CONNECTING
      }
    } else if (socket.value.readyState === WebSocket.CLOSING) {
      if ((connectionStatus.value as string) !== 'disconnecting') {
        console.log('WebSocket正在关闭但状态不一致，更新为DISCONNECTING')
        connectionStatus.value = ConnectionStatus.DISCONNECTING
      }
    } else if (socket.value.readyState === WebSocket.CLOSED) {
      if ((connectionStatus.value as string) !== 'disconnected') {
        console.log('WebSocket已关闭但状态不一致，更新为DISCONNECTED')
        connectionStatus.value = ConnectionStatus.DISCONNECTED

        // 触发断开连接事件
        try {
          const event = new CustomEvent('collaboration-stopped', {
            bubbles: true,
            detail: {
              timestamp: new Date().toISOString(),
              reason: 'WebSocket已关闭',
            },
          })
          document.dispatchEvent(event)
        } catch (error) {
          console.error('发送WebSocket已关闭事件失败:', error)
        }
      }
    }
  }, 1000) // 每秒检查一次

  // 组件卸载时清除定时器
  onUnmounted(() => {
    console.log('CollaborationPanel组件即将卸载，清除定时器')
    clearInterval(statusCheckInterval)
  })
})

// 监听设计ID变化，重新连接
watch(() => props.designId, (newDesignId) => {
  console.log('设计ID变化，重新连接WebSocket:', newDesignId)
  if (newDesignId && userStore.currentUser && connectionStatus.value !== ConnectionStatus.CONNECTED) {
    // 不自动重连，而是等待父组件控制
    console.log('设计ID已更新，但不会自动重连WebSocket')
  }
})

// 监听组件可见性变化
watch(() => !isCollapsed.value, (isVisible) => {
  console.log('协作面板可见性变化:', isVisible)
  // 不根据可见性自动连接
  console.log('面板可见性已更新，但不会自动连接WebSocket')
})

// 监听协作状态变化
watch(() => connectionStatus.value, (newStatus, oldStatus) => {
  console.log('连接状态变化:', oldStatus, '->', newStatus)

  // 如果状态变为断开，确保UI更新
  if (newStatus === ConnectionStatus.DISCONNECTED) {
    console.log('连接已断开，触发UI更新')
    nextTick(() => {
      console.log('连接断开后DOM已更新')
    })
  }
})

// 处理断开连接
const handleDisconnect = () => {
  console.log('点击离开协作按钮')

  // 检查当前是否真的已连接
  if ((connectionStatus.value as string) !== 'connected') {
    console.log('当前未连接，无需断开')
    return
  }

  try {
    // 断开WebSocket连接
    console.log('正在断开WebSocket连接...')

    // 先更新UI状态，避免用户感知延迟
    connectionStatus.value = ConnectionStatus.DISCONNECTING
    console.log('已将连接状态设置为断开中:', connectionStatus.value)

    // 断开连接
    disconnect()
    console.log('WebSocket连接已断开')

    // 不需要额外触发事件，disconnect方法已经包含了事件触发
  } catch (error) {
    console.error('断开连接时出错:', error)
    ElMessage.error('断开连接时出错，请刷新页面后重试')

    // 确保状态被重置
    connectionStatus.value = ConnectionStatus.DISCONNECTED
    console.log('出错后已强制更新连接状态为:', connectionStatus.value)

    // 触发自定义事件
    try {
      console.log('发送错误状态的collaboration-stopped事件')
      const event = new CustomEvent('collaboration-stopped', {
        bubbles: true,
        detail: { timestamp: new Date().toISOString(), error: true },
      })
      document.dispatchEvent(event)
    } catch (eventError) {
      console.error('发送错误状态的collaboration-stopped事件失败:', eventError)
    }
  }
}
</script>

<style scoped>
.collaboration-panel {
  position: fixed;
  top: 80px;
  right: 0;
  width: 300px;
  height: calc(100vh - 80px);
  background-color: #fff;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.1);
  z-index: 100;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease;
}

.collaboration-panel.is-collapsed {
  transform: translateX(calc(100% - 40px));
}

.panel-header {
  padding: 12px 16px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
}

.connection-status {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.invite-section {
  margin-bottom: 16px;
}

.invite-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #606266;
}

.invite-link-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.invite-link-display {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #f5f7fa;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 8px 12px;
}

.invite-link-text {
  flex: 1;
  font-size: 13px;
  color: #606266;
  word-break: break-all;
  margin-right: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.collaborators-list {
  margin-bottom: 16px;
}

.collaborators-list h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #606266;
}

.collaborators-list ul {
  list-style: none;
  padding: 0;
  margin: 0;
  max-height: 150px;
  overflow-y: auto;
}

.collaborators-list li {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #f2f6fc;
}

.collaborator-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  margin-right: 12px;
}

.collaborator-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.collaborator-name {
  font-size: 14px;
  color: #303133;
}

.collaborator-status {
  font-size: 12px;
  color: #909399;
}

.chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-area h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: #606266;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  background-color: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 12px;
}

.chat-message {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 4px;
  background-color: #fff;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  max-width: 85%;
}

.self-message {
  background-color: #ecf5ff;
  margin-left: auto;
}

.system-message {
  background-color: #f2f6fc;
  color: #909399;
  font-style: italic;
  text-align: center;
  max-width: 100%;
  box-shadow: none;
}

.message-sender {
  font-weight: bold;
  font-size: 13px;
  margin-bottom: 4px;
  color: #303133;
}

.message-content {
  font-size: 14px;
  word-break: break-word;
}

.message-time {
  font-size: 11px;
  color: #909399;
  text-align: right;
  margin-top: 4px;
}

.chat-input {
  margin-top: auto;
}

.copy-success-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #67c23a;
  font-size: 12px;
  margin-top: 4px;
}

.copy-icon {
  margin-right: 4px;
}
</style>
