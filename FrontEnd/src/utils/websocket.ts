import { ref, onUnmounted, shallowRef, nextTick } from 'vue'
import { useUserStore } from '@/stores/user'
import { useCourseStore } from '@/stores/course'
import { ElMessage } from 'element-plus'
import type { Obstacle, CourseDesign, CoursePath } from '@/types/obstacle'
import { v4 as uuidv4 } from 'uuid'

// WebSocket连接状态
export enum ConnectionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

// 协作用户信息
export interface CollaboratorInfo {
  id: string
  username: string
  color: string
  cursor?: { x: number; y: number }
  lastActive: Date
}

// 协作会话信息
export interface CollaborationSession {
  id: string
  designId: string
  collaborators: CollaboratorInfo[]
  owner: string
  createdAt: Date
}

// 消息类型
export enum MessageType {
  JOIN = 'join',
  LEAVE = 'leave',
  UPDATE_OBSTACLE = 'update_obstacle',
  ADD_OBSTACLE = 'add_obstacle',
  REMOVE_OBSTACLE = 'remove_obstacle',
  UPDATE_PATH = 'update_path',
  CURSOR_MOVE = 'cursor_move',
  SYNC_REQUEST = 'sync_request',
  SYNC_RESPONSE = 'sync_response',
  CHAT = 'chat',
  ERROR = 'error',
}

// 消息接口
export interface WebSocketMessage {
  type: MessageType
  senderId: string
  senderName: string
  sessionId: string
  timestamp: string
  payload: Record<string, unknown>
}

// 聊天消息
export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: Date
}

// 创建WebSocket连接并管理状态
export function useWebSocketConnection(designId: string) {
  const userStore = useUserStore()
  const courseStore = useCourseStore()

  // 使用shallowRef而不是ref，避免深层响应性可能导致的问题
  const connectionStatus = shallowRef<ConnectionStatus>(ConnectionStatus.DISCONNECTED)
  const socket = ref<WebSocket | null>(null)
  const session = ref<CollaborationSession | null>(null)
  const collaborators = ref<CollaboratorInfo[]>([])
  const chatMessages = ref<ChatMessage[]>([])
  const isOwner = ref(false)
  const backupUrl = ref<string | null>(null)
  const reconnectAttempts = ref(0)

  // 生成随机颜色
  const generateRandomColor = () => {
    const colors = [
      '#FF6B6B',
      '#4ECDC4',
      '#45B7D1',
      '#FFA5A5',
      '#A5FFD6',
      '#FFC145',
      '#FF6B8B',
      '#845EC2',
      '#D65DB1',
      '#FF9671',
    ]
    return colors[Math.floor(Math.random() * colors.length)]
  }

  // 连接WebSocket
  const connect = () => {
    console.log('尝试连接WebSocket，当前状态:', connectionStatus.value, '设计ID:', designId)

    // 检查用户是否已登录
    if (!userStore.currentUser) {
      console.error('用户未登录，无法连接WebSocket')
      ElMessage.error('请先登录后再使用协作功能')
      connectionStatus.value = ConnectionStatus.ERROR
      socket.value = null // 确保socket实例为null

      // 触发连接失败事件
      try {
        console.log('发送collaboration-connection-failed事件: 用户未登录')
        const event = new CustomEvent('collaboration-connection-failed', {
          bubbles: true,
          detail: { reason: '用户未登录', timestamp: new Date().toISOString() },
        })
        document.dispatchEvent(event)
      } catch (error) {
        console.error('发送collaboration-connection-failed事件失败:', error)
      }

      return
    }

    // 检查设计ID是否有效
    if (!designId) {
      console.error('设计ID无效，无法连接WebSocket')
      ElMessage.error('设计ID无效，无法启动协作')
      connectionStatus.value = ConnectionStatus.ERROR
      socket.value = null // 确保socket实例为null

      // 触发连接失败事件
      try {
        console.log('发送collaboration-connection-failed事件: 设计ID无效')
        const event = new CustomEvent('collaboration-connection-failed', {
          bubbles: true,
          detail: { reason: '设计ID无效', timestamp: new Date().toISOString() },
        })
        document.dispatchEvent(event)
      } catch (error) {
        console.error('发送collaboration-connection-failed事件失败:', error)
      }

      return
    }

    // 防止重复连接
    if (
      connectionStatus.value === ConnectionStatus.CONNECTED ||
      connectionStatus.value === ConnectionStatus.CONNECTING
    ) {
      console.log('WebSocket已连接或正在连接中，无需重复连接')
      console.log('当前socket实例状态:', socket.value ? socket.value.readyState : '不存在')

      // 如果状态是CONNECTED但socket不存在，修正状态
      if (connectionStatus.value === ConnectionStatus.CONNECTED && !socket.value) {
        console.log('状态不一致：状态为CONNECTED但socket不存在，修正为DISCONNECTED')
        connectionStatus.value = ConnectionStatus.DISCONNECTED
        // 重新尝试连接
        setTimeout(() => connect(), 100)
        return
      }

      // 如果已经连接，触发一个确认事件
      if (connectionStatus.value === ConnectionStatus.CONNECTED && socket.value) {
        console.log('WebSocket已连接，触发确认事件')
        try {
          const event = new CustomEvent('collaboration-connected', {
            bubbles: true,
            detail: {
              timestamp: new Date().toISOString(),
              alreadyConnected: true,
              session: session.value,
            },
          })
          document.dispatchEvent(event)
          console.log('已发送collaboration-connected确认事件')
        } catch (error) {
          console.error('发送collaboration-connected确认事件失败:', error)
        }
      }

      return
    }

    console.log('准备连接WebSocket，设计ID:', designId)

    // 设置连接状态为连接中
    connectionStatus.value = ConnectionStatus.CONNECTING
    console.log('已将连接状态设置为连接中:', connectionStatus.value)

    // 开发环境使用固定的WebSocket地址
    let wsUrl = ''
    if (import.meta.env.DEV) {
      // 开发环境
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      // 使用8000端口连接WebSocket服务
      wsUrl = `${wsProtocol}//127.0.0.1:8000/ws/collaboration/${designId}/`

      // 添加备用URL，如果主URL连接失败，尝试使用备用URL
      const backupWsUrl = `${wsProtocol}//localhost:8000/ws/collaboration/${designId}/`

      console.log('使用开发环境WebSocket URL:', wsUrl)
      console.log('备用WebSocket URL:', backupWsUrl)

      // 存储备用URL以便在主URL连接失败时使用
      backupUrl.value = backupWsUrl
    } else {
      // 生产环境
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host
      wsUrl = `${wsProtocol}//${host}/ws/collaboration/${designId}/`
      console.log('使用生产环境WebSocket URL:', wsUrl)
    }

    try {
      console.log('正在连接WebSocket...')

      // 关闭可能存在的旧连接
      if (socket.value) {
        console.log('关闭旧的WebSocket连接')
        socket.value.close()
        socket.value = null
      }

      // 创建新的WebSocket连接
      socket.value = new WebSocket(wsUrl)
      console.log('WebSocket实例已创建，等待连接建立...')

      // 添加超时处理
      const connectionTimeout = setTimeout(() => {
        if (connectionStatus.value === ConnectionStatus.CONNECTING) {
          console.error('WebSocket连接超时')

          // 如果有备用URL且当前不是使用备用URL，尝试使用备用URL连接
          if (backupUrl.value && wsUrl !== backupUrl.value) {
            console.log('尝试使用备用URL连接:', backupUrl.value)

            // 关闭当前连接
            if (socket.value) {
              socket.value.close()
              socket.value = null
            }

            // 使用备用URL创建新连接
            socket.value = new WebSocket(backupUrl.value)

            // 重新设置事件处理器
            setupSocketEventHandlers(socket.value)

            // 设置新的超时
            setTimeout(() => {
              if (connectionStatus.value === ConnectionStatus.CONNECTING) {
                connectionStatus.value = ConnectionStatus.ERROR
                ElMessage.error('连接超时，请确保后端服务已启动')

                if (socket.value) {
                  socket.value.close()
                  socket.value = null
                }
              }
            }, 10000)

            return
          }

          connectionStatus.value = ConnectionStatus.ERROR
          ElMessage.error('连接超时，请确保后端服务已启动')

          // 尝试关闭可能存在的连接
          if (socket.value) {
            socket.value.close()
            socket.value = null
          }
        }
      }, 10000) // 10秒超时

      // 设置WebSocket事件处理器
      setupSocketEventHandlers(socket.value, connectionTimeout)
    } catch (error) {
      console.error('创建WebSocket连接时出错:', error)
      connectionStatus.value = ConnectionStatus.ERROR
      ElMessage.error('创建WebSocket连接失败')
      socket.value = null
    }
  }

  // 设置WebSocket事件处理器
  const setupSocketEventHandlers = (ws: WebSocket, timeout?: ReturnType<typeof setTimeout>) => {
    console.log('设置WebSocket事件处理器')

    // 连接打开事件
    ws.onopen = () => {
      console.log('WebSocket连接已打开')
      connectionStatus.value = ConnectionStatus.CONNECTED
      reconnectAttempts.value = 0 // 重置重连尝试次数

      // 如果有超时定时器，清除它
      if (timeout) {
        clearTimeout(timeout)
      }

      // 发送加入消息
      const joinMessage: WebSocketMessage = {
        type: MessageType.JOIN,
        senderId: userStore.currentUser?.id.toString() || 'anonymous',
        senderName: userStore.currentUser?.username || 'Anonymous',
        sessionId: designId,
        timestamp: new Date().toISOString(),
        payload: {
          color: generateRandomColor(),
        },
      }

      try {
        sendMessage(joinMessage)
        console.log('已发送加入消息')

        // 延迟一段时间后再发送同步请求，确保服务器有时间处理加入消息
        setTimeout(() => {
          // 发送同步请求消息
          if (userStore.currentUser) {
            const syncRequestMessage: WebSocketMessage = {
              type: MessageType.SYNC_REQUEST,
              senderId: userStore.currentUser.id.toString() || 'anonymous',
              senderName: userStore.currentUser.username || 'Anonymous',
              sessionId: designId,
              timestamp: new Date().toISOString(),
              payload: {},
            }

            try {
              sendMessage(syncRequestMessage)
              console.log('已发送同步请求消息')
            } catch (error) {
              console.error('发送同步请求消息失败:', error)
            }
          }
        }, 500) // 延迟500毫秒

        // 触发连接成功事件
        try {
          const event = new CustomEvent('collaboration-connected', {
            bubbles: true,
            detail: {
              timestamp: new Date().toISOString(),
              designId: designId,
            },
          })
          document.dispatchEvent(event)
          console.log('已发送collaboration-connected事件')
        } catch (error) {
          console.error('发送collaboration-connected事件失败:', error)
        }
      } catch (error) {
        console.error('发送初始消息失败:', error)
      }
    }

    ws.onmessage = (event) => {
      // 减少日志输出，只在调试时打开
      // console.log('收到WebSocket消息:', event.data)
      try {
        const message = JSON.parse(event.data)
        handleMessage(message)
      } catch (error) {
        console.error('解析WebSocket消息失败:', error)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket连接错误:', error)
      connectionStatus.value = ConnectionStatus.ERROR
      console.log('已将连接状态设置为错误:', connectionStatus.value)
      ElMessage.error('WebSocket连接错误，请检查网络连接')

      // 触发连接错误事件
      try {
        console.log('发送collaboration-connection-error事件')
        const event = new CustomEvent('collaboration-connection-error', {
          bubbles: true,
          detail: { timestamp: new Date().toISOString(), error: '连接错误' },
        })
        document.dispatchEvent(event)
      } catch (eventError) {
        console.error('发送collaboration-connection-error事件失败:', eventError)
      }
    }

    ws.onclose = (closeEvent: CloseEvent) => {
      console.log(
        `WebSocket连接已关闭，代码: ${closeEvent.code}，原因: ${closeEvent.reason || '未提供'}`,
      )

      // 如果不是正常关闭且重连尝试次数小于5，尝试重新连接
      if (closeEvent.code !== 1000 && closeEvent.code !== 1001 && reconnectAttempts.value < 5) {
        console.log(
          `WebSocket连接异常关闭，尝试重新连接，尝试次数: ${reconnectAttempts.value + 1}/5`,
        )
        connectionStatus.value = ConnectionStatus.DISCONNECTED
        reconnectAttempts.value++

        // 使用指数退避策略，延迟重连
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.value), 10000)
        console.log(`将在${delay}毫秒后尝试重新连接`)

        setTimeout(() => {
          console.log(`开始第${reconnectAttempts.value}次重连尝试`)
          connect()
        }, delay)

        return
      }

      // 更新连接状态
      connectionStatus.value = ConnectionStatus.DISCONNECTED
      socket.value = null

      // 触发断开连接事件
      try {
        const disconnectEvent = new CustomEvent('collaboration-stopped', {
          bubbles: true,
          detail: {
            timestamp: new Date().toISOString(),
            code: closeEvent.code,
            reason: closeEvent.reason || '连接已关闭',
          },
        })
        document.dispatchEvent(disconnectEvent)
        console.log('已发送collaboration-stopped事件')
      } catch (error) {
        console.error('发送collaboration-stopped事件失败:', error)
      }
    }
  }

  // 断开WebSocket连接
  const disconnect = () => {
    console.log('断开WebSocket连接，当前状态:', connectionStatus.value)

    // 如果已经断开，不要重复操作
    if (connectionStatus.value === ConnectionStatus.DISCONNECTED && !socket.value) {
      console.log('WebSocket已断开，无需重复操作')

      // 确保触发一次事件，以防状态不同步
      try {
        console.log('尝试发送手动collaboration-stopped事件')
        const event = new CustomEvent('collaboration-stopped', {
          bubbles: true,
          detail: { timestamp: new Date().toISOString(), manual: true },
        })
        document.dispatchEvent(event)
        console.log('已发送手动collaboration-stopped事件')
      } catch (error) {
        console.error('发送手动collaboration-stopped事件失败:', error)
      }

      return
    }

    // 先更新状态，防止重复调用
    connectionStatus.value = ConnectionStatus.DISCONNECTING
    console.log('已将连接状态设置为断开中:', connectionStatus.value)

    try {
      // 如果有用户信息且连接已建立，发送离开消息
      if (userStore.currentUser && socket.value && socket.value.readyState === WebSocket.OPEN) {
        console.log('发送离开消息')
        try {
          sendMessage({
            type: MessageType.LEAVE,
            senderId: String(userStore.currentUser.id),
            senderName: userStore.currentUser.username,
            sessionId: designId,
            timestamp: new Date().toISOString(),
            payload: {},
          })
          console.log('离开消息已发送')
        } catch (error) {
          console.error('发送离开消息失败:', error)
        }
      } else {
        console.log('未发送离开消息，用户未登录或WebSocket未连接')
      }

      // 关闭WebSocket连接
      if (socket.value) {
        console.log('关闭WebSocket连接')
        try {
          socket.value.close()
          console.log('WebSocket连接已关闭')
        } catch (error) {
          console.error('关闭WebSocket连接失败:', error)
        } finally {
          socket.value = null
        }
      }

      // 重置会话和协作者状态
      session.value = null
      collaborators.value = []
      console.log('已重置会话和协作者状态')

      // 最后更新状态为断开
      connectionStatus.value = ConnectionStatus.DISCONNECTED
      console.log('已将连接状态设置为断开:', connectionStatus.value)

      // 使用setTimeout确保事件在状态更新后触发
      try {
        console.log('发送collaboration-stopped事件')
        // 直接触发事件
        const event = new CustomEvent('collaboration-stopped', {
          bubbles: true,
          detail: { timestamp: new Date().toISOString(), source: 'disconnect' },
        })
        document.dispatchEvent(event)
        console.log('已发送collaboration-stopped事件')

        // 再次使用setTimeout触发一次，确保事件被处理
        setTimeout(() => {
          try {
            console.log('延迟发送collaboration-stopped事件')
            const event = new CustomEvent('collaboration-stopped', {
              bubbles: true,
              detail: { timestamp: new Date().toISOString(), delayed: true, source: 'disconnect' },
            })
            document.dispatchEvent(event)
            console.log('已发送延迟collaboration-stopped事件')
          } catch (error) {
            console.error('发送延迟collaboration-stopped事件失败:', error)
          }
        }, 500)
      } catch (error) {
        console.error('设置延迟发送collaboration-stopped事件失败:', error)
      }
    } catch (error) {
      console.error('断开WebSocket连接时出错:', error)
      // 确保状态被重置
      socket.value = null
      session.value = null

      // 即使出错也触发事件
      try {
        console.log('尝试发送错误状态的collaboration-stopped事件')
        const event = new CustomEvent('collaboration-stopped', {
          bubbles: true,
          detail: { timestamp: new Date().toISOString(), error: true },
        })
        document.dispatchEvent(event)
        console.log('已发送错误状态的collaboration-stopped事件')
      } catch (error) {
        console.error('发送错误状态的collaboration-stopped事件失败:', error)
      }
    }
  }

  // 检查WebSocket连接状态
  const checkConnection = (autoReconnect = true) => {
    console.log('检查WebSocket连接状态')

    // 检查socket实例是否存在
    if (!socket.value) {
      console.error('WebSocket实例不存在')

      // 确保状态为DISCONNECTED
      if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
        console.log('状态不一致，更新为DISCONNECTED')
        connectionStatus.value = ConnectionStatus.DISCONNECTED

        // 触发断开连接事件
        try {
          console.log('发送WebSocket实例不存在事件')
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
          console.error('发送WebSocket实例不存在事件失败:', error)
        }
      }

      // 只有在autoReconnect为true时才尝试重新连接
      if (autoReconnect) {
        console.log('尝试自动重新连接WebSocket')
        connect()
      } else {
        console.log('不自动重连WebSocket，由调用者决定')
      }

      return false
    }

    switch (socket.value.readyState) {
      case WebSocket.CONNECTING:
        console.log('WebSocket正在连接中...')
        return false
      case WebSocket.OPEN:
        console.log('WebSocket连接已建立')
        return true
      case WebSocket.CLOSING:
        console.log('WebSocket正在关闭...')
        return false
      case WebSocket.CLOSED:
        console.warn('WebSocket连接已关闭')

        // 确保状态为DISCONNECTED
        if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
          console.log('状态不一致，更新为DISCONNECTED')
          connectionStatus.value = ConnectionStatus.DISCONNECTED

          // 触发断开连接事件
          try {
            console.log('发送WebSocket已关闭的collaboration-stopped事件')
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

        // 只有在autoReconnect为true时才尝试重新连接
        if (autoReconnect) {
          console.log('尝试自动重新连接WebSocket')
          connect()
        } else {
          console.log('不自动重连WebSocket，由调用者决定')
        }

        return false
      default:
        console.error('未知的WebSocket状态')
        return false
    }
  }

  // 发送消息
  const sendMessage = (message: WebSocketMessage) => {
    console.log('准备发送消息:', message.type)
    console.log('当前WebSocket状态:', connectionStatus.value)
    console.log('当前socket实例:', socket.value ? '存在' : '不存在')

    // 检查socket是否存在
    if (!socket.value) {
      console.error('WebSocket实例不存在，无法发送消息')

      // 确保状态为DISCONNECTED
      if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
        console.log('状态不一致，更新为DISCONNECTED')
        connectionStatus.value = ConnectionStatus.DISCONNECTED

        // 触发断开连接事件
        try {
          console.log('发送状态不一致的collaboration-stopped事件')
          const event = new CustomEvent('collaboration-stopped', {
            bubbles: true,
            detail: {
              timestamp: new Date().toISOString(),
              error: true,
              reason: 'WebSocket实例不存在',
            },
          })
          document.dispatchEvent(event)

          // 添加延迟事件，确保状态同步
          setTimeout(() => {
            try {
              console.log('发送延迟的状态不一致事件')
              const delayedEvent = new CustomEvent('collaboration-stopped', {
                bubbles: true,
                detail: {
                  timestamp: new Date().toISOString(),
                  delayed: true,
                  reason: 'WebSocket实例不存在',
                },
              })
              document.dispatchEvent(delayedEvent)
            } catch (delayedError) {
              console.error('发送延迟的状态不一致事件失败:', delayedError)
            }
          }, 500)
        } catch (error) {
          console.error('发送状态不一致的collaboration-stopped事件失败:', error)
        }
      }

      throw new Error('WebSocket实例不存在，无法发送消息')
    }

    // 检查WebSocket连接状态
    if (socket.value.readyState !== WebSocket.OPEN) {
      console.error('WebSocket未连接，无法发送消息，当前readyState:', socket.value.readyState)

      // 如果连接状态不一致，更新状态
      if (connectionStatus.value === ConnectionStatus.CONNECTED) {
        console.log('连接状态不一致，更新为DISCONNECTED')
        connectionStatus.value = ConnectionStatus.DISCONNECTED
      }

      // 抛出错误，让调用者处理
      throw new Error(`WebSocket未连接，无法发送消息，当前readyState: ${socket.value.readyState}`)
    }

    try {
      // 添加发送时间戳
      const messageWithTimestamp = {
        ...message,
        timestamp: new Date().toISOString(),
      }

      // 转换为JSON字符串
      const messageString = JSON.stringify(messageWithTimestamp)
      console.log('发送消息:', messageString)

      // 发送消息
      socket.value.send(messageString)
      console.log('消息已发送')

      // 如果是聊天消息，添加到本地聊天记录
      if (message.type === MessageType.CHAT) {
        const chatMessage: ChatMessage = {
          id: uuidv4(),
          senderId: message.senderId,
          senderName: message.senderName,
          content: message.payload.content as string,
          timestamp: new Date(),
        }
        chatMessages.value.push(chatMessage)
      }

      return true
    } catch (error) {
      console.error('发送消息失败:', error)

      // 检查错误是否是由于连接关闭导致的
      if (
        error instanceof Error &&
        (error.message.includes('CLOSING') || error.message.includes('CLOSED'))
      ) {
        console.log('连接已关闭，更新状态')
        connectionStatus.value = ConnectionStatus.DISCONNECTED
      }

      // 抛出错误，让调用者处理
      throw error
    }
  }

  // 处理接收到的消息
  const handleMessage = (message: WebSocketMessage) => {
    switch (message.type) {
      case MessageType.JOIN:
        handleJoinMessage(message)
        break
      case MessageType.LEAVE:
        handleLeaveMessage(message)
        break
      case MessageType.UPDATE_OBSTACLE:
        handleUpdateObstacleMessage(message)
        break
      case MessageType.ADD_OBSTACLE:
        handleAddObstacleMessage(message)
        break
      case MessageType.REMOVE_OBSTACLE:
        handleRemoveObstacleMessage(message)
        break
      case MessageType.UPDATE_PATH:
        handleUpdatePathMessage(message)
        break
      case MessageType.CURSOR_MOVE:
        handleCursorMoveMessage(message)
        break
      case MessageType.SYNC_REQUEST:
        handleSyncRequestMessage()
        break
      case MessageType.SYNC_RESPONSE:
        handleSyncResponseMessage(message)
        break
      case MessageType.CHAT:
        handleChatMessage(message)
        break
      case MessageType.ERROR:
        handleErrorMessage(message)
        break
      default:
        console.warn('未知消息类型:', message.type)
    }
  }

  // 处理加入消息
  const handleJoinMessage = (message: WebSocketMessage) => {
    const { senderId, senderName, payload } = message

    // 更新会话信息
    if (!session.value) {
      session.value = {
        id: message.sessionId,
        designId,
        collaborators: [],
        owner: (message.payload.owner as string) || senderId,
        createdAt: new Date(),
      }

      // 检查当前用户是否是所有者
      if (userStore.currentUser && String(userStore.currentUser.id) === session.value.owner) {
        isOwner.value = true
      }
    }

    // 添加新协作者
    const newCollaborator: CollaboratorInfo = {
      id: senderId,
      username: senderName,
      color: payload.color as string,
      lastActive: new Date(),
    }

    // 检查是否已存在
    const existingIndex = collaborators.value.findIndex((c) => c.id === senderId)
    if (existingIndex >= 0) {
      collaborators.value[existingIndex] = newCollaborator
    } else {
      collaborators.value.push(newCollaborator)

      // 检查是否是当前用户
      const isCurrentUser = userStore.currentUser && String(userStore.currentUser.id) === senderId

      if (!isCurrentUser) {
        // 显示加入消息，使用更醒目的通知
        ElMessage({
          message: `${senderName} 加入了协作会话`,
          type: 'success',
          duration: 5000,
          showClose: true,
          offset: 80,
        })

        // 添加系统消息到聊天
        chatMessages.value.push({
          id: crypto.randomUUID(),
          senderId: 'system',
          senderName: '系统',
          content: `${senderName} 加入了协作会话`,
          timestamp: new Date(),
        })
      }
    }

    // 如果是当前用户加入，且不是第一个加入的用户，则发送同步请求
    // 这样可以确保新加入的用户能获取到所有已存在的协作者信息
    if (
      userStore.currentUser &&
      String(userStore.currentUser.id) === senderId &&
      collaborators.value.length > 0
    ) {
      // 发送同步请求消息
      try {
        sendMessage({
          type: MessageType.SYNC_REQUEST,
          senderId: String(userStore.currentUser.id),
          senderName: userStore.currentUser.username,
          sessionId: designId,
          timestamp: new Date().toISOString(),
          payload: {},
        })
        console.log('已发送同步请求消息，请求获取所有协作者信息')
      } catch (error) {
        console.error('发送同步请求消息失败:', error)
      }
    }
  }

  // 处理离开消息
  const handleLeaveMessage = (message: WebSocketMessage) => {
    const { senderId, senderName } = message

    // 移除协作者
    collaborators.value = collaborators.value.filter((c) => c.id !== senderId)

    // 显示离开消息
    ElMessage.info(`${senderName} 离开了协作会话`)

    // 添加系统消息到聊天
    chatMessages.value.push({
      id: crypto.randomUUID(),
      senderId: 'system',
      senderName: '系统',
      content: `${senderName} 离开了协作会话`,
      timestamp: new Date(),
    })
  }

  // 处理更新障碍物消息
  const handleUpdateObstacleMessage = (message: WebSocketMessage) => {
    const payload = message.payload as { obstacleId: string; updates: Record<string, unknown> }

    // 避免处理自己发送的消息
    if (message.senderId === String(userStore.currentUser?.id)) return

    // 更新障碍物
    courseStore.updateObstacle(payload.obstacleId, payload.updates)
  }

  // 处理添加障碍物消息
  const handleAddObstacleMessage = (message: WebSocketMessage) => {
    const { payload } = message

    // 添加障碍物
    if (payload.obstacle) {
      courseStore.addObstacle(payload.obstacle as Omit<Obstacle, 'id'>)
    }
  }

  // 处理移除障碍物消息
  const handleRemoveObstacleMessage = (message: WebSocketMessage) => {
    const { payload } = message

    // 移除障碍物
    if (payload.obstacleId && typeof payload.obstacleId === 'string') {
      courseStore.removeObstacle(payload.obstacleId)
    }
  }

  // 处理更新路径消息
  const handleUpdatePathMessage = (message: WebSocketMessage) => {
    const { payload } = message

    // 更新路径
    if (payload.path) {
      courseStore.coursePath = payload.path as CoursePath
    }
  }

  // 处理光标移动消息
  const handleCursorMoveMessage = (message: WebSocketMessage) => {
    const { senderId, payload } = message

    // 更新协作者光标位置
    const collaborator = collaborators.value.find((c) => c.id === senderId)
    if (collaborator) {
      collaborator.cursor = payload.position as { x: number; y: number }
      collaborator.lastActive = new Date()
    }
  }

  // 处理同步请求消息
  const handleSyncRequestMessage = () => {
    // 只有所有者响应同步请求
    if (isOwner.value && userStore.currentUser) {
      sendMessage({
        type: MessageType.SYNC_RESPONSE,
        senderId: String(userStore.currentUser.id),
        senderName: userStore.currentUser.username,
        sessionId: designId,
        timestamp: new Date().toISOString(),
        payload: {
          course: courseStore.exportCourse(),
          collaborators: collaborators.value, // 添加协作者信息
        },
      })
    }
  }

  // 处理同步响应消息
  const handleSyncResponseMessage = (message: WebSocketMessage) => {
    const { payload } = message

    // 导入课程数据
    if (payload.course) {
      // 这里需要实现一个导入课程的方法
      courseStore.importCourse(payload.course as CourseDesign)
    }

    // 同步协作者信息
    if (payload.collaborators && Array.isArray(payload.collaborators)) {
      console.log('收到协作者信息同步:', payload.collaborators)

      // 合并协作者信息，确保不会丢失已有的协作者
      const receivedCollaborators = payload.collaborators as CollaboratorInfo[]

      // 遍历接收到的协作者列表
      receivedCollaborators.forEach((receivedCollaborator) => {
        // 检查是否已存在
        const existingIndex = collaborators.value.findIndex((c) => c.id === receivedCollaborator.id)

        // 如果不存在，则添加
        if (existingIndex === -1) {
          // 确保lastActive是Date对象
          const collaborator = {
            ...receivedCollaborator,
            lastActive: new Date(receivedCollaborator.lastActive),
          }
          collaborators.value.push(collaborator)
          console.log(`添加协作者: ${collaborator.username}`)
        }
      })

      console.log('同步后的协作者列表:', collaborators.value)
    }
  }

  // 处理聊天消息
  const handleChatMessage = (message: WebSocketMessage) => {
    const { senderId, senderName, timestamp, payload, sessionId } = message

    // 检查消息是否已存在（防止重复）
    const messageContent = payload.content as string
    const messageTime = new Date(timestamp)

    // 查找最近5秒内的相同内容、相同发送者的消息
    const isDuplicate = chatMessages.value.some(
      (existingMsg) =>
        existingMsg.senderId === senderId &&
        existingMsg.content === messageContent &&
        Math.abs(existingMsg.timestamp.getTime() - messageTime.getTime()) < 5000,
    )

    // 如果是重复消息，不添加到列表
    if (isDuplicate) {
      console.log('检测到重复消息，已忽略:', messageContent)
      return
    }

    // 添加到聊天消息列表
    chatMessages.value.push({
      id: crypto.randomUUID(),
      senderId,
      senderName,
      content: messageContent,
      timestamp: messageTime,
    })
  }

  // 处理错误消息
  const handleErrorMessage = (message: WebSocketMessage) => {
    ElMessage.error(message.payload.message || '发生错误')
  }

  // 发送聊天消息
  const sendChatMessage = (content: string) => {
    console.log('发送聊天消息:', content)

    // 检查WebSocket连接状态
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error('WebSocket未连接，无法发送消息')

      // 更新连接状态
      if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
        connectionStatus.value = ConnectionStatus.DISCONNECTED
        console.log('已将连接状态更新为DISCONNECTED')

        // 触发断开连接事件
        try {
          const event = new CustomEvent('collaboration-stopped', {
            bubbles: true,
            detail: {
              timestamp: new Date().toISOString(),
              error: true,
              reason: 'WebSocket未连接',
            },
          })
          document.dispatchEvent(event)
        } catch (error) {
          console.error('发送WebSocket未连接事件失败:', error)
        }
      }

      throw new Error('WebSocket未连接，无法发送消息')
    }

    if (!userStore.currentUser) {
      console.error('用户未登录，无法发送聊天消息')
      return
    }

    try {
      console.log('发送聊天消息:', content)
      sendMessage({
        type: MessageType.CHAT,
        senderId: String(userStore.currentUser.id),
        senderName: userStore.currentUser.username,
        sessionId: designId,
        timestamp: new Date().toISOString(),
        payload: {
          content,
        },
      })
      console.log('聊天消息已发送')
    } catch (error) {
      console.error('发送聊天消息失败:', error)

      // 如果是因为WebSocket未连接导致的错误，更新状态
      if (
        error instanceof Error &&
        (error.message.includes('WebSocket未连接') || error.message.includes('WebSocket实例不存在'))
      ) {
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
      }

      // 重新抛出错误，让调用者处理
      throw error
    }
  }

  // 发送光标位置更新
  const sendCursorPosition = (position: { x: number; y: number }) => {
    // 检查连接状态，不自动重连
    if (!checkConnection(false)) {
      return
    }

    if (!userStore.currentUser) return

    sendMessage({
      type: MessageType.CURSOR_MOVE,
      senderId: String(userStore.currentUser.id),
      senderName: userStore.currentUser.username,
      sessionId: designId,
      timestamp: new Date().toISOString(),
      payload: {
        position,
      },
    })
  }

  // 发送障碍物更新
  const sendObstacleUpdate = (obstacleId: string, updates: Record<string, unknown>) => {
    // 检查连接状态，不自动重连
    if (!checkConnection(false)) {
      return
    }

    if (!userStore.currentUser) return

    sendMessage({
      type: MessageType.UPDATE_OBSTACLE,
      senderId: String(userStore.currentUser.id),
      senderName: userStore.currentUser.username,
      sessionId: designId,
      timestamp: new Date().toISOString(),
      payload: {
        obstacleId,
        updates,
      },
    })
  }

  // 发送添加障碍物
  const sendAddObstacle = (obstacle: Record<string, unknown>) => {
    // 检查连接状态，不自动重连
    if (!checkConnection(false)) {
      return
    }

    if (!userStore.currentUser) return

    sendMessage({
      type: MessageType.ADD_OBSTACLE,
      senderId: String(userStore.currentUser.id),
      senderName: userStore.currentUser.username,
      sessionId: designId,
      timestamp: new Date().toISOString(),
      payload: {
        obstacle,
      },
    })
  }

  // 发送移除障碍物
  const sendRemoveObstacle = (obstacleId: string) => {
    // 检查连接状态，不自动重连
    if (!checkConnection(false)) {
      return
    }

    if (!userStore.currentUser) return

    sendMessage({
      type: MessageType.REMOVE_OBSTACLE,
      senderId: String(userStore.currentUser.id),
      senderName: userStore.currentUser.username,
      sessionId: designId,
      timestamp: new Date().toISOString(),
      payload: {
        obstacleId,
      },
    })
  }

  // 发送路径更新
  const sendPathUpdate = (path: Record<string, unknown>) => {
    // 检查连接状态，不自动重连
    if (!checkConnection(false)) {
      return
    }

    if (!userStore.currentUser) return

    sendMessage({
      type: MessageType.UPDATE_PATH,
      senderId: String(userStore.currentUser.id),
      senderName: userStore.currentUser.username,
      sessionId: designId,
      timestamp: new Date().toISOString(),
      payload: {
        path,
      },
    })
  }

  // 组件卸载时断开连接
  onUnmounted(() => {
    disconnect()
  })

  return {
    connectionStatus,
    collaborators,
    chatMessages,
    session,
    isOwner,
    socket,
    connect,
    disconnect,
    sendChatMessage,
    sendCursorPosition,
    sendObstacleUpdate,
    sendAddObstacle,
    sendRemoveObstacle,
    sendPathUpdate,
    checkConnection,
  }
}
