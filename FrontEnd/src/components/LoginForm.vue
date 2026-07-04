<template>
  <div class="login-form">
    <h2>登录</h2>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px" @submit.prevent="handleSubmit">
      <el-form-item label="用户名" prop="username">
        <el-input v-model="form.username" placeholder="请输入用户名" />
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <el-input v-model="form.password" type="password" placeholder="请输入密码" />
      </el-form-item>

      <div class="forgot-password">
        <a href="#" @click.prevent="showForgotPasswordForm">忘记密码？</a>
      </div>

      <el-form-item>
        <el-button type="primary" @click="handleSubmit" :loading="loading">登录</el-button>
        <el-button @click="$emit('switch-mode', 'register')">注册账号</el-button>
      </el-form-item>
    </el-form>

    <!-- 忘记密码对话框 -->
    <el-dialog v-model="forgotPasswordDialog" title="忘记密码" width="400px" :close-on-click-modal="false">
      <el-form ref="forgotFormRef" :model="forgotForm" :rules="forgotRules" label-width="80px"
        @submit.prevent="handleForgotPassword">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="forgotForm.username" placeholder="请输入您的用户名" />
        </el-form-item>

        <el-form-item label="邮箱" prop="email">
          <el-input v-model="forgotForm.email" placeholder="请输入注册时使用的邮箱" />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleForgotPassword" :loading="forgotLoading">发送重置邮件</el-button>
          <el-button @click="forgotPasswordDialog = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useUserStore } from '@/stores/user'
import type { LoginForm } from '@/types/user'
import { forgotPassword } from '@/api/user'
import { getApiErrorMessage } from '@/utils/apiErrorMessage'

const emit = defineEmits(['switch-mode', 'login-success'])
const userStore = useUserStore()
const formRef = ref<FormInstance>()
const loading = ref(false)

const form = ref<LoginForm>({
  username: '',
  password: '',
})

const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, message: '用户名长度不能小于2位', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
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
  ]
}

// 忘记密码相关
const forgotPasswordDialog = ref(false)
const forgotFormRef = ref<FormInstance>()
const forgotLoading = ref(false)
const forgotForm = ref({
  username: '',
  email: ''
})

const forgotRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, message: '用户名长度不能小于2位', trigger: 'blur' },
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' }
  ]
}

const showForgotPasswordForm = () => {
  forgotPasswordDialog.value = true
}

const handleForgotPassword = async () => {
  if (!forgotFormRef.value) return

  try {
    await forgotFormRef.value.validate()
    forgotLoading.value = true

    await forgotPassword({
      username: forgotForm.value.username,
      email: forgotForm.value.email
    })

    ElMessage.success('重置密码邮件已发送，请查收邮箱')
    forgotPasswordDialog.value = false
    forgotForm.value.username = ''
    forgotForm.value.email = ''
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error, '发送重置邮件失败'))
  } finally {
    forgotLoading.value = false
  }
}

const handleSubmit = async () => {
  if (!formRef.value) {
    console.error('表单引用不存在')
    return
  }

  try {

    await formRef.value.validate()
    loading.value = true



    // 使用修改后的登录方法
    const user = await userStore.loginUser(form.value)


    ElMessage.success('登录成功')
    emit('login-success', user)
  } catch (error) {
    console.error('登录错误:', error)
    ElMessage.error(getApiErrorMessage(error, '登录失败，请稍后重试'))
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-form {
  max-width: 400px;
  margin: 0 auto;
  padding: 20px;
}

.forgot-password {
  text-align: right;
  margin-bottom: 15px;
  font-size: 14px;
}

.forgot-password a {
  color: var(--el-color-primary);
  text-decoration: none;
}

.forgot-password a:hover {
  text-decoration: underline;
}
</style>
