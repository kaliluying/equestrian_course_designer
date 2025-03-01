<template>
  <div class="login-form">
    <h2>登录</h2>
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="80px"
      @submit.prevent="handleSubmit"
    >
      <el-form-item label="用户名" prop="username">
        <el-input v-model="form.username" placeholder="请输入用户名" />
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <el-input v-model="form.password" type="password" placeholder="请输入密码" />
      </el-form-item>

      <el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading">登录</el-button>
        <el-button @click="$emit('switch-mode', 'register')">注册账号</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import { useUserStore } from '@/stores/user'
import type { LoginForm } from '@/types/user'
import type { AxiosResponse } from 'axios'

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

const handleSubmit = async () => {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
    loading.value = true
    const user = await userStore.login(form.value)
    ElMessage.success('登录成功')
    emit('login-success', user)
  } catch (error) {
    // 处理后端返回的错误信息
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      (error.response as AxiosResponse)?.data
    ) {
      const errorData = (error.response as AxiosResponse).data
      if (errorData.message) {
        // 处理非字段错误
        if (errorData.message.non_field_errors) {
          ElMessage.error(errorData.message.non_field_errors[0])
        }
        // 处理字段错误
        else if (typeof errorData.message === 'object') {
          const messages = Object.values(errorData.message).flat()
          ElMessage.error(messages[0] || '登录失败')
        }
        // 处理字符串错误
        else if (typeof errorData.message === 'string') {
          ElMessage.error(errorData.message)
        }
        else {
          ElMessage.error('登录失败')
        }
      } else {
        ElMessage.error('登录失败')
      }
    } else if (error instanceof Error) {
      // 处理网络错误或其他错误
      if ('code' in error) {
        switch (error.code) {
          case 'ECONNREFUSED':
            ElMessage.error('无法连接到服务器，请检查网络连接')
            break
          case 'TIMEOUT':
            ElMessage.error('服务器响应超时，请稍后重试')
            break
          case 'NETWORK_ERROR':
            ElMessage.error('网络错误，请检查网络连接')
            break
          default:
            ElMessage.error('登录失败，请稍后重试')
        }
      } else {
        ElMessage.error(error.message || '登录失败，请稍后重试')
      }
    } else {
      ElMessage.error('登录失败，请稍后重试')
    }
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
</style>
