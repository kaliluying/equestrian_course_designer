<template>
  <div class="shared-designs-container">
    <div class="header-section">
      <h1 class="title">共享中心</h1>
      <p class="subtitle">发现并体验其他用户分享的精彩内容</p>

      <!-- 页面导航链接 -->
      <div class="page-navigation">
        <router-link to="/" class="nav-btn">
          <el-icon>
            <HomeFilled />
          </el-icon> 返回首页
        </router-link>
        <router-link to="/my-designs" class="nav-btn">
          <el-icon>
            <User />
          </el-icon> 我的设计
        </router-link>
      </div>
    </div>

    <!-- 标签页切换 -->
    <div class="tabs-container">
      <div class="tab-header">
        <div class="tab" :class="{ active: activeTab === 'designs' }" @click="activeTab = 'designs'">
          <el-icon>
            <Picture />
          </el-icon>
          共享设计
        </div>
        <div class="tab" :class="{ active: activeTab === 'obstacles' }" @click="activeTab = 'obstacles'">
          <el-icon>
            <Share />
          </el-icon>
          共享障碍物
        </div>
      </div>

      <!-- 设计标签页内容 -->
      <div v-show="activeTab === 'designs'" class="tab-content">
        <!-- 加载状态 -->
        <div v-if="loading" class="loading-container">
          <el-skeleton :rows="5" animated />
        </div>

        <!-- 空状态 -->
        <div v-else-if="designs.length === 0" class="empty-container">
          <el-empty description="暂无分享的设计" :image-size="200">
            <template #description>
              <p class="empty-text">暂时没有用户分享的设计</p>
              <p class="empty-hint">分享您的第一个设计，让其他用户欣赏吧！</p>
            </template>
          </el-empty>
        </div>

        <!-- 设计列表 -->
        <div v-else class="designs-grid">
          <el-card v-for="design in designs" :key="design.id" class="design-card" shadow="hover">
            <div class="design-image">
              <img :src="design.image" :alt="design.title" @click.stop="previewImage(design)"
                class="design-preview-image" />
            </div>
            <div class="design-info">
              <h3 class="design-title">{{ design.title }}</h3>

              <div class="author-info">
                <el-avatar :size="24" class="author-avatar">{{ design.author_username.charAt(0)
                }}</el-avatar>
                <span class="author-name">{{ design.author_username }}</span>
              </div>

              <p class="design-description" v-if="design.description">{{ design.description }}</p>

              <div class="design-meta">
                <span class="create-time">
                  <el-icon>
                    <Clock />
                  </el-icon>
                  {{ formatDate(design.create_time) }}
                </span>
              </div>

              <div class="design-stats">
                <el-button :type="design.is_liked ? 'danger' : 'default'" class="stat-button"
                  @click="handleLike(design)" :icon="design.is_liked ? 'StarFilled' : 'Star'" size="small">
                  {{ design.likes_count }} 点赞
                </el-button>

                <el-button type="primary" class="stat-button" @click="handleDownload(design)" :icon="Download"
                  size="small" plain>
                  {{ design.downloads_count }} 下载
                </el-button>
              </div>
            </div>
          </el-card>
        </div>

        <!-- 分页 -->
        <el-pagination v-if="totalItems > 0" background layout="prev, pager, next" :total="totalItems"
          :page-size="pageSize" :current-page="currentPage" @current-change="handlePageChange" class="pagination" />
      </div>

      <!-- 障碍物标签页内容 -->
      <div v-show="activeTab === 'obstacles'" class="tab-content obstacles-tab">
        <SharedObstaclesView />
      </div>
    </div>

    <!-- 图片预览组件 -->
    <ImagePreview v-model:visible="previewVisible" :image-url="previewImageUrl" :image-alt="previewImageAlt"
      :title="previewImageTitle" />

    <!-- 下载对话框 -->
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
import { ElMessage } from 'element-plus'
import { getSharedDesigns, likeDesign, downloadDesign } from '@/api/design'
import type { DesignResponse } from '@/types/design'
import { useUserStore } from '@/stores/user'
import { HomeFilled, User,Download, Clock, Document, Picture, Tickets, Share } from '@element-plus/icons-vue'
import ImagePreview from '@/components/ImagePreview.vue'
import SharedObstaclesView from '@/components/SharedObstaclesView.vue'
// 状态
const designs = ref<DesignResponse[]>([])
const loading = ref(true)
const currentPage = ref(1)
const totalItems = ref(0)
const pageSize = ref(9) // 每页显示9条记录
const userStore = useUserStore()
const activeTab = ref('designs') // 默认显示设计标签页

// 图片预览状态
const previewVisible = ref(false)
const previewImageUrl = ref('')
const previewImageAlt = ref('')
const previewImageTitle = ref('')

// 下载对话框状态
const downloadDialogVisible = ref(false)
const selectedDownloadType = ref('json')
const currentDesign = ref<DesignResponse | null>(null)

// 预览图片
const previewImage = (design: DesignResponse) => {
  previewImageUrl.value = design.image
  previewImageAlt.value = design.title
  previewImageTitle.value = design.title
  previewVisible.value = true
}

// 获取分享的设计列表
const fetchSharedDesigns = async () => {
  loading.value = true
  try {
    const response = await getSharedDesigns(currentPage.value)
    designs.value = response.results
    totalItems.value = response.count
  } catch (error) {
    console.error('获取分享设计列表失败:', error)
    ElMessage.error('获取分享设计列表失败')
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

// 处理点赞
const handleLike = async (design: DesignResponse) => {
  if (!userStore.isAuthenticated) {
    ElMessage.warning('请先登录后再点赞')
    return
  }

  try {
    const response = await likeDesign(design.id)
    // 更新设计的点赞状态和数量
    design.is_liked = response.is_liked
    design.likes_count = response.likes_count
    ElMessage.success(response.message)
  } catch (error) {
    console.error('点赞操作失败:', error)
    ElMessage.error('点赞操作失败')
  }
}

// 下载类型选项
const downloadTypeOptions = [
  { label: 'JSON格式 (设计数据)', value: 'json' },
  { label: 'PNG格式 (设计图片)', value: 'png' },
  { label: 'PDF格式 (设计文档)', value: 'pdf' }
]

// 处理下载
const handleDownload = async (design: DesignResponse) => {
  // 设置当前设计和默认下载类型
  currentDesign.value = design
  selectedDownloadType.value = 'json'
  // 显示下载对话框
  downloadDialogVisible.value = true
}

// 确认下载
const confirmDownload = async () => {
  if (!currentDesign.value) return

  try {
    // 添加用户反馈
    ElMessage.info('正在准备下载...')

    const response = await downloadDesign(
      currentDesign.value.id,
      selectedDownloadType.value as 'json' | 'png' | 'pdf'
    )
    console.log('下载响应:', response)

    // 更新下载计数
    if (currentDesign.value) {
      currentDesign.value.downloads_count = response.downloads_count
    }

    // 检查下载URL
    if (!response.download_url) {
      throw new Error('服务器未返回有效的下载链接')
    }

    console.log('下载URL:', response.download_url)

    // 创建一个临时链接并点击它来下载文件
    const link = document.createElement('a')
    link.href = response.download_url
    link.download = response.filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    ElMessage.success('下载成功')
    // 关闭对话框
    downloadDialogVisible.value = false
  } catch (error) {
    console.error('下载失败:', error)
    ElMessage.error(`下载失败: ${error instanceof Error ? error.message : '未知错误'}`)
  }
}

// 处理页码变化
const handlePageChange = (page: number) => {
  currentPage.value = page
  fetchSharedDesigns()
}

// 组件挂载时获取数据
onMounted(() => {
  fetchSharedDesigns()
})
</script>

<style scoped lang="scss">
.shared-designs-container {
  max-width: 100%;
  margin: 0 auto;
  padding: 40px 24px;
  background-color: var(--bg-color);

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

/* 标签页样式 */
.tabs-container {
  margin-top: 30px;
  background-color: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.tab-header {
  display: flex;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  position: relative;

  .tab {
    padding: 16px 24px;
    font-size: 16px;
    font-weight: 500;
    color: var(--text-light);
    cursor: pointer;
    transition: var(--transition);
    display: flex;
    align-items: center;
    gap: 8px;
    position: relative;

    .el-icon {
      font-size: 18px;
    }

    &:hover {
      color: var(--primary-color);
      background-color: var(--primary-light);
    }

    &.active {
      color: var(--primary-color);
      font-weight: 600;

      &:after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        width: 100%;
        height: 2px;
        background-color: var(--primary-color);
      }
    }
  }
}

.tab-content {
  padding: 24px;
  min-height: 400px;
}

.loading-container {
  padding: 40px;
}

.empty-container {
  text-align: center;
  padding: 60px 20px;
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
  margin-bottom: 16px;
}

/* 设计卡片网格 */
.designs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 24px;
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
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s ease;
  cursor: pointer;

  &:hover {
    transform: scale(1.05);
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
  border: 2px solid var(--border-color);
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
  gap: 16px;
  margin-top: 14px;
  justify-content: space-between;

  .action-btn {
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-light);
    font-size: 14px;
    transition: var(--transition);
    padding: 6px 10px;
    border-radius: var(--radius-sm);

    &:hover {
      background-color: var(--primary-light);
      color: var(--primary-color);
    }

    &.like-btn.active {
      color: var(--danger-color);
    }

    &.like-btn.active:hover {
      background-color: #FEE2E2;
    }
  }
}

.like-count {
  font-size: 14px;
}

/* 障碍物网格 */
.obstacles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 24px;
}

.obstacle-card {
  border-radius: var(--radius);
  overflow: hidden;
  transition: var(--transition);
  height: 100%;
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-sm);
  border: none;

  &:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow);
  }
}

.obstacle-image {
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--bg-color);
  overflow: hidden;
}

.obstacle-preview {
  max-width: 80%;
  max-height: 80%;
  object-fit: contain;
}

.obstacle-info {
  padding: 16px;
  flex-grow: 1;
  display: flex;
  flex-direction: column;
}

.obstacle-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 12px 0;
}

.obstacle-actions {
  display: flex;
  gap: 12px;
  margin-top: auto;
  padding-top: 16px;
}

/* 分页样式 */
.pagination {
  margin-top: 40px;
  display: flex;
  justify-content: center;

  :deep(.el-pagination) {
    padding: 16px;
    background-color: var(--card-bg);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .designs-grid {
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 16px;
  }

  .obstacles-grid {
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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

  .tab-header .tab {
    padding: 12px 16px;
    font-size: 14px;
  }
}

/* 预览对话框样式 */
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

/* 下载对话框样式 */
.download-dialog {
  :deep(.el-dialog__header) {
    border-bottom: 1px solid var(--border-color);
  }

  .download-options {
    margin-top: 16px;
  }

  .download-option {
    padding: 16px;
    border: 1px solid var(--border-color);
    border-radius: var(--radius);
    margin-bottom: 16px;
    transition: var(--transition);

    &:hover {
      border-color: var(--primary-color);
      background-color: var(--primary-light);
    }

    .option-title {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-color);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .option-description {
      font-size: 14px;
      color: var(--text-light);
    }
  }
}
</style>
