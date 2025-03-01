<template>
  <div class="app">
    <!-- 顶部导航栏 -->
    <div class="header">
      <div class="header-left">
        <el-icon :size="24" class="header-icon"><Position /></el-icon>
        <h1>马术障碍赛路线设计器</h1>
      </div>
      <div class="user-info">
        <template v-if="userStore.currentUser">
          <span
            class="username-link"
            @click="handleUsernameClick"
            :title="'点击访问后台管理'"
          >
            {{ userStore.currentUser.username }}
          </span>
          <el-button type="text" @click="handleLogout">退出登录</el-button>
        </template>
        <template v-else>
          <el-button type="text" @click="showLoginDialog">登录</el-button>
          <el-button type="text" @click="showRegisterDialog">注册</el-button>
        </template>
      </div>
    </div>

    <!-- 主界面内容 -->
    <div class="main">
      <ToolBar class="toolbar" />
      <CourseCanvas class="canvas" />
      <PropertiesPanel class="properties-panel" />
    </div>

    <!-- 登录对话框 -->
    <el-dialog
      v-model="loginDialogVisible"
      title="登录"
      width="400px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <LoginForm
        @switch-mode="switchToRegister"
        @login-success="handleAuthSuccess"
      />
    </el-dialog>

    <!-- 注册对话框 -->
    <el-dialog
      v-model="registerDialogVisible"
      title="注册"
      width="400px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <RegisterForm
        @switch-mode="switchToLogin"
        @register-success="handleRegisterSuccess"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useUserStore } from '@/stores/user'
import ToolBar from '@/components/ToolBar.vue'
import CourseCanvas from '@/components/CourseCanvas.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import LoginForm from '@/components/LoginForm.vue'
import RegisterForm from '@/components/RegisterForm.vue'
import { ElMessage } from 'element-plus'
import { Position } from '@element-plus/icons-vue'

const userStore = useUserStore()
const loginDialogVisible = ref(false)
const registerDialogVisible = ref(false)

onMounted(() => {
  userStore.initializeAuth()

  // 监听 token 过期事件
  window.addEventListener('token-expired', () => {
    userStore.logout()
    loginDialogVisible.value = true
  })
})

onUnmounted(() => {
  // 移除事件监听
  window.removeEventListener('token-expired', () => {
    userStore.logout()
    loginDialogVisible.value = true
  })
})

const showLoginDialog = () => {
  loginDialogVisible.value = true
}

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
}

const handleRegisterSuccess = () => {
  registerDialogVisible.value = false
  loginDialogVisible.value = true
  ElMessage.success('注册成功，请登录')
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
  const adminUrl = `http://localhost:8000/admin/?token=${cleanToken}`
  window.open(adminUrl, '_blank')
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
</style>
