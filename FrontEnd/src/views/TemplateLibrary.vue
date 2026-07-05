<template>
  <div class="template-library-page">
    <el-card>
      <template #header>
        <div class="page-header">
          <div>
            <h2>路线模板库</h2>
            <p>浏览官方模板和公开用户模板，一键复制为新设计。</p>
          </div>
          <el-button type="primary" @click="loadTemplates">刷新</el-button>
        </div>
      </template>

      <el-form class="filters" inline>
        <el-form-item label="难度">
          <el-select v-model="filters.difficulty" clearable placeholder="全部难度" style="width: 140px" @change="loadTemplates">
            <el-option label="初级" value="easy" />
            <el-option label="中级" value="medium" />
            <el-option label="高级" value="hard" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序">
          <el-select v-model="filters.ordering" placeholder="热门优先" style="width: 140px" @change="loadTemplates">
            <el-option label="热门优先" value="popular" />
            <el-option label="最新发布" value="latest" />
          </el-select>
        </el-form-item>
        <el-form-item label="搜索">
          <el-input v-model="filters.search" clearable placeholder="模板标题或描述" @keyup.enter="loadTemplates" />
        </el-form-item>
      </el-form>

      <el-skeleton v-if="loading" :rows="6" animated />
      <el-empty v-else-if="templates.length === 0" description="暂无模板" />
      <div v-else class="template-grid">
        <el-card v-for="template in templates" :key="template.id" class="template-card" shadow="hover">
          <div class="template-cover">
            <span v-if="template.is_official" class="official-badge">官方</span>
            <strong>{{ template.title }}</strong>
            <small>{{ template.field_width }}m × {{ template.field_height }}m · {{ template.obstacle_count }} 道障碍</small>
          </div>
          <p class="description">{{ template.description || '暂无描述' }}</p>
          <div class="meta-row">
            <el-tag size="small" :type="difficultyType(template.difficulty)">{{ difficultyLabel(template.difficulty) }}</el-tag>
            <span>复制 {{ template.copy_count }}</span>
            <span>收藏 {{ template.favorite_count }}</span>
          </div>
          <div class="actions">
            <el-button size="small" @click="toggleFavorite(template)">
              {{ template.is_favorited ? '取消收藏' : '收藏' }}
            </el-button>
            <el-button size="small" type="primary" @click="copyTemplate(template)">复制为设计</el-button>
          </div>
        </el-card>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import {
  createDesignFromTemplate,
  favoriteCourseTemplate,
  getCourseTemplates,
  type CourseTemplate,
} from '@/api/template'

const router = useRouter()
const loading = ref(false)
const templates = ref<CourseTemplate[]>([])
const filters = reactive({
  difficulty: '',
  ordering: 'popular' as 'popular' | 'latest',
  search: '',
})

const normalizeTemplates = (response: CourseTemplate[] | { results: CourseTemplate[] }) => {
  return Array.isArray(response) ? response : response.results
}

const loadTemplates = async () => {
  loading.value = true
  try {
    templates.value = normalizeTemplates(await getCourseTemplates(filters))
  } catch (error) {
    console.error('加载模板失败:', error)
    ElMessage.error('加载模板失败')
  } finally {
    loading.value = false
  }
}

const difficultyLabel = (difficulty: CourseTemplate['difficulty']) => ({
  easy: '初级',
  medium: '中级',
  hard: '高级',
}[difficulty])

const difficultyType = (difficulty: CourseTemplate['difficulty']): 'success' | 'warning' | 'danger' => {
  const types: Record<CourseTemplate['difficulty'], 'success' | 'warning' | 'danger'> = {
    easy: 'success',
    medium: 'warning',
    hard: 'danger',
  }
  return types[difficulty]
}

const toggleFavorite = async (template: CourseTemplate) => {
  const result = await favoriteCourseTemplate(template.id)
  template.is_favorited = result.is_favorited
  template.favorite_count = result.favorite_count
}

const copyTemplate = async (template: CourseTemplate) => {
  const design = await createDesignFromTemplate(template.id)
  localStorage.setItem('design_id_to_update', String(design.id))
  ElMessage.success('已从模板创建新设计')
  await router.push('/')
}

onMounted(loadTemplates)
</script>

<style scoped>
.template-library-page {
  padding: 24px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.page-header h2,
.page-header p {
  margin: 0;
}
.page-header p,
.description,
.meta-row {
  color: var(--el-text-color-secondary);
}
.filters {
  margin-bottom: 20px;
}
.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
.template-cover {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: end;
  min-height: 120px;
  padding: 16px;
  border-radius: 12px;
  background: linear-gradient(135deg, #e8f3ff, #f7efe5);
}
.official-badge {
  position: absolute;
  top: 10px;
  right: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #1d4ed8;
  color: white;
  font-size: 12px;
}
.meta-row,
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}
.actions {
  justify-content: flex-end;
}
</style>
