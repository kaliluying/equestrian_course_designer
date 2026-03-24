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
            <el-button type="primary" size="small" :disabled="!userStore.currentUser" @click="toggleCollaboration(false)"
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
        <component :is="activeCanvasComponent" class="canvas" ref="canvasRef" />
        <ResizableDivider direction="vertical" @resize="handleRightPanelResize" />
        <PropertiesPanel class="properties-panel" :style="{ width: `${rightPanelWidth}px` }" />
      </template>

      <!-- 路由视图，用于显示其他页面 -->
      <router-view v-if="$route.path !== '/'" class="router-view"></router-view>

      <!-- 自动保存恢复提示 -->
      <el-dialog v-model="showRestoreDialog" title="恢复未完成的设计" width="400px" :close-on-click-modal="false"
        :show-close="false" :append-to-body="true" :destroy-on-close="false" :modal="true">
        <div class="restore-dialog-content">
          <p>检测到您有一个未完成的路线设计，是否恢复？</p>
          <p class="restore-time">保存时间: {{ formatSavedTime }}</p>
        </div>
        <template #footer>
          <span class="dialog-footer">
            <el-button @click="discardAutosave">放弃</el-button>
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

      <!-- 比赛信息浮动按钮 - 只在首页显示 -->
      <div v-if="$route.path === '/'" class="competition-fab" @click="showCompetitionDrawer = true">
        <el-icon :size="20">
          <InfoFilled />
        </el-icon>
        <span>比赛信息</span>
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

    <!-- 比赛信息抽屉 -->
    <el-drawer v-model="showCompetitionDrawer" title="比赛信息" direction="rtl" size="400px" :with-header="true"
      :destroy-on-close="false" :modal="true" :show-close="true" :append-to-body="true"
      :before-close="handleDrawerClose">
      <el-form :model="competitionForm" label-position="right" label-width="100px" class="competition-form">
        <el-form-item label="比赛名称">
          <el-input v-model="competitionForm.name" placeholder="请输入比赛名称" />
        </el-form-item>
        <el-form-item label="级别赛制">
          <el-input v-model="competitionForm.level" placeholder="请输入级别赛制" />
        </el-form-item>
        <el-form-item label="比赛日期">
          <el-input v-model="competitionForm.date" placeholder="请输入比赛日期" />
        </el-form-item>
        <el-form-item label="路线查看时间">
          <el-input v-model="competitionForm.viewTime" placeholder="请输入路线查看时间" />
        </el-form-item>
        <el-form-item label="开赛时间">
          <el-input v-model="competitionForm.startTime" placeholder="请输入开赛时间" />
        </el-form-item>
        <el-form-item label="判罚表">
          <el-input v-model="competitionForm.penaltyTable" placeholder="请输入判罚表" />
        </el-form-item>
        <el-form-item label="障碍高度">
          <el-input v-model="competitionForm.obstacleHeight" placeholder="请输入障碍高度" />
        </el-form-item>
        <el-form-item label="行进速度">
          <el-input v-model="competitionForm.speed" placeholder="请输入行进速度" />
        </el-form-item>
        <el-form-item label="路线长度">
          <el-input v-model="competitionForm.routeLength" placeholder="请输入路线长度" />
        </el-form-item>
        <el-form-item label="允许时间">
          <el-input v-model="competitionForm.allowedTime" placeholder="请输入允许时间" />
        </el-form-item>
        <el-form-item label="限制时间">
          <el-input v-model="competitionForm.limitTime" placeholder="请输入限制时间" />
        </el-form-item>
        <el-form-item label="障碍数量">
          <el-input v-model="competitionForm.obstacleCount" placeholder="请输入障碍数量" />
        </el-form-item>
        <el-form-item label="跳跃数量">
          <el-input v-model="competitionForm.jumpCount" placeholder="请输入跳跃数量" />
        </el-form-item>
        <el-form-item label="附加赛">
          <el-input v-model="competitionForm.playoff" placeholder="请输入附加赛信息" />
        </el-form-item>
        <el-form-item label="路线设计师">
          <el-input v-model="competitionForm.designer" placeholder="请输入路线设计师" />
        </el-form-item>
      </el-form>
    </el-drawer>

    <!-- 首次访问引导 -->
    <OnboardingTour :show="showOnboarding" @complete="handleOnboardingComplete" @close="handleOnboardingClose" />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ChatDotRound, Check, Connection, InfoFilled, Key, Position, SwitchButton, User, UserFilled } from '@element-plus/icons-vue'
import { useRoute, useRouter } from 'vue-router'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import CollaborationPanel from '@/components/CollaborationPanel.vue'
import CourseCanvas from '@/components/CourseCanvas.vue'
import CourseCanvasV2 from '@/components/CourseCanvasV2.vue'
import LoginForm from '@/components/LoginForm.vue'
import OnboardingTour from '@/components/OnboardingTour.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import RegisterForm from '@/components/RegisterForm.vue'
import ResizableDivider from '@/components/ResizableDivider.vue'
import ToolBar from '@/components/ToolBar.vue'
import { useAutosave } from '@/composables/useAutosave'
import { useCollaborationEvents, type CanvasComponentExposed } from '@/composables/useCollaborationEvents'

const userStore = useUserStore()
const courseStore = useCourseStore()
const route = useRoute()
const router = useRouter()
const loginDialogVisible = ref(false)
const registerDialogVisible = ref(false)

// Canvas 组件引用
const canvasRef = ref<CanvasComponentExposed | null>(null)
const activeCanvasComponent = computed(() =>
  courseStore.currentCourse.renderVersion === 'v2' ? CourseCanvasV2 : CourseCanvas
)

// 协作逻辑（从 composable 引入）
const {
  isCollaborating,
  collaborationSession,
  toggleCollaboration,
  checkCollaborationInvite,
  processCollaborationInvite,
  registerEventListeners: registerCollabEventListeners,
  unregisterEventListeners: unregisterCollabEventListeners,
} = useCollaborationEvents(canvasRef, loginDialogVisible)

// 自动保存逻辑（从 composable 引入）
const {
  showRestoreDialog,
  savedTimestamp,
  showAutosaveNotification,
  formatSavedTime,
  showAutosaveNotificationHandler,
  checkAutosave,
  restoreAutosave,
  discardAutosave,
  initAutosaveCheck,
} = useAutosave()

// 比赛信息表单数据
const competitionForm = reactive({
  name: '',
  level: '',
  date: '',
  viewTime: '',
  startTime: '',
  penaltyTable: '',
  obstacleHeight: '',
  speed: '',
  routeLength: '',
  allowedTime: '',
  limitTime: '',
  obstacleCount: '',
  jumpCount: '',
  playoff: '',
  designer: ''
})

// 监听比赛信息变化，自动保存
watch(competitionForm, () => {
  localStorage.setItem('competition_info', JSON.stringify(competitionForm))
  showAutosaveNotificationHandler()
}, { deep: true })

// 监听 token 过期事件
const handleTokenExpired = () => {
  userStore.logout(router)
  loginDialogVisible.value = true
}

// 协作事件处理和连接管理已移至 composables/useCollaborationEvents.ts

onMounted(async () => {
  await userStore.initializeAuth()

  // 初始化面板宽度
  initializePanelWidths()

  // 如果用户已登录，初始化自定义障碍物
  if (userStore.isAuthenticated) {
    import('@/stores/obstacle').then(({ useObstacleStore }) => {
      const obstacleStore = useObstacleStore()
      obstacleStore.initObstacles()
      obstacleStore.initSharedObstacles()
    })
  }

  // 检查是否需要显示首次访问引导
  checkOnboarding()

  // 注册事件监听
  window.addEventListener('token-expired', handleTokenExpired)
  registerCollabEventListeners()
  document.addEventListener('course-autosaved', showAutosaveNotificationHandler as EventListener)

  // 检查URL参数中是否有协作邀请
  checkCollaborationInvite()

  // 检查自动保存
  initAutosaveCheck()

  // 检查并恢复比赛信息
  const savedCompetitionInfo = localStorage.getItem('competition_info')
  if (savedCompetitionInfo) {
    try {
      const competitionData = JSON.parse(savedCompetitionInfo)
      Object.assign(competitionForm, competitionData)
    } catch (error) {
      console.error('恢复比赛信息失败:', error)
      localStorage.removeItem('competition_info')
    }
  }
})

// 在组件卸载时移除事件监听
onUnmounted(() => {
  window.removeEventListener('token-expired', handleTokenExpired)
  unregisterCollabEventListeners()
  document.removeEventListener('course-autosaved', showAutosaveNotificationHandler as EventListener)
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

const handleAuthSuccess = async () => {
  loginDialogVisible.value = false
  ElMessage.success('登录成功')

  // 检查是否有待处理的协作邀请
  const pendingInvitation = localStorage.getItem('pendingInvitation')
  if (pendingInvitation) {
    try {
      const { designId, timestamp } = JSON.parse(pendingInvitation)
      const inviteTime = new Date(timestamp)
      const now = new Date()

      // 检查邀请是否在有效期内（30分钟）
      if (now.getTime() - inviteTime.getTime() < 30 * 60 * 1000) {

        // 显示确认对话框
        try {
          await ElMessageBox.confirm(
            '检测到您有一个未处理的协作邀请，是否立即加入？',
            '继续协作邀请',
            {
              confirmButtonText: '加入',
              cancelButtonText: '忽略',
              type: 'info',
              distinguishCancelAndClose: true
            }
          )

          // 如果用户点击确认按钮，代码会继续执行到这里
          // 处理协作邀请
          await processCollaborationInvite(designId)
        } catch (error) {
          // 如果用户点击取消按钮或关闭对话框，会抛出异常并进入这里
          if (error === 'cancel') {
          } else {
            console.error('处理协作邀请确认对话框时出错:', error)
          }
        }
      } else {
      }
    } catch (error) {
      console.error('处理登录后的协作邀请时出错:', error)
    } finally {
      // 无论处理成功与否，都清除待处理的邀请信息
      localStorage.removeItem('pendingInvitation')
    }
  }
}

const handleRegisterSuccess = async () => {
  registerDialogVisible.value = false
  ElMessage.success('注册成功，已自动登录')

  // 与 handleAuthSuccess 相同的逻辑，处理待处理的协作邀请
  const pendingInvitation = localStorage.getItem('pendingInvitation')
  if (pendingInvitation) {
    try {
      const { designId, timestamp } = JSON.parse(pendingInvitation)
      const inviteTime = new Date(timestamp)
      const now = new Date()

      // 检查邀请是否在有效期内（30分钟）
      if (now.getTime() - inviteTime.getTime() < 30 * 60 * 1000) {

        // 显示确认对话框
        try {
          await ElMessageBox.confirm(
            '检测到您有一个未处理的协作邀请，是否立即加入？',
            '继续协作邀请',
            {
              confirmButtonText: '加入',
              cancelButtonText: '忽略',
              type: 'info',
              distinguishCancelAndClose: true
            }
          )

          // 如果用户点击确认按钮，代码会继续执行到这里
          // 处理协作邀请
          await processCollaborationInvite(designId)
        } catch (error) {
          // 如果用户点击取消按钮或关闭对话框，会抛出异常并进入这里
          if (error === 'cancel') {
          } else {
            console.error('处理协作邀请确认对话框时出错:', error)
          }
        }
      } else {
      }
    } catch (error) {
      console.error('处理注册后的协作邀请时出错:', error)
    } finally {
      // 无论处理成功与否，都清除待处理的邀请信息
      localStorage.removeItem('pendingInvitation')
    }
  }
}

const handleLogout = () => {
  userStore.logout(router)
  ElMessage.success('已退出登录')
}

// toggleCollaboration, checkCollaborationInvite, processCollaborationInvite
// 已移至 composables/useCollaborationEvents.ts

// 为window添加debugCanvas类型声明
declare global {
  interface Window {
    debugCanvas?: {
      startCollaboration: (viaLink?: boolean) => void;
      stopCollaboration: () => void;
    };
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

// 添加抽屉控制变量
const showCompetitionDrawer = ref(false)

// 首次访问引导
const showOnboarding = ref(false)

// 处理抽屉关闭
const handleDrawerClose = (done: () => void) => {
  done()
}

// 检查是否需要显示首次访问引导
const checkOnboarding = () => {
  // 只在首页显示引导
  if (route.path !== '/') return

  // 检查是否已经完成过引导
  const onboardingCompleted = localStorage.getItem('onboarding_completed')

  // 延迟显示，确保页面完全加载
  setTimeout(() => {
    if (!onboardingCompleted) {
      showOnboarding.value = true
    }
  }, 1000)
}

// 监听路由变化，如果用户回到首页且没有完成过引导，则显示
watch(() => route.path, (newPath) => {
  if (newPath === '/') {
    checkOnboarding()
  } else {
    showOnboarding.value = false
  }
})

// 处理引导完成
const handleOnboardingComplete = () => {
  showOnboarding.value = false
  ElMessage.success('欢迎使用！如有问题，请随时查看反馈页面。')
}

// 处理引导关闭
const handleOnboardingClose = () => {
  showOnboarding.value = false
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

.competition-fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  color: white;
  border-radius: 50px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(58, 106, 248, 0.4);
  transition: all 0.3s ease;
  z-index: 1000;
  font-weight: 500;
  user-select: none;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(58, 106, 248, 0.5);
  }

  &:active {
    transform: translateY(0);
  }

  .el-icon {
    flex-shrink: 0;
  }

  span {
    font-size: 14px;
    white-space: nowrap;
  }

  @media (max-width: 768px) {
    bottom: 16px;
    right: 16px;
    padding: 10px 16px;
    font-size: 13px;
  }
}

.competition-form {
  padding: 20px;

  :deep(.el-form-item) {
    margin-bottom: 18px;
  }

  :deep(.el-input) {
    width: 100%;
  }

  :deep(.el-form-item__label) {
    font-size: 14px;
    color: var(--el-text-color-regular);
  }

  :deep(.el-button) {
    width: 100%;
    margin-top: 10px;
  }
}

:deep(.el-drawer__header) {
  margin-bottom: 0;
  padding: 16px 20px;
  border-bottom: 1px solid var(--el-border-color-light);
}

:deep(.el-drawer__body) {
  padding: 0;
  overflow-y: auto;
}
</style>
