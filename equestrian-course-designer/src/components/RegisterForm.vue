<template>
  <div class="register-form">
    <h2>注册</h2>
    <el-form ref="formRef" :model="form" :rules="rules" label-width="80px" @submit.prevent="handleSubmit">
      <el-form-item label="用户名" prop="username">
        <el-input v-model="form.username" placeholder="请输入用户名" :class="{ 'is-error': errors.username }" />
        <div v-if="errors.username" class="el-form-item__error">
          {{ errors.username[0] }}
        </div>
      </el-form-item>

      <el-form-item label="邮箱" prop="email">
        <el-input v-model="form.email" type="email" placeholder="请输入邮箱" :class="{ 'is-error': errors.email }" />
        <div v-if="errors.email" class="el-form-item__error">
          {{ errors.email[0] }}
        </div>
      </el-form-item>

      <el-form-item label="密码" prop="password">
        <el-input v-model="form.password" type="password" placeholder="请输入密码"
          :class="{ 'is-error': errors.password }" />
        <div v-if="errors.password" class="el-form-item__error">
          {{ errors.password[0] }}
        </div>
      </el-form-item>

      <el-form-item label="确认密码" prop="confirmPassword">
        <el-input v-model="form.confirmPassword" type="password" placeholder="请再次输入密码"
          :class="{ 'is-error': errors.confirmPassword }" />
        <div v-if="errors.confirmPassword" class="el-form-item__error">
          {{ errors.confirmPassword[0] }}
        </div>
      </el-form-item>

      <el-form-item>
        <el-button type="primary" native-type="submit" :loading="loading">注册</el-button>
        <el-button @click="$emit('switch-mode', 'login')">返回登录</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage } from 'element-plus'
import type { FormInstance } from 'element-plus'
import type { AxiosResponse } from 'axios'
import { useUserStore } from '@/stores/user'
import type { RegisterForm, ErrorResponse } from '@/types/user'

const emit = defineEmits(['switch-mode', 'register-success'])
const userStore = useUserStore()
const formRef = ref<FormInstance>()
const loading = ref(false)

// 表单数据
const form = reactive<RegisterForm>({
  username: '',
  email: '',
  password: '',
  confirmPassword: ''
})

// 错误信息
const errors = reactive<{ [key: string]: string[] }>({
  username: [],
  email: [],
  password: [],
  confirmPassword: []
})

// 清除错误信息
const clearErrors = () => {
  Object.keys(errors).forEach(key => {
    errors[key] = []
  })
}

// 表单验证规则
const rules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 2, message: '用户名长度不能小于2位', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
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
  ],
  confirmPassword: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_: unknown, value: string, callback: (error?: Error) => void) => {
        if (value !== form.password) {
          callback(new Error('两次输入的密码不一致'))
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
    clearErrors() // 清除之前的错误信息

    // 注册成功后，用户已经自动登录（userStore.register方法已经设置了token和用户信息）
    const user = await userStore.register(form)
    ElMessage.success('注册成功')
    emit('register-success', user)
  } catch (error) {
    // 处理后端返回的错误信息
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      (error.response as AxiosResponse)?.data
    ) {
      const errorData = (error.response as AxiosResponse).data as ErrorResponse
      if (errorData.message) {
        // 更新错误信息
        let hasFieldErrors = false
        Object.keys(errorData.message).forEach(key => {
          if (key in errors) {
            errors[key] = errorData.message[key]
            hasFieldErrors = true
          } else if (key === 'non_field_errors') {
            // 处理非字段错误
            ElMessage.error(errorData.message[key].join('，'))
          }
        })

        // 如果有字段错误，显示概要错误信息
        if (hasFieldErrors) {
          ElMessage.error('请检查表单中的错误信息')
        }
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
            ElMessage.error(error.message || '注册失败，请稍后重试')
        }
      } else {
        ElMessage.error(error.message || '注册失败，请稍后重试')
      }
    } else {
      ElMessage.error('注册失败，请稍后重试')
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.register-form {
  max-width: 400px;
  margin: 0 auto;
  padding: 20px;
}

:deep(.el-input.is-error .el-input__wrapper) {
  box-shadow: 0 0 0 1px var(--el-color-danger) inset;
}

:deep(.el-form-item__error) {
  color: var(--el-color-danger);
  font-size: 12px;
  margin-top: 4px;
}
</style>
