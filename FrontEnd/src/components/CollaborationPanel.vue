<template>
  <div class="collaboration-panel" :class="{ 'is-collapsed': isCollapsed }" :style="panelStyle" ref="panelRef">
    <div class="panel-header" @mousedown="startDrag">
      <h3>协作面板</h3>
      <div class="panel-actions">
        <el-button link :icon="isCollapsed ? 'el-icon-arrow-left' : 'el-icon-arrow-right'" @click="toggleCollapse" />
      </div>
    </div>

    <div v-if="!isCollapsed" class="panel-content">
      <!-- 连接状态 -->
      <div class="connection-status">
        <span :class="['status-indicator', connectionStatusClass]"></span>
        <span>{{ connectionStatusText }}</span>
        <el-button v-if="connectionStatus === 3 || connectionStatus === 4" size="small" type="primary"
          @click="reconnect">
          重新连接
        </el-button>
      </div>

      <!-- 邀请链接 -->
      <div v-if="isConnected" class="invite-section">
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

        <!-- 所有者信息 -->
        <div class="owner-info" v-if="session">
          <div class="owner-label">所有者：</div>
          <div class="owner-value">
            <span v-if="ownerName" class="owner-name">{{ ownerName }}</span>
            <span v-else class="owner-unknown">未知</span>
            <span v-if="isCurrentUserOwner()" class="owner-badge">(我)</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 协作者列表 -->
    <div class="collaborators-section">
      <h4>当前协作者 ({{ collaborators.length }})</h4>
      <div v-if="collaborators.length === 0" class="no-collaborators">
        暂无其他协作者
        <div class="invite-suggestion">
          <el-alert type="success" :closable="false" effect="light">
            <template #title>
              <span>复制上方邀请链接，邀请他人加入协作</span>
            </template>
          </el-alert>
        </div>
      </div>
      <ul v-else class="collaborators-list">
        <li v-for="collaborator in collaborators" :key="collaborator.id" class="collaborator-item">
          <div class="collaborator-avatar" :style="{ backgroundColor: collaborator.color }">
            {{ collaborator.username.charAt(0).toUpperCase() }}
          </div>
          <div class="collaborator-info">
            <span class="collaborator-name">{{ collaborator.username }}</span>
          </div>
          <div v-if="String(currentUser?.id) === collaborator.id" class="collaborator-badge">
            (我)
          </div>
        </li>
      </ul>
      <div v-if="collaborators.length > 0" class="collaborators-debug">
        <el-button size="small" type="info" @click="refreshCollaborators">刷新协作者列表</el-button>
      </div>
    </div>

    <!-- 聊天区域 -->
    <div v-if="isConnected" class="chat-section">
      <h4>聊天</h4>
      <div class="chat-messages" ref="chatMessagesRef">
        <div v-if="chatMessages.length === 0" class="no-messages">
          暂无消息，发送第一条消息开始聊天
        </div>
        <div v-else class="message-list">
          <div v-for="message in chatMessages" :key="message.id"
            :class="['message-item', { 'system-message': message.senderId === 'system', 'my-message': String(message.senderId) === String(currentUser?.id) }]">
            <div class="message-header">
              <span class="message-sender">{{ message.senderName }}</span>
              <span class="message-time">{{ formatMessageTime(message.timestamp) }}</span>
            </div>
            <div class="message-content">{{ message.content }}</div>
          </div>
        </div>
      </div>
      <div class="chat-input">
        <el-input v-model="chatInput" placeholder="输入消息..." :disabled="connectionStatus !== 1"
          @keyup.enter="sendMessage" />
        <el-button type="primary" :disabled="connectionStatus !== 1 || !chatInput.trim()" @click="sendMessage">
          发送
        </el-button>
      </div>
    </div>

    <!-- 连接错误提示 -->
    <div v-if="connectionStatus === 4" class="connection-error">
      <el-alert title="连接错误" type="error" description="无法连接到协作服务器，请检查网络连接或后端服务是否正常运行。" show-icon :closable="false" />
      <div class="error-actions">
        <el-button type="primary" @click="reconnect">重试连接</el-button>
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
  type CollaboratorInfo,
  MessageType
} from '@/utils/websocket'
import { ElMessage } from 'element-plus'
import { Document, Check } from '@element-plus/icons-vue'
// 导入API配置
import apiConfig from '@/config/api'

const props = defineProps({
  designId: {
    type: String,
    required: true
  }
})

const userStore = useUserStore()

// 从useWebSocketConnection获取状态和方法
const {
  connectionStatus,
  socket,
  chatMessages,
  collaborators,
  sendChatMessage,
  connect,
  session,
} = useWebSocketConnection(props.designId)

// 当前用户
const currentUser = computed(() => userStore.currentUser)

// 面板折叠状态
const isCollapsed = ref(false)
const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
}

// 面板位置状态
const panelRef = ref<HTMLElement | null>(null)
const position = ref({ x: 0, y: 0 })
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

// 添加变量存储最后一次鼠标事件
const lastMouseEvent = ref<MouseEvent | null>(null)
let animationFrameId: number | null = null

// 计算面板样式
const panelStyle = computed(() => {
  // 始终使用transform来定位面板
  return {
    transform: `translate(${position.value.x}px, ${position.value.y}px)`,
    right: 'auto', // 当使用transform时，覆盖right属性
    top: 'auto'    // 当使用transform时，覆盖top属性
  };
})

// 开始拖动
const startDrag = (event: MouseEvent) => {
  if (!panelRef.value) return

  // 防止文本选择
  event.preventDefault()

  // 记录初始点击位置相对于面板的偏移
  const rect = panelRef.value.getBoundingClientRect()
  dragOffset.value = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }

  isDragging.value = true

  // 添加移动和结束拖动事件监听器
  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', endDrag)
}

// 处理拖动
const handleDrag = (event: MouseEvent) => {
  if (!isDragging.value) return

  // 存储最后一次鼠标事件
  lastMouseEvent.value = event

  // 如果已经有动画帧请求，则不再重复请求
  if (animationFrameId === null) {
    animationFrameId = requestAnimationFrame(updatePosition)
  }
}

// 更新位置的函数，与事件处理分离
const updatePosition = () => {
  // 重置动画帧ID
  animationFrameId = null

  // 如果没有鼠标事件或不在拖动状态，则返回
  if (!lastMouseEvent.value || !isDragging.value) return

  // 计算新位置
  const newX = lastMouseEvent.value.clientX - dragOffset.value.x
  const newY = lastMouseEvent.value.clientY - dragOffset.value.y

  // 获取面板尺寸
  if (panelRef.value) {
    const rect = panelRef.value.getBoundingClientRect()

    // 确保面板不会超出窗口边界
    // 右边界检查
    const maxX = window.innerWidth - rect.width
    // 下边界检查
    const maxY = window.innerHeight - rect.height

    // 应用边界限制
    position.value = {
      x: Math.max(0, Math.min(newX, maxX)),
      y: Math.max(0, Math.min(newY, maxY))
    }
  } else {
    // 如果没有面板引用，仍然更新位置但不做边界检查
    position.value = {
      x: newX,
      y: newY
    }
  }
}

// 结束拖动
const endDrag = () => {
  isDragging.value = false
  lastMouseEvent.value = null

  // 取消可能存在的动画帧请求
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  // 移除事件监听器
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', endDrag)
}

// 在组件卸载时清理事件监听器
onUnmounted(() => {
  // 移除事件监听器
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', endDrag)
  window.removeEventListener('resize', handleResize)

  // 取消可能存在的动画帧请求
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
  }

  // 清除定时器
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval)
  }
})

// 邀请链接
const inviteLink = computed(() => {
  if (!props.designId) {
    console.error('设计ID不存在，无法生成邀请链接')
    return ''
  }

  // 使用配置文件中的应用基础URL
  const baseUrl = apiConfig.appBaseUrl

  // 构建URL
  try {
    const url = new URL(baseUrl)
    url.pathname = window.location.pathname
    url.searchParams.set('collaboration', 'true')
    url.searchParams.set('designId', props.designId)

    const link = url.toString()
    console.log('生成邀请链接:', link, '设计ID:', props.designId)
    return link
  } catch (error) {
    console.error('生成邀请链接失败:', error)
    // 降级方案：使用字符串拼接
    return `${baseUrl}${window.location.pathname}?collaboration=true&designId=${props.designId}`
  }
})

// 复制邀请链接
const copyInviteLink = async () => {
  try {
    // 尝试使用 Clipboard API
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(inviteLink.value)
      copySuccess.value = true
      setTimeout(() => {
        copySuccess.value = false
      }, 2000)
      ElMessage.success('链接已复制到剪贴板')
    } else {
      // 后备方案：使用传统的复制方法
      const textArea = document.createElement('textarea')
      textArea.value = inviteLink.value
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        copySuccess.value = true
        setTimeout(() => {
          copySuccess.value = false
        }, 2000)
        ElMessage.success('链接已复制到剪贴板')
      } catch (err) {
        console.error('复制失败:', err)
        ElMessage.error('复制失败，请手动复制链接')
      } finally {
        document.body.removeChild(textArea)
      }
    }
  } catch (err) {
    console.error('复制失败:', err)
    ElMessage.error('复制失败，请手动复制链接')
  }
}

// 复制成功状态
const copySuccess = ref(false)

// 聊天输入
const chatInput = ref('')
const chatMessagesRef = ref<HTMLElement | null>(null)

// 计算连接状态类
const connectionStatusClass = computed(() => {
  switch (connectionStatus.value) {
    case ConnectionStatus.CONNECTED:
      return 'status-connected'
    case ConnectionStatus.CONNECTING:
      return 'status-connecting'
    case ConnectionStatus.DISCONNECTED:
      return 'status-disconnected'
    case ConnectionStatus.ERROR:
      return 'status-error'
    default:
      return ''
  }
})

// 计算连接状态文本
const connectionStatusText = computed(() => {
  switch (connectionStatus.value) {
    case ConnectionStatus.CONNECTED:
      return '已连接'
    case ConnectionStatus.CONNECTING:
      return '连接中...'
    case ConnectionStatus.DISCONNECTED:
      return '未连接'
    case ConnectionStatus.ERROR:
      return '连接错误'
    default:
      return '未知状态'
  }
})

// 计算连接状态类型
const connectionStatusType = computed(() => {
  const status = connectionStatus.value;

  if (status === ConnectionStatus.CONNECTED) {
    return 'success';
  } else if (status === ConnectionStatus.CONNECTING) {
    return 'warning';
  } else if (status === ConnectionStatus.DISCONNECTING) {
    return 'warning';
  } else if (status === ConnectionStatus.ERROR) {
    return 'danger';
  } else if (status === ConnectionStatus.DISCONNECTED) {
    return 'info';
  }

  return 'info';
})

// 检查是否已连接
const isConnected = computed(() => {
  return connectionStatus.value === 1 // ConnectionStatus.CONNECTED的值为1
})

// 在组件挂载时初始化面板位置
onMounted(() => {
  // 自动连接WebSocket
  connect() // 自动连接WebSocket
  console.log('当前连接状态:', connectionStatus.value)

  // 使用nextTick确保DOM已完全渲染后再获取元素尺寸
  nextTick(() => {
    // 初始化面板位置到窗口右侧
    if (panelRef.value) {
      const rect = panelRef.value.getBoundingClientRect()

      // 使用transform初始化位置，将面板放置在屏幕右侧
      position.value = {
        x: window.innerWidth - rect.width - 20, // 距离右侧20px
        y: 80 // 距离顶部80px
      }
    } else {
      // 使用默认位置，仍然放在屏幕右侧
      position.value = {
        x: window.innerWidth - 320, // 假设面板宽度为300px，加上右侧边距20px
        y: 80 // 距离顶部80px
      }
    }
  })

  // 添加连接状态变化监听
  watch(
    () => connectionStatus.value,
    (newStatus, oldStatus) => {
      console.log(`连接状态从 ${oldStatus} 变为 ${newStatus}，类型: ${typeof newStatus}`)

      // 如果连接状态变为已连接，尝试获取会话信息
      if (newStatus === ConnectionStatus.CONNECTED) {
        console.log('尝试获取会话信息')
        tryGetSessionInfo()
      }

      // 强制更新计算属性
      console.log('强制更新connectionStatusType:', connectionStatusType.value)
    },
    { immediate: true }
  )

  // 设置定时器检查WebSocket连接状态
  statusCheckInterval = setInterval(() => {
    checkConnectionStatus()
  }, 1000) // 每1秒检查一次

  // 添加窗口大小变化监听
  window.addEventListener('resize', handleResize)

  // 在组件挂载后也滚动到底部
  nextTick(() => {
    scrollToBottom()
  })
})

// 监听设计ID变化，重新连接
watch(() => props.designId, (newDesignId) => {
  console.log('设计ID变化，重新连接WebSocket:', newDesignId)
  if (newDesignId && userStore.currentUser && connectionStatus.value !== ConnectionStatus.CONNECTED) {
    // 不自动重连，而是等待父组件控制
  }
})

// 监听组件可见性变化
watch(() => !isCollapsed.value, () => {
  // 不根据可见性自动连接
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

// 处理窗口大小变化
const handleResize = () => {
  // 确保面板不会超出窗口边界
  if (panelRef.value) {
    const rect = panelRef.value.getBoundingClientRect()

    // 如果面板超出右边界，调整位置
    if (position.value.x + rect.width > window.innerWidth) {
      position.value.x = window.innerWidth - rect.width
    }

    // 如果面板超出下边界，调整位置
    if (position.value.y + rect.height > window.innerHeight) {
      position.value.y = window.innerHeight - rect.height
    }

    // 如果面板超出左边界，调整位置
    if (position.value.x < 0) {
      position.value.x = 0
    }

    // 如果面板超出上边界，调整位置
    if (position.value.y < 0) {
      position.value.y = 0
    }
  }
}

// 定义状态检查间隔变量
let statusCheckInterval: number | null = null

// 检查WebSocket连接状态
const checkConnectionStatus = () => {
  // 先检查socket变量是否存在
  if (!socket) {
    if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
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
    if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
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

  // 根据WebSocket的readyState更新连接状态
  if (socket.value.readyState === WebSocket.OPEN) {
    // 如果WebSocket是OPEN状态，但connectionStatus不是CONNECTED，则更新
    if (connectionStatus.value !== ConnectionStatus.CONNECTED) {
      connectionStatus.value = ConnectionStatus.CONNECTED
    }
  } else if (socket.value.readyState === WebSocket.CONNECTING) {
    if (connectionStatus.value !== ConnectionStatus.CONNECTING) {
      connectionStatus.value = ConnectionStatus.CONNECTING
    }
  } else if (socket.value.readyState === WebSocket.CLOSING) {
    if (connectionStatus.value !== ConnectionStatus.DISCONNECTING) {
      connectionStatus.value = ConnectionStatus.DISCONNECTING
    }
  } else if (socket.value.readyState === WebSocket.CLOSED) {
    if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
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
}

// 尝试获取会话信息
const tryGetSessionInfo = () => {
  console.log('尝试获取会话信息')
  // 这里可以添加获取会话信息的逻辑
  // 例如发送特定的WebSocket消息请求会话数据
}

// 获取协作者最后活动时间文本
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const getLastActiveText = (collaborator: CollaboratorInfo) => {
  // 返回空字符串，不显示活动时间
  return ''
}

// 获取所有者名称
const getOwnerName = () => {
  if (!session.value || !session.value.owner) return null

  // 在协作者列表中查找所有者
  const owner = collaborators.value.find(c => c.id === session.value?.owner)
  return owner ? owner.username : null
}

// 使用计算属性缓存所有者名称
const ownerName = computed(() => getOwnerName())

// 检查当前用户是否是所有者
const isCurrentUserOwner = () => {
  return session.value &&
    userStore.currentUser &&
    session.value.owner === String(userStore.currentUser.id)
}

// 格式化消息时间
const formatMessageTime = (timestamp: Date) => {
  const date = new Date(timestamp)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

// 刷新协作者列表
const refreshCollaborators = () => {
  if (connectionStatus.value === ConnectionStatus.CONNECTED && userStore.currentUser) {
    try {
      // 检查WebSocket连接状态
      if (!socket || !socket.value || socket.value.readyState !== WebSocket.OPEN) {
        console.error('WebSocket未连接，无法发送同步请求')
        ElMessage.error('WebSocket未连接，无法刷新')
        return
      }

      // 构造同步请求消息
      const syncRequestMessage = {
        type: MessageType.SYNC_REQUEST,
        senderId: String(userStore.currentUser.id),
        senderName: userStore.currentUser.username,
        sessionId: props.designId,
        timestamp: new Date().toISOString(),
        payload: {},
      }

      // 直接发送消息，不通过sendMessage函数，避免在聊天中显示
      socket.value.send(JSON.stringify(syncRequestMessage))
      ElMessage.success('已刷新协作者列表')
    } catch (error) {
      console.error('刷新协作者列表失败:', error)
      ElMessage.error('刷新协作者列表失败')
    }
  } else {
    console.error('未连接到协作服务器，无法刷新，当前状态:', connectionStatus.value)
    ElMessage.error('未连接到协作服务器，无法刷新')
  }
}

// 重新连接WebSocket
const reconnect = () => {
  if (connectionStatus.value === ConnectionStatus.ERROR ||
    connectionStatus.value === ConnectionStatus.DISCONNECTED) {
    console.log('尝试重新连接WebSocket')
    connect() // 调用useWebSocketConnection中的connect方法
  }
}

// 定义状态变量以修复linter错误
const isConnecting = ref(false)
const connectionError = ref<string | null>(null)
const previousStatus = ref<ConnectionStatus>(ConnectionStatus.DISCONNECTED)

// 监听WebSocket连接状态变化
watch(
  () => connectionStatus.value,
  (newStatus) => {
    // 根据连接状态更新UI
    if (newStatus === ConnectionStatus.CONNECTED) {
      isConnecting.value = false
      connectionError.value = null

      // 显示成功消息
      ElMessage.success('协作连接已建立')
    } else if (newStatus === ConnectionStatus.CONNECTING) {
      isConnecting.value = true
      connectionError.value = null
    } else if (newStatus === ConnectionStatus.ERROR) {
      isConnecting.value = false
      connectionError.value = '连接失败，请检查网络连接'
      console.error('WebSocket连接错误')

      // 显示错误消息
      ElMessage.error('协作连接失败，请检查网络连接')
    } else if (newStatus === ConnectionStatus.DISCONNECTED) {
      isConnecting.value = false

      // 只有在之前是连接状态时才显示断开连接消息
      if (previousStatus.value === ConnectionStatus.CONNECTED) {
        connectionError.value = '连接已断开'

        // 显示断开连接消息
        ElMessage.warning('协作连接已断开')
      }
    }

    // 保存上一次的状态
    previousStatus.value = newStatus
  }
)

// 监听WebSocket实例变化
watch(
  () => socket.value,
  (newSocket) => {
    if (newSocket) {
      // 如果WebSocket已经打开但连接状态不是CONNECTED，更新状态
      if (newSocket.readyState === WebSocket.OPEN &&
        connectionStatus.value !== ConnectionStatus.CONNECTED) {
        connectionStatus.value = ConnectionStatus.CONNECTED
      }
    }
  }
)

// 发送消息
const sendMessage = () => {
  // 检查消息是否为空
  if (!chatInput.value.trim()) {
    return
  }

  // 检查WebSocket连接状态
  if (connectionStatus.value !== 1) { // ConnectionStatus.CONNECTED的值为1
    console.error('WebSocket未连接，无法发送消息，当前状态:', connectionStatus.value)
    ElMessage.error('未连接到协作服务器，无法发送消息')

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
    return
  }

  // 检查socket实例是否存在
  if (!socket || !socket.value) {
    console.error('WebSocket实例不存在，无法发送消息')
    ElMessage.error('协作连接异常，请尝试重新连接')

    // 确保状态为DISCONNECTED
    if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
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
    sendChatMessage(chatInput.value)

    // 清空输入框
    chatInput.value = ''

    // 发送后滚动到底部
    nextTick(() => {
      scrollToBottom()
    })
  } catch (error) {
    console.error('发送聊天消息失败:', error)
    ElMessage.error('发送消息失败，请稍后重试')

    // 如果是因为WebSocket未连接导致的错误，更新状态
    if (error instanceof Error &&
      (error.message.includes('WebSocket未连接') ||
        error.message.includes('WebSocket实例不存在'))) {
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
        if (socket && socket.value) {
          // 如果socket存在但状态不一致，尝试关闭它
          try {
            socket.value.close()
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
  // 使用两次nextTick确保DOM完全更新
  await nextTick()
  await nextTick()

  if (chatMessagesRef.value) {
    chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight

    // 额外保障：如果第一次滚动不成功，再尝试一次
    setTimeout(() => {
      if (chatMessagesRef.value) {
        chatMessagesRef.value.scrollTop = chatMessagesRef.value.scrollHeight
      }
    }, 100)
  } else {
    console.warn('聊天消息容器引用不存在')
  }
}

// 监听消息变化，自动滚动
watch(chatMessages, () => {
  nextTick(() => {
    scrollToBottom()
  })
}, { deep: true, immediate: true })
</script>

<style scoped>
.collaboration-panel {
  position: fixed;
  /* 移除top和right定位，完全依赖transform */
  width: 300px;
  height: auto;
  max-height: calc(100vh - 100px);
  background-color: #fff;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  transition: transform 0.05s cubic-bezier(0.17, 0.84, 0.44, 1), box-shadow 0.3s ease;
  border-radius: 12px;
  overflow: hidden;
  will-change: transform;
  /* 确保面板不会被裁剪 */
  transform-origin: top right;
}

/* 修改折叠状态的样式，确保不会超出屏幕 */
.collaboration-panel.is-collapsed {
  height: auto;
  width: 40px;
  /* 折叠时的宽度 */
}

.collaboration-panel:hover {
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.panel-header {
  padding: 14px 16px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #f0f5ff;
  cursor: move;
  user-select: none;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  color: #303133;
  font-weight: 600;
}

.panel-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  max-height: calc(100vh - 180px);
  padding: 16px;
}

.connection-status {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #f9f9f9;
  padding: 8px 12px;
  border-radius: 8px;
}

.invite-section {
  margin-bottom: 16px;
}

.invite-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #409EFF;
  font-weight: 600;
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
  border-radius: 8px;
  padding: 10px 12px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
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

.copy-success-tip {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #67c23a;
  font-size: 12px;
  margin-top: 4px;
  padding: 4px 8px;
  background-color: #f0f9eb;
  border-radius: 4px;
}

.copy-icon {
  margin-right: 4px;
}

.collaborators-section {
  padding: 14px 15px;
  border-bottom: 1px solid #e0e0e0;
  background-color: #fafafa;
  border-radius: 8px;
  margin-bottom: 10px;
}

.collaborators-section h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #409EFF;
}

.no-collaborators {
  color: #909399;
  font-size: 13px;
  text-align: center;
  padding: 15px 0;
  background-color: #f5f7fa;
  border-radius: 6px;
}

.collaborators-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.collaborator-item {
  display: flex;
  align-items: center;
  padding: 10px;
  border-radius: 8px;
  margin-bottom: 8px;
  background-color: #f5f7fa;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.collaborator-item:hover {
  background-color: #e6f1fc;
  transform: translateY(-2px);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.08);
}

.collaborator-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  font-weight: bold;
  font-size: 14px;
  margin-right: 10px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.collaborator-info {
  display: flex;
  flex-direction: column;
}

.collaborator-name {
  font-size: 14px;
  font-weight: 500;
}

/* 添加协作者标记样式 */
.collaborator-badge {
  font-size: 12px;
  color: #409eff;
  margin-left: 5px;
  background-color: rgba(64, 158, 255, 0.1);
  padding: 2px 6px;
  border-radius: 10px;
}

.collaborators-debug {
  margin-top: 12px;
  text-align: center;
}

.chat-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: #fafafa;
  border-radius: 8px;
  padding: 12px;
  margin-top: 10px;
}

.chat-section h4 {
  margin: 0 0 10px 0;
  font-size: 14px;
  color: #409EFF;
  font-weight: 600;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  background-color: #fff;
  border-radius: 8px;
  margin-bottom: 10px;
  max-height: 300px;
  scroll-behavior: smooth;
  box-shadow: inset 0 0 5px rgba(0, 0, 0, 0.05);
}

.no-messages {
  text-align: center;
  color: #909399;
  padding: 30px 0;
  font-style: italic;
  background-color: #f9f9f9;
  border-radius: 6px;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message-item {
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background-color: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  max-width: 85%;
  word-break: break-word;
  transition: transform 0.2s ease;
}

.message-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.08);
}

.my-message {
  background-color: #ecf5ff;
  align-self: flex-end;
  border-bottom-right-radius: 0;
  border-top-right-radius: 12px;
  border-top-left-radius: 12px;
  border-bottom-left-radius: 12px;
}

.system-message {
  background-color: #f2f6fc;
  color: #606266;
  font-style: italic;
  text-align: center;
  max-width: 100%;
  box-shadow: none;
  padding: 6px 10px;
  font-size: 12px;
  border-radius: 20px;
}

.chat-input {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.message-sender {
  font-weight: bold;
  font-size: 13px;
  color: #303133;
}

.message-time {
  font-size: 11px;
  color: #909399;
}

.message-content {
  font-size: 14px;
  word-break: break-word;
  line-height: 1.5;
}

.connection-error {
  margin: 10px 15px;
}

.error-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 10px;
}

.troubleshooting-guide {
  font-size: 14px;
}

.troubleshooting-guide h4 {
  margin: 0 0 10px 0;
}

.troubleshooting-guide ol {
  padding-left: 20px;
}

.troubleshooting-guide li {
  margin-bottom: 10px;
}

.troubleshooting-guide code {
  background-color: #f5f7fa;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: monospace;
}

.connection-info {
  margin-top: 10px;
  padding: 10px;
  border-radius: 4px;
  background-color: #f5f7fa;
  font-size: 12px;
  color: #606266;

  .connection-status,
  .design-info {
    display: flex;
    align-items: center;
    margin-bottom: 5px;

    span {
      margin-right: 5px;
    }

    .status-connected {
      color: #67c23a;
      font-weight: bold;
    }

    .status-connecting {
      color: #e6a23c;
      font-weight: bold;
    }

    .status-error {
      color: #f56c6c;
      font-weight: bold;
    }
  }

  .connection-error {
    color: #f56c6c;
    margin-bottom: 5px;
  }
}

.status-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;
}

.status-connected {
  background-color: #67c23a;
  box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.2);
}

.status-connecting {
  background-color: #e6a23c;
  animation: blink 1s infinite;
}

.status-disconnected {
  background-color: #909399;
}

.status-error {
  background-color: #f56c6c;
  box-shadow: 0 0 0 3px rgba(245, 108, 108, 0.2);
}

@keyframes blink {
  0% {
    opacity: 0.4;
    transform: scale(0.8);
  }

  50% {
    opacity: 1;
    transform: scale(1.1);
  }

  100% {
    opacity: 0.4;
    transform: scale(0.8);
  }
}

.invite-suggestion {
  margin-top: 10px;
  padding: 0 5px;
}

/* 所有者信息样式 */
.owner-info {
  margin-top: 12px;
  padding: 8px 12px;
  background-color: #f5f7fa;
  border-radius: 6px;
  display: flex;
  align-items: center;
}

.owner-label {
  font-weight: 500;
  color: #606266;
  margin-right: 8px;
}

.owner-value {
  display: flex;
  align-items: center;
}

.owner-name {
  font-weight: 500;
  color: #303133;
}

.owner-unknown {
  color: #909399;
  font-style: italic;
}

.owner-badge {
  margin-left: 6px;
  color: #409EFF;
  font-size: 12px;
}

.restore-time {
  font-size: 14px;
  color: #909399;
  margin-top: 10px;
}
</style>
