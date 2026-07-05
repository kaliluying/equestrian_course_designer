<template>
  <aside class="design-version-history floating-panel">
    <div class="history-header">
      <div>
        <h3>版本历史</h3>
        <p>{{ currentDesignId ? '查看、恢复或复制历史版本' : '保存设计后可查看版本' }}</p>
      </div>
      <el-button size="small" :disabled="!currentDesignId" :loading="loading" @click="loadVersions">刷新</el-button>
    </div>

    <el-empty v-if="!currentDesignId" description="当前设计尚未保存" />
    <el-empty v-else-if="!loading && versions.length === 0" description="暂无版本记录" />

    <div v-else class="version-list">
      <div v-for="version in versions" :key="version.id" class="version-item">
        <div>
          <strong>v{{ version.version_number }} · {{ sourceLabel(version.source) }}</strong>
          <p>{{ version.title }} · {{ formatTime(version.created_at) }}</p>
        </div>
        <div class="version-actions">
          <el-button size="small" @click="previewVersion(version)">预览</el-button>
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
import { copyDesignVersion, getDesignVersions, restoreDesignVersion, type DesignVersion } from '@/api/design'

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

const previewVersion = (version: DesignVersion) => {
  ElMessageBox.alert(JSON.stringify(version.course_data, null, 2), `v${version.version_number} 预览`, {
    customClass: 'version-preview-dialog',
  })
}

const restoreVersion = async (version: DesignVersion) => {
  if (!currentDesignId.value) return
  await restoreDesignVersion(currentDesignId.value, version.id)
  ElMessage.success('版本已恢复，请刷新或重新打开设计查看')
  await loadVersions()
}

const copyVersion = async (version: DesignVersion) => {
  if (!currentDesignId.value) return
  const copied = await copyDesignVersion(currentDesignId.value, version.id)
  localStorage.setItem('design_id_to_update', String(copied.id))
  ElMessage.success('已复制为新设计')
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
  width: 360px;
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
.history-header p {
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
.version-item p {
  margin: 4px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.version-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}
</style>
