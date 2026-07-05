<template>
  <aside class="design-version-history floating-panel">
    <div class="history-header">
      <div>
        <h3>版本历史</h3>
        <p>{{ currentDesignId ? '查看、备注、恢复或复制历史版本' : '保存设计后可查看版本' }}</p>
      </div>
      <el-button size="small" :disabled="!currentDesignId" :loading="loading" @click="loadVersions">刷新</el-button>
    </div>

    <el-empty v-if="!currentDesignId" description="当前设计尚未保存" />
    <el-empty v-else-if="!loading && versions.length === 0" description="暂无版本记录" />

    <div v-else class="version-list">
      <div v-for="version in versions" :key="version.id" class="version-item">
        <div class="version-main">
          <strong>v{{ version.version_number }} · {{ sourceLabel(version.source) }}</strong>
          <p>{{ version.title }} · {{ formatTime(version.created_at) }}</p>
          <p v-if="version.remark" class="version-remark">备注：{{ version.remark }}</p>
          <p class="version-diff">{{ compareSummary(version) }}</p>
        </div>
        <div class="version-actions">
          <el-button size="small" @click="previewVersion(version)">预览</el-button>
          <el-button size="small" @click="editVersion(version)">备注</el-button>
          <el-button size="small" type="primary" @click="restoreVersion(version)">恢复</el-button>
          <el-button size="small" @click="copyVersion(version)">复制</el-button>
        </div>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  copyDesignVersion,
  getDesignVersions,
  restoreDesignVersion,
  updateDesignVersion,
  type DesignVersion,
} from '@/api/design'
import { useCourseStore } from '@/stores/course'

const courseStore = useCourseStore()
const versions = ref<DesignVersion[]>([])
const loading = ref(false)

const currentDesignId = computed(() => {
  const raw = localStorage.getItem('design_id_to_update')
  const id = raw ? Number(raw) : NaN
  return Number.isFinite(id) ? id : null
})

const sourceLabel = (source: DesignVersion['source']) => {
  const labels: Record<DesignVersion['source'], string> = {
    manual: '手动保存',
    autosave: '自动保存',
    ai: 'AI生成',
    restore: '版本恢复',
  }
  return labels[source]
}

const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN')

const loadVersions = async () => {
  if (!currentDesignId.value) return
  loading.value = true
  try {
    versions.value = await getDesignVersions(currentDesignId.value)
  } catch (error) {
    console.error('加载版本历史失败:', error)
    ElMessage.error('加载版本历史失败')
  } finally {
    loading.value = false
  }
}

const getObstacleCount = (data: Record<string, unknown>) => {
  const obstacles = (data as { obstacles?: unknown[] }).obstacles
  return Array.isArray(obstacles) ? obstacles.length : 0
}

const compareSummary = (version: DesignVersion) => {
  const currentCount = courseStore.currentCourse.obstacles.length
  const versionCount = getObstacleCount(version.course_data)
  const delta = versionCount - currentCount
  const deltaText = delta === 0 ? '障碍数量无变化' : `障碍数量${delta > 0 ? '+' : ''}${delta}`
  const titleText = version.title === courseStore.currentCourse.name ? '标题相同' : '标题不同'
  return `${deltaText} · ${titleText}`
}

const previewVersion = (version: DesignVersion) => {
  const obstacleCount = getObstacleCount(version.course_data)
  const summary = [
    `标题：${version.title}`,
    `来源：${sourceLabel(version.source)}`,
    `障碍数量：${obstacleCount}`,
    `备注：${version.remark || '无'}`,
    '',
    '路线数据预览：',
    JSON.stringify(version.course_data, null, 2),
  ].join('\n')
  ElMessageBox.alert(`<pre class="version-preview-pre">${summary}</pre>`, `v${version.version_number} 预览`, {
    dangerouslyUseHTMLString: true,
    customClass: 'version-preview-dialog',
  })
}

const editVersion = async (version: DesignVersion) => {
  if (!currentDesignId.value) return
  const titleResult = await ElMessageBox.prompt('请输入版本名称', '编辑版本名称', {
    inputValue: version.title,
    confirmButtonText: '下一步',
    cancelButtonText: '取消',
  }).catch(() => null)
  if (!titleResult) return

  const remarkResult = await ElMessageBox.prompt('请输入版本备注', '编辑版本备注', {
    inputValue: version.remark || '',
    confirmButtonText: '保存',
    cancelButtonText: '取消',
  }).catch(() => null)
  if (!remarkResult) return

  await updateDesignVersion(currentDesignId.value, version.id, {
    title: titleResult.value,
    remark: remarkResult.value,
  })
  ElMessage.success('版本备注已保存')
  await loadVersions()
}

const restoreVersion = async (version: DesignVersion) => {
  if (!currentDesignId.value) return
  try {
    await ElMessageBox.confirm(
      `将把当前设计恢复到 v${version.version_number}，系统会自动创建一个 restore 版本。是否继续？`,
      '确认恢复版本',
      { confirmButtonText: '恢复', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  await restoreDesignVersion(currentDesignId.value, version.id)
  ElMessage.success('版本已恢复，并已创建 restore 版本')
  await loadVersions()
}

const copyVersion = async (version: DesignVersion) => {
  if (!currentDesignId.value) return
  const copied = await copyDesignVersion(currentDesignId.value, version.id)
  localStorage.setItem('design_id_to_update', String(copied.id))
  ElMessage.success('已复制为新设计，当前编辑目标已切换到副本')
  await loadVersions()
}

onMounted(loadVersions)
</script>

<style scoped>
.design-version-history {
  position: absolute;
  left: 24px;
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
.history-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}
.history-header h3,
.history-header p {
  margin: 0;
}
.history-header p,
.version-diff,
.version-remark {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.version-item {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.version-main p {
  margin: 4px 0 0;
}
.version-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
  min-width: 132px;
}
:global(.version-preview-pre) {
  max-height: 420px;
  overflow: auto;
  text-align: left;
  white-space: pre-wrap;
}
</style>
