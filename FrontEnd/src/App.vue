<template>
  <div class="app">
    <!-- 顶部导航栏 -->
    <div class="header">
      <div class="header-left">
        <router-link to="/" class="logo-link">
          <el-icon :size="24" class="header-icon">
            <Position />
          </el-icon>
          <h1>马术障碍赛路线设计器</h1>
        </router-link>
      </div>

      <!-- 导航菜单 - 将导航菜单放在中间容器内 -->
      <div class="header-center">
        <div class="nav-menu" v-if="userStore.currentUser">
          <router-link to="/" class="nav-link">首页</router-link>
          <router-link to="/my-designs" class="nav-link">我的设计</router-link>
          <router-link to="/shared-designs" class="nav-link">共享</router-link>
          <router-link to="/profile" class="nav-link">
            <el-icon>
              <User />
            </el-icon>
            我的资料
          </router-link>
        </div>
      </div>

      <!-- 右侧区域 - 将反馈和用户信息放在一个容器内 -->
      <div class="header-right">
        <!-- 反馈入口 - 无论是否登录都显示 -->
        <router-link to="/feedback" class="feedback-link">
          <el-icon class="feedback-icon">
            <ChatDotRound />
          </el-icon>
          反馈
        </router-link>

        <div class="user-info">
          <template v-if="userStore.currentUser">
            <div class="user-profile">
              <span class="username-display">
                <el-avatar :size="28" class="user-avatar">
                  {{ userStore.currentUser.username.charAt(0).toUpperCase() }}
                </el-avatar>
                {{ userStore.currentUser.username }}
              </span>
            </div>
            <el-button type="primary" size="small" :disabled="!userStore.currentUser" @click="toggleCollaboration"
              class="collab-button" :class="{ 'is-active': isCollaborating }">
              <el-icon>
                <Connection />
              </el-icon>
              {{ isCollaborating ? '退出协作' : '协作' }}
            </el-button>
            <el-button class="logout-button" @click="handleLogout">
              <el-icon>
                <SwitchButton />
              </el-icon>
              退出登录
            </el-button>
          </template>
          <template v-else>
            <div class="auth-buttons">
              <el-button type="primary" class="login-button" @click="showLoginDialog">
                <el-icon>
                  <Key />
                </el-icon>
                登录
              </el-button>
              <el-button class="register-button" @click="showRegisterDialog">
                <el-icon>
                  <UserFilled />
                </el-icon>
                注册
              </el-button>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 主界面内容 -->
    <div class="main">
      <!-- 只在主页显示这些组件 -->
      <template v-if="$route.path === '/'">
        <ToolBar class="toolbar" :style="{ width: `${leftPanelWidth}px` }" @show-login="showLoginDialog" />
        <ResizableDivider direction="vertical" @resize="handleLeftPanelResize" />
        <CourseCanvas class="canvas" ref="canvasRef" />
        <ResizableDivider direction="vertical" @resize="handleRightPanelResize" />
        <PropertiesPanel class="properties-panel" :style="{ width: `${rightPanelWidth}px` }" />
      </template>

      <!-- 路由视图，用于显示其他页面 -->
      <router-view v-else class="router-view"></router-view>

      <!-- 自动保存恢复提示 -->
      <el-dialog v-model="showRestoreDialog" title="恢复未完成的设计" width="400px" :close-on-click-modal="false"
        :show-close="false" :append-to-body="true" :destroy-on-close="false" :modal="true">
        <div class="restore-dialog-content">
          <p>检测到您有一个未完成的路线设计，是否恢复？</p>
          <p class="restore-time">保存时间: {{ formatSavedTime }}</p>
        </div>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="rejectRestore">放弃</el-button>
            <el-button type="primary" @click="restoreAutosave">恢复</el-button>
          </span>
        </template>
      </el-dialog>

      <!-- 自动保存提示 -->
      <div class="autosave-notification" v-if="showAutosaveNotification">
        <el-icon>
          <Check />
        </el-icon>
        <span>已自动保存</span>
      </div>


      <!-- 登录对话框 -->
      <el-dialog v-model="loginDialogVisible" title="登录" width="400px" :close-on-click-modal="false" destroy-on-close
        :append-to-body="true" :modal="true" :show-close="true">
        <LoginForm @switch-mode="switchToRegister" @login-success="handleAuthSuccess" />
      </el-dialog>

      <!-- 注册对话框 -->
      <el-dialog v-model="registerDialogVisible" title="注册" width="400px" :close-on-click-modal="false" destroy-on-close
        :append-to-body="true" :modal="true" :show-close="true">
        <RegisterForm @switch-mode="switchToLogin" @register-success="handleRegisterSuccess" />
      </el-dialog>
    </div>

    <!-- 协作面板 -->
    <CollaborationPanel v-if="isCollaborating" :designId="courseStore.currentCourse.id" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useUserStore } from '@/stores/user'
import ToolBar from '@/components/ToolBar.vue'
import CourseCanvas from '@/components/CourseCanvas.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import LoginForm from '@/components/LoginForm.vue'
import RegisterForm from '@/components/RegisterForm.vue'
import CollaborationPanel from '@/components/CollaborationPanel.vue'
import { Position, User, ChatDotRound, SwitchButton, Connection, Key, UserFilled, Check } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { v4 as uuidv4 } from 'uuid'
import type { CollaborationSession } from '@/utils/websocket'
import ResizableDivider from '@/components/ResizableDivider.vue'

const userStore = useUserStore()
const courseStore = useCourseStore()
const route = useRoute()
const router = useRouter()
const loginDialogVisible = ref(false)
const registerDialogVisible = ref(false)

// 协作状态
const isCollaborating = ref(false)
const collaborationSession = ref<CollaborationSession | null>(null)
const canvasRef = ref<InstanceType<typeof CourseCanvas> | null>(null)
let isTogglingCollaboration = false

// 自动保存相关变量
const showRestoreDialog = ref(false)
const savedTimestamp = ref('')
const showAutosaveNotification = ref(false)
let autosaveNotificationTimer: number | null = null

// 格式化保存时间
const formatSavedTime = computed(() => {
  if (!savedTimestamp.value) return ''

  try {
    const date = new Date(savedTimestamp.value)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return savedTimestamp.value
  }
})

// 显示自动保存提示
const showAutosaveNotificationHandler = () => {
  // 显示自动保存提示
  showAutosaveNotification.value = true

  // 清除之前的定时器
  if (autosaveNotificationTimer !== null) {
    window.clearTimeout(autosaveNotificationTimer)
  }

  // 3秒后自动隐藏提示
  autosaveNotificationTimer = window.setTimeout(() => {
    showAutosaveNotification.value = false
    autosaveNotificationTimer = null
  }, 3000)
}

// 检查是否有自动保存的路线设计
const checkAutosave = () => {
  // 如果不是在首页，不检查自动保存
  if (route.path !== '/') return

  console.log('检查是否有自动保存的路线设计')
  const timestamp = localStorage.getItem('autosaved_timestamp')
  const savedCourse = localStorage.getItem('autosaved_course')

  if (!timestamp || !savedCourse) {
    console.log('没有找到自动保存的数据', { timestamp, hasSavedCourse: !!savedCourse })
    return
  }

  console.log('找到自动保存的数据', {
    timestamp,
    dataSize: savedCourse.length,
    savedAt: new Date(timestamp).toLocaleString()
  })

  try {
    // 验证数据是否有效
    const courseData = JSON.parse(savedCourse)
    if (!courseData || !courseData.id) {
      console.error('自动保存数据无效：缺少必要字段')
      clearLocalStorage()
      return
    }

    // 进一步验证数据结构
    if (!Array.isArray(courseData.obstacles)) {
      console.error('自动保存数据无效：obstacles不是数组')
      clearLocalStorage()
      return
    }

    // 验证路径数据（如果存在）
    if (courseData.path) {
      if (courseData.path.points && !Array.isArray(courseData.path.points)) {
        console.error('自动保存数据无效：path.points不是数组')
        clearLocalStorage()
        return
      }
    }

    console.log('自动保存数据验证通过', {
      id: courseData.id,
      name: courseData.name,
      obstacles: courseData.obstacles.length,
      hasPath: !!courseData.path
    })

    // 检查自动保存的时间是否在24小时内
    const savedDate = new Date(timestamp)
    const now = new Date()
    const hoursDiff = (now.getTime() - savedDate.getTime()) / (1000 * 60 * 60)
    console.log('自动保存时间距现在:', { hoursDiff: hoursDiff.toFixed(2) + '小时' })

    if (hoursDiff <= 24) {
      savedTimestamp.value = timestamp
      // 确保对话框显示
      console.log('显示恢复对话框')
      showRestoreDialog.value = true
    } else {
      // 如果自动保存的时间超过24小时，则清除localStorage
      console.log('自动保存数据已过期（超过24小时）')
      clearLocalStorage()
    }
  } catch (error) {
    console.error('解析自动保存数据失败:', error)
    clearLocalStorage()
    return
  }
}

// 恢复自动保存的路线设计
const restoreAutosave = () => {
  console.log('尝试恢复自动保存的路线设计')
  const courseStore = useCourseStore()
  const success = courseStore.restoreFromLocalStorage()
  if (success) {
    ElMessage.success('已恢复未完成的路线设计')
    console.log('恢复成功')
  } else {
    ElMessage.error('恢复失败，可能是数据已损坏')
    console.error('恢复失败')
  }
  showRestoreDialog.value = false
}

// 拒绝恢复自动保存
const rejectRestore = () => {
  courseStore.clearAutosave()
  showRestoreDialog.value = false
  ElMessage.info('已放弃恢复')
}

// 清除localStorage（用于调试）
const clearLocalStorage = () => {
  localStorage.removeItem('autosaved_course')
  localStorage.removeItem('autosaved_timestamp')
  console.log('已清除自动保存数据')
}

onMounted(() => {
  userStore.initializeAuth()
  console.log('App.vue已挂载，初始化事件监听器')

  // 初始化面板宽度
  initializePanelWidths()

  // 如果用户已登录，初始化自定义障碍物
  if (userStore.isAuthenticated) {
    console.log('用户已登录，初始化自定义障碍物')
    import('@/stores/obstacle').then(({ useObstacleStore }) => {
      const obstacleStore = useObstacleStore()
      obstacleStore.initObstacles()
      obstacleStore.initSharedObstacles()
    })
  }

  // 监听 token 过期事件
  const handleTokenExpired = () => {
    userStore.logout()
    loginDialogVisible.value = true
  }
  window.addEventListener('token-expired', handleTokenExpired)
  console.log('已添加token-expired事件监听器')

  // 监听协作停止事件
  const handleCollaborationStopped = (event: Event) => {
    const customEvent = event as CustomEvent
    // 减少日志输出
    // console.log('收到协作停止事件', customEvent.detail)

    // 检查当前状态，避免重复处理
    if (!isCollaborating.value) {
      // console.log('当前已经不在协作中，无需更新状态')
      return
    }

    // 更新状态
    // console.log('当前协作状态:', isCollaborating.value)
    isCollaborating.value = false
    console.log('协作状态已更新为:', isCollaborating.value)

    // 显示提示消息
    if (customEvent.detail && customEvent.detail.error) {
      console.log('这是一个错误导致的停止事件')
      ElMessage.error('协作连接出错，已断开连接')
    } else if (customEvent.detail && customEvent.detail.manual) {
      // console.log('这是一个手动停止事件')
      ElMessage.warning('协作已被手动停止')
    } else if (customEvent.detail && customEvent.detail.source === 'onclose') {
      // console.log('这是由WebSocket关闭触发的停止事件')
      ElMessage.warning(`协作连接已关闭 (代码: ${customEvent.detail.code})`)
    } else if (customEvent.detail && customEvent.detail.source === 'disconnect') {
      // console.log('这是由disconnect方法触发的停止事件')
      ElMessage.info('已断开协作连接')
    } else if (customEvent.detail && customEvent.detail.delayed) {
      // console.log('这是一个延迟触发的停止事件')
      ElMessage.info('已退出协作模式')
    } else if (customEvent.detail && customEvent.detail.reason === '用户主动退出') {
      // console.log('这是用户主动退出的事件')
      ElMessage.info('已退出协作模式')
    } else {
      // console.log('这是一个正常停止事件')
      ElMessage.info('已退出协作模式')
    }

    // 使用nextTick确保DOM更新
    nextTick(() => {
      // console.log('DOM已更新，确认协作状态:', isCollaborating.value)
    })
  }

  // 监听协作连接成功事件
  const handleCollaborationConnected = (event: CustomEvent) => {
    // 减少日志输出
    // console.log('收到collaboration-connected事件', event.detail)

    // 检查是否是延迟事件，如果是普通事件已经处理过，则不重复处理
    if (event.detail.delayed && isCollaborating.value) {
      // console.log('已经处理过普通连接事件，忽略延迟事件')
      return
    }

    // 如果已经在协作状态，不重复设置
    if (isCollaborating.value) {
      // console.log('已经在协作状态，不重复设置')
      return
    }

    // console.log('更新协作状态为true')
    isCollaborating.value = true

    // 更新会话信息
    if (event.detail.session) {
      // console.log('更新会话信息:', event.detail.session)
      collaborationSession.value = event.detail.session
    }

    // 显示成功消息
    ElMessage.success('已成功连接到协作会话')
    console.log('协作状态已更新为:', isCollaborating.value)
  }

  // 先移除可能存在的旧监听器，避免重复绑定
  try {
    document.removeEventListener('collaboration-stopped', handleCollaborationStopped as EventListener)
    document.removeEventListener('collaboration-connected', handleCollaborationConnected as EventListener)
    console.log('已移除旧的事件监听器')
  } catch (error) {
    console.error('移除旧事件监听器失败:', error)
  }

  // 添加新的监听器
  try {
    document.addEventListener('collaboration-stopped', handleCollaborationStopped as EventListener)
    console.log('已添加collaboration-stopped事件监听器')

    document.addEventListener('collaboration-connected', handleCollaborationConnected as EventListener)
    console.log('已添加collaboration-connected事件监听器')
  } catch (error) {
    console.error('添加事件监听器失败:', error)
  }

  // 处理协作链接
  handleCollaborationRoute()

  // 检查URL参数中是否有协作邀请
  checkCollaborationInvite()

  // 检查登录后是否有待处理的协作邀请
  if (userStore.isAuthenticated) {
    const pendingCollaboration = localStorage.getItem('pendingCollaboration')
    if (pendingCollaboration) {
      try {
        const { designId, timestamp } = JSON.parse(pendingCollaboration)
        const inviteTime = new Date(timestamp)
        const now = new Date()

        // 检查邀请是否在24小时内
        if (now.getTime() - inviteTime.getTime() < 24 * 60 * 60 * 1000) {
          console.log('发现待处理的协作邀请，设计ID:', designId)
          courseStore.setCurrentCourseId(designId)

          setTimeout(() => {
            isCollaborating.value = true
            ElMessage.success('已自动加入协作会话')
          }, 1000)
        }

        // 清除待处理的协作邀请
        localStorage.removeItem('pendingCollaboration')
      } catch (error) {
        console.error('处理待处理协作邀请时出错:', error)
        localStorage.removeItem('pendingCollaboration')
      }
    }
  }

  // 监听自动保存事件
  document.addEventListener('course-autosaved', showAutosaveNotificationHandler as EventListener)

  // 检查是否有自动保存的路线设计
  if (route.path === '/') {
    console.log('准备检查自动保存数据')

    // 使用多种方法尝试显示对话框
    // 1. 立即检查
    checkAutosave()

    // 2. 使用nextTick
    nextTick(() => {
      checkAutosave()
    })

    // 3. 使用setTimeout
    setTimeout(() => {
      checkAutosave()

      // 4. 如果还是没有显示，尝试直接设置
      if (!showRestoreDialog.value) {
        const timestamp = localStorage.getItem('autosaved_timestamp')
        const savedCourse = localStorage.getItem('autosaved_course')

        if (timestamp && savedCourse) {
          try {
            JSON.parse(savedCourse) // 验证JSON格式
            savedTimestamp.value = timestamp
            console.log('直接设置对话框显示')
            showRestoreDialog.value = true
          } catch (e) {
            console.error('解析失败', e)
          }
        }
      }
    }, 500)
  }

  // 在组件卸载时移除事件监听
  onUnmounted(() => {
    console.log('App.vue即将卸载，移除事件监听器')
    window.removeEventListener('token-expired', handleTokenExpired)
    document.removeEventListener('collaboration-stopped', handleCollaborationStopped as EventListener)
    document.removeEventListener('collaboration-connected', handleCollaborationConnected as EventListener)
    // 移除自动保存事件监听
    document.removeEventListener('course-autosaved', showAutosaveNotificationHandler as EventListener)
    console.log('已移除所有事件监听器')
  })
})

const showRegisterDialog = () => {
  registerDialogVisible.value = true
}

const switchToLogin = () => {
  registerDialogVisible.value = false
  loginDialogVisible.value = true
}

const switchToRegister = () => {
  loginDialogVisible.value = false
  registerDialogVisible.value = true
}

const handleAuthSuccess = () => {
  loginDialogVisible.value = false
  ElMessage.success('登录成功')

  // 检查是否有待处理的协作
  const pendingCollaboration = localStorage.getItem('pendingCollaboration')
  if (pendingCollaboration) {
    try {
      const { designId, timestamp } = JSON.parse(pendingCollaboration)
      // 检查是否在30分钟内的邀请
      if (Date.now() - timestamp < 30 * 60 * 1000) {
        console.log('登录后处理待处理的协作:', designId)
        courseStore.setCurrentCourseId(designId)

        // 显示加入协作的确认对话框
        ElMessageBox.confirm(
          '您有一个待处理的协作邀请，是否加入该协作会话？',
          '协作邀请',
          {
            confirmButtonText: '加入',
            cancelButtonText: '取消',
            type: 'info',
          }
        )
          .then(() => {
            console.log('用户确认加入待处理的协作')
            // 启动协作
            toggleCollaboration()
            // 清除待处理的协作
            localStorage.removeItem('pendingCollaboration')
          })
          .catch(() => {
            console.log('用户取消加入待处理的协作')
            localStorage.removeItem('pendingCollaboration')
            ElMessage({
              type: 'info',
              message: '已取消加入协作',
            })
          })
      } else {
        // 邀请已过期
        console.log('协作邀请已过期')
        localStorage.removeItem('pendingCollaboration')
      }
    } catch (error) {
      console.error('处理待处理的协作时出错:', error)
      localStorage.removeItem('pendingCollaboration')
    }
  }
}

const handleRegisterSuccess = () => {
  registerDialogVisible.value = false
  ElMessage.success('注册成功，已自动登录')
}

const handleLogout = () => {
  userStore.logout()
  ElMessage.success('已退出登录')
}

// 为window添加debugCanvas类型声明
declare global {
  interface Window {
    debugCanvas?: {
      startCollaboration: () => void;
      stopCollaboration: () => void;
    };
  }
}

// 切换协作状态
const toggleCollaboration = async () => {
  if (isTogglingCollaboration) return
  isTogglingCollaboration = true

  try {
    // 检查用户是否为会员
    if (!userStore.currentUser?.is_premium_active && !isCollaborating.value) {
      // 先尝试更新用户资料，确保会员状态是最新的
      await userStore.updateUserProfile()

      // 再次检查会员状态
      if (!userStore.currentUser?.is_premium_active) {
        ElMessageBox.confirm(
          '协作功能是会员专属功能，请升级到会员以使用此功能。',
          '会员专属功能',
          {
            confirmButtonText: '立即升级',
            cancelButtonText: '取消',
            type: 'warning'
          }
        ).then(() => {
          // 跳转到用户资料页面
          router.push('/profile')
        }).catch(() => {
          // 用户取消操作
        })
        isTogglingCollaboration = false
        return
      }
    }

    if (isCollaborating.value) {
      // 退出协作模式
      console.log('尝试退出协作模式')

      // 立即更新状态，确保UI响应
      isCollaborating.value = false

      // 调用Canvas组件的stopCollaboration方法
      if (canvasRef.value) {
        try {
          await canvasRef.value.stopCollaboration()
          console.log('协作已停止')
        } catch (error) {
          console.error('停止协作时出错:', error)
        }
      } else {
        console.error('Canvas引用不存在，无法停止协作')
      }

      // 触发协作停止事件
      const event = new CustomEvent('collaboration-stopped', {
        bubbles: true,
        detail: {
          timestamp: new Date().toISOString(),
          source: 'manual',
          message: '用户手动退出协作'
        }
      })
      document.dispatchEvent(event)

      // 显示提示消息
      ElMessage.success('已退出协作模式')
    } else {
      // 进入协作模式
      console.log('尝试进入协作模式')

      // 确保有设计ID
      if (!courseStore.currentCourse.id) {
        console.log('设计ID不存在，生成新ID')
        courseStore.currentCourse.id = uuidv4()
      }

      // 先设置协作状态为true，确保面板显示
      isCollaborating.value = true

      // 等待DOM更新，确保面板已渲染
      await nextTick()

      // 调用Canvas组件的startCollaboration方法
      if (canvasRef.value) {
        const result = await canvasRef.value.startCollaboration()
        console.log('startCollaboration结果:', result)

        if (!result) {
          console.error('启动协作失败')
          // 如果失败，恢复状态
          isCollaborating.value = false
          isTogglingCollaboration = false
          return
        }

        // 显示成功消息
        ElMessage.success('已成功进入协作模式')
      } else {
        console.error('Canvas引用不存在，无法启动协作')
        ElMessage.error('无法启动协作，请刷新页面后重试')
        // 如果失败，恢复状态
        isCollaborating.value = false
        isTogglingCollaboration = false
        return
      }
    }
  } catch (error) {
    console.error('切换协作状态时出错:', error)
    ElMessage.error('操作失败，请稍后重试')
  } finally {
    isTogglingCollaboration = false
  }
}

// 处理协作路由
const handleCollaborationRoute = async () => {
  const currentRoute = route
  console.log('处理协作路由:', currentRoute)

  // 处理URL中的协作参数
  if (currentRoute.query.collaboration) {
    const designId = currentRoute.query.designId as string
    console.log('协作链接包含设计ID:', designId)

    if (!designId) {
      console.error('协作链接缺少设计ID')
      ElMessage.error('协作链接无效：缺少设计ID')
      return
    }

    // 确保用户已登录
    if (!userStore.isAuthenticated) {
      console.log('用户未登录，显示登录对话框')
      loginDialogVisible.value = true
      // 存储协作信息，等待登录后处理
      localStorage.setItem('pendingCollaboration', JSON.stringify({
        designId,
        timestamp: Date.now()
      }))
      return
    }

    try {
      console.log('设置当前设计ID:', designId)
      courseStore.setCurrentCourseId(designId)

      // 等待Canvas组件加载
      await nextTick()

      // 显示加入协作的确认对话框
      ElMessageBox.confirm(
        '您收到了一个协作邀请，是否加入该协作会话？',
        '协作邀请',
        {
          confirmButtonText: '加入',
          cancelButtonText: '取消',
          type: 'info',
        }
      )
        .then(() => {
          console.log('用户确认加入协作')
          // 启动协作
          toggleCollaboration()
        })
        .catch(() => {
          console.log('用户取消加入协作')
          ElMessage({
            type: 'info',
            message: '已取消加入协作',
          })
        })
    } catch (error) {
      console.error('处理协作链接时出错:', error)
      ElMessage.error('加入协作失败，请稍后重试')
    }
  }
}

// 检查URL参数中是否有协作邀请
const checkCollaborationInvite = () => {
  const urlParams = new URLSearchParams(window.location.search)
  const isCollaboration = urlParams.get('collaboration') === 'true'
  const designId = urlParams.get('designId')

  if (isCollaboration && designId) {
    console.log('检测到协作邀请链接，设计ID:', designId)

    // 如果用户已登录，自动进入协作模式
    if (userStore.isAuthenticated) {
      console.log('用户已登录，自动进入协作模式')

      // 加载设计
      courseStore.setCurrentCourseId(designId)

      // 延迟一点时间后开启协作模式
      setTimeout(() => {
        isCollaborating.value = true
        ElMessage.success('已自动加入协作会话')
      }, 1000)
    } else {
      console.log('用户未登录，提示登录后加入协作')
      ElMessage.warning('请先登录后再加入协作会话')

      // 保存协作信息，登录后可以自动加入
      localStorage.setItem('pendingCollaboration', JSON.stringify({
        designId,
        timestamp: new Date().toISOString()
      }))

      // 跳转到登录页面
      router.push('/')
    }

    // 清除URL参数，避免刷新页面重复处理
    const url = new URL(window.location.href)
    url.searchParams.delete('collaboration')
    url.searchParams.delete('designId')
    window.history.replaceState({}, document.title, url.toString())
  }
}

const rightPanelWidth = ref(300)
const handleRightPanelResize = (newWidth: number) => {
  rightPanelWidth.value = newWidth
  localStorage.setItem('rightPanelWidth', newWidth.toString())
}

const leftPanelWidth = ref(300)
const handleLeftPanelResize = (newWidth: number) => {
  leftPanelWidth.value = newWidth
  localStorage.setItem('leftPanelWidth', newWidth.toString())
}

// 初始化面板宽度
const initializePanelWidths = () => {
  // 从本地存储中获取保存的宽度
  const savedLeftWidth = localStorage.getItem('leftPanelWidth')
  const savedRightWidth = localStorage.getItem('rightPanelWidth')

  // 如果有保存的宽度，则使用保存的宽度
  if (savedLeftWidth) {
    const width = parseInt(savedLeftWidth)
    if (!isNaN(width) && width >= 220 && width <= 500) {
      leftPanelWidth.value = width
    }
  }

  if (savedRightWidth) {
    const width = parseInt(savedRightWidth)
    if (!isNaN(width) && width >= 220 && width <= 600) {
      rightPanelWidth.value = width
    }
  }
}

const showLoginDialog = () => {
  loginDialogVisible.value = true
}
</script>

<style>
:root {
  --primary-color: #3a6af8;
  --primary-dark: #2d54c5;
  --primary-light: #eef2ff;
  --secondary-color: #2c3e50;
  --accent-color: #00c6a2;
  --border-color: #e0e7ff;
  --text-color: #1a202c;
  --text-light: #6b7280;
  --bg-color: #f8fafc;
  --card-bg: #ffffff;
  --danger-color: #ef4444;
  --warning-color: #f59e0b;
  --success-color: #10b981;
  --shadow-sm: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  --radius-sm: 0.25rem;
  --radius: 0.5rem;
  --radius-lg: 0.75rem;
  --transition: all 0.2s ease;
}

html,
body {
  margin: 0;
  padding: 0;
  height: 100vh;
  overflow: hidden;
  font-family: 'Inter', 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
    '微软雅黑', Arial, sans-serif;
  color: var(--text-color);
  background-color: var(--bg-color);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  line-height: 1.5;
}

#app {
  height: 100vh;
  width: 100vw;
}

/* 全局头像样式 */
.el-avatar {
  --el-avatar-bg-color: var(--primary-color);
  --el-avatar-text-color: white;
  font-weight: 600;
}

/* 全局按钮样式优化 */
.el-button {
  border-radius: var(--radius-sm);
  font-weight: 500;
  transition: var(--transition);
}

.el-button--primary {
  background-color: var(--primary-color);
  border-color: var(--primary-color);
}

.el-button--primary:hover,
.el-button--primary:focus {
  background-color: var(--primary-dark);
  border-color: var(--primary-dark);
  transform: translateY(-1px);
  box-shadow: 0 2px 5px rgba(58, 106, 248, 0.2);
}

.el-button--success {
  background-color: var(--success-color);
  border-color: var(--success-color);
}

.el-button--danger {
  background-color: var(--danger-color);
  border-color: var(--danger-color);
}

.el-button--warning {
  background-color: var(--warning-color);
  border-color: var(--warning-color);
}

/* 全局输入框优化 */
.el-input__inner {
  border-radius: var(--radius-sm);
  border-color: var(--border-color);
  transition: var(--transition);
}

.el-input__inner:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 2px rgba(58, 106, 248, 0.1);
}

/* 分割线优化 */
.el-divider {
  margin: 24px 0;
  border-color: var(--border-color);
}

/* 卡片优化 */
.el-card {
  border-radius: var(--radius);
  border-color: var(--border-color);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
  transition: var(--transition);
}

.el-card:hover {
  box-shadow: var(--shadow);
}

/* 确保所有主要容器允许滚动 */
html,
body,
.app {
  height: 100%;
  overflow-y: auto;
}

/* 修复了可能影响滚动的问题 */
.app {
  display: flex;
  flex-direction: column;
}

/* 确保主要内容区可以滚动和自动增长 */
.container {
  flex: 1;
  min-height: 0;
  /* 允许内容区收缩 */
  overflow-y: auto;
  /* 允许垂直滚动 */
  padding-bottom: 40px;
  /* 底部留出空间，确保最下面的内容可见 */
}

/* 移动设备上的额外优化 */
@media (max-width: 768px) {
  body {
    height: auto;
    min-height: 100vh;
  }

  .app {
    min-height: 100vh;
  }
}
</style>

<style scoped lang="scss">
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  height: 60px;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  color: white;
  display: flex;
  align-items: center;
  padding: 0 24px;
  justify-content: space-between;
  box-shadow: var(--shadow);
  flex-shrink: 0;
  position: relative;
  z-index: 10;

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;

    .header-icon {
      color: white;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      letter-spacing: -0.5px;
    }

    .logo-link {
      display: flex;
      align-items: center;
      gap: 16px;
      text-decoration: none;
      color: white;
      transition: var(--transition);

      &:hover {
        opacity: 0.95;
        transform: translateY(-1px);
      }
    }
  }

  .header-center {
    display: flex;
    align-items: center;
    flex: 1;
    justify-content: center;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }
}

.nav-menu {
  display: flex;
  gap: 20px;
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 6px 16px;
  margin: 0;

  .nav-link {
    color: rgba(255, 255, 255, 0.85);
    text-decoration: none;
    font-size: 15px;
    position: relative;
    padding: 6px 10px;
    transition: var(--transition);
    font-weight: 500;
    border-radius: 6px;

    &:hover {
      color: white;
      background-color: rgba(255, 255, 255, 0.15);
    }

    &.router-link-active {
      color: white;
      font-weight: 600;
      background-color: rgba(255, 255, 255, 0.2);

      &:after {
        content: '';
        position: absolute;
        bottom: 2px;
        left: 10px;
        right: 10px;
        height: 2px;
        background-color: white;
        border-radius: 3px;
        box-shadow: 0 1px 3px rgba(255, 255, 255, 0.3);
      }
    }
  }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 16px;

  .user-profile {
    display: flex;
    align-items: center;
  }

  .auth-buttons {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .user-avatar {
    background-color: var(--accent-color);
    color: white;
    font-weight: 600;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  }

  .username-display {
    color: white;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 4px;
    background-color: rgba(255, 255, 255, 0.1);
    border-radius: 30px;
  }

  .collab-button {
    display: flex;
    align-items: center;
    gap: 5px;
    background-color: rgba(255, 255, 255, 0.15);
    border-color: transparent;
    font-weight: 500;

    .el-icon {
      font-size: 14px;
    }

    &:hover {
      background-color: rgba(255, 255, 255, 0.25);
      transform: translateY(-1px);
    }

    &.is-active,
    &.is-active:hover {
      background-color: var(--accent-color);
      border-color: var(--accent-color);
      box-shadow: 0 2px 8px rgba(0, 198, 162, 0.3);
    }
  }

  .login-button {
    padding: 8px 20px;
    font-weight: 600;
    background-color: var(--accent-color);
    border-color: var(--accent-color);
    display: flex;
    align-items: center;
    gap: 6px;

    .el-icon {
      font-size: 15px;
    }

    &:hover {
      background-color: #00b090;
      border-color: #00b090;
      box-shadow: 0 3px 8px rgba(0, 198, 162, 0.3);
    }
  }

  .register-button {
    padding: 8px 20px;
    font-weight: 600;
    color: white;
    border: 2px solid rgba(255, 255, 255, 0.65);
    background-color: transparent;
    display: flex;
    align-items: center;
    gap: 6px;

    .el-icon {
      font-size: 15px;
    }

    &:hover {
      border-color: white;
      background-color: rgba(255, 255, 255, 0.1);
      transform: translateY(-1px);
    }
  }

  .logout-button {
    padding: 6px 14px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.2);
    background-color: rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    gap: 5px;
    transition: var(--transition);

    .el-icon {
      font-size: 14px;
    }

    &:hover {
      color: white;
      border-color: rgba(255, 255, 255, 0.4);
      background-color: rgba(255, 255, 255, 0.15);
    }
  }
}

.main {
  flex: 1;
  display: flex;
  overflow: hidden;
  background-color: var(--bg-color);
  height: calc(100vh - 60px);
  position: relative;
  justify-content: space-around;

  .router-view {
    flex: 1;
    overflow: auto;
    background-color: var(--card-bg);
    border-radius: var(--radius) var(--radius) 0 0;
    box-shadow: var(--shadow-sm);
    margin: 0 1px;
  }
}

.toolbar {
  width: 400px;
  background-color: var(--card-bg);
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  min-width: 220px;
  max-width: 500px;
  transition: width 0.2s ease;
  box-shadow: var(--shadow-sm);
  z-index: 5;
}

.canvas {
  flex: 1;
  background-color: var(--card-bg);
  overflow: hidden;
  min-width: 300px;
  box-shadow: var(--shadow-sm);
  z-index: 1;
}

.properties-panel {
  width: 300px;
  background-color: var(--card-bg);
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  min-width: 220px;
  max-width: 600px;
  transition: width 0.2s ease;
  box-shadow: var(--shadow-sm);
  z-index: 4;
}

:deep(.el-dialog) {
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow-lg);

  .el-dialog__header {
    margin: 0;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border-color);
    background-color: var(--primary-light);
  }

  .el-dialog__title {
    font-weight: 600;
    color: var(--secondary-color);
    font-size: 18px;
  }

  .el-dialog__headerbtn {
    top: 16px;
    right: 20px;
  }

  .el-dialog__body {
    padding: 24px;
  }
}

.feedback-link {
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.85);
  text-decoration: none;
  font-size: 14px;
  padding: 6px 12px;
  border-radius: 6px;
  transition: var(--transition);
  background-color: rgba(255, 255, 255, 0.1);

  &:hover {
    color: white;
    background-color: rgba(255, 255, 255, 0.15);
  }

  .feedback-icon {
    font-size: 16px;
  }
}

.restore-dialog-content {
  text-align: center;
  margin-bottom: 20px;
}

.restore-time {
  font-size: 14px;
  color: #909399;
  margin-top: 10px;
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.autosave-notification {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background-color: rgba(25, 190, 107, 0.9);
  color: white;
  padding: 10px 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  z-index: 9999;
  animation: fadeIn 0.3s ease-in-out;
}

.debug-buttons {
  position: fixed;
  bottom: 20px;
  left: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
