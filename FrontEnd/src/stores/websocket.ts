/**
 * @file websocket.ts
 * @description WebSocket连接的状态管理模块
 * 使用 Pinia 管理 WebSocket 连接，提供统一的连接管理和消息发送接口
 */

import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { useUserStore } from './user'
import { useCourseStore } from './course'
import apiConfig from '@/config/api'
// import { ElMessage } from 'element-plus' // 不再需要
import { v4 as uuidv4 } from 'uuid'
import type { Obstacle, PathPoint } from '@/types/obstacle'
import { ObstacleType } from '@/types/obstacle'

/**
 * WebSocket连接状态枚举
 */
export enum ConnectionStatus {
  CONNECTING = 0, // 正在连接中
  CONNECTED = 1, // 已连接
  DISCONNECTING = 2, // 正在断开连接
  DISCONNECTED = 3, // 已断开连接
  ERROR = 4, // 连接错误
}

/**
 * 协作者信息接口
 */
export interface CollaboratorInfo {
  id: string
  username: string
  color: string
  lastActive: Date
  role: string
}

/**
 * 聊天消息接口
 */
export interface ChatMessage {
  id: string
  senderId: string
  senderName: string
  content: string
  timestamp: Date
}

/**
 * 协作会话信息接口
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
 * 创建WebSocket连接
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
    } else {
      console.log('非通过链接加入，不添加via_link参数')
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
 * WebSocket状态管理
 */
export const useWebSocketStore = defineStore('websocket', () => {
  // 获取用户和课程状态
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
  const viaLink = ref(false)
  const isCollaborating = ref(false)
  const currentDesignId = ref<string>('')

  // 消息队列
  const messageQueue = ref<
    {
      type: 'update' | 'add' | 'remove' | 'path'
      data: Record<string, unknown>
    }[]
  >([])

  /**
   * 发送消息的通用方法
   */
  const sendMessage = (type: MessageType, payload: Record<string, unknown>) => {
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      // 只记录日志，不显示错误消息
      console.log('WebSocket未连接，消息已加入队列')

      // 如果是同步请求或加入消息，不加入队列
      if (type !== MessageType.SYNC_REQUEST && type !== MessageType.JOIN) {
        messageQueue.value.push({
          type:
            type === MessageType.UPDATE_OBSTACLE || type === MessageType.UPDATE_PATH
              ? 'update'
              : type === MessageType.ADD_OBSTACLE
                ? 'add'
                : type === MessageType.REMOVE_OBSTACLE
                  ? 'remove'
                  : 'path',
          data: payload,
        })
      }
      return false
    }

    const userStore = useUserStore()
    if (!userStore.currentUser) {
      console.error('用户未登录，无法发送消息')
      return false
    }

    // 构建消息
    const message: WebSocketMessage = {
      type,
      senderId: String(userStore.currentUser.id), // 确保ID为字符串
      senderName: userStore.currentUser.username || '未知用户',
      sessionId: session.value?.id || '',
      timestamp: new Date().toISOString(),
      payload,
    }

    try {
      // 发送消息
      socket.value.send(JSON.stringify(message))
      return true
    } catch (error) {
      console.error('发送消息失败:', error)
      return false
    }
  }

  /**
   * 处理接收到的WebSocket消息
   */
  const handleReceivedMessage = (message: WebSocketMessage) => {
    console.log('处理接收到的消息:', message)

    try {
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
        case MessageType.CHAT:
          handleChatMessage(message)
          break
        case MessageType.SESSION_UPDATE:
          handleSessionUpdateMessage(message)
          break
        case MessageType.SYNC_REQUEST:
          handleSyncRequestMessage(message)
          break
        case MessageType.SYNC_RESPONSE:
          handleSyncResponseMessage(message)
          break
        case MessageType.ERROR:
          handleErrorMessage(message)
          break
        default:
          console.warn('收到未知类型的消息:', message.type)
      }
    } catch (error) {
      console.error('处理WebSocket消息时出错:', error)
    }
  }

  /**
   * 处理加入消息
   */
  const handleJoinMessage = (message: WebSocketMessage) => {
    console.log('处理加入消息:', message)

    // 正确断言payload类型
    const payload = message.payload as {
      session?: {
        collaborators: Array<{
          id: string
          username: string
          color: string
          role: string
        }>
      }
      collaborator?: {
        id: string
        username: string
        color: string
        role: string
      }
      requestCanvasState?: boolean // 是否请求画布状态
      clientInfo?: {
        browser: string
        screenSize: string
        timestamp: string
      }
    }

    // 检查payload中的数据格式
    let collaborator: CollaboratorInfo | null = null

    if (
      payload.session &&
      payload.session.collaborators &&
      payload.session.collaborators.length > 0
    ) {
      // 如果是包含完整session信息的消息
      console.log('收到包含完整会话信息的JOIN消息')

      // 获取所有协作者并更新列表
      const allCollaborators: CollaboratorInfo[] = payload.session.collaborators.map((collab) => ({
        id: collab.id,
        username: collab.username,
        color: collab.color,
        lastActive: new Date(),
        role: collab.role,
      }))

      console.log('协作者完整列表:', allCollaborators)

      // 直接替换协作者列表
      collaborators.value = allCollaborators

      // 获取最后加入的协作者（用于后续处理）
      const collab = payload.session.collaborators[payload.session.collaborators.length - 1]
      collaborator = {
        id: collab.id,
        username: collab.username,
        color: collab.color,
        lastActive: new Date(),
        role: collab.role,
      }
    } else if (payload.collaborator) {
      // 如果是单独包含新加入者信息的格式
      collaborator = {
        id: payload.collaborator.id,
        username: payload.collaborator.username,
        color: payload.collaborator.color,
        lastActive: new Date(),
        role: payload.collaborator.role,
      }
    } else {
      // 尝试直接从payload中获取信息
      const { id, username, color, role } = payload as {
        id?: string
        username?: string
        color?: string
        role?: string
      }
      if (id && username) {
        collaborator = {
          id,
          username,
          color: color || '#3498db',
          lastActive: new Date(),
          role: role || 'collaborator',
        }
      }
    }

    if (!collaborator) {
      console.error('无法从JOIN消息中提取协作者信息:', message)
      return
    }

    console.log('添加到协作者列表:', collaborator)

    // 检查是否已存在，如果存在则更新
    const existingIndex = collaborators.value.findIndex((c) => c.id === collaborator!.id)
    if (existingIndex >= 0) {
      collaborators.value[existingIndex] = collaborator
    } else {
      collaborators.value.push(collaborator)
    }

    // 如果是第一次看到session信息，保存它
    if (message.sessionId && !session.value) {
      // 检查payload中是否有完整的会话信息
      if (payload.session) {
        console.log('从完整会话信息创建会话:', payload.session)
        // 使用类型断言来正确处理payload.session
        const sessionData = payload.session as {
          owner?: string
          collaborators?: Array<{
            id: string
            username: string
            color: string
            role?: string
          }>
        }

        session.value = {
          id: message.sessionId,
          designId: currentDesignId.value,
          collaborators: collaborators.value,
          owner: sessionData.owner || '',
          createdAt: new Date(),
        }
      } else {
        // 如果没有完整会话信息，使用默认值
        session.value = {
          id: message.sessionId,
          designId: currentDesignId.value,
          collaborators: collaborators.value,
          owner: collaborator.role === 'initiator' ? collaborator.id : '',
          createdAt: new Date(),
        }
      }
      console.log('创建会话信息，所有者ID:', session.value.owner)
    }

    // 如果收到的协作者角色是所有者或发起者，更新会话的所有者字段
    if ((collaborator.role === 'owner' || collaborator.role === 'initiator') && session.value) {
      console.log('更新会话所有者信息:', collaborator.id, collaborator.username)
      session.value.owner = collaborator.id
    }

    // 如果当前用户ID与加入用户ID匹配，标记为课程所有者
    if (
      userStore.currentUser &&
      String(userStore.currentUser.id) === collaborator.id &&
      collaborator.role === 'owner'
    ) {
      isOwner.value = true
    }

    // 更新协作者列表后输出日志
    console.log('协作者列表已更新:', JSON.stringify(collaborators.value))

    // 触发新协作者加入事件，通知所有者发送完整画布状态
    try {
      // 获取当前用户ID
      const currentUserId = userStore.currentUser?.id

      // 如果不是自己加入，触发事件
      if (collaborator.id !== String(currentUserId)) {
        console.log('准备触发新协作者加入事件:', collaborator.username)

        // 添加更多日志，帮助调试
        console.log('当前用户ID:', currentUserId)
        console.log('会话所有者ID:', session.value?.owner)
        console.log('当前用户是否为所有者:', isOwner.value)

        // 检查是否已经触发过该协作者的加入事件
        const joinedCollaboratorsKey = 'joined_collaborators'
        let joinedCollaborators: string[] = []

        try {
          const storedCollaborators = localStorage.getItem(joinedCollaboratorsKey)
          if (storedCollaborators) {
            joinedCollaborators = JSON.parse(storedCollaborators)
          }
        } catch (e) {
          console.error('解析已加入协作者列表失败:', e)
          joinedCollaborators = []
        }

        // 检查该协作者是否已经触发过加入事件
        if (joinedCollaborators.includes(collaborator.id)) {
          console.log('该协作者已经触发过加入事件，跳过:', collaborator.username)
          return
        }

        // 将该协作者添加到已触发列表
        joinedCollaborators.push(collaborator.id)
        localStorage.setItem(joinedCollaboratorsKey, JSON.stringify(joinedCollaborators))

        // 创建事件对象，包含更多信息
        const event = new CustomEvent('collaborator-joined', {
          bubbles: true,
          detail: {
            collaborator,
            timestamp: new Date().toISOString(),
            session: session.value,
            isOwner: isOwner.value,
            currentUserId: currentUserId,
          },
        })

        // 使用防抖机制，避免短时间内多次触发
        const debounceKey = `collaborator_joined_${collaborator.id}`
        const lastTriggerTime = parseInt(localStorage.getItem(debounceKey) || '0')
        const now = Date.now()
        const debounceTime = 5000 // 5秒内不重复触发

        if (now - lastTriggerTime > debounceTime) {
          // 更新最后触发时间
          localStorage.setItem(debounceKey, now.toString())

          // 延迟触发事件，确保会话信息已更新
          setTimeout(() => {
            document.dispatchEvent(event)
            console.log('已触发新协作者加入事件:', collaborator.username)
          }, 500)
        } else {
          console.log('防抖期内，跳过触发协作者加入事件:', collaborator.username)
        }
      }
    } catch (error) {
      console.error('触发新协作者加入事件失败:', error)
    }

    // 检查是否请求画布状态
    if (payload.requestCanvasState) {
      console.log('收到画布状态请求，发送当前画布状态')

      // 获取当前用户ID
      const currentUserId = userStore.currentUser?.id

      // 如果是其他用户请求画布状态，发送同步响应
      if (message.senderId !== String(currentUserId)) {
        console.log('发送画布状态给新加入的协作者:', message.senderId)

        // 记录当前障碍物数量
        const obstaclesCount = courseStore.currentCourse.obstacles.length
        console.log('当前障碍物数量:', obstaclesCount)

        // 记录当前路径点数量
        const pathPointsCount = courseStore.coursePath.points.length
        console.log('当前路径点数量:', pathPointsCount)

        // 深拷贝障碍物数据，避免引用问题
        const obstaclesCopy = JSON.parse(JSON.stringify(courseStore.currentCourse.obstacles))

        // 构建同步响应消息
        const syncResponse = {
          obstacles: obstaclesCopy,
          path: {
            visible: courseStore.coursePath.visible,
            points: JSON.parse(JSON.stringify(courseStore.coursePath.points)),
            startPoint: courseStore.startPoint
              ? JSON.parse(JSON.stringify(courseStore.startPoint))
              : null,
            endPoint: courseStore.endPoint
              ? JSON.parse(JSON.stringify(courseStore.endPoint))
              : null,
          },
          timestamp: new Date().toISOString(),
          sender: {
            id: String(currentUserId),
            username: userStore.currentUser?.username || '未知用户',
          },
        }

        // 发送同步响应
        console.log('发送同步响应，包含障碍物数量:', obstaclesCount)
        console.log('发送同步响应，包含路径点数量:', pathPointsCount)
        console.log('同步响应数据示例:', JSON.stringify(syncResponse).substring(0, 200) + '...')

        // 直接发送消息，不使用sendMessage函数，避免可能的问题
        try {
          if (socket.value && socket.value.readyState === WebSocket.OPEN) {
            const directMessage = {
              type: MessageType.SYNC_RESPONSE,
              senderId: String(currentUserId),
              senderName: userStore.currentUser?.username || '未知用户',
              sessionId: session.value?.id || '',
              timestamp: new Date().toISOString(),
              payload: syncResponse,
            }

            socket.value.send(JSON.stringify(directMessage))
            console.log('同步响应消息直接发送成功')
          } else {
            console.error('WebSocket未连接，无法发送同步响应')
            sendMessage(MessageType.SYNC_RESPONSE, syncResponse)
          }
        } catch (error) {
          console.error('直接发送同步响应失败:', error)
          // 尝试使用sendMessage函数
          sendMessage(MessageType.SYNC_RESPONSE, syncResponse)
        }
      }
    }
  }

  /**
   * 处理离开消息
   */
  const handleLeaveMessage = (message: WebSocketMessage) => {
    console.log('处理离开消息:', message)

    const { id } = message.payload as { id: string }

    // 从协作者列表中移除
    const index = collaborators.value.findIndex((c) => c.id === id)
    if (index >= 0) {
      collaborators.value.splice(index, 1)
    }
  }

  /**
   * 处理更新障碍物消息
   */
  const handleUpdateObstacleMessage = (message: WebSocketMessage) => {
    console.log('处理更新障碍物消息:', message)

    // 获取当前用户ID
    const userStore = useUserStore()
    const currentUserId = userStore.currentUser?.id

    // 如果是自己发送的消息，忽略它
    if (message.senderId === String(currentUserId)) {
      console.log('忽略自己发送的障碍物更新消息')
      return
    }

    const { obstacleId, updates } = message.payload as {
      obstacleId: string
      updates: Record<string, unknown>
    }

    console.log('从其他协作者收到障碍物更新消息:', obstacleId, updates)

    try {
      // 确保position是一个新对象，避免引用问题
      if (updates.position) {
        updates.position = { ...(updates.position as { x: number; y: number }) }
      }

      // 检查障碍物是否存在
      const course = courseStore.currentCourse
      const obstacleExists = course.obstacles.some((obs) => obs.id === obstacleId)

      if (!obstacleExists) {
        console.warn('收到更新消息的障碍物不存在:', obstacleId)

        // 尝试从updates中创建一个新的障碍物
        if (updates.position && typeof updates.position === 'object') {
          try {
            // 创建一个基本的障碍物对象
            const newObstacle: Obstacle = {
              id: obstacleId,
              type: ObstacleType.SINGLE, // 默认类型为SINGLE
              position: updates.position as { x: number; y: number },
              rotation: (updates.rotation as number) || 0,
              poles: [
                {
                  width: 20,
                  height: 120,
                  color: '#FF0000',
                },
              ],
              customId: '',
              number: (updates.number as string) || undefined, // 如果有编号，使用传递的编号
            }

            console.log('尝试添加缺失的障碍物:', newObstacle)
            // 使用addObstacleWithId保留原始ID
            if (typeof courseStore.addObstacleWithId === 'function') {
              console.log('使用addObstacleWithId添加障碍物，保留原始ID:', obstacleId)
              courseStore.addObstacleWithId(newObstacle)
            } else {
              // 如果addObstacleWithId不可用，回退到addObstacle
              console.log('addObstacleWithId不可用，使用addObstacle添加障碍物')
              courseStore.addObstacle(newObstacle)
            }

            // 添加成功后，不需要再更新，因为已经使用了updates中的数据
            return
          } catch (error) {
            console.error('尝试添加缺失的障碍物失败:', error)
          }
        }

        // 如果无法创建障碍物，请求完整同步
        console.log('请求完整同步以获取最新障碍物数据')
        sendSyncRequest()
        return
      }

      // 更新本地障碍物，但不触发事件
      // 使用sendUpdate=false参数，避免触发事件
      courseStore.updateObstacle(obstacleId, updates as Partial<Obstacle>, false)
      console.log('成功更新本地障碍物:', obstacleId, updates)

      // 不再触发自定义事件，避免循环更新
      /*
      try {
        const event = new CustomEvent('obstacle-updated', {
          bubbles: true,
          detail: {
            obstacleId,
            updates,
            timestamp: new Date().toISOString(),
            senderId: message.senderId,
          },
        })
        document.dispatchEvent(event)
      } catch (eventError) {
        console.error('触发障碍物更新事件失败:', eventError)
      }
      */
    } catch (error) {
      console.error('更新本地障碍物失败:', obstacleId, updates, error)
    }
  }

  /**
   * 处理添加障碍物消息
   */
  const handleAddObstacleMessage = (message: WebSocketMessage) => {
    console.log('处理添加障碍物消息:', message)

    // 获取当前用户ID
    const userStore = useUserStore()
    const currentUserId = userStore.currentUser?.id

    // 如果是自己发送的消息，忽略它
    if (message.senderId === String(currentUserId)) {
      console.log('忽略自己发送的添加障碍物消息')
      return
    }

    // 先转成 unknown，再转成 Obstacle 类型
    const obstacleData = message.payload as unknown as Obstacle

    // 检查障碍物是否已存在
    const obstacleExists = courseStore.currentCourse.obstacles.some(
      (obs) => obs.id === obstacleData.id,
    )

    if (obstacleExists) {
      console.log('障碍物已存在，不重复添加:', obstacleData.id)
      return
    }

    // 使用addObstacleWithId而不是addObstacle，保留原始ID
    if (typeof courseStore.addObstacleWithId === 'function') {
      console.log('使用addObstacleWithId添加障碍物，保留原始ID:', obstacleData.id)
      courseStore.addObstacleWithId(obstacleData)
    } else {
      // 如果addObstacleWithId不可用，回退到addObstacle
      console.log('addObstacleWithId不可用，使用addObstacle添加障碍物')
      courseStore.addObstacle(obstacleData)
    }
  }

  /**
   * 处理移除障碍物消息
   */
  const handleRemoveObstacleMessage = (message: WebSocketMessage) => {
    console.log('处理移除障碍物消息:', message)

    // 获取当前用户ID
    const userStore = useUserStore()
    const currentUserId = userStore.currentUser?.id

    // 如果是自己发送的消息，忽略它
    if (message.senderId === String(currentUserId)) {
      console.log('忽略自己发送的移除障碍物消息')
      return
    }

    const { obstacleId } = message.payload as { obstacleId: string }

    courseStore.removeObstacle(obstacleId)
  }

  /**
   * 处理更新路径消息
   */
  const handleUpdatePathMessage = (message: WebSocketMessage) => {
    console.log('处理更新路径消息:', message)

    try {
      // 获取当前用户ID
      const userStore = useUserStore()
      const currentUserId = userStore.currentUser?.id

      // 如果是自己发送的消息，忽略它
      if (message.senderId === String(currentUserId)) {
        console.log('忽略自己发送的路径更新消息')
        return
      }

      // 解析路径更新消息
      const { pathId, updates } = message.payload as {
        pathId: string
        updates: {
          visible: boolean
          points: Array<PathPoint>
          startPoint?: { x: number; y: number; rotation: number }
          endPoint?: { x: number; y: number; rotation: number }
        }
      }

      console.log('从其他协作者收到路径更新消息:', pathId, updates)

      // 获取Canvas组件的引用，以便设置路径更新标志
      const canvasElement = document.querySelector('.course-canvas')
      if (canvasElement) {
        // 获取Canvas组件实例
        const canvasInstance = (canvasElement as any).__vueParentComponent?.ctx
        if (canvasInstance && canvasInstance.isPathUpdateFromWebSocket !== undefined) {
          // 设置标志，表示路径更新来自WebSocket
          console.log('设置路径更新标志为true，表示更新来自WebSocket')
          canvasInstance.isPathUpdateFromWebSocket.value = true
        }
      }

      // 更新路径可见性
      if (updates.visible !== undefined) {
        courseStore.togglePathVisibility(updates.visible)
        console.log('更新路径可见性:', updates.visible)
      }

      // 更新路径点
      if (updates.points && Array.isArray(updates.points)) {
        // 使用深拷贝避免引用问题
        courseStore.coursePath.points = JSON.parse(JSON.stringify(updates.points))
        console.log('更新路径点:', updates.points.length)
      }

      // 更新起点
      if (updates.startPoint) {
        // 使用深拷贝避免引用问题
        courseStore.startPoint = JSON.parse(JSON.stringify(updates.startPoint))
        console.log('更新起点:', updates.startPoint)
      }

      // 更新终点
      if (updates.endPoint) {
        // 使用深拷贝避免引用问题
        courseStore.endPoint = JSON.parse(JSON.stringify(updates.endPoint))
        console.log('更新终点:', updates.endPoint)
      }

      console.log('成功更新本地路径数据')
    } catch (error) {
      console.error('处理路径更新消息失败:', error)
    }
  }

  /**
   * 处理聊天消息
   */
  const handleChatMessage = (message: WebSocketMessage) => {
    console.log('处理聊天消息:', message)

    const { content } = message.payload as { content: string }

    // 添加到聊天消息列表
    chatMessages.value.push({
      id: uuidv4(),
      senderId: message.senderId,
      senderName: message.senderName,
      content,
      timestamp: new Date(),
    })
  }

  /**
   * 处理会话更新消息
   */
  const handleSessionUpdateMessage = (message: WebSocketMessage) => {
    console.log('处理会话更新消息:', message)

    // 正确断言payload类型并添加类型检查
    const payload = message.payload as {
      sessionId?: string
      collaborators?: Array<{
        id: string
        username: string
        color: string
        lastActive?: string
        role?: string
      }>
      owner?: string
      session?: {
        owner?: string
        collaborators?: Array<{
          id: string
          username: string
          color: string
          role?: string
        }>
      }
    }

    // 验证必要字段
    let collaboratorsList = payload.collaborators
    let ownerValue = payload.owner

    // 如果有session字段，优先使用它
    if (payload.session) {
      console.log('使用payload.session中的数据:', payload.session)
      if (payload.session.collaborators) {
        collaboratorsList = payload.session.collaborators
      }
      if (payload.session.owner !== undefined) {
        ownerValue = payload.session.owner
      }
    }

    // 验证协作者列表
    if (!collaboratorsList) {
      console.error('SESSION_UPDATE消息缺少collaborators字段:', message)
      return
    }

    // 转换协作者列表，确保格式正确
    const mappedCollaborators: CollaboratorInfo[] = collaboratorsList.map((collab) => ({
      id: collab.id,
      username: collab.username,
      color: collab.color,
      lastActive: collab.lastActive ? new Date(collab.lastActive) : new Date(),
      role: collab.role || 'collaborator',
    }))

    // 更新会话信息
    if (session.value) {
      // 如果有所有者信息，更新它
      if (ownerValue !== undefined) {
        console.log('从会话更新消息中更新所有者:', ownerValue)
        session.value.owner = ownerValue
      }

      // 更新协作者列表
      session.value.collaborators = mappedCollaborators
    } else if (payload.sessionId) {
      // 创建新会话
      session.value = {
        id: payload.sessionId,
        designId: currentDesignId.value,
        collaborators: mappedCollaborators,
        owner: ownerValue || '',
        createdAt: new Date(),
      }
      console.log('从会话更新消息中创建新会话，所有者:', ownerValue || '未知')
    } else {
      console.warn('SESSION_UPDATE消息中没有sessionId，无法创建新会话')
    }

    // 如果有所有者信息，检查当前用户是否是所有者
    if (session.value && session.value.owner && userStore.currentUser) {
      isOwner.value = String(userStore.currentUser.id) === session.value.owner
      console.log('当前用户是否是所有者:', isOwner.value)
    }

    // 同步协作者列表
    collaborators.value = mappedCollaborators
    console.log('会话更新后的协作者列表:', JSON.stringify(collaborators.value))
  }

  /**
   * 处理同步响应消息
   */
  const handleSyncResponseMessage = (message: WebSocketMessage) => {
    console.log('处理同步响应消息:', message)

    try {
      // 获取同步响应数据
      const payload = message.payload as {
        obstacles?: Array<Obstacle>
        path?: {
          visible: boolean
          points: Array<PathPoint>
          startPoint?: { x: number; y: number; rotation: number }
          endPoint?: { x: number; y: number; rotation: number }
        }
        session?: any // 会话信息
        collaboratorsOnly?: boolean // 标记是否只包含协作者列表
      }

      console.log('接收到同步响应消息，payload类型:', typeof payload)

      // 检查payload是否为空
      if (!payload) {
        console.error('同步响应消息的payload为空')
        return
      }

      // 检查payload中是否包含obstacles或path
      if (!payload.obstacles && !payload.path && payload.session) {
        console.log('同步响应只包含会话信息')

        // 检查是否是只刷新协作者列表的请求
        const isCollaboratorsOnly =
          payload.collaboratorsOnly === true ||
          localStorage.getItem('collaborators_only_sync') === 'true' ||
          localStorage.getItem('refreshing_collaborators') === 'true'

        if (isCollaboratorsOnly) {
          console.log('这是一个只刷新协作者列表的请求，不需要获取画布数据')
          // 更新会话信息
          if (payload.session) {
            // 处理会话信息
            console.log('处理会话信息:', payload.session)

            // 如果有协作者列表，更新它
            if (payload.session.collaborators && Array.isArray(payload.session.collaborators)) {
              const mappedCollaborators: CollaboratorInfo[] = payload.session.collaborators.map(
                (collab: any) => ({
                  id: collab.id,
                  username: collab.username,
                  color: collab.color,
                  lastActive: collab.last_active ? new Date(collab.last_active) : new Date(),
                  role: collab.role || 'collaborator',
                }),
              )

              // 更新协作者列表
              collaborators.value = mappedCollaborators

              // 如果有会话对象，也更新它
              if (session.value) {
                session.value.collaborators = mappedCollaborators

                // 如果有所有者信息，更新它
                if (payload.session.owner !== undefined) {
                  session.value.owner = payload.session.owner
                }
              }

              console.log('已更新协作者列表，数量:', collaborators.value.length)
            }
          }
        } else {
          console.log('同步响应只包含会话信息，但需要画布数据，尝试再次发送同步请求')
          // 延迟1秒后再次发送同步请求
          setTimeout(() => {
            sendSyncRequest()
          }, 1000)
        }
        return
      }

      // 处理障碍物数据
      if (payload.obstacles && Array.isArray(payload.obstacles)) {
        console.log('同步响应包含障碍物数据，数量:', payload.obstacles.length)
        console.log('障碍物数据示例:', JSON.stringify(payload.obstacles.slice(0, 1)))

        // 记录当前障碍物数量
        const currentObstaclesCount = courseStore.currentCourse.obstacles.length
        console.log('当前本地障碍物数量:', currentObstaclesCount)

        // 如果收到的障碍物数量大于0，或者本地没有障碍物但收到了空数组（表示清空障碍物）
        if (
          payload.obstacles.length > 0 ||
          (payload.obstacles.length === 0 && currentObstaclesCount > 0)
        ) {
          console.log('需要更新障碍物数据')

          try {
            // 清除当前障碍物
            courseStore.currentCourse.obstacles = []
            console.log('已清除本地障碍物')

            // 添加从服务器接收到的障碍物
            if (payload.obstacles.length > 0) {
              // 使用for循环而不是forEach，避免可能的undefined错误
              for (let i = 0; i < payload.obstacles.length; i++) {
                const obstacle = payload.obstacles[i]
                if (obstacle) {
                  console.log(`添加障碍物 ${i + 1}/${payload.obstacles.length}:`, obstacle.id)
                  try {
                    // 使用深拷贝避免引用问题
                    const obstacleClone = JSON.parse(JSON.stringify(obstacle))

                    // 检查障碍物是否已存在
                    const exists = courseStore.currentCourse.obstacles.some(
                      (o) => o.id === obstacleClone.id,
                    )
                    if (!exists) {
                      // 使用addObstacleWithId保留原始ID
                      if (typeof courseStore.addObstacleWithId === 'function') {
                        courseStore.addObstacleWithId(obstacleClone)
                      } else {
                        courseStore.addObstacle(obstacleClone)
                      }
                    } else {
                      console.log(`障碍物 ${obstacleClone.id} 已存在，跳过添加`)
                    }
                  } catch (error) {
                    console.error(`添加障碍物 ${i + 1} 失败:`, error)
                  }
                } else {
                  console.warn(`障碍物 ${i + 1} 为undefined，跳过添加`)
                }
              }
            }

            console.log(
              '已同步障碍物数据，当前障碍物数量:',
              courseStore.currentCourse.obstacles.length,
            )
          } catch (error) {
            console.error('处理障碍物数据时出错:', error)
          }
        } else {
          console.log('无需更新障碍物数据')
        }
      } else {
        console.log('同步响应不包含障碍物数据')
      }

      // 处理路径数据
      if (payload.path) {
        console.log('同步响应包含路径数据:', payload.path)

        // 获取Canvas组件的引用，以便设置路径更新标志
        const canvasElement = document.querySelector('.course-canvas')
        if (canvasElement) {
          // 获取Canvas组件实例
          const canvasInstance = (canvasElement as any).__vueParentComponent?.ctx
          if (canvasInstance && canvasInstance.isPathUpdateFromWebSocket !== undefined) {
            // 设置标志，表示路径更新来自WebSocket
            console.log('设置路径更新标志为true，表示更新来自WebSocket')
            canvasInstance.isPathUpdateFromWebSocket.value = true
          }
        }

        // 更新路径可见性
        courseStore.togglePathVisibility(payload.path.visible)
        console.log('更新路径可见性:', payload.path.visible)

        // 更新路径点
        if (payload.path.points && Array.isArray(payload.path.points)) {
          // 使用深拷贝避免引用问题
          courseStore.coursePath.points = JSON.parse(JSON.stringify(payload.path.points))
          console.log('更新路径点数量:', payload.path.points.length)
        }

        // 更新起点和终点
        if (payload.path.startPoint) {
          // 使用深拷贝避免引用问题
          courseStore.startPoint = JSON.parse(JSON.stringify(payload.path.startPoint))
          console.log('更新起点:', payload.path.startPoint)
        }

        if (payload.path.endPoint) {
          // 使用深拷贝避免引用问题
          courseStore.endPoint = JSON.parse(JSON.stringify(payload.path.endPoint))
          console.log('更新终点:', payload.path.endPoint)
        }

        console.log('已同步路径数据')
      } else {
        console.log('同步响应不包含路径数据')
      }
    } catch (error) {
      console.error('处理同步响应消息失败:', error)
    }
  }

  /**
   * 处理错误消息
   */
  const handleErrorMessage = (message: WebSocketMessage) => {
    console.error('收到错误消息:', message)

    const { code, message: errorMessage } = message.payload as {
      code: string
      message: string
    }

    // 不显示错误提示，只记录到控制台
    console.error(`协作错误 (${code}): ${errorMessage}`)
  }

  /**
   * 连接WebSocket
   */
  const connect = (designId: string, isViaLink: boolean = false, silentMode: boolean = false) => {
    console.log(
      '尝试连接WebSocket，设计ID:',
      designId,
      '通过链接加入:',
      isViaLink,
      '静默模式:',
      silentMode,
    )

    // 如果是新的连接（非重连），重置重连尝试次数
    if (!silentMode) {
      reconnectAttempts.value = 0
      console.log('重置重连尝试次数')
    }

    // 保存设计ID
    currentDesignId.value = designId

    // 设置通过链接加入的状态
    console.log('设置通过链接加入的状态，原值:', viaLink.value, '新值:', isViaLink)
    viaLink.value = isViaLink

    // 断开现有连接
    if (!silentMode) {
      disconnect()
    } else if (socket.value) {
      try {
        socket.value.close()
      } catch (error) {
        console.error('关闭现有连接失败:', error)
      }
      socket.value = null
    }

    // 更新连接状态为"连接中"
    connectionStatus.value = ConnectionStatus.CONNECTING
    connectionError.value = null
    console.log('已将连接状态设置为连接中:', connectionStatus.value)

    try {
      // 创建WebSocket实例
      const ws = createWebSocketConnection(designId, isViaLink)
      if (!ws) {
        throw new Error('创建WebSocket连接失败')
      }

      // 保存WebSocket实例
      socket.value = ws
      console.log('WebSocket实例已创建，readyState:', ws.readyState)

      // 设置连接超时处理
      const connectionTimeout = setTimeout(() => {
        if (socket.value && socket.value.readyState === WebSocket.CONNECTING) {
          console.error('WebSocket连接超时')
          connectionError.value = 'WebSocket连接超时'

          try {
            socket.value.close()
          } catch (error) {
            console.error('关闭超时连接失败:', error)
          }
          socket.value = null
          connectionStatus.value = ConnectionStatus.DISCONNECTED

          if (!silentMode) {
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
          } else {
            console.log('静默模式下，不发送连接超时事件')
            localStorage.setItem('isCollaborating', 'true')
          }
        }
      }, 10000) // 10秒超时

      // 设置WebSocket事件
      setupWebSocketEvents(ws, connectionTimeout, silentMode)
    } catch (error) {
      console.error('连接WebSocket失败:', error)
      connectionStatus.value = ConnectionStatus.ERROR
      connectionError.value = String(error)

      if (!silentMode) {
        try {
          console.log('发送连接失败事件')
          const event = new CustomEvent('collaboration-stopped', {
            bubbles: true,
            detail: {
              timestamp: new Date().toISOString(),
              error: true,
              reason: String(error),
            },
          })
          document.dispatchEvent(event)
        } catch (eventError) {
          console.error('发送连接失败事件失败:', eventError)
        }
      }
    }
  }

  /**
   * 设置WebSocket事件
   */
  const setupWebSocketEvents = (
    ws: WebSocket,
    connectionTimeout?: ReturnType<typeof setTimeout>,
    silentMode: boolean = false,
  ) => {
    console.log('设置WebSocket事件处理器')

    // 连接打开事件处理
    ws.onopen = () => {
      console.log('WebSocket连接已打开')

      // 清除连接超时定时器
      if (connectionTimeout) {
        clearTimeout(connectionTimeout)
      }

      // 重置重连尝试次数
      reconnectAttempts.value = 0

      // 更新连接状态
      connectionStatus.value = ConnectionStatus.CONNECTED
      connectionError.value = null
      isCollaborating.value = true

      // 处理消息队列
      processMessageQueue()

      // 发送加入消息
      sendJoinMessage()

      // 触发连接成功事件
      try {
        const event = new CustomEvent('collaboration-connected', {
          bubbles: true,
          detail: {
            timestamp: new Date().toISOString(),
            delayed: false,
          },
        })
        console.log('WebSocket连接成功，触发collaboration-connected事件')
        document.dispatchEvent(event)
      } catch (error) {
        console.error('触发collaboration-connected事件失败:', error)
      }
    }

    // 接收消息事件处理
    ws.onmessage = (messageEvent: MessageEvent) => {
      console.log('收到WebSocket原始消息:', messageEvent.data)

      try {
        // 解析消息
        const message = JSON.parse(messageEvent.data) as WebSocketMessage
        console.log('解析后的WebSocket消息:', message)

        // 处理消息
        handleReceivedMessage(message)
      } catch (error) {
        console.error('处理WebSocket消息失败:', error)
      }
    }

    // 连接关闭事件处理
    ws.onclose = (closeEvent: CloseEvent) => {
      console.log('WebSocket连接已关闭:', closeEvent.code, closeEvent.reason)

      // 更新连接状态
      if (connectionStatus.value !== ConnectionStatus.DISCONNECTING) {
        connectionStatus.value = ConnectionStatus.DISCONNECTED

        // 如果不是静默模式，则触发事件
        if (!silentMode) {
          try {
            console.log('发送连接关闭事件')
            const customEvent = new CustomEvent('collaboration-stopped', {
              bubbles: true,
              detail: {
                timestamp: new Date().toISOString(),
                error: closeEvent.code !== 1000, // 1000是正常关闭的代码
                reason: closeEvent.reason || '连接已关闭',
              },
            })
            document.dispatchEvent(customEvent)
          } catch (error) {
            console.error('发送连接关闭事件失败:', error)
          }
        }

        // 检查用户是否为高级会员或通过链接加入
        const isPremiumOrViaLink = userStore.currentUser?.is_premium_active || viaLink.value

        // 只有在非正常关闭且用户仍在协作模式下才尝试重连
        if (
          closeEvent.code !== 1000 && // 非正常关闭
          closeEvent.code !== 1001 && // 非主动关闭
          isCollaborating.value &&
          reconnectAttempts.value < 3 && // 限制重连次数为3次
          isPremiumOrViaLink // 只有高级会员或通过链接加入的用户才能重连
        ) {
          console.log(`尝试重连 (${reconnectAttempts.value + 1}/3)...`)
          reconnectAttempts.value++

          // 使用固定的重连延迟，确保快速重连
          setTimeout(() => {
            connect(currentDesignId.value, viaLink.value, silentMode)
          }, 1000) // 固定1秒重连延迟
        } else if (reconnectAttempts.value >= 3) {
          connectionStatus.value = ConnectionStatus.ERROR
          connectionError.value = '重连失败，请刷新页面重试'
          console.error('WebSocket重连失败，已达到最大尝试次数')

          // 重置协作状态，避免继续尝试重连
          isCollaborating.value = false
          localStorage.setItem('isCollaborating', 'false')
        } else if (!isPremiumOrViaLink && isCollaborating.value) {
          // 非高级会员且不是通过链接加入，显示错误信息
          connectionStatus.value = ConnectionStatus.ERROR
          connectionError.value = '协作功能是会员专属功能，请升级到会员以使用此功能'
          console.error('非高级会员用户尝试使用协作功能')

          // 重置协作状态，避免继续尝试重连
          isCollaborating.value = false
          localStorage.setItem('isCollaborating', 'false')

          // 触发自定义事件，通知App.vue更新状态
          try {
            const event = new CustomEvent('collaboration-premium-required', {
              bubbles: true,
              detail: {
                timestamp: new Date().toISOString(),
                error: true,
                reason: '协作功能是会员专属功能',
              },
            })
            document.dispatchEvent(event)
          } catch (error) {
            console.error('触发会员提示事件失败:', error)
          }
        }
      }
    }

    // 连接错误事件处理
    ws.onerror = (errorEvent: Event) => {
      console.error('WebSocket连接错误:', errorEvent)
      connectionStatus.value = ConnectionStatus.ERROR
      connectionError.value = '连接错误'

      // 如果不是静默模式，则触发事件
      if (!silentMode) {
        try {
          console.log('发送连接错误事件')
          const customEvent = new CustomEvent('collaboration-stopped', {
            bubbles: true,
            detail: {
              timestamp: new Date().toISOString(),
              error: true,
              reason: '连接错误',
            },
          })
          document.dispatchEvent(customEvent)
        } catch (error) {
          console.error('发送连接错误事件失败:', error)
        }
      }
    }
  }

  /**
   * 断开WebSocket连接
   */
  const disconnect = () => {
    console.log('断开WebSocket连接')

    if (!socket.value) {
      console.log('WebSocket实例不存在，无需断开连接')
      connectionStatus.value = ConnectionStatus.DISCONNECTED
      return
    }

    try {
      // 如果连接已打开或正在连接中，则关闭连接
      if (
        socket.value.readyState === WebSocket.OPEN ||
        socket.value.readyState === WebSocket.CONNECTING
      ) {
        // 更新状态为断开连接中
        connectionStatus.value = ConnectionStatus.DISCONNECTING

        // 关闭连接
        socket.value.close(1000, '用户主动断开连接')
      }

      // 更新状态
      connectionStatus.value = ConnectionStatus.DISCONNECTED
      isCollaborating.value = false

      // 清空状态
      collaborators.value = []
      socket.value = null

      console.log('WebSocket连接已断开')
    } catch (error) {
      console.error('断开WebSocket连接时出错:', error)

      // 确保状态被重置
      connectionStatus.value = ConnectionStatus.DISCONNECTED
      isCollaborating.value = false
      collaborators.value = []
      socket.value = null
    }
  }

  /**
   * 发送加入消息
   */
  const sendJoinMessage = () => {
    const userStore = useUserStore()
    if (!userStore.currentUser) return

    // 生成随机颜色
    const colors = [
      '#3498db',
      '#2ecc71',
      '#e74c3c',
      '#f39c12',
      '#9b59b6',
      '#1abc9c',
      '#d35400',
      '#c0392b',
      '#16a085',
      '#8e44ad',
    ]
    const randomColor = colors[Math.floor(Math.random() * colors.length)]

    console.log('发送加入消息，通过链接加入:', viaLink.value)

    // 如果是通过链接加入，在加入消息中请求画布状态
    const joinPayload = {
      userId: userStore.currentUser.id,
      username: userStore.currentUser.username || '未知用户',
      color: randomColor,
      viaLink: viaLink.value,
    }

    // 如果是通过链接加入，添加请求画布状态的标志
    if (viaLink.value) {
      console.log('通过链接加入，在加入消息中请求画布状态')
      Object.assign(joinPayload, {
        requestCanvasState: true,
        clientInfo: {
          browser: navigator.userAgent,
          screenSize: `${window.innerWidth}x${window.innerHeight}`,
          timestamp: new Date().toISOString(),
        },
      })
    }

    return sendMessage(MessageType.JOIN, joinPayload)
  }

  /**
   * 发送障碍物更新消息
   */
  const sendObstacleUpdate = (obstacleId: string, updates: Record<string, unknown>) => {
    return sendMessage(MessageType.UPDATE_OBSTACLE, {
      obstacleId,
      updates,
    })
  }

  /**
   * 发送添加障碍物消息
   */
  const sendAddObstacle = (obstacle: Record<string, unknown>) => {
    // 确保障碍物对象包含编号信息
    if (obstacle.type !== ObstacleType.DECORATION && !obstacle.number) {
      // 获取当前非装饰物的数量，用于生成新编号
      const nonDecorationObstacles = courseStore.currentCourse.obstacles.filter(
        (obs) => obs.type !== ObstacleType.DECORATION,
      )

      // 查找当前最大编号
      let maxNumber = 0
      nonDecorationObstacles.forEach((obs) => {
        if (obs.number && /^\d+$/.test(obs.number)) {
          const num = parseInt(obs.number)
          if (!isNaN(num) && num > maxNumber) {
            maxNumber = num
          }
        }
      })

      // 新编号为当前最大编号+1
      obstacle.number = String(maxNumber + 1)
    }

    return sendMessage(MessageType.ADD_OBSTACLE, obstacle)
  }

  /**
   * 发送移除障碍物消息
   */
  const sendRemoveObstacle = (obstacleId: string) => {
    return sendMessage(MessageType.REMOVE_OBSTACLE, {
      obstacleId,
    })
  }

  /**
   * 发送路径更新消息
   */
  const sendPathUpdate = (pathId: string, updates: Record<string, unknown>) => {
    return sendMessage(MessageType.UPDATE_PATH, {
      pathId,
      updates,
    })
  }

  /**
   * 发送聊天消息
   */
  const sendChatMessage = (content: string) => {
    return sendMessage(MessageType.CHAT, {
      content,
    })
  }

  /**
   * 发送同步请求
   */
  const sendSyncRequest = () => {
    // 检查是否是只刷新协作者列表的请求
    const isCollaboratorsOnly = localStorage.getItem('collaborators_only_sync') === 'true'

    if (isCollaboratorsOnly) {
      console.log('发送同步请求，只请求协作者列表')
    } else {
      console.log('发送同步请求，尝试获取最新的障碍物和路径数据')
    }

    // 检查WebSocket连接状态
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.error('WebSocket未连接，无法发送同步请求')

      // 如果WebSocket未连接，尝试重新连接
      if (currentDesignId.value) {
        console.log('尝试重新连接WebSocket')
        connect(currentDesignId.value, viaLink.value)

        // 延迟2秒后再次尝试发送同步请求
        setTimeout(() => {
          if (socket.value && socket.value.readyState === WebSocket.OPEN) {
            console.log('WebSocket已重新连接，再次发送同步请求')
            sendSyncRequest()
          } else {
            console.error('WebSocket重连失败，无法发送同步请求')
          }
        }, 2000)
      }

      return false
    }

    // 构造同步请求
    if (isCollaboratorsOnly) {
      console.log('发送同步请求，只请求协作者列表')
      return sendMessage(MessageType.SYNC_REQUEST, {
        requestType: 'collaborators_only', // 只请求协作者列表
        includeObstacles: false, // 不包括障碍物
        includePaths: false, // 不包括路径
        timestamp: new Date().toISOString(), // 请求时间戳
        refreshOnly: true, // 标记这是一个刷新请求
        skipCanvasSync: true, // 标记不需要画布同步
        clientInfo: {
          // 添加客户端信息，帮助服务器识别请求
          browser: navigator.userAgent,
          screenSize: `${window.innerWidth}x${window.innerHeight}`,
          viaLink: viaLink.value,
        },
      })
    } else {
      // 构造完整的同步请求
      console.log('发送同步请求，请求完整画布数据')
      return sendMessage(MessageType.SYNC_REQUEST, {
        requestType: 'full', // 请求完整同步
        includeObstacles: true, // 包括障碍物
        includePaths: true, // 包括路径
        timestamp: new Date().toISOString(), // 请求时间戳
        clientInfo: {
          // 添加客户端信息，帮助服务器识别请求
          browser: navigator.userAgent,
          screenSize: `${window.innerWidth}x${window.innerHeight}`,
          viaLink: viaLink.value,
        },
      })
    }
  }

  /**
   * 处理同步请求消息
   * 当收到其他用户的同步请求时，发送当前画布状态
   */
  const handleSyncRequestMessage = (message: WebSocketMessage) => {
    console.log('处理同步请求消息:', message)

    try {
      // 获取当前用户ID
      const userStore = useUserStore()
      const currentUserId = userStore.currentUser?.id

      // 如果是自己发送的消息，忽略它
      if (message.senderId === String(currentUserId)) {
        console.log('忽略自己发送的同步请求消息')
        return
      }

      // 检查是否是刷新协作者列表的请求
      const payload = message.payload as {
        requestType?: string
        includeObstacles?: boolean
        includePaths?: boolean
        refreshOnly?: boolean
        skipCanvasSync?: boolean
        timestamp?: string
        clientInfo?: {
          browser: string
          screenSize: string
          viaLink: boolean
        }
      }

      // 检查是否正在刷新协作者列表
      const isRefreshingCollaborators = localStorage.getItem('refreshing_collaborators') === 'true'
      const isCollaboratorsOnly = localStorage.getItem('collaborators_only_sync') === 'true'

      // 如果是刷新协作者列表的请求，或者本地标记为正在刷新，则只发送会话信息
      if (
        payload.requestType === 'collaborators_only' ||
        payload.refreshOnly === true ||
        payload.skipCanvasSync === true ||
        isRefreshingCollaborators ||
        isCollaboratorsOnly
      ) {
        console.log('收到刷新协作者列表的请求，只发送会话信息')

        // 构建只包含会话信息的同步响应
        const sessionResponse = {
          session: session.value,
          timestamp: new Date().toISOString(),
          sender: {
            id: String(currentUserId),
            username: userStore.currentUser?.username || '未知用户',
          },
          // 添加标记，表明这是一个只包含会话信息的响应
          collaboratorsOnly: true,
        }

        // 发送同步响应
        console.log('发送会话信息同步响应')
        sendMessage(MessageType.SYNC_RESPONSE, sessionResponse)
        return
      }

      console.log('收到来自其他用户的同步请求，准备发送当前画布状态')
      console.log('当前障碍物数量:', courseStore.currentCourse.obstacles.length)
      console.log('当前路径可见性:', courseStore.coursePath.visible)
      console.log('当前路径点数量:', courseStore.coursePath.points.length)

      // 构建同步响应消息
      const syncResponse = {
        obstacles: courseStore.currentCourse.obstacles,
        path: {
          visible: courseStore.coursePath.visible,
          points: courseStore.coursePath.points,
          startPoint: courseStore.startPoint,
          endPoint: courseStore.endPoint,
        },
        timestamp: new Date().toISOString(),
        sender: {
          id: String(currentUserId),
          username: userStore.currentUser?.username || '未知用户',
        },
      }

      // 发送同步响应
      console.log('发送同步响应，包含障碍物数量:', courseStore.currentCourse.obstacles.length)
      console.log('发送同步响应，包含路径点数量:', courseStore.coursePath.points.length)
      sendMessage(MessageType.SYNC_RESPONSE, syncResponse)
    } catch (error) {
      console.error('处理同步请求消息失败:', error)
    }
  }

  /**
   * 检查连接状态
   */
  const checkConnection = () => {
    if (!socket.value) {
      return false
    }

    // 检查连接状态
    if (socket.value.readyState !== WebSocket.OPEN) {
      // 不再自动重连，避免重复重连
      // 连接关闭事件会自动处理重连
      return false
    }

    return true
  }

  /**
   * 重新连接
   * 注意：此函数已被弃用，不再使用
   * 所有重连逻辑已移至onclose事件处理中，避免重复重连
   */
  const reconnect = () => {
    console.log('reconnect函数已被弃用，不再使用')
    // 不执行任何操作，避免重复重连
    return
  }

  /**
   * 处理消息队列
   */
  const processMessageQueue = () => {
    if (messageQueue.value.length === 0) {
      console.log('消息队列为空，无需处理')
      return
    }

    console.log(`开始处理消息队列，队列长度: ${messageQueue.value.length}`)

    // 检查WebSocket是否连接
    if (!socket.value || socket.value.readyState !== WebSocket.OPEN) {
      console.log('WebSocket未连接，消息队列处理延迟')
      return
    }

    // 处理队列中的所有消息
    const messagesToProcess = [...messageQueue.value]
    messageQueue.value = []

    // 使用Promise.all并行处理所有消息，提高处理效率
    Promise.all(
      messagesToProcess.map(async (item) => {
        try {
          switch (item.type) {
            case 'update':
              if ('obstacleId' in item.data && 'updates' in item.data) {
                return sendObstacleUpdate(
                  item.data.obstacleId as string,
                  item.data.updates as Record<string, unknown>,
                )
              } else if ('pathId' in item.data && 'updates' in item.data) {
                return sendPathUpdate(
                  item.data.pathId as string,
                  item.data.updates as Record<string, unknown>,
                )
              }
              break
            case 'add':
              return sendAddObstacle(item.data)
            case 'remove':
              if ('obstacleId' in item.data) {
                return sendRemoveObstacle(item.data.obstacleId as string)
              }
              break
            default:
              console.warn('未知的队列消息类型:', item.type)
          }
        } catch (error) {
          console.error('处理队列消息失败:', error)
          // 失败的消息重新加入队列
          messageQueue.value.push(item)
        }
      }),
    ).catch((error) => {
      console.error('处理消息队列时发生错误:', error)
    })
  }

  // 返回状态和方法
  return {
    // 状态
    socket,
    connectionStatus,
    connectionError,
    collaborators,
    chatMessages,
    isOwner,
    session,
    viaLink,
    isCollaborating,
    currentDesignId,

    // 方法
    connect,
    disconnect,
    sendObstacleUpdate,
    sendAddObstacle,
    sendRemoveObstacle,
    sendPathUpdate,
    sendChatMessage,
    sendSyncRequest,
    checkConnection,
    reconnect,
  }
})
