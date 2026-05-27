<template>
  <div class="error-boundary">
    <slot v-if="!hasError" />
    
    <!-- 错误展示界面 -->
    <div v-else class="error-container">
      <div class="error-content">
        <el-result
          icon="error"
          :title="errorTitle"
          :sub-title="errorMessage"
        >
          <template #extra>
            <el-space>
              <el-button type="primary" @click="handleReload">
                刷新页面
              </el-button>
              <el-button @click="handleReset">
                返回首页
              </el-button>
              <el-button v-if="showDetails" text @click="toggleDetails">
                {{ detailsVisible ? '隐藏' : '查看' }}详情
              </el-button>
            </el-space>
          </template>
        </el-result>

        <!-- 错误详情（开发环境） -->
        <el-collapse v-if="showDetails && detailsVisible" class="error-details">
          <el-collapse-item title="错误详情" name="1">
            <div class="error-stack">
              <p><strong>错误类型：</strong>{{ errorInfo?.type || 'Unknown' }}</p>
              <p><strong>错误时间：</strong>{{ errorTime }}</p>
              <p v-if="errorStack"><strong>堆栈信息：</strong></p>
              <pre v-if="errorStack">{{ errorStack }}</pre>
            </div>
          </el-collapse-item>
        </el-collapse>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onErrorCaptured } from 'vue'
import { useRouter } from 'vue-router'
import { handleError, type ErrorInfo } from '@/utils/errorHandler'

const router = useRouter()

const hasError = ref(false)
const errorInfo = ref<ErrorInfo | null>(null)
const detailsVisible = ref(false)

// 是否显示详情（仅开发环境）
const showDetails = computed(() => import.meta.env.DEV)

// 错误标题
const errorTitle = computed(() => {
  if (!errorInfo.value) return '页面出错了'
  
  switch (errorInfo.value.type) {
    case 'NETWORK':
      return '网络连接失败'
    case 'AUTH':
      return '认证失败'
    case 'VALIDATION':
      return '数据验证失败'
    case 'BUSINESS':
      return '操作失败'
    case 'SYSTEM':
      return '系统错误'
    default:
      return '页面出错了'
  }
})

// 错误消息
const errorMessage = computed(() => {
  return errorInfo.value?.message || '抱歉，页面遇到了一些问题'
})

// 错误时间
const errorTime = computed(() => {
  if (!errorInfo.value) return ''
  return new Date(errorInfo.value.timestamp).toLocaleString('zh-CN')
})

// 错误堆栈
const errorStack = computed(() => {
  const error = errorInfo.value?.originalError
  if (error instanceof Error) {
    return error.stack || error.message
  }
  return String(error)
})

// 捕获组件错误
onErrorCaptured((err, instance, info) => {
  console.error('[ErrorBoundary] Captured error:', err, info)
  
  // 处理错误
  errorInfo.value = handleError(err, {
    component: instance?.$options.name || 'Unknown',
    errorInfo: info
  })
  
  hasError.value = true
  
  // 阻止错误继续传播
  return false
})

// 切换详情显示
const toggleDetails = () => {
  detailsVisible.value = !detailsVisible.value
}

// 刷新页面
const handleReload = () => {
  window.location.reload()
}

// 重置错误状态并返回首页
const handleReset = () => {
  hasError.value = false
  errorInfo.value = null
  router.push('/')
}
</script>

<style scoped lang="scss">
.error-boundary {
  width: 100%;
  height: 100%;
}

.error-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 40px 20px;
  background: #f5f7fa;
}

.error-content {
  max-width: 600px;
  width: 100%;
  background: white;
  border-radius: 8px;
  padding: 40px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.error-details {
  margin-top: 24px;
}

.error-stack {
  p {
    margin: 8px 0;
    color: #606266;
    
    strong {
      color: #303133;
    }
  }
  
  pre {
    margin-top: 12px;
    padding: 12px;
    background: #f5f7fa;
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.6;
    color: #606266;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
}

:deep(.el-result) {
  padding: 20px 0;
}

:deep(.el-result__icon) {
  svg {
    width: 64px;
    height: 64px;
  }
}

:deep(.el-result__title) {
  margin-top: 16px;
  font-size: 20px;
}

:deep(.el-result__subtitle) {
  margin-top: 8px;
}
</style>
