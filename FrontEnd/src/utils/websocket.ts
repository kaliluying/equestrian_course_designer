/**
 * WebSocket工具模块
 *
 * 该模块提供了WebSocket连接的创建、管理和消息处理功能，
 * 用于实现马术障碍赛路线设计器的实时协作功能。
 */

// 导入Vue相关功能
import { ref, onUnmounted, shallowRef } from 'vue'
// 导入用户状态管理
import { useUserStore } from '@/stores/user'
// 导入课程状态管理
import { useCourseStore } from '@/stores/course'
// 导入Element Plus消息组件
import { ElMessage } from 'element-plus'
// 导入障碍物和路径类型定义
import type { Obstacle, CoursePath } from '@/types/obstacle'
// 导入UUID生成工具
import { v4 as uuidv4 } from 'uuid'
// 导入API配置文件
import apiConfig from '@/config/api'

/**
 * WebSocket连接状态枚举
 *
 * 定义了WebSocket连接的五种可能状态：
 * - CONNECTING: 正在连接中
 * - CONNECTED: 已连接
 * - DISCONNECTING: 正在断开连接
 * - DISCONNECTED: 已断开连接
 * - ERROR: 连接错误
 */
export enum ConnectionStatus {
  CONNECTING = 0, // 正在连接中
  CONNECTED = 1, // 已连接
  DISCONNECTING = 2, // 正在断开连接
  DISCONNECTED = 3, // 已断开连接
  ERROR = 4, // 连接错误
}

/**
 * 协作用户信息接口
 *
 * 定义了协作用户的基本信息结构：
 * - id: 用户唯一标识
 * - username: 用户名
 * - color: 用户在协作中的标识颜色
 * - cursor: 用户光标位置（可选）
 * - lastActive: 最后活动时间
 * - role: 用户角色
 */
export interface CollaboratorInfo {
  id: string
  username: string
  color: string
  cursor?: { x: number; y: number }
  lastActive: Date
  role: string
}

/**
 * 协作会话信息接口
 *
 * 定义了协作会话的基本信息结构：
 * - id: 会话唯一标识
 * - designId: 设计唯一标识
 * - collaborators: 协作者列表
 * - owner: 所有者ID
 * - createdAt: 创建时间
 */
export interface CollaborationSession {
  id: string
  designId: string
  collaborators: CollaboratorInfo[]
  owner: string
  createdAt: Date
}

/**
 * 消息类型枚举
 *
 * 定义了WebSocket通信中的各种消息类型：
 * - JOIN: 加入协作
 * - LEAVE: 离开协作
 * - UPDATE_OBSTACLE: 更新障碍物
 * - ADD_OBSTACLE: 添加障碍物
 * - REMOVE_OBSTACLE: 移除障碍物
 * - UPDATE_PATH: 更新路径
 * - CURSOR_MOVE: 光标移动
 * - SYNC_REQUEST: 同步请求
 * - SYNC_RESPONSE: 同步响应
 * - CHAT: 聊天消息
 * - ERROR: 错误消息
 * - SESSION_UPDATE: 会话更新
 */
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
  SESSION_UPDATE = 'session_update',
}

/**
 * WebSocket消息接口
 *
 * 定义了WebSocket消息的基本结构：
 * - type: 消息类型
 * - senderId: 发送者ID
 * - senderName: 发送者名称
 * - sessionId: 会话ID
 * - timestamp: 时间戳
 * - payload: 消息负载
 */
export interface WebSocketMessage {
  type: MessageType
  senderId: string
  senderName: string
  sessionId: string
  timestamp: string
  payload: Record<string, unknown>
}

/**
 * 聊天消息接口
 *
 * 定义了聊天消息的基本结构：
 * - id: 消息唯一标识
 * - senderId: 发送者ID
 * - senderName: 发送者名称
 * - content: 消息内容
 * - timestamp: 时间戳
 */
export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: Date
}

// 定义Path类型别名，使用CoursePath类型
export type Path = CoursePath

/**
 * 后端会话信息接口
 *
 * 定义了从后端接收的会话信息结构：
 * - id: 会话唯一标识
 * - design_id: 设计唯一标识
 * - collaborators: 协作者列表
 * - owner: 所有者ID
 * - created_at: 创建时间
 * - initiator?: string // 保留字段以兼容后端，但前端不使用
 */
interface BackendSession {
  id: string
  design_id: string
  collaborators: Array<{
    id: string
    username: string
    color: string
    last_active: string
    role?: string
  }>
  owner: string
  created_at: string
  initiator?: string // 保留字段以兼容后端，但前端不使用
}

/**
 * 创建WebSocket连接函数
 *
 * 该函数负责创建一个新的WebSocket连接实例。
 *
 * @param designId - 设计ID，用于标识要连接的协作会话
 * @param viaLink - 是否通过邀请链接加入，默认为false
 * @returns 返回创建的WebSocket实例，如果创建失败则返回null
 */
const createWebSocketConnection = (
  designId: string,
  viaLink: boolean = false,
): WebSocket | null => {
  console.log('创建WebSocket连接，设计ID:', designId, '通过链接加入:', viaLink)

  // 验证设计ID是否存在
  if (!designId) {
    console.error('设计ID为空，无法创建WebSocket连接')
    return null
  }

  // 确保用户已登录
  const userStore = useUserStore()
  if (!userStore.currentUser) {
    console.error('用户未登录，无法创建WebSocket连接')
    return null
  }

  try {
    // 使用配置文件获取WebSocket URL
    let wsUrl = apiConfig.websocket.getConnectionUrl(designId)

    // 添加token参数
    const token = localStorage.getItem('access_token')
    if (token) {
      wsUrl += (wsUrl.includes('?') ? '&' : '?') + `token=${token}`
    }

    // 如果是通过链接加入，添加via_link参数
    if (viaLink) {
      wsUrl += (wsUrl.includes('?') ? '&' : '?') + 'via_link=true'
      console.log('添加via_link参数，最终URL:', wsUrl)
    }

    console.log('WebSocket连接URL:', wsUrl)

    // 创建WebSocket实例
    const ws = new WebSocket(wsUrl)
    console.log('WebSocket实例已创建，readyState:', ws.readyState)
    return ws
  } catch (error) {
    console.error('创建WebSocket连接失败:', error)
    return null
  }
}

/**
 * 创建并管理WebSocket连接的组合式函数
 *
 * 该函数提供了完整的WebSocket连接管理功能，包括：
 * - 创建和维护WebSocket连接
 * - 管理连接状态
 * - 处理各类消息（加入、离开、更新等）
 * - 提供消息发送接口
 * - 自动重连机制
 * - 消息队列管理
 *
 * @param designId - 设计ID，用于标识要连接的协作会话
 * @returns 返回WebSocket连接相关的状态和方法
 */
export function useWebSocketConnection(designId: string) {
  // 获取用户和课程状态
  const userStore = useUserStore()
  const courseStore = useCourseStore()

  /**
   * 状态变量定义
   *
   * socket - WebSocket实例引用
   * connectionStatus - 当前连接状态
   * connectionError - 连接错误信息
   * collaborators - 协作者列表
   * chatMessages - 聊天消息列表
   * isOwner - 当前用户是否是所有者
   * reconnectAttempts - 重连尝试次数
   * session - 当前会话信息
   * viaLink - 是否通过链接加入
   */
  const socket = shallowRef<WebSocket | null>(null)
  const connectionStatus = ref<ConnectionStatus>(ConnectionStatus.DISCONNECTED)
  const connectionError = ref<string | null>(null)
  const collaborators = ref<CollaboratorInfo[]>([])
  const chatMessages = ref<ChatMessage[]>([])
  const isOwner = ref(false)
  const reconnectAttempts = ref(0)
  const session = ref<CollaborationSession | null>(null)
  const viaLink = ref(false)

  /**
   * 消息队列
   *
   * 用于存储WebSocket连接建立前的消息，连接建立后会自动发送
   * 支持的消息类型：
   * - update: 更新障碍物
   * - add: 添加障碍物
   * - remove: 移除障碍物
   * - path: 更新路径
   */
  const messageQueue = ref<
    {
      type: 'update' | 'add' | 'remove' | 'path'
      data: Record<string, unknown>
    }[]
  >([])

  /**
   * 处理消息队列
   *
   * 当WebSocket连接建立后，处理在连接建立前积累的消息队列。
   * 按照消息类型分别调用相应的发送函数，确保消息按顺序发送。
   * 如果WebSocket未连接，则不处理队列。
   */
  const processMessageQueue = () => {
    // 检查队列是否为空
    if (messageQueue.value.length === 0) {
      console.log('消息队列为空，无需处理')
      return
    }

    // 检查WebSocket是否已连接
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error(
        '处理消息队列失败: WebSocket未连接，当前状态:',
        socket.value ? socket.value.readyState : '实例不存在',
      )
      return
    }

    console.log(`开始处理消息队列，队列长度: ${messageQueue.value.length}`)

    // 处理队列中的每条消息
    const processedMessages: Array<{
      type: 'update' | 'add' | 'remove' | 'path'
      data: Record<string, unknown>
    }> = []

    for (const message of messageQueue.value) {
      try {
        // 根据消息类型调用相应的发送函数
        if (message.type === 'update' && message.data.obstacleId && message.data.updates) {
          // 发送障碍物更新消息
          console.log('从队列中发送障碍物更新消息:', message.data.obstacleId, message.data.updates)

          // 直接发送消息，不使用sendObstacleUpdate函数，避免额外的连接检查
          if (socket.value && socket.value.readyState === WebSocket.OPEN && userStore.currentUser) {
            const updateMessage = {
              type: MessageType.UPDATE_OBSTACLE,
              senderId: String(userStore.currentUser.id),
              senderName: userStore.currentUser.username,
              sessionId: designId,
              timestamp: new Date().toISOString(),
              payload: {
                obstacleId: message.data.obstacleId,
                updates: message.data.updates,
              },
            }

            socket.value.send(JSON.stringify(updateMessage))
            console.log(`队列中的障碍物更新消息发送成功 - 障碍物ID: ${message.data.obstacleId}`)
            processedMessages.push(message)
          } else {
            console.error(
              '发送队列中的障碍物更新消息失败: WebSocket未连接或用户未登录',
              socket.value ? socket.value.readyState : '实例不存在',
            )
            break // 如果发送失败，停止处理队列
          }
        } else if (message.type === 'add' && message.data.obstacle) {
          // 发送添加障碍物消息
          console.log('从队列中发送添加障碍物消息:', message.data.obstacle)

          // 确保障碍物有ID
          const obstacle = message.data.obstacle as Record<string, unknown>
          if (!obstacle.id) {
            console.error('队列中的添加障碍物消息缺少ID，跳过处理')
            processedMessages.push(message) // 移除无效消息
            continue
          }

          // 直接发送消息，不使用sendAddObstacle函数，避免额外的连接检查
          if (socket.value && socket.value.readyState === WebSocket.OPEN && userStore.currentUser) {
            const addMessage = {
              type: MessageType.ADD_OBSTACLE,
              senderId: String(userStore.currentUser.id),
              senderName: userStore.currentUser.username,
              sessionId: designId,
              timestamp: new Date().toISOString(),
              payload: {
                obstacle: message.data.obstacle,
              },
            }

            socket.value.send(JSON.stringify(addMessage))
            console.log('队列中的添加障碍物消息发送成功')
            processedMessages.push(message)
          } else {
            console.error(
              '发送队列中的添加障碍物消息失败: WebSocket未连接或用户未登录',
              socket.value ? socket.value.readyState : '实例不存在',
            )
            break // 如果发送失败，停止处理队列
          }
        } else if (message.type === 'remove' && message.data.obstacleId) {
          // 发送移除障碍物消息
          console.log('从队列中发送移除障碍物消息:', message.data.obstacleId)

          // 直接发送消息，不使用sendRemoveObstacle函数，避免额外的连接检查
          if (socket.value && socket.value.readyState === WebSocket.OPEN && userStore.currentUser) {
            const removeMessage = {
              type: MessageType.REMOVE_OBSTACLE,
              senderId: String(userStore.currentUser.id),
              senderName: userStore.currentUser.username,
              sessionId: designId,
              timestamp: new Date().toISOString(),
              payload: {
                obstacleId: message.data.obstacleId,
              },
            }

            socket.value.send(JSON.stringify(removeMessage))
            console.log(`队列中的移除障碍物消息发送成功 - 障碍物ID: ${message.data.obstacleId}`)
            processedMessages.push(message)
          } else {
            console.error(
              '发送队列中的移除障碍物消息失败: WebSocket未连接或用户未登录',
              socket.value ? socket.value.readyState : '实例不存在',
            )
            break // 如果发送失败，停止处理队列
          }
        } else if (message.type === 'path' && message.data.path) {
          // 发送路径更新消息
          console.log('从队列中发送路径更新消息:', message.data.path)

          // 直接发送消息，不使用sendPathUpdate函数，避免额外的连接检查
          if (socket.value && socket.value.readyState === WebSocket.OPEN && userStore.currentUser) {
            const pathMessage = {
              type: MessageType.UPDATE_PATH,
              senderId: String(userStore.currentUser.id),
              senderName: userStore.currentUser.username,
              sessionId: designId,
              timestamp: new Date().toISOString(),
              payload: {
                path: message.data.path,
              },
            }

            socket.value.send(JSON.stringify(pathMessage))
            console.log('队列中的路径更新消息发送成功')
            processedMessages.push(message)
          } else {
            console.error(
              '发送队列中的路径更新消息失败: WebSocket未连接或用户未登录',
              socket.value ? socket.value.readyState : '实例不存在',
            )
            break // 如果发送失败，停止处理队列
          }
        } else {
          // 未知消息类型，从队列中移除
          console.warn('队列中存在未知类型的消息:', message)
          processedMessages.push(message)
        }
      } catch (error) {
        console.error('处理队列消息失败:', error, message)
        break // 如果处理失败，停止处理队列
      }
    }

    // 从队列中移除已处理的消息
    if (processedMessages.length > 0) {
      messageQueue.value = messageQueue.value.filter((msg) => !processedMessages.includes(msg))
      console.log(
        `已处理 ${processedMessages.length} 条队列消息，剩余 ${messageQueue.value.length} 条`,
      )
    }
  }

  /**
   * 生成随机颜色
   *
   * 为协作用户生成一个随机的标识颜色，用于在界面上区分不同用户。
   * 从预定义的颜色列表中随机选择一个颜色。
   *
   * @returns 返回一个十六进制颜色代码，如 '#FF6B6B'
   */
  const generateRandomColor = () => {
    // 预定义的颜色列表，选择了一些明亮、易于区分的颜色
    const colors = [
      '#FF6B6B', // 红色
      '#4ECDC4', // 青色
      '#45B7D1', // 蓝色
      '#FFA5A5', // 浅红色
      '#A5FFD6', // 浅绿色
      '#FFC145', // 橙色
      '#FF6B8B', // 粉色
      '#845EC2', // 紫色
      '#D65DB1', // 洋红色
      '#FF9671', // 珊瑚色
    ]
    // 随机选择一个颜色并返回
    return colors[Math.floor(Math.random() * colors.length)]
  }

  /**
   * 连接WebSocket
   *
   * 创建并建立WebSocket连接，设置连接超时处理和事件监听。
   * 如果连接失败或超时，会自动尝试重新连接（最多5次）。
   *
   * @param isViaLink - 是否通过邀请链接加入，默认为false
   */
  const connect = (isViaLink: boolean = false) => {
    console.log('尝试连接WebSocket，设计ID:', designId, '通过链接加入:', isViaLink)

    // 设置通过链接加入的状态
    viaLink.value = isViaLink

    // 断开现有连接，确保不会有多个连接同时存在
    disconnect()

    // 更新连接状态为"连接中"
    connectionStatus.value = ConnectionStatus.CONNECTING
    connectionError.value = null
    console.log('已将连接状态设置为连接中:', connectionStatus.value)

    try {
      // 使用createWebSocketConnection创建WebSocket实例，传递通过链接加入的状态
      const ws = createWebSocketConnection(designId, isViaLink)
      if (!ws) {
        throw new Error('创建WebSocket连接失败')
      }

      // 保存WebSocket实例
      socket.value = ws
      console.log('WebSocket实例已创建，readyState:', ws.readyState)

      // 设置连接超时处理，防止连接一直处于CONNECTING状态
      const connectionTimeout = setTimeout(() => {
        // 检查连接是否仍在连接中状态
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

          // 触发连接失败事件，通知其他组件
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

          // 尝试重新连接，最多重试5次，每次间隔时间递增
          if (reconnectAttempts.value < 5) {
            reconnectAttempts.value++
            console.log(`WebSocket连接超时，第${reconnectAttempts.value}次重试...`)
            setTimeout(() => {
              connect()
            }, 1000 * reconnectAttempts.value) // 重试间隔随重试次数增加
          }
        }
      }, apiConfig.websocket.reconnectInterval) // 使用配置文件中的超时设置

      // 设置WebSocket事件处理器（onopen, onmessage, onclose, onerror）
      setupWebSocketEvents(ws, connectionTimeout)
    } catch (error) {
      // 处理连接创建过程中的错误
      console.error('创建WebSocket连接失败:', error)
      connectionStatus.value = ConnectionStatus.ERROR
      connectionError.value = `创建WebSocket连接失败: ${error}`
      socket.value = null

      // 触发连接失败事件，通知其他组件
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

  /**
   * 设置WebSocket事件处理器
   *
   * 为WebSocket实例设置各种事件处理函数：
   * - onopen: 连接成功时的处理
   * - onmessage: 接收消息时的处理
   * - onclose: 连接关闭时的处理
   * - onerror: 连接错误时的处理
   *
   * @param ws - WebSocket实例
   * @param connectionTimeout - 连接超时定时器，用于在连接成功时清除
   */
  const setupWebSocketEvents = (
    ws: WebSocket,
    connectionTimeout?: ReturnType<typeof setTimeout>,
  ) => {
    console.log('设置WebSocket事件处理器')

    // 连接成功事件处理
    ws.onopen = () => {
      console.log('WebSocket连接成功')

      // 清除连接超时定时器
      if (connectionTimeout) {
        clearTimeout(connectionTimeout)
      }

      // 更新连接状态为已连接
      connectionStatus.value = ConnectionStatus.CONNECTED
      connectionError.value = null
      reconnectAttempts.value = 0 // 重置重连尝试次数

      // 如果有用户信息，发送加入消息
      if (userStore.currentUser) {
        try {
          // 构造并发送加入消息，包含用户ID、用户名和随机颜色
          const joinMessage: WebSocketMessage = {
            type: MessageType.JOIN,
            senderId: String(userStore.currentUser.id),
            senderName: userStore.currentUser.username,
            sessionId: designId,
            timestamp: new Date().toISOString(),
            payload: {
              color: generateRandomColor(), // 为用户生成随机颜色标识
            },
          }
          console.log('准备发送加入消息:', joinMessage)
          sendMessage(joinMessage)
          console.log('已发送加入消息')
        } catch (error) {
          console.error('发送加入消息失败:', error)
          connectionError.value = `发送加入消息失败: ${error}`
        }
      } else {
        console.error('用户未登录，无法发送加入消息')
        connectionError.value = '用户未登录，无法发送加入消息'
      }

      // 处理连接建立前积累的消息队列
      processMessageQueue()

      // 触发连接成功事件，通知其他组件
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

    // 接收消息事件处理
    ws.onmessage = (event: MessageEvent) => {
      try {
        console.log('收到WebSocket原始消息:', event.data)

        // 处理心跳检测消息 - ping
        if (event.data === '{"type":"ping"}') {
          console.log('收到ping消息，发送pong响应')
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }))
            console.log('pong响应已发送')
          }
          return
        }

        // 处理心跳检测响应 - pong
        if (event.data === '{"type":"pong"}') {
          console.log('收到pong响应，连接正常')
          return
        }

        // 解析消息JSON内容为WebSocketMessage对象
        const message = JSON.parse(event.data) as WebSocketMessage
        console.log('解析后的WebSocket消息:', message)
        console.log(
          '消息类型:',
          message.type,
          '发送者:',
          message.senderName,
          '(ID:',
          message.senderId,
          ')',
        )
        console.log('消息内容:', message.payload)

        // 验证消息格式是否完整
        if (!message.type || !message.senderId || !message.senderName) {
          console.error('收到格式不正确的WebSocket消息:', message)
          return
        }

        // 调用相应的消息处理函数
        handleMessage(message)
      } catch (error) {
        // 捕获并记录消息处理过程中的任何错误
        console.error('处理WebSocket消息失败:', error, '原始消息:', event.data)
      }
    }

    // 连接关闭事件处理
    ws.onclose = (event) => {
      console.log('WebSocket连接关闭:', event.code, event.reason)

      // 清除连接超时定时器
      if (connectionTimeout) {
        clearTimeout(connectionTimeout)
      }

      // 更新连接状态为已断开
      if (connectionStatus.value !== ConnectionStatus.DISCONNECTED) {
        connectionStatus.value = ConnectionStatus.DISCONNECTED
        connectionError.value = `WebSocket连接关闭: ${event.code} ${event.reason}`
      }

      // 触发连接关闭事件，通知其他组件
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

      // 如果不是主动断开连接，尝试自动重新连接（最多5次）
      if (
        (connectionStatus.value as number) !== ConnectionStatus.DISCONNECTING &&
        reconnectAttempts.value < 5
      ) {
        reconnectAttempts.value++
        console.log(`WebSocket连接关闭，第${reconnectAttempts.value}次重试...`)
        setTimeout(() => {
          connect()
        }, 1000 * reconnectAttempts.value) // 重试间隔随重试次数增加
      }
    }

    // 连接错误事件处理
    ws.onerror = (event) => {
      console.error('WebSocket连接错误:', event)

      // 清除连接超时定时器
      if (connectionTimeout) {
        clearTimeout(connectionTimeout)
      }

      // 更新连接状态为错误
      connectionStatus.value = ConnectionStatus.ERROR
      connectionError.value = 'WebSocket连接错误'

      // 触发连接错误事件，通知其他组件
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

  /**
   * 断开WebSocket连接
   *
   * 主动断开当前的WebSocket连接，执行以下操作：
   * 1. 检查当前连接状态，避免重复操作
   * 2. 发送离开消息
   * 3. 关闭WebSocket连接
   * 4. 更新连接状态
   * 5. 清空协作者列表
   * 6. 触发断开连接事件
   */
  const disconnect = () => {
    console.log('准备断开WebSocket连接')
    console.log('当前连接状态:', connectionStatus.value)
    console.log('当前socket实例:', socket.value ? '存在' : '不存在')

    // 如果已经断开连接或正在断开连接，不重复操作
    if (
      connectionStatus.value === ConnectionStatus.DISCONNECTED ||
      connectionStatus.value === ConnectionStatus.DISCONNECTING
    ) {
      console.log('WebSocket已断开或正在断开连接，不重复操作')
      return
    }

    // 更新连接状态为正在断开连接
    connectionStatus.value = ConnectionStatus.DISCONNECTING
    console.log('已将连接状态设置为断开连接中:', connectionStatus.value)

    // 如果有用户信息且WebSocket连接已建立，发送离开消息
    if (socket.value && socket.value.readyState === WebSocket.OPEN && userStore.currentUser) {
      try {
        // 构造并发送离开消息
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
        socket.value.close(1000, '用户主动断开连接') // 1000是正常关闭的状态码
        console.log('WebSocket连接已关闭')
      } catch (error) {
        console.error('关闭WebSocket连接失败:', error)
        connectionError.value = `关闭WebSocket连接失败: ${error}`
      }
    }

    // 更新连接状态为已断开连接
    connectionStatus.value = ConnectionStatus.DISCONNECTED
    socket.value = null
    console.log('已将连接状态设置为已断开:', connectionStatus.value)

    // 清空协作者列表
    collaborators.value = []
    console.log('已清空协作者列表')

    // 触发断开连接事件，通知其他组件
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
    console.log(
      '检查WebSocket连接状态:',
      socket.value ? `实例存在，状态: ${socket.value.readyState}` : '实例不存在',
      `当前连接状态: ${connectionStatus.value}`,
    )

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
      console.log(
        '当前WebSocket readyState:',
        socket.value.readyState,
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)',
      )
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
            console.error(
              '延迟发送失败，WebSocket仍未就绪:',
              socket.value ? socket.value.readyState : '不存在',
            )
          }
        }, 500)

        return false
      }

      // 如果状态不是CONNECTING，则更新为DISCONNECTED
      if (
        socket.value.readyState !== WebSocket.CONNECTING &&
        connectionStatus.value !== ConnectionStatus.DISCONNECTED
      ) {
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
      case MessageType.SESSION_UPDATE:
        handleSessionUpdateMessage(message)
        break
      default:
        console.warn('未知消息类型:', message.type)
    }
  }

  // 处理加入消息
  const handleJoinMessage = (message: WebSocketMessage) => {
    const { payload } = message

    console.log('收到加入消息:', message)
    console.log('消息负载:', payload)
    console.log('当前用户ID:', userStore.currentUser?.id)
    console.log('发送者ID:', message.senderId)

    // 更新会话信息
    if (payload && typeof payload === 'object' && 'session' in payload) {
      const backendSession = (payload as { session: BackendSession }).session
      console.log('后端会话信息:', backendSession)
      console.log('协作者列表:', backendSession.collaborators)
      console.log('协作者数量:', backendSession.collaborators.length)

      // 检查会话信息的完整性
      if (!backendSession.id || !backendSession.design_id) {
        console.error('收到的会话信息不完整 - 缺少ID或设计ID:', backendSession)
        return
      }

      if (!Array.isArray(backendSession.collaborators)) {
        console.error('收到的会话信息不完整 - 协作者列表不是数组:', backendSession)
        return
      }

      // 更新会话信息
      session.value = {
        id: backendSession.id,
        designId: backendSession.design_id,
        collaborators: backendSession.collaborators.map((c) => ({
          id: c.id,
          username: c.username,
          color: c.color,
          role: c.role || 'collaborator',
          lastActive: new Date(c.last_active),
        })),
        owner: backendSession.owner,
        createdAt: new Date(backendSession.created_at),
      }
      console.log('会话信息已更新:', session.value)

      // 更新协作者列表
      collaborators.value = backendSession.collaborators.map((c) => ({
        id: c.id,
        username: c.username,
        color: c.color,
        role: c.role || 'collaborator',
        lastActive: new Date(c.last_active),
      }))
      console.log('协作者列表已更新:', collaborators.value)

      console.log('更新后的会话信息:', session.value)
      console.log('更新后的协作者列表:', collaborators.value)
      console.log('当前协作者数量:', collaborators.value.length)

      // 检查当前用户是否是所有者
      if (
        userStore.currentUser &&
        session.value &&
        String(userStore.currentUser.id) === session.value.owner
      ) {
        isOwner.value = true
        console.log('当前用户是会话所有者')
      } else {
        isOwner.value = false
      }
    }
  }

  // 处理离开消息
  const handleLeaveMessage = (message: WebSocketMessage) => {
    const { payload } = message

    console.log('收到离开消息:', message)

    if (payload && (payload as { session: BackendSession }).session) {
      const backendSession = (payload as { session: BackendSession }).session
      // 更新协作者列表
      collaborators.value = backendSession.collaborators.map((c) => ({
        id: c.id,
        username: c.username,
        color: c.color,
        role: c.role || 'collaborator',
        lastActive: new Date(c.last_active),
      }))

      console.log('更新协作者列表，当前数量:', collaborators.value.length)
    }
  }

  // 处理会话更新消息
  const handleSessionUpdateMessage = (message: WebSocketMessage) => {
    const { payload } = message

    console.log('收到会话更新消息:', message)

    if (payload && (payload as { session: BackendSession }).session) {
      const backendSession = (payload as { session: BackendSession }).session
      // 更新协作者列表
      collaborators.value = backendSession.collaborators.map((c) => ({
        id: c.id,
        username: c.username,
        color: c.color,
        role: c.role || 'collaborator',
        lastActive: new Date(c.last_active),
      }))

      console.log('更新协作者列表，当前数量:', collaborators.value.length)
    }
  }

  // 处理同步响应消息
  const handleSyncResponseMessage = (message: WebSocketMessage) => {
    const { payload } = message

    console.log('收到同步响应消息:', message)

    // 处理会话信息
    if (payload && (payload as { session: BackendSession }).session) {
      const backendSession = (payload as { session: BackendSession }).session
      session.value = {
        id: backendSession.id,
        designId: backendSession.design_id,
        collaborators: backendSession.collaborators.map((c) => ({
          id: c.id,
          username: c.username,
          color: c.color,
          role: c.role || 'collaborator',
          lastActive: new Date(c.last_active),
        })),
        owner: backendSession.owner,
        createdAt: new Date(backendSession.created_at),
      }

      // 更新协作者列表
      collaborators.value = backendSession.collaborators.map((c) => ({
        id: c.id,
        username: c.username,
        color: c.color,
        role: c.role || 'collaborator',
        lastActive: new Date(c.last_active),
      }))

      console.log('更新会话信息:', session.value)
      console.log('当前协作者数量:', collaborators.value.length)
    }

    // 处理障碍物和路径数据
    if (payload && (payload as { obstacles: Obstacle[] }).obstacles) {
      console.log('收到障碍物同步数据:', (payload as { obstacles: Obstacle[] }).obstacles)

      // 合并障碍物数据，保留本地未同步的障碍物
      const receivedObstacles = (payload as { obstacles: Obstacle[] }).obstacles

      // 创建障碍物ID映射，用于快速查找
      const obstacleMap = new Map<string, Obstacle>()
      receivedObstacles.forEach((obstacle) => {
        obstacleMap.set(obstacle.id, obstacle)
      })

      // 更新本地障碍物列表
      const localObstacles = [...courseStore.currentCourse.obstacles]

      // 1. 更新已存在的障碍物
      for (let i = 0; i < localObstacles.length; i++) {
        const localObstacle = localObstacles[i]
        const remoteObstacle = obstacleMap.get(localObstacle.id)

        if (remoteObstacle) {
          // 更新本地障碍物
          localObstacles[i] = remoteObstacle
          // 从映射中移除，剩下的将是需要添加的新障碍物
          obstacleMap.delete(localObstacle.id)
        }
      }

      // 2. 添加远程有但本地没有的障碍物
      obstacleMap.forEach((obstacle) => {
        localObstacles.push(obstacle)
      })

      // 更新课程障碍物列表
      courseStore.currentCourse.obstacles = localObstacles
      console.log('障碍物同步完成，当前障碍物数量:', courseStore.currentCourse.obstacles.length)
    }

    // 处理路径数据
    if (payload && (payload as { path: CoursePath }).path) {
      console.log('收到路径同步数据:', (payload as { path: CoursePath }).path)
      courseStore.coursePath = (payload as { path: CoursePath }).path
      console.log('路径同步完成')
    }
  }

  // 处理更新障碍物消息
  const handleUpdateObstacleMessage = (message: WebSocketMessage) => {
    const { senderId, payload } = message

    // 避免处理自己发送的消息
    if (senderId === String(userStore.currentUser?.id)) {
      console.log('收到自己发送的更新障碍物消息，忽略处理')
      return
    }

    console.log('收到更新障碍物消息:', payload)

    try {
      // 检查障碍物是否存在
      const obstacle = courseStore.currentCourse.obstacles.find((o) => o.id === payload.obstacleId)
      if (!obstacle) {
        console.error(`无法更新障碍物，ID不存在: ${payload.obstacleId}`)

        // 当障碍物ID不存在时，自动发送同步请求获取最新数据
        console.log('障碍物ID不存在，自动发送同步请求')
        if (userStore.currentUser) {
          const syncRequest: WebSocketMessage = {
            type: MessageType.SYNC_REQUEST,
            senderId: String(userStore.currentUser.id),
            senderName: userStore.currentUser.username,
            sessionId: designId,
            timestamp: new Date().toISOString(),
            payload: {},
          }
          sendMessage(syncRequest)
          console.log('已发送同步请求，等待接收最新数据')
        }

        return
      }

      console.log('准备更新障碍物:', payload.obstacleId, '更新内容:', payload.updates)

      // 更新障碍物
      courseStore.updateObstacle(
        payload.obstacleId as string,
        payload.updates as Record<string, unknown>,
      )
      console.log(
        '障碍物更新成功:',
        payload.obstacleId,
        '更新后状态:',
        courseStore.currentCourse.obstacles.find((o) => o.id === payload.obstacleId),
      )

      // 不再添加系统消息通知
    } catch (error) {
      console.error('处理更新障碍物消息失败:', error)
    }
  }

  // 处理添加障碍物消息
  const handleAddObstacleMessage = (message: WebSocketMessage) => {
    const { senderId, payload } = message

    // 避免处理自己发送的消息
    if (senderId === String(userStore.currentUser?.id)) {
      console.log('收到自己发送的添加障碍物消息，忽略处理')
      return
    }

    console.log('收到添加障碍物消息:', payload)

    try {
      if (payload.obstacle && typeof payload.obstacle === 'object') {
        console.log('准备添加障碍物，数据:', payload.obstacle)

        // 检查障碍物是否已存在
        const obstacleExists = courseStore.currentCourse.obstacles.some(
          (o) => o.id === (payload.obstacle as { id?: string }).id,
        )

        if (obstacleExists) {
          console.log('障碍物已存在，不重复添加:', (payload.obstacle as { id?: string }).id)
          return
        }

        // 直接使用原始障碍物数据添加，包括ID
        const addedObstacle = courseStore.addObstacleWithId(payload.obstacle as Obstacle)

        console.log(
          '障碍物添加成功:',
          addedObstacle,
          '当前障碍物列表:',
          courseStore.currentCourse.obstacles,
        )

        // 不再添加系统消息通知
      } else {
        console.error('添加障碍物失败，无效的障碍物数据:', payload)
      }
    } catch (error) {
      console.error('处理添加障碍物消息失败:', error)
    }
  }

  // 处理移除障碍物消息
  const handleRemoveObstacleMessage = (message: WebSocketMessage) => {
    const { senderId, payload } = message

    // 避免处理自己发送的消息
    if (senderId === String(userStore.currentUser?.id)) {
      console.log('收到自己发送的移除障碍物消息，忽略处理')
      return
    }

    console.log('收到移除障碍物消息:', payload)

    try {
      // 检查障碍物是否存在
      const obstacle = courseStore.currentCourse.obstacles.find((o) => o.id === payload.obstacleId)
      if (!obstacle) {
        console.error(`无法移除障碍物，ID不存在: ${payload.obstacleId}`)
        return
      }

      console.log('准备移除障碍物:', payload.obstacleId)

      // 移除障碍物
      if (payload.obstacleId && typeof payload.obstacleId === 'string') {
        courseStore.removeObstacle(payload.obstacleId)
        console.log(
          '障碍物移除成功:',
          payload.obstacleId,
          '当前障碍物列表:',
          courseStore.currentCourse.obstacles,
        )

        // 不再添加系统消息通知
      } else {
        console.error('移除障碍物失败，无效的障碍物ID:', payload.obstacleId)
      }
    } catch (error) {
      console.error('处理移除障碍物消息失败:', error)
    }
  }

  // 处理更新路径消息
  const handleUpdatePathMessage = (message: WebSocketMessage) => {
    const { payload } = message

    // 避免处理自己发送的消息
    if (message.senderId === String(userStore.currentUser?.id)) return

    console.log('收到路径更新消息:', payload.path)

    // 更新路径
    if (payload.path) {
      courseStore.coursePath = payload.path as CoursePath

      // 不再添加系统消息通知
    }
  }

  // 处理光标移动消息
  const handleCursorMoveMessage = (message: WebSocketMessage) => {
    const { senderId, payload } = message

    // 避免处理自己发送的消息
    if (senderId === String(userStore.currentUser?.id)) return

    console.log('收到光标移动消息:', senderId, payload.position)

    // 确保payload.position存在且格式正确
    if (
      !payload.position ||
      typeof payload.position !== 'object' ||
      !('x' in payload.position) ||
      !('y' in payload.position)
    ) {
      console.error('光标位置数据格式不正确:', payload.position)
      return
    }

    // 更新协作者光标位置
    const collaborator = collaborators.value.find((c) => c.id === senderId)
    if (collaborator) {
      collaborator.cursor = payload.position as { x: number; y: number }
      collaborator.lastActive = new Date()
      console.log(`已更新协作者 ${collaborator.username} 的光标位置:`, collaborator.cursor)
    } else {
      console.warn(
        '收到未知协作者的光标移动消息:',
        senderId,
        '当前协作者列表:',
        collaborators.value,
      )

      // 尝试发送同步请求获取最新协作者列表
      if (userStore.currentUser) {
        console.log('尝试发送同步请求获取最新协作者列表')
        const syncRequest: WebSocketMessage = {
          type: MessageType.SYNC_REQUEST,
          senderId: String(userStore.currentUser.id),
          senderName: userStore.currentUser.username,
          sessionId: designId,
          timestamp: new Date().toISOString(),
          payload: {},
        }
        sendMessage(syncRequest)
      }
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

  // 处理聊天消息
  const handleChatMessage = (message: WebSocketMessage) => {
    const { senderId, senderName, timestamp, payload } = message

    // 检查消息是否已存在（防止重复）
    const messageContent = payload.content as string
    const existingMessage = chatMessages.value.find(
      (msg) => msg.senderId === senderId && msg.content === messageContent,
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

    // 确保position对象格式正确
    if (typeof position !== 'object' || !('x' in position) || !('y' in position)) {
      console.error('光标位置数据格式不正确:', position)
      return
    }

    // 确保x和y是数字
    const validPosition = {
      x: Number(position.x),
      y: Number(position.y),
    }

    // 发送消息
    sendMessage({
      type: MessageType.CURSOR_MOVE,
      senderId: String(userStore.currentUser.id),
      senderName: userStore.currentUser.username,
      sessionId: designId,
      timestamp: new Date().toISOString(),
      payload: {
        position: validPosition,
      },
    })
  }

  // 发送障碍物更新
  const sendObstacleUpdate = (
    obstacleId: string,
    updates: Record<string, unknown>,
    useQueue = true,
  ) => {
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

    // 检查WebSocket连接状态
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error(
        '发送障碍物更新失败: WebSocket未连接，当前状态:',
        socket.value ? socket.value.readyState : '实例不存在',
      )

      // 如果允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('将障碍物更新消息添加到队列:', obstacleId, updates)
        messageQueue.value.push({
          type: 'update',
          data: { obstacleId, updates },
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
      console.log(
        'WebSocket readyState:',
        socket.value.readyState,
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)',
      )
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
      }

      console.log('构造的障碍物更新消息:', message)
      // 直接发送消息，不使用sendMessage函数，避免额外的连接检查
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        const messageString = JSON.stringify(message)
        socket.value.send(messageString)
        console.log(`障碍物更新消息发送成功 - 障碍物ID: ${obstacleId}`)
        return true
      } else {
        console.error(
          `障碍物更新消息发送失败 - WebSocket未连接，当前状态:`,
          socket.value ? socket.value.readyState : '实例不存在',
        )

        // 如果发送失败且允许使用队列，将消息添加到队列
        if (useQueue) {
          console.log('发送失败，将障碍物更新消息添加到队列:', obstacleId, updates)
          messageQueue.value.push({
            type: 'update',
            data: { obstacleId, updates },
          })
        }

        return false
      }
    } catch (error) {
      console.error('发送障碍物更新消息失败:', error)

      // 如果发送失败且允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('发送异常，将障碍物更新消息添加到队列:', obstacleId, updates)
        messageQueue.value.push({
          type: 'update',
          data: { obstacleId, updates },
        })
      }

      return false
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

    // 确保障碍物有ID
    if (!obstacle.id) {
      console.error('发送添加障碍物失败: 障碍物ID为空')
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
          data: { obstacle },
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
      console.log(
        'WebSocket readyState:',
        socket.value.readyState,
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)',
      )
    }

    // 再次检查WebSocket是否已连接
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error(
        '发送添加障碍物失败: WebSocket未连接或未就绪，当前状态:',
        socket.value ? socket.value.readyState : '实例不存在',
      )

      // 如果允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('将添加障碍物消息添加到队列:', obstacle)
        messageQueue.value.push({
          type: 'add',
          data: { obstacle },
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
      }

      console.log('构造的添加障碍物消息:', message)
      // 直接发送消息，不使用sendMessage函数，避免额外的连接检查
      if (socket.value && socket.value.readyState === WebSocket.OPEN) {
        const messageString = JSON.stringify(message)
        socket.value.send(messageString)
        console.log('添加障碍物消息发送成功')
        return true
      } else {
        console.error('添加障碍物消息发送失败')

        // 如果发送失败且允许使用队列，将消息添加到队列
        if (useQueue) {
          console.log('发送失败，将添加障碍物消息添加到队列:', obstacle)
          messageQueue.value.push({
            type: 'add',
            data: { obstacle },
          })
        }

        return false
      }
    } catch (error) {
      console.error('发送添加障碍物消息失败:', error)

      // 如果发送失败且允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('发送异常，将添加障碍物消息添加到队列:', obstacle)
        messageQueue.value.push({
          type: 'add',
          data: { obstacle },
        })
      }

      return false
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
          data: { obstacleId },
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
      console.log(
        'WebSocket readyState:',
        socket.value.readyState,
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)',
      )
    }

    // 再次检查WebSocket是否已连接
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error(
        '发送移除障碍物失败: WebSocket未连接或未就绪，当前状态:',
        socket.value ? socket.value.readyState : '实例不存在',
      )

      // 如果允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('将移除障碍物消息添加到队列:', obstacleId)
        messageQueue.value.push({
          type: 'remove',
          data: { obstacleId },
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
      }

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
            data: { obstacleId },
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
          data: { obstacleId },
        })
      }
    }
  }

  // 发送路径更新
  const sendPathUpdate = (path: Record<string, unknown>, useQueue = true) => {
    console.log('准备发送路径更新，路径数据:', path)

    // 检查参数有效性
    if (!path) {
      console.error('发送路径更新失败: 路径数据为空')
      return
    }

    // 检查WebSocket连接状态
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error(
        '发送路径更新失败: WebSocket未连接，当前状态:',
        socket.value ? socket.value.readyState : '实例不存在',
      )

      // 如果允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('将路径更新消息添加到队列:', path)
        messageQueue.value.push({
          type: 'path',
          data: { path },
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
      const message = {
        type: MessageType.UPDATE_PATH,
        senderId: String(userStore.currentUser.id),
        senderName: userStore.currentUser.username,
        sessionId: designId,
        timestamp: new Date().toISOString(),
        payload: {
          path,
        },
      }

      // 直接发送消息，不使用sendMessage函数
      const messageString = JSON.stringify(message)
      socket.value.send(messageString)
      console.log('路径更新消息发送成功')
      return true
    } catch (error) {
      console.error('发送路径更新消息失败:', error)

      // 如果发送失败且允许使用队列，将消息添加到队列
      if (useQueue) {
        console.log('发送异常，将路径更新消息添加到队列:', path)
        messageQueue.value.push({
          type: 'path',
          data: { path },
        })
      }

      return false
    }
  }

  // 发送同步请求
  const sendSyncRequest = () => {
    console.log('准备发送同步请求')

    // 检查连接状态，不自动重连
    if (!checkConnection(false)) {
      console.error('发送同步请求失败: WebSocket未连接')
      return
    }

    if (!userStore.currentUser) {
      console.error('发送同步请求失败: 用户未登录')
      return
    }

    console.log('准备发送同步请求消息')
    console.log('当前WebSocket状态:', connectionStatus.value)
    console.log('当前socket实例:', socket.value ? '存在' : '不存在')

    if (socket.value) {
      console.log(
        'WebSocket readyState:',
        socket.value.readyState,
        '(0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED)',
      )
    }

    try {
      const syncRequest: WebSocketMessage = {
        type: MessageType.SYNC_REQUEST,
        senderId: String(userStore.currentUser.id),
        senderName: userStore.currentUser.username,
        sessionId: designId,
        timestamp: new Date().toISOString(),
        payload: {},
      }

      console.log('构造的同步请求消息:', syncRequest)
      const result = sendMessage(syncRequest)

      if (result) {
        console.log('同步请求消息发送成功')
      } else {
        console.error('同步请求消息发送失败')
      }
    } catch (error) {
      console.error('发送同步请求消息失败:', error)
    }
  }

  // 重新连接
  const reconnect = () => {
    if (
      connectionStatus.value === ConnectionStatus.DISCONNECTED ||
      connectionStatus.value === ConnectionStatus.ERROR
    ) {
      console.log('尝试重新连接...')
      connect()
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
    sendSyncRequest,
    checkConnection,
    reconnect,
    viaLink,
  }
}
