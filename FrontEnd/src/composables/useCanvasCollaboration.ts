/**
 * 协作相关逻辑的 composable
 * 从 CourseCanvas.vue 提取的 WebSocket 协作同步、状态管理
 */
import { ref, watch } from 'vue'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import { ConnectionStatus, useWebSocketStore } from '@/stores/websocket'

export function useCanvasCollaboration() {
  const courseStore = useCourseStore()
  const webSocketStore = useWebSocketStore()

  // 协作状态
  const isCollaborating = ref(false)

  // 添加一个标志，用于标识路径更新是否来自WebSocket
  const isPathUpdateFromWebSocket = ref(false)

  // 取出需要使用的 WebSocket 状态和方法
  const {
    connectionStatus,
    isCollaborating: wsIsCollaborating,
    sendAddObstacle,
    sendObstacleUpdate,
    sendRemoveObstacle,
    sendPathUpdate,
    connect,
    disconnect
  } = webSocketStore

  // 监听路径变化，同步到其他协作者
  watch(() => courseStore.coursePath, (newPath) => {
    // 如果更新来自WebSocket，不再发送更新消息，避免循环更新
    if (isPathUpdateFromWebSocket.value) {
      isPathUpdateFromWebSocket.value = false
      return
    }

    if (wsIsCollaborating) {
      // 使用路径ID和更新内容调用sendPathUpdate
      sendPathUpdate(courseStore.currentCourse.id, {
        visible: newPath.visible,
        points: newPath.points,
        startPoint: courseStore.startPoint,
        endPoint: courseStore.endPoint
      })
    }
  }, { deep: true })

  // 添加协作控制方法
  const startCollaboration = async (viaLink = false, shareToken: string | null = null) => {
    const designId = courseStore.currentCourse.id

    // 验证设计ID
    if (!designId) {
      console.error('无法开始协作：设计ID为空')
      return false
    }

    // 如果已经在协作中且已连接，则不重复启动
    if (wsIsCollaborating && connectionStatus === ConnectionStatus.CONNECTED) {
      // 触发自定义事件，通知App.vue更新状态
      const event = new CustomEvent('collaboration-connected', {
        bubbles: true,
        detail: {
          timestamp: new Date().toISOString(),
          session: webSocketStore.session,
          delayed: true
        }
      })
      document.dispatchEvent(event)
      return true
    }

    // 设置协作状态为true
    isCollaborating.value = true

    // 保存通过链接加入的标志到localStorage，以便其他组件可以使用
    localStorage.setItem('via_link', viaLink.toString())

    // 连接WebSocket，传递通过链接加入的标志
    courseStore.setCurrentCourseId(designId)
    connect(designId, viaLink, false, shareToken)

    // 等待一段时间，确保WebSocket有足够时间连接
    await new Promise(resolve => setTimeout(resolve, 1000))

    // 如果连接成功但未触发事件，手动触发connected事件
    if (connectionStatus === ConnectionStatus.CONNECTED && !isCollaborating.value) {
      const event = new CustomEvent('collaboration-connected', {
        bubbles: true,
        detail: {
          timestamp: new Date().toISOString(),
          session: webSocketStore.session
        }
      })
      document.dispatchEvent(event)
    }

    // 如果是通过链接加入（即协作者），直接请求创建者的画布状态
    if (viaLink && connectionStatus === ConnectionStatus.CONNECTED) {
      // 延迟一秒发送请求，确保连接已完全建立
      setTimeout(() => {
        // 创建一个特殊的JOIN消息，包含请求画布状态的标志
        const userStore = useUserStore()
        if (!userStore.currentUser && !viaLink) {
          console.error('用户未登录，无法发送请求')
          return
        }

        // 生成随机颜色
        const colors = [
          '#3498db', '#2ecc71', '#e74c3c', '#f39c12', '#9b59b6',
          '#1abc9c', '#d35400', '#c0392b', '#16a085', '#8e44ad'
        ]
        const randomColor = colors[Math.floor(Math.random() * colors.length)]

        // 构建JOIN消息
        const joinMessage = {
          type: 'join',
          senderId: userStore.currentUser ? String(userStore.currentUser.id) : 'anonymous',
          senderName: userStore.currentUser?.username || '分享访客',
          sessionId: '',
          timestamp: new Date().toISOString(),
          payload: {
            userId: userStore.currentUser?.id || null,
            username: userStore.currentUser?.username || '分享访客',
            color: randomColor,
            viaLink: true,
            requestCanvasState: true, // 请求画布状态的标志
            clientInfo: {
              browser: navigator.userAgent,
              screenSize: `${window.innerWidth}x${window.innerHeight}`,
              timestamp: new Date().toISOString()
            }
          }
        }

        // 发送JOIN消息
        try {
          const socket = webSocketStore.$state.socket
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify(joinMessage))
          } else {
            console.error('WebSocket未连接，无法发送特殊JOIN消息')
          }
        } catch (error) {
          console.error('发送特殊JOIN消息失败:', error)
        }
      }, 1000)
    }

    // 返回成功
    return true
  }

  const stopCollaboration = async (): Promise<boolean> => {
    // 添加检查，如果当前不在协作中，直接返回
    if (!isCollaborating.value) {
      return true
    }

    try {
      // 先更新状态，确保UI立即响应
      // 触发自定义事件通知App.vue更新状态
      const event = new CustomEvent('collaboration-stopped', {
        bubbles: true,
        detail: { timestamp: new Date().toISOString(), reason: '用户主动退出' },
      })
      document.dispatchEvent(event)

      // 然后断开连接
      disconnect()

      // 清除通过链接加入的标志
      localStorage.removeItem('via_link')
      localStorage.removeItem('sync_requested')

      // 清除已加入协作者列表
      localStorage.removeItem('joined_collaborators')

      // 清除防抖相关的存储
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sync_response_sent_') ||
          key.startsWith('canvas_state_sent_') ||
          key.startsWith('collaborator_joined_')) {
          localStorage.removeItem(key)
        }
      })

      return true
    } catch (error) {
      console.error('停止协作时出错:', error)

      // 触发自定义事件
      try {
        const event = new CustomEvent('collaboration-stopped', {
          bubbles: true,
          detail: { timestamp: new Date().toISOString(), error: true, reason: '未知错误' },
        })
        document.dispatchEvent(event)
      } catch (eventError) {
        console.error('发送错误状态的collaboration-stopped事件失败:', eventError)
      }

      return false
    }
  }

  /**
   * 通过统一 WebSocket 入口广播当前画布状态。
   */
  const sendFullCanvasState = () => {
    if (!isCollaborating.value) {
      console.warn('当前不在协作状态，无法发送画布状态')
      return
    }

    // 获取WebSocket store
    const webSocketStore = useWebSocketStore()

    // 构建同步响应消息
    const syncResponse = {
      obstacles: JSON.parse(JSON.stringify(courseStore.currentCourse.obstacles)),
      path: {
        visible: courseStore.coursePath.visible,
        points: JSON.parse(JSON.stringify(courseStore.coursePath.points)),
        startPoint: courseStore.startPoint ? JSON.parse(JSON.stringify(courseStore.startPoint)) : null,
        endPoint: courseStore.endPoint ? JSON.parse(JSON.stringify(courseStore.endPoint)) : null
      },
      timestamp: new Date().toISOString()
    }

    // 只通过统一发送入口发送，目标用户由服务端 requestId 决定。
    try {
      webSocketStore.sendSyncResponse(syncResponse)
    } catch (error) {
      console.error('发送同步响应失败:', error)
    }
  }

  // 判断当前用户是否为创建者
  const isCreator = () => {
    // 获取WebSocket store
    const webSocketStore = useWebSocketStore()

    // 获取当前用户信息
    const userStore = useUserStore()
    const currentUserId = userStore.currentUser?.id

    // 获取会话信息
    interface WebSocketStoreWithSession {
      session?: { owner: string; id: string };
    }
    const session = (webSocketStore as unknown as WebSocketStoreWithSession).session
    const sessionOwnerId = session?.owner

    // 判断当前用户是否为所有者
    const isOwner = currentUserId && sessionOwnerId && String(currentUserId) === String(sessionOwnerId)

    // 检查是否通过链接加入
    const viaLink = localStorage.getItem('via_link') === 'true'

    return isOwner || !viaLink
  }

  return {
    // State
    isCollaborating,
    isPathUpdateFromWebSocket,
    // WebSocket methods (pass-through)
    sendAddObstacle,
    sendObstacleUpdate,
    sendRemoveObstacle,
    sendPathUpdate,
    // Collaboration methods
    startCollaboration,
    stopCollaboration,
    sendFullCanvasState,
    isCreator,
  }
}
