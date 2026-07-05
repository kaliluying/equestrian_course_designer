<template>
  <aside class="route-validation-panel floating-panel">
    <div class="panel-header">
      <div>
        <h3>规则检查</h3>
        <p>{{ validationSummary }}</p>
      </div>
      <div class="panel-actions">
        <el-button size="small" :loading="isGeneratingNotes" @click="generateCoachNotes">
          教练说明
        </el-button>
        <el-button size="small" :disabled="!hasFixableIssues" :loading="isFixing" @click="applyAutoFix">
          一键修复
        </el-button>
        <el-button size="small" type="primary" :loading="isChecking" @click="runValidation">
          重新检查
        </el-button>
      </div>
    </div>

    <div v-if="result" class="score-card" :class="scoreClass">
      <span class="score-label">路线评分</span>
      <strong>{{ result.score }}/10</strong>
      <el-tag size="small" :type="result.is_valid ? 'success' : 'danger'">
        {{ result.is_valid ? '可用' : '需处理' }}
      </el-tag>
    </div>

    <div v-if="result" class="filters">
      <el-radio-group v-model="activeFilter" size="small">
        <el-radio-button label="all">全部</el-radio-button>
        <el-radio-button label="error">严重</el-radio-button>
        <el-radio-button label="warning">提醒</el-radio-button>
        <el-radio-button label="selected">当前障碍</el-radio-button>
      </el-radio-group>
    </div>

    <div v-if="result" class="issue-groups">
      <section v-if="visibleIssues.length" class="issue-section">
        <h4>严重问题 {{ visibleIssues.length }}</h4>
        <button v-for="issue in visibleIssues" :key="issue.code + issue.message" class="issue-card issue-error" @click="focusIssue(issue)">
          <strong>{{ issue.message }}</strong>
          <span>{{ issue.suggested_action }}</span>
        </button>
      </section>

      <section v-if="visibleWarnings.length" class="issue-section">
        <h4>提醒 {{ visibleWarnings.length }}</h4>
        <button v-for="issue in visibleWarnings" :key="issue.code + issue.message" class="issue-card issue-warning" @click="focusIssue(issue)">
          <strong>{{ issue.message }}</strong>
          <span>{{ issue.suggested_action }}</span>
        </button>
      </section>

      <section v-if="result.auto_fixed.length" class="issue-section">
        <h4>自动优化 {{ result.auto_fixed.length }}</h4>
        <ul>
          <li v-for="item in result.auto_fixed" :key="item">{{ item }}</li>
        </ul>
      </section>

      <el-empty v-if="!visibleIssues.length && !visibleWarnings.length" description="未发现需要处理的问题" />
    </div>

    <el-empty v-else description="点击重新检查，获取路线专业建议" />
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { fixCourse, validateCourse, type RouteValidationIssue } from '@/api/design'
import { aiApi, type CoachNotesResponse } from '@/api/ai'
import { useCourseStore } from '@/stores/course'

const courseStore = useCourseStore()
const isChecking = ref(false)
const isFixing = ref(false)
const isGeneratingNotes = ref(false)
const coachNotes = ref<CoachNotesResponse | null>(null)
const activeFilter = ref<'all' | 'error' | 'warning' | 'selected'>('all')
const result = computed(() => courseStore.routeValidationResult)

const validationSummary = computed(() => result.value?.summary || '检查间距、边界和高度规则')
const allIssues = computed(() => result.value ? [...result.value.issues, ...result.value.warnings] : [])
const hasFixableIssues = computed(() => allIssues.value.some(issue => issue.auto_fixable))
const selectedObstacleId = computed(() => courseStore.selectedObstacle?.id || '')

const filterBySelection = (issue: RouteValidationIssue) => {
  if (activeFilter.value !== 'selected') return true
  return Boolean(selectedObstacleId.value && issue.obstacle_ids.includes(selectedObstacleId.value))
}

const visibleIssues = computed(() => {
  if (!result.value || activeFilter.value === 'warning') return []
  return result.value.issues.filter(filterBySelection)
})

const visibleWarnings = computed(() => {
  if (!result.value || activeFilter.value === 'error') return []
  return result.value.warnings.filter(filterBySelection)
})

const scoreClass = computed(() => {
  if (!result.value) return ''
  if (result.value.score >= 8) return 'score-good'
  if (result.value.score >= 6) return 'score-warning'
  return 'score-danger'
})

const currentValidationPayload = () => ({
  obstacles: courseStore.currentCourse.obstacles,
  field_width: courseStore.currentCourse.fieldWidth,
  field_height: courseStore.currentCourse.fieldHeight,
  difficulty: 'medium' as const,
  path: {
    visible: courseStore.coursePath.visible,
    points: courseStore.coursePath.points,
    startPoint: courseStore.startPoint,
    endPoint: courseStore.endPoint,
  },
})

const runValidation = async () => {
  isChecking.value = true
  try {
    const validation = await validateCourse(currentValidationPayload())
    courseStore.setValidationResult(validation)
    ElMessage.success('路线规则检查完成')
  } catch (error) {
    console.error('路线规则检查失败:', error)
    ElMessage.error('路线规则检查失败，请稍后重试')
  } finally {
    isChecking.value = false
  }
}

const applyAutoFix = async () => {
  if (!hasFixableIssues.value) return
  try {
    await ElMessageBox.confirm('将自动调整可修复的障碍位置、高度或组合间距。是否继续？', '应用自动修复', {
      confirmButtonText: '应用修复',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  isFixing.value = true
  try {
    const fixed = await fixCourse(currentValidationPayload())
    courseStore.applyRouteFix(fixed.updated_obstacles, fixed.updated_path)
    courseStore.setValidationResult(fixed.validation)
    ElMessage.success(fixed.explanation || '自动修复完成')
  } catch (error) {
    console.error('自动修复失败:', error)
    ElMessage.error('自动修复失败，请稍后重试')
  } finally {
    isFixing.value = false
  }
}

const generateCoachNotes = async () => {
  isGeneratingNotes.value = true
  try {
    const response = await aiApi.coachNotes({
      course: {
        obstacles: courseStore.currentCourse.obstacles as never,
        field_width: courseStore.currentCourse.fieldWidth,
        field_height: courseStore.currentCourse.fieldHeight,
      },
      validation: result.value,
    })
    if (!response.data) {
      throw new Error('未返回教练说明')
    }
    const notes = response.data
    coachNotes.value = notes
    ElMessageBox.alert(
      [
        `训练目标：${notes.training_goals.join('；')}`,
        `节奏建议：${notes.rhythm_advice.join('；')}`,
        `常见错误：${notes.common_mistakes.join('；')}`,
        `教练口令：${notes.coach_commands.join('；')}`,
        `风险重点：${notes.risk_focus.join('；')}`,
      ].join('\n\n'),
      '教练说明',
    )
  } catch (error) {
    console.error('生成教练说明失败:', error)
    ElMessage.error('生成教练说明失败')
  } finally {
    isGeneratingNotes.value = false
  }
}

const focusIssue = (issue: RouteValidationIssue) => {
  courseStore.highlightValidationIssue(issue)
}
</script>

<style scoped>
.route-validation-panel {
  position: absolute;
  right: 24px;
  bottom: 24px;
  z-index: 20;
  width: 380px;
  max-height: 55vh;
  overflow: auto;
  padding: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-light);
  border-radius: 14px;
  box-shadow: var(--el-box-shadow-light);
}
.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}
.panel-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.panel-header h3 {
  margin: 0 0 4px;
}
.panel-header p {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.score-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 14px 0;
  padding: 12px;
  border-radius: 10px;
  background: var(--el-fill-color-light);
}
.score-card strong {
  font-size: 22px;
}
.filters {
  margin-bottom: 10px;
}
.score-good strong { color: var(--el-color-success); }
.score-warning strong { color: var(--el-color-warning); }
.score-danger strong { color: var(--el-color-danger); }
.issue-section h4 {
  margin: 14px 0 8px;
}
.issue-card {
  display: block;
  width: 100%;
  margin-bottom: 8px;
  padding: 10px;
  text-align: left;
  border: 1px solid var(--el-border-color-light);
  border-left-width: 4px;
  border-radius: 8px;
  background: var(--el-bg-color-page);
  cursor: pointer;
}
.issue-card strong,
.issue-card span {
  display: block;
}
.issue-card span {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.issue-error { border-left-color: var(--el-color-danger); }
.issue-warning { border-left-color: var(--el-color-warning); }
</style>
