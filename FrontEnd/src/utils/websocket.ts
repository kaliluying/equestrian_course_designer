import { ref, onUnmounted, shallowRef } from 'vue'
import { useUserStore } from '@/stores/user'
import { useCourseStore } from '@/stores/course'
import { ElMessage } from 'element-plus'
import type { Obstacle, CoursePath } from '@/types/obstacle'
import { v4 as uuidv4 } from 'uuid'

// WebSocket连接状态
export enum ConnectionStatus {
  CONNECTING = 0,
  CONNECTED = 1,
  DISCONNECTING = 2,
  DISCONNECTED = 3,
  ERROR = 4,
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

// 定义Path类型
export type Path = CoursePath

// 创建WebSocket连接并管理状态
export function useWebSocketConnection(designId: string) {
  const userStore = useUserStore()
  const courseStore = useCourseStore()

  // 状态变量
  const socket = shallowRef<WebSocket | null>(null)
  const connectionStatus = ref<ConnectionStatus>(ConnectionStatus.DISCONNECTED)
  const connectionError = ref<string | null>(null)
  const collaborators = ref<CollaboratorInfo[]>([])
  const chatMessages = ref<ChatMessage[]>([])
  const isOwner = ref(false)
  const reconnectAttempts = ref(0)
  const session = ref<CollaborationSession | null>(null)

  // 创建消息队列，用于存储WebSocket连接建立前的消息
  const messageQueue = ref<{
    type: 'update' | 'add' | 'remove' | 'path';
    data: Record<string, unknown>;
  }[]>([])

  // 处理消息队列
  const processMessageQueue = () => {
    if (messageQueue.value.length === 0) {
      console.log('消息队列为空，无需处理')
      return
    }

    console.log(`开始处理消息队列，共${messageQueue.value.length}条消息`)

    // 检查WebSocket连接状态
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error('WebSocket未连接，无法处理消息队列')
      return
    }

    // 处理队列中的消息
    const queueCopy = [...messageQueue.value]
    messageQueue.value = []

    queueCopy.forEach((item, index) => {
      console.log(`处理队列消息 ${index + 1}/${queueCopy.length}:`, item.type)

      try {
        switch (item.type) {
          case 'update':
            if (item.data.obstacleId && item.data.updates) {
              console.log('从队列发送障碍物更新:', item.data.obstacleId, item.data.updates)
              sendObstacleUpdate(
                item.data.obstacleId as string,
                item.data.updates as Record<string, unknown>,
                false
              )
            } else {
              console.error('队列中的障碍物更新消息格式不正确:', item)
            }
            break
          case 'add':
            if (item.data.obstacle) {
              console.log('从队列发送添加障碍物:', item.data.obstacle)
              sendAddObstacle(
                item.data.obstacle as Record<string, unknown>,
                false
              )
            } else {
              console.error('队列中的添加障碍物消息格式不正确:', item)
            }
            break
          case 'remove':
            if (item.data.obstacleId) {
              console.log('从队列发送移除障碍物:', item.data.obstacleId)
              sendRemoveObstacle(
                item.data.obstacleId as string,
                false
              )
            } else {
              console.error('队列中的移除障碍物消息格式不正确:', item)
            }
            break
          case 'path':
            if (item.data.path) {
              console.log('从队列发送路径更新:', item.data.path)
              sendPathUpdate(
                item.data.path as Record<string, unknown>,
                false
              )
            } else {
              console.error('队列中的路径更新消息格式不正确:', item)
            }
            break
          default:
            console.error('未知的队列消息类型:', item.type)
        }
      } catch (error) {
        console.error(`处理队列消息 ${index + 1}/${queueCopy.length} 失败:`, error)
      }
    })

    console.log('消息队列处理完成')
  }

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
    console.log('开始建立WebSocket连接')
    console.log('当前连接状态:', connectionStatus.value)
    console.log('当前socket实例:', socket.value ? '存在' : '不存在')

    // 如果已经连接或正在连接，不重复连接
    if (connectionStatus.value === ConnectionStatus.CONNECTED ||
        connectionStatus.value === ConnectionStatus.CONNECTING) {
      console.log('WebSocket已连接或正在连接中，不重复连接')

      // 如果状态是CONNECTED但socket不存在或未打开，修正状态
      if (connectionStatus.value === ConnectionStatus.CONNECTED &&
          (!socket.value || socket.value.readyState !== WebSocket.OPEN)) {
        console.log('连接状态不一致，重置状态并重新连接')
        connectionStatus.value = ConnectionStatus.DISCONNECTED
        connectionError.value = '连接状态不一致，已重置'
      } else {
        // 如果socket存在且状态是OPEN，确认连接正常
        if (socket.value && socket.value.readyState === WebSocket.OPEN) {
          console.log('WebSocket连接正常，无需重新连接')

          // 发送一个ping消息确认连接
          try {
            console.log('发送ping消息确认连接')
            socket.value.send(JSON.stringify({ type: 'ping' }))
            console.log('ping消息发送成功，连接正常')
            return
          } catch (error) {
            console.error('ping消息发送失败，连接可能已断开:', error)
            connectionStatus.value = ConnectionStatus.DISCONNECTED
            connectionError.value = 'ping消息发送失败，连接可能已断开'
            socket.value = null
          }
        } else {
          return
        }
      }
    }

    // 如果socket实例存在，先关闭
    if (socket.value) {
      try {
        console.log('关闭现有WebSocket连接')
        socket.value.close()
      } catch (error) {
        console.error('关闭现有WebSocket连接失败:', error)
      }
    }

    // 更新连接状态
    connectionStatus.value = ConnectionStatus.CONNECTING
    connectionError.value = null
    console.log('已将连接状态设置为连接中:', connectionStatus.value)

    try {
      // 构建WebSocket URL
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = import.meta.env.VITE_API_HOST || '127.0.0.1:8000'
      const wsUrl = `${protocol}//${host}/ws/collaboration/${designId}/`
      console.log('WebSocket连接URL:', wsUrl)

      // 创建WebSocket实例
      const ws = new WebSocket(wsUrl)
      socket.value = ws
      console.log('WebSocket实例已创建，readyState:', ws.readyState)

      // 设置连接超时处理
      const connectionTimeout = setTimeout(() => {
        if (socket.value && socket.value.readyState === WebSocket.CONNECTING) {
          console.error('WebSocket连接超时')
          connectionError.value = 'WebSocket连接超时'

          // 关闭当前连接
          try {
            socket.value.close()
          } catch (error) {
            console.error('关闭超时连接失败:', error)
          }
          socket.value = null
          connectionStatus.value = ConnectionStatus.DISCONNECTED

          // 触发连接失败事件
          try {
            console.log('发送连接超时事件')
            const event = new CustomEvent('collaboration-stopped', {
              bubbles: true,
              detail: {
                timestamp: new Date().toISOString(),
                error: true,
                reason: 'WebSocket连接超时',
              },
            })
            document.dispatchEvent(event)
          } catch (error) {
            console.error('发送连接超时事件失败:', error)
          }

          // 尝试重新连接
          if (reconnectAttempts.value < 5) {
            reconnectAttempts.value++
            console.log(`WebSocket连接超时，第${reconnectAttempts.value}次重试...`)
            setTimeout(() => {
              connect()
            }, 1000 * reconnectAttempts.value)
          }
        }
      }, 10000) // 10秒超时

      // 设置WebSocket事件处理器
      setupWebSocketEvents(ws, connectionTimeout)
    } catch (error) {
      console.error('创建WebSocket连接失败:', error)
      connectionStatus.value = ConnectionStatus.ERROR
      connectionError.value = `创建WebSocket连接失败: ${error}`
      socket.value = null

      // 触发连接失败事件
      try {
        console.log('发送连接失败事件')
        const event = new CustomEvent('collaboration-stopped', {
          bubbles: true,
          detail: {
            timestamp: new Date().toISOString(),
            error: true,
            reason: '创建WebSocket连接失败',
          },
        })
        document.dispatchEvent(event)
      } catch (error) {
        console.error('发送连接失败事件失败:', error)
      }
    }
  }

  // 设置WebSocket事件处理器
  const setupWebSocketEvents = (ws: WebSocket, connectionTimeout?: ReturnType<typeof setTimeout>) => {
    console.log('设置WebSocket事件处理器')

    // 连接成功
    ws.onopen = () => {
      console.log('WebSocket连接成功')

      // 清除连接超时
      if (connectionTimeout) {
        clearTimeout(connectionTimeout)
      }

      // 更新连接状态
      connectionStatus.value = ConnectionStatus.CONNECTED
      connectionError.value = null
      reconnectAttempts.value = 0

      // 如果有用户信息，发送加入消息
      if (userStore.currentUser) {
        try {
          // 发送加入消息
          sendMessage({
            type: MessageType.JOIN,
            senderId: String(userStore.currentUser.id),
            senderName: userStore.currentUser.username,
            sessionId: designId,
            timestamp: new Date().toISOString(),
            payload: {
              color: generateRandomColor(),
            },
          })
          console.log('已发送加入消息')
        } catch (error) {
          console.error('发送加入消息失败:', error)
          connectionError.value = `发送加入消息失败: ${error}`
        }
      } else {
        console.error('用户未登录，无法发送加入消息')
        connectionError.value = '用户未登录，无法发送加入消息'
      }

      // 处理消息队列
      processMessageQueue()

      // 触发连接成功事件
      try {
        console.log('发送连接成功事件')
        const event = new CustomEvent('collaboration-started', {
          bubbles: true,
          detail: {
            timestamp: new Date().toISOString(),
            designId,
          },
        })
        document.dispatchEvent(event)
      } catch (error) {
        console.error('发送连接成功事件失败:', error)
      }
    }

    ws.onmessage = (event: MessageEvent) => {
      try {
        console.log('收到WebSocket原始消息:', event.data)

        // 检查是否是ping消息
        if (event.data === '{"type":"ping"}') {
          console.log('收到ping消息，发送pong响应')
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }))
            console.log('pong响应已发送')
          }
          return
        }

        // 检查是否是pong消息
        if (event.data === '{"type":"pong"}') {
          console.log('收到pong响应，连接正常')
          return
        }

        const message = JSON.parse(event.data) as WebSocketMessage
        console.log('解析后的WebSocket消息:', message)
        console.log('消息类型:', message.type, '发送者:', message.senderName, '(ID:', message.senderId, ')')
        console.log('消息内容:', message.payload)

        // 检查消息格式是否正确
        if (!message.type || !message.senderId || !message.senderName) {
          console.error('收到格式不正确的WebSocket消息:', message)
          return
        }

        // 处理消息
        handleMessage(message)
      } catch (error) {
        console.error('处理WebSocket消息失败:', error, '原始消息:', event.data)
      }
    }

    // 连接关闭
    ws.onclose = (event) => {
      console.log('WebSocket连接关闭:', event.code, event.reason)

      // 清除连接超时
      if (connectionTimeout) {
        clearTimeout(connectionTimeout)
      }

      // 更新连接状态
      if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
        connectionStatus.value = ConnectionStatus.DISCONNECTED
        connectionError.value = `WebSocket连接关闭: ${event.code} ${event.reason}`
      }

      // 触发连接关闭事件
      try {
        console.log('发送连接关闭事件')
        const event = new CustomEvent('collaboration-stopped', {
          bubbles: true,
          detail: {
            timestamp: new Date().toISOString(),
            error: false,
            reason: '连接已关闭',
          },
        })
        document.dispatchEvent(event)
      } catch (error) {
        console.error('发送连接关闭事件失败:', error)
      }

      // 如果不是主动断开连接，尝试重新连接
      if (
        connectionStatus.value !== ConnectionStatus.DISCONNECTING &&
        reconnectAttempts.value < 5
      ) {
        reconnectAttempts.value++
        console.log(`WebSocket连接关闭，第${reconnectAttempts.value}次重试...`)
        setTimeout(() => {
          connect()
        }, 1000 * reconnectAttempts.value)
      }
    }

    // 连接错误
    ws.onerror = (event) => {
      console.error('WebSocket连接错误:', event)

      // 清除连接超时
      if (connectionTimeout) {
        clearTimeout(connectionTimeout)
      }

      // 更新连接状态
      connectionStatus.value = ConnectionStatus.ERROR
      connectionError.value = 'WebSocket连接错误'

      // 触发连接错误事件
      try {
        console.log('发送连接错误事件')
        const event = new CustomEvent('collaboration-stopped', {
          bubbles: true,
          detail: {
            timestamp: new Date().toISOString(),
            error: true,
            reason: 'WebSocket连接错误',
          },
        })
        document.dispatchEvent(event)
      } catch (error) {
        console.error('发送连接错误事件失败:', error)
      }
    }
  }

  // 断开WebSocket连接
  const disconnect = () => {
    console.log('准备断开WebSocket连接')
    console.log('当前连接状态:', connectionStatus.value)
    console.log('当前socket实例:', socket.value ? '存在' : '不存在')

    // 如果已经断开连接，不重复操作
    if (connectionStatus.value === ConnectionStatus.DISCONNECTED ||
        connectionStatus.value === ConnectionStatus.DISCONNECTING) {
      console.log('WebSocket已断开或正在断开连接，不重复操作')
      return
    }

    // 更新连接状态
    connectionStatus.value = ConnectionStatus.DISCONNECTING
    console.log('已将连接状态设置为断开连接中:', connectionStatus.value)

    // 如果有用户信息，发送离开消息
    if (socket.value && socket.value.readyState === WebSocket.OPEN && userStore.currentUser) {
      try {
        // 发送离开消息
        sendMessage({
          type: MessageType.LEAVE,
          senderId: String(userStore.currentUser.id),
          senderName: userStore.currentUser.username,
          sessionId: designId,
          timestamp: new Date().toISOString(),
          payload: {},
        })
        console.log('已发送离开消息')
      } catch (error) {
        console.error('发送离开消息失败:', error)
        connectionError.value = `发送离开消息失败: ${error}`
      }
    }

    // 关闭WebSocket连接
    if (socket.value) {
      try {
        console.log('关闭WebSocket连接')
        socket.value.close(1000, '用户主动断开连接')
        console.log('WebSocket连接已关闭')
      } catch (error) {
        console.error('关闭WebSocket连接失败:', error)
        connectionError.value = `关闭WebSocket连接失败: ${error}`
      }
    }

    // 更新连接状态
    connectionStatus.value = ConnectionStatus.DISCONNECTED
    socket.value = null
    console.log('已将连接状态设置为已断开:', connectionStatus.value)

    // 清空协作者列表
    collaborators.value = []
    console.log('已清空协作者列表')

    // 触发断开连接事件
    try {
      console.log('发送断开连接事件')
      const event = new CustomEvent('collaboration-stopped', {
        bubbles: true,
        detail: {
          timestamp: new Date().toISOString(),
          error: false,
          reason: '用户主动断开连接',
        },
      })
      document.dispatchEvent(event)
    } catch (error) {
      console.error('发送断开连接事件失败:', error)
    }
  }

  // 检查WebSocket连接状态
  const checkConnection = (autoReconnect = true) => {
    console.log('检查WebSocket连接状态:',
      socket.value ? `实例存在，状态: ${socket.value.readyState}` : '实例不存在',
      `当前连接状态: ${connectionStatus.value}`)

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

    // 检查WebSocket状态
    let isConnected = false
    switch (socket.value.readyState) {
      case WebSocket.CONNECTING:
        console.log('WebSocket正在连接中')
        // 如果状态不是CONNECTING，更新状态
        if (connectionStatus.value !== ConnectionStatus.CONNECTING) {
          console.log('状态不一致，更新为CONNECTING')
          connectionStatus.value = ConnectionStatus.CONNECTING
        }
        isConnected = false
        break
      case WebSocket.OPEN:
        console.log('WebSocket已连接')
        // 如果状态不是CONNECTED，更新状态
        if (connectionStatus.value !== ConnectionStatus.CONNECTED) {
          console.log('状态不一致，更新为CONNECTED')
          connectionStatus.value = ConnectionStatus.CONNECTED

          // 发送一个ping消息确认连接
          try {
            console.log('发送ping消息确认连接')
            socket.value.send(JSON.stringify({ type: 'ping' }))
            console.log('ping消息发送成功，连接正常')
          } catch (error) {
            console.error('ping消息发送失败，连接可能已断开:', error)
            connectionStatus.value = ConnectionStatus.DISCONNECTED
            socket.value = null
            return false
          }
        }
        isConnected = true
        break
      case WebSocket.CLOSING:
        console.log('WebSocket正在关闭')
        // 如果状态不是DISCONNECTING，更新状态
        if (connectionStatus.value !== ConnectionStatus.DISCONNECTING) {
          console.log('状态不一致，更新为DISCONNECTING')
          connectionStatus.value = ConnectionStatus.DISCONNECTING
        }
        isConnected = false
        break
      case WebSocket.CLOSED:
        console.log('WebSocket已关闭')
        // 如果状态不是DISCONNECTED，更新状态
        if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
          console.log('状态不一致，更新为DISCONNECTED')
          connectionStatus.value = ConnectionStatus.DISCONNECTED
        }
        isConnected = false

        // 如果自动重连，尝试重新连接
        if (autoReconnect && reconnectAttempts.value < 5) {
          console.log(`WebSocket已关闭，尝试自动重连，尝试次数: ${reconnectAttempts.value + 1}/5`)
          reconnectAttempts.value++
          connect()
        }
        break
      default:
        console.error('未知的WebSocket状态:', socket.value.readyState)
        isConnected = false
    }

    // 确保连接状态与实际状态一致
    if (isConnected && connectionStatus.value !== ConnectionStatus.CONNECTED) {
      console.log('连接状态不一致，更新为CONNECTED')
      connectionStatus.value = ConnectionStatus.CONNECTED
    } else if (!isConnected && connectionStatus.value === ConnectionStatus.CONNECTED) {
      console.log('连接状态不一致，更新为DISCONNECTED')
      connectionStatus.value = ConnectionStatus.DISCONNECTED
    }

    console.log('WebSocket连接检查结果:', isConnected ? '已连接' : '未连接')
    return isConnected
  }

  // 发送消息
  const sendMessage = (message: WebSocketMessage) => {
    console.log('准备发送消息:', message.type, '内容:', message.payload)
    console.log('当前WebSocket状态:', connectionStatus.value)
    console.log('当前socket实例:', socket.value ? '存在' : '不存在')

    if (socket.value) {
      console.log('当前WebSocket readyState:', socket.value.readyState,
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)')
    }

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
        } catch (error) {
          console.error('发送状态不一致的collaboration-stopped事件失败:', error)
        }
      }

      // 尝试重新连接
      console.log('尝试重新连接WebSocket')
      connect()

      return false
    }

    // 检查WebSocket连接状态
    if (socket.value.readyState !== WebSocket.OPEN) {
      console.error('WebSocket未连接，无法发送消息，当前状态:', socket.value.readyState)

      // 如果WebSocket正在连接中，尝试延迟发送
      if (socket.value.readyState === WebSocket.CONNECTING) {
        console.log('WebSocket正在连接中，尝试延迟发送消息')

        // 延迟500毫秒后重试
        setTimeout(() => {
          console.log('尝试延迟发送消息:', message.type)
          if (socket.value && socket.value.readyState === WebSocket.OPEN) {
            try {
              const messageString = JSON.stringify(message)
              socket.value.send(messageString)
              console.log('延迟发送消息成功:', message.type)
            } catch (error) {
              console.error('延迟发送消息失败:', error)
            }
          } else {
            console.error('延迟发送失败，WebSocket仍未就绪:',
              socket.value ? socket.value.readyState : '不存在')
          }
        }, 500)

        return false
      }

      // 如果状态不是CONNECTING，则更新为DISCONNECTED
      if (socket.value.readyState !== WebSocket.CONNECTING && connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
        console.log('状态不一致，更新为DISCONNECTED')
        connectionStatus.value = ConnectionStatus.DISCONNECTED

        // 触发断开连接事件
        try {
          console.log('发送WebSocket未连接的collaboration-stopped事件')
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
          console.error('发送WebSocket未连接的collaboration-stopped事件失败:', error)
        }
      }

      // 尝试重新连接
      console.log('尝试重新连接WebSocket')
      connect()

      return false
    }

    try {
      // 发送消息
      const messageString = JSON.stringify(message)
      console.log('准备发送WebSocket消息:', messageString)
      socket.value.send(messageString)
      console.log('消息已发送:', message.type)
      return true
    } catch (error) {
      console.error('发送消息失败:', error)

      // 如果发送失败，可能是连接已断开，尝试重新连接
      console.log('发送失败，尝试重新连接WebSocket')

      // 更新连接状态
      connectionStatus.value = ConnectionStatus.DISCONNECTED

      // 尝试重新连接
      connect()

      return false
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

    console.log('收到加入消息:', senderName, senderId)

    // 更新会话信息
    if (!session.value) {
      session.value = {
        id: message.sessionId,
        designId,
        collaborators: [],
        owner: payload.owner as string,
        createdAt: new Date(),
      }

      console.log('创建会话信息:', session.value)

      // 检查当前用户是否是所有者
      if (userStore.currentUser && String(userStore.currentUser.id) === session.value.owner) {
        isOwner.value = true
      }
    }

    // 检查用户是否已在协作者列表中
    const existingCollaborator = collaborators.value.find(c => c.id === senderId)

    if (existingCollaborator) {
      // 更新现有协作者的活跃时间
      existingCollaborator.lastActive = new Date()
      console.log('更新协作者活跃时间:', senderName)
    } else {
      // 添加新协作者
      const newCollaborator: CollaboratorInfo = {
        id: senderId,
        username: senderName,
        color: payload.color as string || generateRandomColor(),
        lastActive: new Date(),
      }

      collaborators.value.push(newCollaborator)
      console.log('添加新协作者:', senderName, '当前协作者数量:', collaborators.value.length)

      // 添加系统消息通知
      chatMessages.value.push({
        id: uuidv4(),
        senderId: 'system',
        senderName: '系统',
        content: `${senderName} 加入了协作`,
        timestamp: new Date(),
      })
    }
  }

  // 处理离开消息
  const handleLeaveMessage = (message: WebSocketMessage) => {
    const { senderId, senderName } = message

    console.log('收到离开消息:', senderName, senderId)

    // 从协作者列表中移除
    const index = collaborators.value.findIndex(c => c.id === senderId)
    if (index !== -1) {
      collaborators.value.splice(index, 1)
      console.log('移除协作者:', senderName, '当前协作者数量:', collaborators.value.length)

      // 添加系统消息通知
      chatMessages.value.push({
        id: uuidv4(),
        senderId: 'system',
        senderName: '系统',
        content: `${senderName} 离开了协作`,
        timestamp: new Date(),
      })
    }
  }

  // 处理更新障碍物消息
  const handleUpdateObstacleMessage = (message: WebSocketMessage) => {
    const { senderId, senderName, payload } = message

    // 避免处理自己发送的消息
    if (senderId === String(userStore.currentUser?.id)) {
      console.log('收到自己发送的更新障碍物消息，忽略处理')
      return
    }

    console.log('收到更新障碍物消息:', payload)

    try {
      // 检查障碍物是否存在
      const obstacle = courseStore.currentCourse.obstacles.find(o => o.id === payload.obstacleId)
      if (!obstacle) {
        console.error(`无法更新障碍物，ID不存在: ${payload.obstacleId}`)
        return
      }

      console.log('准备更新障碍物:', payload.obstacleId, '更新内容:', payload.updates)

      // 更新障碍物
      courseStore.updateObstacle(payload.obstacleId as string, payload.updates as Record<string, unknown>)
      console.log('障碍物更新成功:', payload.obstacleId, '更新后状态:',
        courseStore.currentCourse.obstacles.find(o => o.id === payload.obstacleId))

      // 添加系统消息通知
      chatMessages.value.push({
        id: uuidv4(),
        senderId: 'system',
        senderName: '系统',
        content: `${senderName} 更新了障碍物`,
        timestamp: new Date(),
      })
    } catch (error) {
      console.error('处理更新障碍物消息失败:', error)
    }
  }

  // 处理添加障碍物消息
  const handleAddObstacleMessage = (message: WebSocketMessage) => {
    const { senderId, senderName, payload } = message

    // 避免处理自己发送的消息
    if (senderId === String(userStore.currentUser?.id)) {
      console.log('收到自己发送的添加障碍物消息，忽略处理')
      return
    }

    console.log('收到添加障碍物消息:', payload)

    try {
      if (payload.obstacle && typeof payload.obstacle === 'object') {
        console.log('准备添加障碍物，数据:', payload.obstacle)
        const addedObstacle = courseStore.addObstacle(payload.obstacle as Omit<Obstacle, 'id'>)
        console.log('障碍物添加成功:', addedObstacle, '当前障碍物列表:', courseStore.currentCourse.obstacles)

        // 添加系统消息通知
        chatMessages.value.push({
          id: uuidv4(),
          senderId: 'system',
          senderName: '系统',
          content: `${senderName} 添加了障碍物`,
          timestamp: new Date(),
        })
      } else {
        console.error('添加障碍物失败，无效的障碍物数据:', payload)
      }
    } catch (error) {
      console.error('处理添加障碍物消息失败:', error)
    }
  }

  // 处理移除障碍物消息
  const handleRemoveObstacleMessage = (message: WebSocketMessage) => {
    const { senderId, senderName, payload } = message

    // 避免处理自己发送的消息
    if (senderId === String(userStore.currentUser?.id)) {
      console.log('收到自己发送的移除障碍物消息，忽略处理')
      return
    }

    console.log('收到移除障碍物消息:', payload)

    try {
      // 检查障碍物是否存在
      const obstacle = courseStore.currentCourse.obstacles.find(o => o.id === payload.obstacleId)
      if (!obstacle) {
        console.error(`无法移除障碍物，ID不存在: ${payload.obstacleId}`)
        return
      }

      console.log('准备移除障碍物:', payload.obstacleId)

      // 移除障碍物
      if (payload.obstacleId && typeof payload.obstacleId === 'string') {
        courseStore.removeObstacle(payload.obstacleId)
        console.log('障碍物移除成功:', payload.obstacleId, '当前障碍物列表:', courseStore.currentCourse.obstacles)

        // 添加系统消息通知
        chatMessages.value.push({
          id: uuidv4(),
          senderId: 'system',
          senderName: '系统',
          content: `${senderName} 移除了障碍物`,
          timestamp: new Date(),
        })
      } else {
        console.error('移除障碍物失败，无效的障碍物ID:', payload.obstacleId)
      }
    } catch (error) {
      console.error('处理移除障碍物消息失败:', error)
    }
  }

  // 处理更新路径消息
  const handleUpdatePathMessage = (message: WebSocketMessage) => {
    const { payload, senderName } = message

    // 避免处理自己发送的消息
    if (message.senderId === String(userStore.currentUser?.id)) return

    console.log('收到路径更新消息:', payload.path)

    // 更新路径
    if (payload.path) {
      courseStore.coursePath = payload.path as CoursePath

      // 添加系统消息通知
      chatMessages.value.push({
        id: crypto.randomUUID(),
        senderId: 'system',
        senderName: '系统',
        content: `${senderName} 更新了路径`,
        timestamp: new Date(),
      })
    }
  }

  // 处理光标移动消息
  const handleCursorMoveMessage = (message: WebSocketMessage) => {
    const { senderId, payload } = message

    // 避免处理自己发送的消息
    if (senderId === String(userStore.currentUser?.id)) return

    console.log('收到光标移动消息:', senderId, payload.position)

    // 更新协作者光标位置
    const collaborator = collaborators.value.find((c) => c.id === senderId)
    if (collaborator) {
      collaborator.cursor = payload.position as { x: number; y: number }
      collaborator.lastActive = new Date()
      console.log(`已更新协作者 ${collaborator.username} 的光标位置:`, collaborator.cursor)
    } else {
      console.warn('收到未知协作者的光标移动消息:', senderId)
    }
  }

  // 处理同步请求消息
  const handleSyncRequestMessage = () => {
    console.log('收到同步请求消息，准备发送同步响应')

    try {
      // 如果当前用户是所有者，发送同步响应
      if (userStore.currentUser) {
        // 构建同步响应消息
        const syncResponseMessage: WebSocketMessage = {
          type: MessageType.SYNC_RESPONSE,
          senderId: String(userStore.currentUser.id),
          senderName: userStore.currentUser.username,
          sessionId: designId,
          timestamp: new Date().toISOString(),
          payload: {
            obstacles: courseStore.currentCourse.obstacles,
            paths: courseStore.currentCourse.path || [],
          },
        }

        // 发送同步响应消息
        sendMessage(syncResponseMessage)
        console.log('同步响应消息已发送')
      } else {
        console.error('用户未登录，无法发送同步响应')
      }
    } catch (error) {
      console.error('处理同步请求消息失败:', error)
    }
  }

  // 处理同步响应消息
  const handleSyncResponseMessage = (message: WebSocketMessage) => {
    console.log('收到同步响应消息:', message.senderId, message.senderName)

    // 避免处理自己发送的消息
    if (message.senderId === String(userStore.currentUser?.id)) {
      console.log('收到自己发送的同步响应消息，忽略处理')
      return
    }

    try {
      const { obstacles, paths } = message.payload as { obstacles: Obstacle[]; paths: Path[] }

      // 更新障碍物
      if (obstacles && Array.isArray(obstacles)) {
        console.log('收到同步障碍物数据:', obstacles.length, '个障碍物')
        // 这里不直接替换，而是合并数据
        obstacles.forEach(obstacle => {
          const existingObstacle = courseStore.currentCourse.obstacles.find(o => o.id === obstacle.id)
          if (!existingObstacle) {
            console.log('添加新同步的障碍物:', obstacle.id)
            courseStore.addObstacle(obstacle)
          }
        })
      }

      // 更新路径
      if (paths && Array.isArray(paths)) {
        console.log('收到同步路径数据:', paths.length, '条路径')
        // 这里不直接替换，而是合并数据
        if (courseStore.currentCourse.path) {
          // 如果已有路径，更新现有路径
          courseStore.generatePath()
          console.log('更新现有路径')
        } else {
          // 如果没有路径，设置路径
          courseStore.generatePath()
          console.log('设置新路径')
        }
      }

      console.log('同步数据处理完成')

      // 不在聊天中添加系统消息，避免干扰用户
    } catch (error) {
      console.error('处理同步响应消息失败:', error)
    }
  }

  // 处理聊天消息
  const handleChatMessage = (message: WebSocketMessage) => {
    const { senderId, senderName, timestamp, payload } = message

    // 检查消息是否已存在（防止重复）
    const messageContent = payload.content as string
    const existingMessage = chatMessages.value.find(
      (msg) => msg.senderId === senderId && msg.content === messageContent
    )

    if (existingMessage) {
      console.log('收到重复的聊天消息，忽略处理')
      return
    }

    // 添加聊天消息
    chatMessages.value.push({
      id: uuidv4(),
      senderId,
      senderName,
      content: messageContent,
      timestamp: new Date(timestamp),
    })

    console.log('聊天消息已添加:', messageContent)
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
      console.warn('WebSocket未连接，无法发送光标位置')
      return
    }

    if (!userStore.currentUser) {
      console.warn('用户未登录，无法发送光标位置')
      return
    }

    // 添加日志输出
    console.log('发送光标位置消息:', position)

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
  const sendObstacleUpdate = (obstacleId: string, updates: Record<string, unknown>, useQueue = true) => {
    console.log(`准备发送障碍物更新 - ID: ${obstacleId}, 更新内容:`, updates)

    // 检查参数有效性
    if (!obstacleId) {
      console.error('发送障碍物更新失败: 障碍物ID为空')
      return
    }

    if (!updates || Object.keys(updates).length === 0) {
      console.error('发送障碍物更新失败: 更新内容为空')
      return
    }

    // 检查连接状态，不自动重连
    if (!checkConnection(false)) {
      console.error('发送障碍物更新失败: WebSocket未连接')

      // 如果允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('将障碍物更新消息添加到队列:', obstacleId, updates)
        messageQueue.value.push({
          type: 'update',
          data: { obstacleId, updates }
        })
      }

      return
    }

    if (!userStore.currentUser) {
      console.error('发送障碍物更新失败: 用户未登录')
      return
    }

    console.log(`准备发送障碍物更新消息 - 障碍物ID: ${obstacleId}, 更新内容:`, updates)
    console.log('当前WebSocket状态:', connectionStatus.value)
    console.log('当前socket实例:', socket.value ? '存在' : '不存在')

    if (socket.value) {
      console.log('WebSocket readyState:', socket.value.readyState,
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)')
    }

    try {
      const message = {
        type: MessageType.UPDATE_OBSTACLE,
        senderId: String(userStore.currentUser.id),
        senderName: userStore.currentUser.username,
        sessionId: designId,
        timestamp: new Date().toISOString(),
        payload: {
          obstacleId,
          updates,
        },
      };

      console.log('构造的障碍物更新消息:', message)
      const result = sendMessage(message)

      if (result) {
        console.log(`障碍物更新消息发送成功 - 障碍物ID: ${obstacleId}`)
      } else {
        console.error(`障碍物更新消息发送失败 - 障碍物ID: ${obstacleId}`)

        // 如果发送失败且允许使用队列，将消息添加到队列
        if (useQueue) {
          console.log('发送失败，将障碍物更新消息添加到队列:', obstacleId, updates)
          messageQueue.value.push({
            type: 'update',
            data: { obstacleId, updates }
          })
        }
      }
    } catch (error) {
      console.error('发送障碍物更新消息失败:', error)

      // 如果发送失败且允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('发送异常，将障碍物更新消息添加到队列:', obstacleId, updates)
        messageQueue.value.push({
          type: 'update',
          data: { obstacleId, updates }
        })
      }
    }
  }

  // 发送添加障碍物
  const sendAddObstacle = (obstacle: Record<string, unknown>, useQueue = true) => {
    console.log('准备发送添加障碍物消息，障碍物数据:', obstacle)

    // 检查参数有效性
    if (!obstacle) {
      console.error('发送添加障碍物失败: 障碍物数据为空')
      return
    }

    // 检查连接状态，不自动重连
    if (!checkConnection(false)) {
      console.error('发送添加障碍物失败: WebSocket未连接')

      // 如果允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('将添加障碍物消息添加到队列:', obstacle)
        messageQueue.value.push({
          type: 'add',
          data: { obstacle }
        })
      }

      return
    }

    if (!userStore.currentUser) {
      console.error('发送添加障碍物失败: 用户未登录')
      return
    }

    console.log('准备发送添加障碍物消息:', obstacle)
    console.log('当前WebSocket状态:', connectionStatus.value)
    console.log('当前socket实例:', socket.value ? '存在' : '不存在')

    if (socket.value) {
      console.log('WebSocket readyState:', socket.value.readyState,
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)')
    }

    // 再次检查WebSocket是否已连接
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error('发送添加障碍物失败: WebSocket未连接或未就绪，当前状态:',
        socket.value ? socket.value.readyState : '实例不存在')

      // 如果允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('将添加障碍物消息添加到队列:', obstacle)
        messageQueue.value.push({
          type: 'add',
          data: { obstacle }
        })
      }

      return
    }

    try {
      const message = {
        type: MessageType.ADD_OBSTACLE,
        senderId: String(userStore.currentUser.id),
        senderName: userStore.currentUser.username,
        sessionId: designId,
        timestamp: new Date().toISOString(),
        payload: {
          obstacle,
        },
      };

      console.log('构造的添加障碍物消息:', message)
      const result = sendMessage(message)

      if (result) {
        console.log('添加障碍物消息发送成功')
      } else {
        console.error('添加障碍物消息发送失败')

        // 如果发送失败且允许使用队列，将消息添加到队列
        if (useQueue) {
          console.log('发送失败，将添加障碍物消息添加到队列:', obstacle)
          messageQueue.value.push({
            type: 'add',
            data: { obstacle }
          })
        }
      }
    } catch (error) {
      console.error('发送添加障碍物消息失败:', error)

      // 如果发送失败且允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('发送异常，将添加障碍物消息添加到队列:', obstacle)
        messageQueue.value.push({
          type: 'add',
          data: { obstacle }
        })
      }
    }
  }

  // 发送移除障碍物
  const sendRemoveObstacle = (obstacleId: string, useQueue = true) => {
    console.log('准备发送移除障碍物消息，障碍物ID:', obstacleId)

    // 检查参数有效性
    if (!obstacleId) {
      console.error('发送移除障碍物失败: 障碍物ID为空')
      return
    }

    // 检查连接状态，不自动重连
    if (!checkConnection(false)) {
      console.error('发送移除障碍物失败: WebSocket未连接')

      // 如果允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('将移除障碍物消息添加到队列:', obstacleId)
        messageQueue.value.push({
          type: 'remove',
          data: { obstacleId }
        })
      }

      return
    }

    if (!userStore.currentUser) {
      console.error('发送移除障碍物失败: 用户未登录')
      return
    }

    console.log('准备发送移除障碍物消息:', obstacleId)
    console.log('当前WebSocket状态:', connectionStatus.value)
    console.log('当前socket实例:', socket.value ? '存在' : '不存在')

    if (socket.value) {
      console.log('WebSocket readyState:', socket.value.readyState,
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)')
    }

    // 再次检查WebSocket是否已连接
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error('发送移除障碍物失败: WebSocket未连接或未就绪，当前状态:',
        socket.value ? socket.value.readyState : '实例不存在')

      // 如果允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('将移除障碍物消息添加到队列:', obstacleId)
        messageQueue.value.push({
          type: 'remove',
          data: { obstacleId }
        })
      }

      return
    }

    try {
      const message = {
        type: MessageType.REMOVE_OBSTACLE,
        senderId: String(userStore.currentUser.id),
        senderName: userStore.currentUser.username,
        sessionId: designId,
        timestamp: new Date().toISOString(),
        payload: {
          obstacleId,
        },
      };

      console.log('构造的移除障碍物消息:', message)
      const result = sendMessage(message)

      if (result) {
        console.log('移除障碍物消息发送成功')
      } else {
        console.error('移除障碍物消息发送失败')

        // 如果发送失败且允许使用队列，将消息添加到队列
        if (useQueue) {
          console.log('发送失败，将移除障碍物消息添加到队列:', obstacleId)
          messageQueue.value.push({
            type: 'remove',
            data: { obstacleId }
          })
        }
      }
    } catch (error) {
      console.error('发送移除障碍物消息失败:', error)

      // 如果发送失败且允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('发送异常，将移除障碍物消息添加到队列:', obstacleId)
        messageQueue.value.push({
          type: 'remove',
          data: { obstacleId }
        })
      }
    }
  }

  // 发送路径更新
  const sendPathUpdate = (path: Record<string, unknown>, useQueue = true) => {
    // 检查连接状态，不自动重连
    if (!checkConnection(false)) {
      console.error('发送路径更新失败: WebSocket未连接')

      // 如果允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('将路径更新消息添加到队列:', path)
        messageQueue.value.push({
          type: 'path',
          data: { path }
        })
      }

      return
    }

    if (!userStore.currentUser) {
      console.error('发送路径更新失败: 用户未登录')
      return
    }

    console.log('准备发送路径更新消息:', path)

    try {
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
      console.log('路径更新消息发送成功')
    } catch (error) {
      console.error('发送路径更新消息失败:', error)
    }
  }

  // 组件卸载时断开连接
  onUnmounted(() => {
    disconnect()
  })

  return {
    connectionStatus,
    connectionError,
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
