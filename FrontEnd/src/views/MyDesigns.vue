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
            <el-button type="info" @click="handleDownload(design)">
              下载
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

    <!-- 添加下载对话框 -->
    <el-dialog v-model="downloadDialogVisible" title="下载设计" width="400px" destroy-on-close>
      <div class="dialog-content">
        <p class="dialog-description">请选择您想要下载的文件格式：</p>
        <el-select v-model="selectedDownloadType" placeholder="选择文件类型" style="width: 100%">
          <el-option v-for="option in downloadTypeOptions" :key="option.value" :label="option.label"
            :value="option.value" />
        </el-select>
        <div class="format-description" v-if="selectedDownloadType === 'json'">
          <el-icon>
            <Document />
          </el-icon>
          <span>JSON格式包含完整的设计数据，可用于编辑和重新加载</span>
        </div>
        <div class="format-description" v-else-if="selectedDownloadType === 'png'">
          <el-icon>
            <Picture />
          </el-icon>
          <span>PNG格式为高质量图片，适合打印或分享</span>
        </div>
        <div class="format-description" v-else-if="selectedDownloadType === 'pdf'">
          <el-icon>
            <Tickets />
          </el-icon>
          <span>PDF格式包含详细说明，适合正式文档和打印</span>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="downloadDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmDownload">下载</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getUserDesigns, deleteDesign, toggleDesignSharing, downloadDesign } from '@/api/design'
import type { DesignResponse } from '@/types/design'
import { useUserStore } from '@/stores/user'
import { useCourseStore } from '@/stores/course'
import { Star, Download, HomeFilled, Share, Clock, Timer, Document, Picture, Tickets } from '@element-plus/icons-vue'
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

// 下载相关状态
const downloadDialogVisible = ref(false)
const selectedDownloadType = ref('json')
const currentDesign = ref<DesignResponse | null>(null)

// 下载类型选项
const downloadTypeOptions = [
  { label: 'JSON格式 (设计数据)', value: 'json' },
  { label: 'PNG格式 (设计图片)', value: 'png' },
  { label: 'PDF格式 (设计文档)', value: 'pdf' }
]

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
      // 处理视口信息
      const viewportInfo = designData.viewportInfo || {
        width: window.innerWidth,
        height: window.innerHeight,
        canvasWidth: 800,
        canvasHeight: 600,
        aspectRatio: (designData.fieldWidth || 80) / (designData.fieldHeight || 60)
      }

      // 确保数据中包含所有必要的字段
      const courseData = {
        id: designData.id || design.id.toString() || uuidv4(),
        name: designData.name || design.title || '未命名设计',
        obstacles: Array.isArray(designData.obstacles) ? designData.obstacles : [],
        createdAt: designData.createdAt || design.create_time || new Date().toISOString(),
        updatedAt: designData.updatedAt || design.update_time || new Date().toISOString(),
        fieldWidth: designData.fieldWidth || 80,
        fieldHeight: designData.fieldHeight || 60,
        viewportInfo // 添加视口信息用于屏幕适配
      }

      console.log('处理后的课程数据:', courseData)
      console.log('视口信息:', viewportInfo)

      // 将处理后的数据加载到课程存储
      courseStore.currentCourse = courseData

      // 加载路径数据(如果存在)
      if (designData.path) {
        console.log('发现路径数据，正在加载，路径点数量:', designData.path.points?.length || 0)

        // 更新路径数据
        courseStore.coursePath = {
          visible: designData.path.visible || false,
          points: Array.isArray(designData.path.points) ? designData.path.points : []
        }

        // 更新起点数据
        if (designData.path.startPoint) {
          courseStore.startPoint = {
            x: designData.path.startPoint.x || 0,
            y: designData.path.startPoint.y || 0,
            rotation: designData.path.startPoint.rotation || 270
          }
        }

        // 更新终点数据
        if (designData.path.endPoint) {
          courseStore.endPoint = {
            x: designData.path.endPoint.x || 0,
            y: designData.path.endPoint.y || 0,
            rotation: designData.path.endPoint.rotation || 270
          }
        }
      } else {
        console.log('未找到路径数据')
      }

      // 导航到主页
      router.push('/')
      ElMessage.success(`已加载设计: ${design.title}`)
      // 保存设计ID到本地存储
      localStorage.setItem('design_id_to_update', design.id.toString())
      // 设置标记，表示是从"我的设计"页面进入的编辑模式
      localStorage.setItem('from_my_designs', 'true')
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

// 处理下载按钮点击
const handleDownload = async (design: DesignResponse) => {
  currentDesign.value = design
  selectedDownloadType.value = 'json'
  downloadDialogVisible.value = true
}

// 确认下载
const confirmDownload = async () => {
  if (!currentDesign.value) return

  try {
    ElMessage.info('正在准备下载...')

    const response = await downloadDesign(
      currentDesign.value.id,
      selectedDownloadType.value as 'json' | 'png' | 'pdf'
    )

    // 更新下载计数
    if (currentDesign.value) {
      currentDesign.value.downloads_count = response.downloads_count
    }

    // 检查下载URL
    if (!response.download_url) {
      throw new Error('服务器未返回有效的下载链接')
    }

    // 创建下载链接并触发下载
    const link = document.createElement('a')
    link.href = response.download_url
    link.download = response.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    ElMessage.success('下载成功')
    downloadDialogVisible.value = false
  } catch (error) {
    console.error('下载失败:', error)
    ElMessage.error(`下载失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
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

<style scoped lang="scss">
.my-designs-container {
  max-width: 100%;
  margin: 0 auto;
  padding: 40px 24px;

  @media (min-width: 992px) {
    max-width: 1200px;
  }
}

.header-section {
  text-align: center;
  margin-bottom: 40px;
  position: relative;
  padding-bottom: 20px;

  &:after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 60px;
    height: 3px;
    background: linear-gradient(90deg, var(--primary-color), var(--accent-color));
    border-radius: 3px;
  }
}

.title {
  font-size: 32px;
  font-weight: 700;
  color: var(--text-color);
  margin-bottom: 12px;
  letter-spacing: -0.5px;
}

.subtitle {
  font-size: 16px;
  color: var(--text-light);
  margin-bottom: 28px;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

/* 页面导航样式 */
.page-navigation {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-bottom: 16px;
  margin-top: 24px;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
  color: var(--primary-color);
  padding: 10px 20px;
  border-radius: var(--radius);
  transition: var(--transition);
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  font-weight: 500;
  box-shadow: var(--shadow-sm);
}

.nav-btn:hover {
  color: var(--primary-dark);
  background-color: var(--primary-light);
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.empty-container {
  margin: 40px 0;
  padding: 40px;
  background-color: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.empty-text {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 8px;
}

.empty-hint {
  font-size: 14px;
  color: var(--text-light);
}

.designs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
  margin-top: 32px;
}

.design-card {
  border-radius: var(--radius);
  overflow: hidden;
  transition: var(--transition);
  height: 100%;
  display: flex;
  flex-direction: column;
  border: none;
  box-shadow: var(--shadow-sm);

  &:hover {
    transform: translateY(-5px);
    box-shadow: var(--shadow);
  }
}

.design-image {
  height: 200px;
  overflow: hidden;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f8f9fa;
  padding: 8px;

  @media (max-width: 768px) {
    height: 160px;
  }

  @media (max-width: 480px) {
    height: 140px;
  }

  &:before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 100%;
    background: linear-gradient(to bottom, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, 0.1) 100%);
    z-index: 1;
    pointer-events: none;
  }
}

.design-preview-image {
  width: auto;
  height: auto;
  object-fit: contain;
  max-height: 100%;
  max-width: 100%;
  transition: transform 0.5s ease;
  cursor: pointer;

  &:hover {
    transform: scale(1.05);
  }

  @media (max-width: 768px) {
    max-height: 160px;
  }

  @media (max-width: 480px) {
    max-height: 140px;
  }
}

.design-info {
  padding: 16px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
}

.design-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin-top: 0;
  margin-bottom: 12px;
  line-height: 1.4;
}

.author-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.author-avatar {
  background: linear-gradient(135deg, #1890ff 0%, #4e6ef2 100%);
  color: white;
  font-weight: bold;
  margin-right: 8px;
}

.author-name {
  font-size: 14px;
  color: var(--text-light);
}

.design-description {
  font-size: 14px;
  color: var(--text-light);
  margin-bottom: 12px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex-grow: 1;
}

.design-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.design-date {
  font-size: 12px;
  color: var(--text-light);
}

.card-actions {
  display: flex;
  gap: 20px;
  margin-top: 14px;

  .action-btn {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-light);
    font-size: 14px;
    transition: var(--transition);
    padding: 6px 12px;
    border-radius: var(--radius-sm);

    &:hover {
      background-color: var(--primary-light);
      color: var(--primary-color);
    }

    &.delete-btn:hover {
      background-color: #FEE2E2;
      color: var(--danger-color);
    }
  }
}

// 确认删除对话框样式
.delete-dialog {
  :deep(.el-dialog__header) {
    border-bottom: 1px solid var(--border-color);
    padding-bottom: 16px;
  }

  :deep(.el-dialog__body) {
    padding-top: 24px;
  }

  .warning-icon {
    font-size: 48px;
    color: var(--warning-color);
    margin-bottom: 16px;
  }

  .delete-warning {
    font-size: 16px;
    color: var(--text-color);
    margin-bottom: 8px;
  }

  .delete-hint {
    font-size: 14px;
    color: var(--text-light);
    margin-bottom: 24px;
  }
}

.loading-container {
  padding: 40px;
  background-color: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

// 图片预览样式
.preview-dialog {
  :deep(.el-dialog__body) {
    padding: 0;
  }

  .preview-image {
    width: 100%;
    max-height: 70vh;
    object-fit: contain;
  }

  .preview-info {
    padding: 16px 24px;
    background-color: var(--card-bg);

    .preview-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-color);
    }

    .preview-description {
      font-size: 14px;
      color: var(--text-light);
      line-height: 1.5;
    }
  }
}

:deep(.el-pagination) {
  margin-top: 20px;
  justify-content: space-around;
}

@media (max-width: 768px) {
  .designs-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 16px;
  }

  .design-image {
    height: 180px;
  }

  .title {
    font-size: 28px;
  }

  .subtitle {
    font-size: 15px;
  }

  .page-navigation {
    flex-wrap: wrap;
  }
}

.dialog-content {
  padding: 20px 0;

  .dialog-description {
    margin-bottom: 20px;
    color: var(--text-color);
    font-size: 14px;
  }

  .format-description {
    margin-top: 16px;
    padding: 12px;
    background-color: var(--bg-color-light);
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    color: var(--text-color-secondary);

    .el-icon {
      font-size: 20px;
      color: var(--primary-color);
    }
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}
</style>
