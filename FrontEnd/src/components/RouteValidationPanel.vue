<template>
  <aside class="route-validation-panel floating-panel">
    <div class="panel-header">
      <div>
        <h3>规则检查</h3>
        <p>{{ validationSummary }}</p>
      </div>
      <el-button size="small" type="primary" :loading="isChecking" @click="runValidation">
        重新检查
      </el-button>
    </div>

    <div v-if="result" class="score-card" :class="scoreClass">
      <span class="score-label">路线评分</span>
      <strong>{{ result.score }}/10</strong>
      <el-tag size="small" :type="result.is_valid ? 'success' : 'danger'">
        {{ result.is_valid ? '可用' : '需处理' }}
      </el-tag>
    </div>

    <div v-if="result" class="issue-groups">
      <section v-if="result.issues.length" class="issue-section">
        <h4>严重问题 {{ result.issues.length }}</h4>
        <button v-for="issue in result.issues" :key="issue.code + issue.message" class="issue-card issue-error" @click="focusIssue(issue)">
          <strong>{{ issue.message }}</strong>
          <span>{{ issue.suggested_action }}</span>
        </button>
      </section>

      <section v-if="result.warnings.length" class="issue-section">
        <h4>提醒 {{ result.warnings.length }}</h4>
        <button v-for="issue in result.warnings" :key="issue.code + issue.message" class="issue-card issue-warning" @click="focusIssue(issue)">
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

      <el-empty v-if="!result.issues.length && !result.warnings.length" description="未发现需要处理的问题" />
    </div>

    <el-empty v-else description="点击重新检查，获取路线专业建议" />
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { validateCourse, type RouteValidationIssue } from '@/api/design'
import { useCourseStore } from '@/stores/course'

const courseStore = useCourseStore()
const isChecking = ref(false)
const result = computed(() => courseStore.routeValidationResult)

const validationSummary = computed(() => result.value?.summary || '检查间距、边界和高度规则')
const scoreClass = computed(() => {
  if (!result.value) return ''
  if (result.value.score >= 8) return 'score-good'
  if (result.value.score >= 6) return 'score-warning'
  return 'score-danger'
})

const runValidation = async () => {
  isChecking.value = true
  try {
    const validation = await validateCourse({
      obstacles: courseStore.currentCourse.obstacles,
      field_width: courseStore.currentCourse.fieldWidth,
      field_height: courseStore.currentCourse.fieldHeight,
      difficulty: 'medium',
    })
    courseStore.setValidationResult(validation)
    ElMessage.success('路线规则检查完成')
  } catch (error) {
    console.error('路线规则检查失败:', error)
    ElMessage.error('路线规则检查失败，请稍后重试')
  } finally {
    isChecking.value = false
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
  width: 360px;
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
