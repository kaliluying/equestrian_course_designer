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

      <!-- 导航菜单 -->
      <div class="nav-menu" v-if="userStore.currentUser">
        <router-link to="/" class="nav-link">首页</router-link>
        <router-link to="/my-designs" class="nav-link">我的设计</router-link>
        <router-link to="/shared-designs" class="nav-link">共享设计</router-link>
        <router-link to="/profile" class="nav-link">
          <el-icon>
            <User />
          </el-icon>
          我的资料
        </router-link>
      </div>

      <div class="user-info">
        <template v-if="userStore.currentUser">
          <el-button type="primary" size="small" :disabled="!userStore.currentUser" @click="toggleCollaboration">
            {{ isCollaborating ? '退出协作' : '协作' }}
          </el-button>
          <span class="username-display">
            {{ userStore.currentUser.username }}
          </span>
          <el-button link @click="handleLogout">退出登录</el-button>
        </template>
        <template v-else>
          <el-button type="primary" @click="showLoginForm = !showLoginForm">
            {{ showLoginForm ? '隐藏登录' : '显示登录' }}
          </el-button>
          <el-button link @click="showRegisterDialog">注册</el-button>
        </template>
      </div>
    </div>

    <!-- 主界面内容 -->
    <div class="main">
      <!-- 只在主页显示这些组件 -->
      <template v-if="$route.path === '/'">
        <ToolBar class="toolbar" :style="{ width: `${leftPanelWidth}px` }" />
        <ResizableDivider direction="vertical" @resize="handleLeftPanelResize" />
        <CourseCanvas class="canvas" ref="canvasRef" />
        <ResizableDivider direction="vertical" @resize="handleRightPanelResize" />
        <PropertiesPanel class="properties-panel" :style="{ width: `${rightPanelWidth}px` }" />
      </template>

      <!-- 路由视图，用于显示其他页面 -->
      <router-view v-else class="router-view"></router-view>

      <!-- 直接显示登录表单 -->
      <div v-if="showLoginForm && !userStore.currentUser" class="test-login-form">
        <h3>登录</h3>
        <LoginForm @switch-mode="switchToRegister" @login-success="handleAuthSuccess" />
      </div>
    </div>

    <!-- 协作面板 -->
    <CollaborationPanel v-if="isCollaborating" :designId="courseStore.currentCourse.id" />

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
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useUserStore } from '@/stores/user'
import ToolBar from '@/components/ToolBar.vue'
import CourseCanvas from '@/components/CourseCanvas.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import LoginForm from '@/components/LoginForm.vue'
import RegisterForm from '@/components/RegisterForm.vue'
import CollaborationPanel from '@/components/CollaborationPanel.vue'
import { Position, User } from '@element-plus/icons-vue'
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
const showLoginForm = ref(false)

// 协作状态
const isCollaborating = ref(false)
const collaborationSession = ref<CollaborationSession | null>(null)
const canvasRef = ref<InstanceType<typeof CourseCanvas> | null>(null)
let isTogglingCollaboration = false

onMounted(() => {
  userStore.initializeAuth()
  console.log('App.vue已挂载，初始化事件监听器')

  // 初始化面板宽度
  initializePanelWidths()

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

  // 在组件卸载时移除事件监听
  onUnmounted(() => {
    console.log('App.vue即将卸载，移除事件监听器')
    window.removeEventListener('token-expired', handleTokenExpired)
    document.removeEventListener('collaboration-stopped', handleCollaborationStopped as EventListener)
    document.removeEventListener('collaboration-connected', handleCollaborationConnected as EventListener)
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
</script>

<style>
:root {
  --primary-color: #2b5ce7;
  --secondary-color: #f0f5ff;
  --border-color: #e4e7ed;
  --text-color: #303133;
  --bg-color: #f5f7fa;
  --background-color: #f5f7fa;
}

html,
body {
  margin: 0;
  padding: 0;
  height: 100vh;
  overflow: hidden;
  font-family: 'Helvetica Neue', Helvetica, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
    '微软雅黑', Arial, sans-serif;
  color: var(--text-color);
}

#app {
  height: 100vh;
  width: 100vw;
}

.username-display {
  color: #fff;
  margin-right: 16px;
  font-weight: 500;
}
</style>

<style scoped lang="scss">
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  height: 50px;
  background: linear-gradient(135deg, var(--primary-color) 0%, #1890ff 100%);
  color: white;
  display: flex;
  align-items: center;
  padding: 0 20px;
  justify-content: space-between;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  flex-shrink: 0;

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;

    .header-icon {
      color: white;
      opacity: 0.9;
    }

    h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 500;
    }

    .logo-link {
      display: flex;
      align-items: center;
      gap: 16px;
      text-decoration: none;
      color: white;

      &:hover {
        opacity: 0.9;
      }
    }
  }
}

.nav-menu {
  display: flex;
  gap: 24px;
  margin: 0 20px;

  .nav-link {
    color: white;
    text-decoration: none;
    font-size: 16px;
    position: relative;
    padding: 4px 0;
    transition: opacity 0.3s;

    &:hover {
      opacity: 0.8;
    }

    &.router-link-active {
      font-weight: 500;

      &:after {
        content: '';
        position: absolute;
        bottom: -4px;
        left: 0;
        right: 0;
        height: 2px;
        background-color: white;
        border-radius: 2px;
      }
    }
  }
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;

  :deep(.el-button--text) {
    color: white;
    font-size: 14px;

    &:hover {
      color: var(--secondary-color);
    }
  }
}

.main {
  flex: 1;
  display: flex;
  overflow: hidden;
  background-color: var(--bg-color);
  height: calc(100vh - 50px);

  .router-view {
    flex: 1;
    overflow: auto;
    background-color: white;
  }
}

.toolbar {
  width: 400px;
  background-color: white;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
  min-width: 220px;
  max-width: 500px;
  transition: width 0.1s ease;
}

.canvas {
  flex: 1;
  background-color: white;
  overflow: hidden;
  min-width: 300px;
}

.properties-panel {
  width: 300px;
  background-color: white;
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
  min-width: 220px;
  max-width: 600px;
  transition: width 0.1s ease;
}

:deep(.el-dialog) {
  border-radius: 8px;

  .el-dialog__header {
    margin: 0;
    padding: 20px;
    border-bottom: 1px solid var(--border-color);
  }

  .el-dialog__body {
    padding: 20px;
  }
}

.test-login-form {
  position: absolute;
  top: 100px;
  left: 50%;
  transform: translateX(-50%);
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
  z-index: 1000;
  width: 400px;
}
</style>
