<template>
  <el-dialog
    v-model="dialogVisible"
    title="AI 智能生成路线"
    width="600px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <!-- 配额信息 -->
    <div class="quota-info">
      <el-tag :type="quotaInfo.remaining_quota > 0 ? 'success' : 'danger'">
        剩余次数: {{ quotaInfo.remaining_quota }}
      </el-tag>
      <el-button size="small" text type="primary" @click="handlePurchase">
        购买次数
      </el-button>
    </div>

    <!-- 输入区域 -->
    <el-form :model="form" label-position="top" class="ai-form">
      <el-form-item label="描述你的设计需求">
        <el-input
          v-model="form.prompt"
          type="textarea"
          :rows="4"
          placeholder="例如：设计一条中等难度的路线，包含12个障碍物，要有组合障碍和利物浦..."
          :disabled="isGenerating || quotaInfo.remaining_quota <= 0"
          maxlength="500"
          show-word-limit
        />
      </el-form-item>

      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item label="障碍物数量">
            <el-slider v-model="form.config.obstacle_count" :min="8" :max="15" show-stops />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="难度级别">
            <el-radio-group v-model="form.config.difficulty" :disabled="isGenerating">
              <el-radio-button value="easy">简单</el-radio-button>
              <el-radio-button value="medium">中等</el-radio-button>
              <el-radio-button value="hard">困难</el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <!-- 生成结果 -->
    <div v-if="result" class="result-section">
      <el-divider>生成结果</el-divider>

      <el-card class="result-card">
        <div class="result-stats">
          <span><el-icon><Odometer /></el-icon> 障碍物: {{ result.obstacles.length }}</span>
          <span><el-icon><TrendCharts /></el-icon> 难度: {{ result.difficulty_score }}/10</span>
          <span><el-icon><Timer /></el-icon> 预估: {{ result.estimated_time }}s</span>
        </div>

        <div class="result-explanation">
          <h4>设计说明</h4>
          <p>{{ result.explanation }}</p>
        </div>

        <div v-if="result.teaching_notes" class="teaching-notes">
          <h4>教学建议</h4>
          <p>{{ result.teaching_notes }}</p>
        </div>
      </el-card>
    </div>

    <template #footer>
      <el-button @click="dialogVisible = false">取消</el-button>
      <el-button
        type="primary"
        :loading="isGenerating"
        :disabled="!form.prompt.trim() || quotaInfo.remaining_quota <= 0"
        @click="handleGenerate"
      >
        {{ isGenerating ? '生成中...' : '生成' }}
      </el-button>
      <el-button
        type="success"
        v-if="result"
        @click="applyResult"
      >
        应用到画布
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Odometer, TrendCharts, Timer } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { useCourseStore } from '@/stores/course'
import { aiApi, type AIQuotaInfo, type AIGenerateResponse } from '@/api/ai'

const router = useRouter()
const userStore = useUserStore()
const courseStore = useCourseStore()

const dialogVisible = ref(false)
const isGenerating = ref(false)
const result = ref<AIGenerateResponse | null>(null)

const quotaInfo = reactive<AIQuotaInfo>({
  free_quota: 0,
  purchased_quota: 0,
  used_quota: 0,
  remaining_quota: 0
})

const form = reactive({
  prompt: '',
  config: {
    field_width: 90,
    field_height: 60,
    obstacle_count: 12,
    difficulty: 'medium' as 'easy' | 'medium' | 'hard'
  }
})

const fetchQuota = async () => {
  if (!userStore.isAuthenticated) return

  try {
    const response = await aiApi.getQuota()
    if (response.data) {
      Object.assign(quotaInfo, response.data)
    }
  } catch (error) {
    console.error('获取配额失败:', error)
  }
}

const handleGenerate = async () => {
  if (!form.prompt.trim() || quotaInfo.remaining_quota <= 0) return

  isGenerating.value = true
  result.value = null

  try {
    const response = await aiApi.generate({
      prompt: form.prompt,
      config: form.config
    })

    if (response.code === 200 && response.data) {
      result.value = response.data
      quotaInfo.remaining_quota = response.data.remaining_quota
      ElMessage.success(`生成成功！剩余次数: ${response.data.remaining_quota}`)
    }
  } catch (error: any) {
    const message = error.response?.data?.message || '生成失败，请稍后重试'
    ElMessage.error(message)
  } finally {
    isGenerating.value = false
  }
}

const applyResult = () => {
  if (!result.value) return

  courseStore.importAIResult({
    obstacles: result.value.obstacles,
    path: result.value.path
  })

  dialogVisible.value = false
  ElMessage.success('已应用到画布')
}

const handlePurchase = () => {
  dialogVisible.value = false
  router.push('/profile')
}

const open = () => {
  dialogVisible.value = true
  result.value = null
  fetchQuota()
}

defineExpose({ open })
</script>

<style scoped lang="scss">
.quota-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  margin-bottom: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.ai-form {
  :deep(.el-form-item) {
    margin-bottom: 16px;
  }
}

.result-section {
  margin-top: 16px;
}

.result-card {
  .result-stats {
    display: flex;
    gap: 24px;
    margin-bottom: 16px;

    span {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #606266;
    }
  }

  .result-explanation, .teaching-notes {
    margin-top: 12px;

    h4 {
      margin-bottom: 8px;
      color: #303133;
      font-size: 14px;
    }

    p {
      color: #606266;
      line-height: 1.6;
      margin: 0;
    }
  }

  .teaching-notes {
    padding-top: 12px;
    border-top: 1px dashed #dcdfe6;

    h4 {
      color: #409eff;
    }
  }
}
</style>
