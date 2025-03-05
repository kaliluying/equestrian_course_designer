<template>
  <div class="my-designs-container">
    <div class="header-section">
      <h1 class="title">我的路线设计</h1>
      <p class="subtitle">管理和编辑您创建的所有设计</p>

      <!-- 页面导航链接 -->
      <div class="page-navigation">
        <router-link to="/" class="nav-btn">
          <el-icon>
            <HomeFilled />
          </el-icon> 返回首页
        </router-link>
        <router-link to="/shared-designs" class="nav-btn">
          <el-icon>
            <Share />
          </el-icon> 浏览共享设计
        </router-link>
      </div>
    </div>

    <div v-if="loading" class="loading-container">
      <el-skeleton :rows="5" animated />
    </div>

    <div v-else-if="designs.length === 0" class="empty-container">
      <el-empty description="您还没有创建任何设计" :image-size="200">
        <template #description>
          <p class="empty-text">您的设计列表为空</p>
          <p class="empty-hint">返回首页创建您的第一个设计吧！</p>
        </template>
      </el-empty>
    </div>

    <div v-else class="designs-grid">
      <el-card v-for="design in designs" :key="design.id" class="design-card" shadow="hover">
        <div class="design-image">
          <img :src="design.image" :alt="design.title" @click.stop="previewImage(design)"
            class="design-preview-image" />
        </div>
        <div class="design-info">
          <h3 class="design-title">{{ design.title }}</h3>

          <div class="author-info">
            <el-avatar :size="24" class="author-avatar">{{ userStore.currentUser?.username.charAt(0) }}</el-avatar>
            <span class="author-name">{{ userStore.currentUser?.username }}</span>
          </div>

          <p class="design-description" v-if="design.description">{{ design.description }}</p>

          <div class="design-meta">
            <span class="create-time">
              <el-icon>
                <Clock />
              </el-icon>
              创建于 {{ formatDate(design.create_time) }}
            </span>
            <span class="update-time">
              <el-icon>
                <Timer />
              </el-icon>
              更新于 {{ formatDate(design.update_time) }}
            </span>
          </div>

          <div class="design-stats">
            <span class="stat-item">
              <el-icon>
                <Star />
              </el-icon>
              {{ design.likes_count }} 点赞
            </span>
            <span class="stat-item">
              <el-icon>
                <Download />
              </el-icon>
              {{ design.downloads_count }} 下载
            </span>
          </div>

          <div class="action-buttons">
            <el-button type="primary" @click="openDesign(design)">
              编辑
            </el-button>
            <el-button :type="design.is_shared ? 'success' : 'info'" @click="toggleShare(design)">
              {{ design.is_shared ? '取消分享' : '分享' }}
            </el-button>
            <el-button type="danger" @click="confirmDelete(design)">
              删除
            </el-button>
          </div>
        </div>
      </el-card>
    </div>

    <el-pagination v-if="totalItems > 0" background layout="prev, pager, next" :total="totalItems" :page-size="pageSize"
      :current-page="currentPage" @current-change="handlePageChange" class="pagination" />

    <!-- 图片预览组件 -->
    <ImagePreview v-model:visible="previewVisible" :image-url="previewImageUrl" :image-alt="previewImageAlt"
      :title="previewImageTitle" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getUserDesigns, deleteDesign, toggleDesignSharing } from '@/api/design'
import type { DesignResponse } from '@/types/design'
import { useUserStore } from '@/stores/user'
import { useCourseStore } from '@/stores/course'
import { Star, Download, HomeFilled, Share, Clock, Timer } from '@element-plus/icons-vue'
import ImagePreview from '@/components/ImagePreview.vue'
import { v4 as uuidv4 } from 'uuid'

// 状态
const designs = ref<DesignResponse[]>([])
const loading = ref(true)
const currentPage = ref(1)
const totalItems = ref(0)
const pageSize = ref(9) // 每页显示9条记录
const router = useRouter()
const userStore = useUserStore()
const courseStore = useCourseStore()

// 图片预览状态
const previewVisible = ref(false)
const previewImageUrl = ref('')
const previewImageAlt = ref('')
const previewImageTitle = ref('')

// 预览图片
const previewImage = (design: DesignResponse) => {
  previewImageUrl.value = design.image
  previewImageAlt.value = design.title
  previewImageTitle.value = design.title
  previewVisible.value = true
}

// 获取用户的设计列表
const fetchUserDesigns = async () => {
  loading.value = true
  try {
    const response = await getUserDesigns(currentPage.value)
    designs.value = response.results
    totalItems.value = response.count
  } catch (error) {
    console.error('获取我的设计列表失败:', error)
    ElMessage.error('获取我的设计列表失败')
  } finally {
    loading.value = false
  }
}

// 格式化日期
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 打开设计
const openDesign = async (design: DesignResponse) => {
  try {
    console.log('打开我的设计:', design)
    console.log('设计ID:', design.id)

    // 添加用户反馈
    ElMessage.info('正在加载设计...')

    // 获取设计文件内容
    const response = await fetch(design.download)
    if (!response.ok) {
      throw new Error(`HTTP错误，状态码: ${response.status}`)
    }

    // 尝试解析JSON
    let designData
    try {
      const responseText = await response.text()
      console.log('响应文本(前200字符):', responseText.substring(0, 200) + '...')
      designData = JSON.parse(responseText)
    } catch (parseError) {
      console.error('JSON解析错误:', parseError)
      throw new Error('设计数据格式错误，无法解析')
    }

    console.log('获取到的设计数据:', designData)

    // 检查数据格式是否符合要求
    if (!designData || typeof designData !== 'object') {
      throw new Error('设计数据无效')
    }

    // 加载设计到课程存储 - 将JSON对象转换为CourseDesign类型
    try {
      // 确保数据中包含所有必要的字段
      const courseData = {
        id: designData.id || design.id.toString() || uuidv4(),
        name: designData.name || design.title || '未命名设计',
        obstacles: Array.isArray(designData.obstacles) ? designData.obstacles : [],
        createdAt: designData.createdAt || design.create_time || new Date().toISOString(),
        updatedAt: designData.updatedAt || design.update_time || new Date().toISOString(),
        fieldWidth: designData.fieldWidth || 80,
        fieldHeight: designData.fieldHeight || 60
      }

      console.log('处理后的课程数据:', courseData)

      // 将处理后的数据加载到课程存储
      courseStore.currentCourse = courseData

      // 导航到主页
      router.push('/')
      ElMessage.success(`已加载设计: ${design.title}`)
    } catch (loadError) {
      console.error('加载课程数据错误:', loadError)
      throw new Error('加载设计数据到系统失败')
    }
  } catch (error) {
    console.error('打开设计失败:', error)
    ElMessage.error(`打开设计失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 切换分享状态
const toggleShare = async (design: DesignResponse) => {
  try {
    const response = await toggleDesignSharing(design.id)
    design.is_shared = response.is_shared
    ElMessage.success(response.is_shared ? '设计已分享' : '设计已取消分享')
  } catch (error) {
    console.error('切换分享状态失败:', error)
    ElMessage.error('切换分享状态失败')
  }
}

// 确认删除
const confirmDelete = (design: DesignResponse) => {
  ElMessageBox.confirm(
    '确定要删除这个设计吗？此操作不可恢复。',
    '删除确认',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }
  )
    .then(() => {
      handleDelete(design)
    })
    .catch(() => {
      ElMessage({
        type: 'info',
        message: '已取消删除',
      })
    })
}

// 处理删除
const handleDelete = async (design: DesignResponse) => {
  try {
    await deleteDesign(design.id)
    // 从列表中移除
    designs.value = designs.value.filter(d => d.id !== design.id)
    ElMessage.success('设计已删除')
  } catch (error) {
    console.error('删除设计失败:', error)
    ElMessage.error('删除设计失败')
  }
}

// 处理页码变化
const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchUserDesigns()
}

// 组件挂载时获取数据
onMounted(() => {
  // 检查用户是否登录
  if (!userStore.isAuthenticated) {
    ElMessage.warning('请先登录后查看我的设计')
    router.push('/')
    return
  }

  fetchUserDesigns()
})
</script>

<style scoped>
.my-designs-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 30px 20px;
}

.header-section {
  text-align: center;
  margin-bottom: 40px;
}

.title {
  font-size: 32px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.subtitle {
  font-size: 16px;
  color: #606266;
  margin-bottom: 24px;
}

/* 页面导航样式 */
.page-navigation {
  display: flex;
  justify-content: center;
  gap: 20px;
  margin-bottom: 10px;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: #409EFF;
  padding: 10px 20px;
  border-radius: 6px;
  transition: all 0.3s;
  border: 1px solid #DCDFE6;
  background-color: #fff;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.nav-btn:hover {
  color: #1890ff;
  background-color: #f0f5ff;
  border-color: #b3d8ff;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.loading-container {
  padding: 40px;
  background-color: #fff;
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
}

.empty-container {
  margin: 60px 0;
  text-align: center;
}

.empty-text {
  font-size: 18px;
  color: #606266;
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
  color: #909399;
}

.designs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 30px;
  margin-bottom: 40px;
}

.design-card {
  border-radius: 8px;
  overflow: hidden;
  transition: transform 0.3s, box-shadow 0.3s;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #fff;
  border: none;
}

.design-card:hover {
  transform: translateY(-8px);
  box-shadow: 0 15px 30px rgba(0, 0, 0, 0.15);
}

.design-image {
  height: 200px;
  overflow: hidden;
  position: relative;
  cursor: pointer;
}

.design-preview-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s;
  cursor: zoom-in;
}

.design-card:hover .design-image img {
  transform: scale(1.05);
}

.design-info {
  padding: 20px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.design-title {
  margin: 0 0 16px;
  font-size: 20px;
  font-weight: 600;
  color: #303133;
  line-height: 1.4;
}

.author-info {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.author-avatar {
  background: linear-gradient(135deg, #1890ff 0%, #4e6ef2 100%);
  color: white;
  font-weight: bold;
  margin-right: 8px;
}

.author-name {
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.design-description {
  margin: 0 0 16px;
  font-size: 14px;
  color: #606266;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  line-height: 1.6;
}

.design-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.create-time,
.update-time {
  font-size: 13px;
  color: #909399;
  display: flex;
  align-items: center;
  gap: 4px;
}

.design-stats {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  color: #606266;
}

.action-buttons {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: auto;
}

.pagination {
  margin-top: 30px;
  text-align: center;
  width: 100%;
  display: flex;
  justify-content: center;
}
</style>
