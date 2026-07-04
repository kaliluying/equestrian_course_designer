/**
 * 协作事件处理的 composable
 * 从 App.vue 提取的 DOM 事件监听器和协作流程控制
 */
import { nextTick, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import { useWebSocketStore } from '@/stores/websocket'
import type { CollaborationSession } from '@/stores/websocket'

// Canvas 组件暴露的方法类型
export interface CanvasComponentExposed {
  startCollaboration: (viaLink?: boolean) => Promise<boolean> | boolean
  stopCollaboration: () => Promise<boolean> | boolean
  isCreator?: () => boolean
  sendFullCanvasState?: (targetUserId?: string) => void
}

export function useCollaborationEvents(
  canvasRef: { value: CanvasComponentExposed | null },
  loginDialogVisible: { value: boolean },
) {
  const courseStore = useCourseStore()
  const router = useRouter()

  // 协作状态
  const isCollaborating = ref(false)
  const collaborationSession = ref<CollaborationSession | null>(null)
  let isTogglingCollaboration = false

  // 防抖变量，避免短时间内多次触发弹窗
  let premiumPromptDebounceTimer: number | null = null
  let premiumPromptShowing = false

  // 监听协作连接成功事件
  const handleCollaborationConnected = (event: CustomEvent) => {
    // 检查是否是延迟事件，如果是普通事件已经处理过，则不重复处理
    if (event.detail.delayed && isCollaborating.value) {
      return
    }

    // 如果已经在协作状态，不重复设置
    if (isCollaborating.value) {
      return
    }

    isCollaborating.value = true

    // 更新会话信息
    if (event.detail.session) {
      collaborationSession.value = event.detail.session
    }

    // 同步当前画布状态
    nextTick(() => {
      if (canvasRef.value) {
        // 如果是通过链接加入（协作者），发送同步请求获取完整画布状态
        const viaLink = localStorage.getItem('via_link') === 'true'
        if (viaLink) {
          // 检查是否已经发送过同步请求
          const syncRequested = localStorage.getItem('sync_requested') === 'true'
          if (!syncRequested) {
            // 使用WebSocket store发送同步请求
            const webSocketStore = useWebSocketStore()

            // 延迟1秒后发送同步请求，确保WebSocket连接已完全建立
            setTimeout(() => {
              localStorage.setItem('sync_requested', 'true')
              if (typeof webSocketStore.sendSyncRequest === 'function') {
                webSocketStore.sendSyncRequest()
              } else {
                console.warn('webSocketStore中没有sendSyncRequest方法')
              }
            }, 1000)
          }
        } else {
          // 如果是创建者，触发画布状态同步
          const syncEvent = new CustomEvent('sync-canvas-state', {
            detail: {
              course: courseStore.currentCourse,
              obstacles: courseStore.currentCourse.obstacles,
              timestamp: Date.now()
            }
          })
          document.dispatchEvent(syncEvent)
        }
      } else {
        console.warn('canvasRef 不存在，无法同步画布状态')
      }
    })
  }

  // 监听协作连接失败事件
  const handleCollaborationFailed = (_event: CustomEvent) => {
    isCollaborating.value = false
  }

  // 监听协作断开连接事件
  const handleCollaborationDisconnected = (_event: CustomEvent) => {
    isCollaborating.value = false
  }

  // 监听协作状态同步事件
  const handleCollaborationSync = (event: CustomEvent) => {
    if (event.detail.course) {
      // 确保路径数据存在
      const courseData = {
        ...event.detail.course,
        path: event.detail.course.path || {
          visible: false,
          points: [],
          startPoint: { x: 0, y: 0, rotation: 270 },
          endPoint: { x: 0, y: 0, rotation: 270 }
        }
      }
      courseStore.importCourse(courseData)
    }
  }

  // 监听路线生成事件
  const handleRouteGenerated = () => {
    if (isCollaborating.value) {
      if (canvasRef.value) {
        // 确保 courseStore.currentCourse 存在
        if (!courseStore.currentCourse) {
          console.error('courseStore.currentCourse 不存在，无法同步状态')
          return
        }

        // 获取完整的路径数据
        const pathData = {
          visible: courseStore.coursePath.visible,
          points: courseStore.coursePath.points,
          startPoint: courseStore.startPoint,
          endPoint: courseStore.endPoint
        }

        // 触发画布状态同步
        const syncEvent = new CustomEvent('sync-canvas-state', {
          detail: {
            course: {
              ...courseStore.currentCourse,
              path: pathData
            },
            obstacles: courseStore.currentCourse.obstacles,
            timestamp: Date.now()
          }
        })
        document.dispatchEvent(syncEvent)
      } else {
        console.warn('canvasRef 不存在，无法同步状态')
      }
    }
  }

  // 监听新协作者加入事件
  const handleCollaboratorJoined = (event: CustomEvent) => {
    // 防抖处理：检查是否在短时间内已经处理过该协作者的加入事件
    const collaborator = event.detail.collaborator
    if (!collaborator || !collaborator.id) {
      console.error('事件中缺少协作者信息')
      return
    }

    const responseKey = `sync_response_sent_${collaborator.id}`
    const lastResponseTime = parseInt(localStorage.getItem(responseKey) || '0')
    const now = Date.now()
    const debounceTime = 10000 // 10秒内不重复发送

    if (now - lastResponseTime < debounceTime) {
      return
    }

    // 记录本次响应时间
    localStorage.setItem(responseKey, now.toString())

    // 获取当前用户ID和WebSocket会话信息
    const userStore = useUserStore()
    const webSocketStore = useWebSocketStore()
    const currentUserId = userStore.currentUser?.id

    // 从事件中获取更多信息
    const eventSession = event.detail.session
    const eventIsOwner = event.detail.isOwner

    // 获取会话信息，包括所有者ID
    const session = webSocketStore.session || eventSession
    const sessionOwnerId = session?.owner

    // 判断当前用户是否为所有者
    const isOwner = (currentUserId && sessionOwnerId && String(currentUserId) === String(sessionOwnerId)) || eventIsOwner === true

    // 检查是否通过链接加入
    const viaLink = localStorage.getItem('via_link') === 'true'

    // 如果当前用户是所有者（或创建者）且在协作状态，则发送完整画布状态
    if (isCollaborating.value) {
      // 使用Canvas组件的isCreator方法判断当前用户是否为创建者
      if (canvasRef.value && typeof canvasRef.value.isCreator === 'function') {
        const isCreator = canvasRef.value.isCreator()

        if (isCreator) {
          // 使用Canvas组件的sendFullCanvasState方法发送完整画布状态
          if (typeof canvasRef.value.sendFullCanvasState === 'function') {
            canvasRef.value.sendFullCanvasState(event.detail.collaborator.id)
          } else {
            console.warn('Canvas组件没有sendFullCanvasState方法')
          }
        }
      } else if (isOwner || !viaLink) {
        // 回退到原来的判断逻辑
        if (canvasRef.value) {
          if (!courseStore.currentCourse) {
            console.error('courseStore.currentCourse 不存在，无法发送完整画布状态')
            return
          }

          // 构建同步响应消息
          const syncResponse = {
            obstacles: JSON.parse(JSON.stringify(courseStore.currentCourse.obstacles)),
            path: {
              visible: courseStore.coursePath.visible,
              points: JSON.parse(JSON.stringify(courseStore.coursePath.points)),
              startPoint: courseStore.startPoint ? JSON.parse(JSON.stringify(courseStore.startPoint)) : null,
              endPoint: courseStore.endPoint ? JSON.parse(JSON.stringify(courseStore.endPoint)) : null
            },
            timestamp: new Date().toISOString(),
            targetUser: event.detail.collaborator.id
          }

          // 尝试直接发送
          try {
            const socket = webSocketStore.socket
            const currentUserId = userStore.currentUser?.id

            if (socket && socket.readyState === WebSocket.OPEN) {
              const directMessage = {
                type: 'sync_response',
                senderId: String(currentUserId),
                senderName: userStore.currentUser?.username || '未知用户',
                sessionId: webSocketStore.session?.id || '',
                timestamp: new Date().toISOString(),
                payload: syncResponse
              }

              socket.send(JSON.stringify(directMessage))
            }
          } catch (error) {
            console.error('直接发送同步响应失败:', error)
          }
        } else {
          console.warn('canvasRef 不存在，无法发送完整画布状态')
        }
      }
    }
  }

  // 监听会员检查事件
  const handleCollaborationPremiumRequired = (_event: CustomEvent) => {
    isCollaborating.value = false

    // 如果已经在显示弹窗，不再重复显示
    if (premiumPromptShowing) {
      return
    }

    // 如果在短时间内已经触发过，不再重复显示
    if (premiumPromptDebounceTimer !== null) {
      return
    }

    // 设置防抖标记
    premiumPromptShowing = true
    premiumPromptDebounceTimer = window.setTimeout(() => {
      premiumPromptDebounceTimer = null
    }, 5000) // 5秒内不重复触发

    // 显示会员提示对话框
    ElMessageBox.confirm(
      '协作功能是会员专属功能，请升级到会员以使用此功能。',
      '会员专属功能',
      {
        confirmButtonText: '立即升级',
        cancelButtonText: '取消',
        type: 'warning'
      }
    ).then(() => {
      router.push('/profile')
      premiumPromptShowing = false
    }).catch(() => {
      premiumPromptShowing = false
    })
  }

  // 切换协作状态
  const toggleCollaboration = async (viaLink = false) => {
    if (isTogglingCollaboration) return
    isTogglingCollaboration = true

    try {
      // 如果已经在协作中，停止协作（无需检查会员）
      if (isCollaborating.value) {
        if (canvasRef.value) {
          await canvasRef.value.stopCollaboration()
        }
        isCollaborating.value = false
        isTogglingCollaboration = false
        return
      }

      // 开始协作前检查会员状态（通过链接加入除外）
      if (!viaLink) {
        // 调用后端 API 检查会员状态
        const { checkPremiumStatus } = await import('@/api/user')
        const premiumCheck = await checkPremiumStatus()

        if (!premiumCheck.is_premium_active) {
          ElMessageBox.confirm(
            '协作功能是会员专属功能，请升级到会员以使用此功能。',
            '会员专属功能',
            {
              confirmButtonText: '立即升级',
              cancelButtonText: '取消',
              type: 'warning'
            }
          ).then(() => {
            router.push('/profile')
          }).catch(() => {
            // 用户取消操作
          })
          isTogglingCollaboration = false
          return
        }
      }

      // 开始协作
      if (canvasRef.value) {
        await canvasRef.value.startCollaboration(viaLink)
      }
      isCollaborating.value = true
    } catch (error) {
      console.error('切换协作状态时出错:', error)
      ElMessage.error('操作失败，请稍后重试')
    } finally {
      isTogglingCollaboration = false
    }
  }

  // 检查URL参数中是否有协作邀请
  const checkCollaborationInvite = async () => {
    const urlParams = new URLSearchParams(window.location.search)
    const isCollaboration = urlParams.get('collaboration') === 'true'
    const designId = urlParams.get('designId')

    if (isCollaboration && designId) {
      try {
        // 先显示确认对话框
        try {
          await ElMessageBox.confirm(
            '您收到了一个协作邀请，是否加入该协作会话？',
            '协作邀请',
            {
              confirmButtonText: '加入',
              cancelButtonText: '取消',
              type: 'info',
            }
          )

          const userStore = useUserStore()

          // 用户点击确认后，检查登录状态
          if (!userStore.isAuthenticated) {
            // 保存邀请信息到本地存储，以便登录后继续处理
            localStorage.setItem('pendingInvitation', JSON.stringify({
              designId,
              timestamp: new Date().toISOString()
            }))

            loginDialogVisible.value = true
            return
          }

          // 如果已登录，直接处理协作邀请
          await processCollaborationInvite(designId)
        } catch (confirmError) {
          // 如果用户点击取消按钮或关闭对话框
          if (confirmError === 'cancel') {
            ElMessage.info('已取消加入协作')
            return
          } else {
            throw confirmError
          }
        }

      } catch (error) {
        console.error('处理协作邀请时出错:', error)
        ElMessage.error('加入协作失败，请稍后重试')
      } finally {
        // 清除URL参数，避免刷新页面重复处理
        const url = new URL(window.location.href)
        url.searchParams.delete('collaboration')
        url.searchParams.delete('designId')
        window.history.replaceState({}, document.title, url.toString())
      }
    }
  }

  // 处理协作邀请的共用函数
  const processCollaborationInvite = async (designId: string) => {
    try {
      // 加载设计
      courseStore.setCurrentCourseId(designId)

      // 等待Canvas组件加载
      await nextTick()

      // 启动协作模式
      if (canvasRef.value) {
        await canvasRef.value.startCollaboration(true)
      } else {
        throw new Error('Canvas组件未加载')
      }
    } catch (error) {
      console.error('处理协作邀请时出错:', error)
      console.error('加入协作失败，请稍后重试')
      throw error
    }
  }

  /**
   * 注册所有协作相关的事件监听器（在 onMounted 中调用）
   */
  const registerEventListeners = () => {
    document.addEventListener('collaboration-connected', handleCollaborationConnected as EventListener)
    document.addEventListener('collaboration-failed', handleCollaborationFailed as EventListener)
    document.addEventListener('collaboration-disconnected', handleCollaborationDisconnected as EventListener)
    document.addEventListener('collaboration-premium-required', handleCollaborationPremiumRequired as EventListener)
    document.addEventListener('sync-canvas-state', handleCollaborationSync as EventListener)
    document.addEventListener('route-generated', handleRouteGenerated as EventListener)
    document.addEventListener('collaborator-joined', handleCollaboratorJoined as EventListener)
  }

  /**
   * 注销所有协作相关的事件监听器（在 onUnmounted 中调用）
   */
  const unregisterEventListeners = () => {
    document.removeEventListener('collaboration-connected', handleCollaborationConnected as EventListener)
    document.removeEventListener('collaboration-failed', handleCollaborationFailed as EventListener)
    document.removeEventListener('collaboration-disconnected', handleCollaborationDisconnected as EventListener)
    document.removeEventListener('collaboration-premium-required', handleCollaborationPremiumRequired as EventListener)
    document.removeEventListener('sync-canvas-state', handleCollaborationSync as EventListener)
    document.removeEventListener('route-generated', handleRouteGenerated as EventListener)
    document.removeEventListener('collaborator-joined', handleCollaboratorJoined as EventListener)
  }

  return {
    // State
    isCollaborating,
    collaborationSession,
    // Methods
    toggleCollaboration,
    checkCollaborationInvite,
    processCollaborationInvite,
    registerEventListeners,
    unregisterEventListeners,
  }
}
