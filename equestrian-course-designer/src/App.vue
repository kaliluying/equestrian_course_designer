<template>
  <div class="app">
    <!-- 顶部导航栏 -->
    <div class="header">
      <div class="header-left">
        <el-icon :size="24" class="header-icon">
          <Position />
        </el-icon>
        <h1>马术障碍赛路线设计器</h1>
      </div>
      <div class="user-info">
        <template v-if="userStore.currentUser">
          <el-button type="primary" size="small" :disabled="!userStore.currentUser" @click="toggleCollaboration">
            {{ isCollaborating ? '退出协作' : '协作' }}
          </el-button>
          <span class="username-link" @click="handleUsernameClick" :title="'点击访问后台管理'">
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
      <ToolBar class="toolbar" />
      <CourseCanvas class="canvas" ref="canvasRef" />
      <PropertiesPanel class="properties-panel" />

      <!-- 直接显示登录表单 -->
      <div v-if="showLoginForm && !userStore.currentUser" class="test-login-form">
        <h3>登录</h3>
        <LoginForm @login-success="handleAuthSuccess" />
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
import { Position } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useRoute } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { v4 as uuidv4 } from 'uuid'
import type { CollaborationSession } from '@/utils/websocket'

const userStore = useUserStore()
const courseStore = useCourseStore()
const route = useRoute()
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
    console.log('收到协作停止事件', customEvent.detail)

    // 检查当前状态，避免重复处理
    if (!isCollaborating.value) {
      console.log('当前已经不在协作中，无需更新状态')
      return
    }

    // 更新状态
    console.log('当前协作状态:', isCollaborating.value)
    isCollaborating.value = false
    console.log('协作状态已更新为:', isCollaborating.value)

    // 显示提示消息
    if (customEvent.detail && customEvent.detail.error) {
      console.log('这是一个错误导致的停止事件')
      ElMessage.error('协作连接出错，已断开连接')
    } else if (customEvent.detail && customEvent.detail.manual) {
      console.log('这是一个手动停止事件')
      ElMessage.warning('协作已被手动停止')
    } else if (customEvent.detail && customEvent.detail.source === 'onclose') {
      console.log('这是由WebSocket关闭触发的停止事件')
      ElMessage.warning(`协作连接已关闭 (代码: ${customEvent.detail.code})`)
    } else if (customEvent.detail && customEvent.detail.source === 'disconnect') {
      console.log('这是由disconnect方法触发的停止事件')
      ElMessage.info('已断开协作连接')
    } else if (customEvent.detail && customEvent.detail.delayed) {
      console.log('这是一个延迟触发的停止事件')
      ElMessage.info('已退出协作模式')
    } else if (customEvent.detail && customEvent.detail.reason === '用户主动退出') {
      console.log('这是用户主动退出的事件')
      ElMessage.info('已退出协作模式')
    } else {
      console.log('这是一个正常停止事件')
      ElMessage.info('已退出协作模式')
    }

    // 使用nextTick确保DOM更新
    nextTick(() => {
      console.log('DOM已更新，确认协作状态:', isCollaborating.value)
    })
  }

  // 监听协作连接成功事件
  const handleCollaborationConnected = (event: CustomEvent) => {
    console.log('收到collaboration-connected事件', event.detail)

    // 检查是否是延迟事件，如果是普通事件已经处理过，则不重复处理
    if (event.detail.delayed && isCollaborating.value) {
      console.log('已经处理过普通连接事件，忽略延迟事件')
      return
    }

    // 如果已经在协作状态，不重复设置
    if (isCollaborating.value) {
      console.log('已经在协作状态，不重复设置')
      return
    }

    console.log('更新协作状态为true')
    isCollaborating.value = true

    // 更新会话信息
    if (event.detail.session) {
      console.log('更新会话信息:', event.detail.session)
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

  // 添加调试事件监听器
  const debugEventListener = (event: Event) => {
    console.log('收到事件:', event.type, event)
  }
  document.addEventListener('collaboration-stopped', debugEventListener)
  document.addEventListener('collaboration-connected', debugEventListener)
  console.log('已添加调试事件监听器')

  // 处理协作链接
  handleCollaborationRoute()

  // 在组件卸载时移除事件监听
  onUnmounted(() => {
    console.log('App.vue即将卸载，移除事件监听器')
    window.removeEventListener('token-expired', handleTokenExpired)
    document.removeEventListener('collaboration-stopped', handleCollaborationStopped as EventListener)
    document.removeEventListener('collaboration-connected', handleCollaborationConnected as EventListener)
    document.removeEventListener('collaboration-stopped', debugEventListener)
    document.removeEventListener('collaboration-connected', debugEventListener)
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

const handleUsernameClick = () => {
  // 获取 token 并确保它是完整的 Bearer token
  const token = localStorage.getItem('access_token')
  if (!token) {
    ElMessage.error('请先登录')
    return
  }
  // 移除可能存在的 Bearer 前缀
  const cleanToken = token.replace('Bearer ', '')

  // 使用当前环境的后端URL
  let adminUrl = ''
  if (import.meta.env.DEV) {
    // 开发环境
    adminUrl = `http://127.0.0.1:8000/admin/?token=${cleanToken}`
  } else {
    // 生产环境
    const host = window.location.host
    adminUrl = `http://${host}/admin/?token=${cleanToken}`
  }

  console.log('打开管理后台URL:', adminUrl)
  window.open(adminUrl, '_blank')
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
  console.log('切换协作状态，当前状态:', isCollaborating.value)

  // 防止重复点击
  if (isTogglingCollaboration) {
    console.log('正在处理协作状态切换，请稍候')
    return
  }

  isTogglingCollaboration = true

  try {
    if (!isCollaborating.value) {
      // 进入协作模式
      console.log('尝试进入协作模式')

      // 确保有设计ID
      if (!courseStore.currentCourse.id) {
        console.log('设计ID不存在，生成新ID')
        courseStore.currentCourse.id = uuidv4()
      }

      console.log('调用startCollaboration前，协作状态:', isCollaborating.value)

      // 调用Canvas组件的startCollaboration方法
      if (canvasRef.value) {
        console.log('调用Canvas的startCollaboration方法')
        const result = await canvasRef.value.startCollaboration()
        console.log('startCollaboration结果:', result)

        if (!result) {
          console.error('启动协作失败')
          isTogglingCollaboration = false
          return
        }
      } else {
        console.error('Canvas引用不存在，无法启动协作')
        ElMessage.error('无法启动协作，请刷新页面后重试')
        isTogglingCollaboration = false
        return
      }
    } else {
      // 退出协作模式
      console.log('尝试退出协作模式')

      // 立即更新状态，确保UI响应
      isCollaborating.value = false

      // 调用Canvas组件的stopCollaboration方法
      if (canvasRef.value) {
        console.log('调用Canvas的stopCollaboration方法')
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
    }
  } catch (error) {
    console.error('切换协作状态时出错:', error)
    ElMessage.error('操作失败，请稍后重试')
  } finally {
    isTogglingCollaboration = false
  }

  console.log('协作状态切换完成，当前状态:', isCollaborating.value)
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

.username-link {
  cursor: pointer;
  color: #fff;
  text-decoration: underline;
  margin-right: 16px;
  transition: opacity 0.3s;
}

.username-link:hover {
  opacity: 0.8;
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
}

.toolbar {
  width: 300px;
  background-color: white;
  border-right: 1px solid var(--border-color);
  overflow-y: auto;
}

.canvas {
  flex: 1;
  background-color: white;
  overflow: hidden;
}

.properties-panel {
  width: 300px;
  background-color: white;
  border-left: 1px solid var(--border-color);
  overflow-y: auto;
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
