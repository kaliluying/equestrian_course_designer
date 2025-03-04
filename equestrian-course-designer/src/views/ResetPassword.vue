<template>
  <div class="reset-password-container">
    <div class="reset-password-card">
      <h2>重置密码</h2>
      <p v-if="!token" class="error-message">
        无效的重置链接，请重新申请密码重置
      </p>
      <el-form v-else ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent="handleSubmit">
        <el-form-item label="新密码" prop="password">
          <el-input v-model="form.password" type="password" placeholder="请输入新密码" show-password />
        </el-form-item>

        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input v-model="form.confirmPassword" type="password" placeholder="请再次输入新密码" show-password />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" native-type="submit" :loading="loading">
            重置密码
          </el-button>
          <el-button @click="goToLogin">返回登录</el-button>
        </el-form-item>
      </el-form>

      <div v-if="resetSuccess" class="success-message">
        <el-icon>
          <Check />
        </el-icon>
        <p>密码重置成功！</p>
        <el-button type="primary" @click="goToLogin">前往登录</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { resetPassword } from '@/api/user'
import { Check } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const formRef = ref<FormInstance>()
const loading = ref(false)
const resetSuccess = ref(false)
const token = ref('')

const form = ref({
  password: '',
  confirmPassword: '',
})

const rules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '密码长度不能小于8位', trigger: 'blur' },
    {
      validator: (_: unknown, value: string, callback: (error?: Error) => void) => {
        if (value && value.length >= 8) {
          if (!/\d/.test(value)) {
            callback(new Error('密码必须包含数字'))
          } else if (!/[a-zA-Z]/.test(value)) {
            callback(new Error('密码必须包含字母'))
          } else {
            callback()
          }
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ],
  confirmPassword: [
    { required: true, message: '请确认密码', trigger: 'blur' },
    {
      validator: (_: unknown, value: string, callback: (error?: Error) => void) => {
        if (value !== form.value.password) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

onMounted(() => {
  // 从URL获取token参数
  const tokenParam = route.query.token
  if (tokenParam && typeof tokenParam === 'string') {
    token.value = tokenParam
  }
})

const handleSubmit = async () => {
  if (!formRef.value || !token.value) return

  try {
    await formRef.value.validate()
    loading.value = true

    await resetPassword({
      token: token.value,
      password: form.value.password,
      confirmPassword: form.value.confirmPassword
    })

    resetSuccess.value = true
  } catch (error) {
    if (error && typeof error === 'object' && 'response' in error) {
      const response = error.response as { data?: { message?: string } }
      if (response?.data?.message) {
        ElMessage.error(response.data.message)
      } else {
        ElMessage.error('重置密码失败，请稍后重试')
      }
    } else if (error instanceof Error) {
      ElMessage.error(error.message || '重置密码失败，请稍后重试')
    } else {
      ElMessage.error('重置密码失败，请稍后重试')
    }
  } finally {
    loading.value = false
  }
}

const goToLogin = () => {
  router.push('/')
}
</script>

<style scoped>
.reset-password-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f5f7fa;
}

.reset-password-card {
  width: 450px;
  padding: 30px;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
}

h2 {
  text-align: center;
  margin-bottom: 30px;
  color: #303133;
}

.error-message {
  color: #f56c6c;
  text-align: center;
  margin: 20px 0;
}

.success-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 20px;
}

.success-message .el-icon {
  font-size: 48px;
  color: #67c23a;
  margin-bottom: 16px;
}

.success-message p {
  font-size: 18px;
  color: #67c23a;
  margin-bottom: 20px;
}
</style>
