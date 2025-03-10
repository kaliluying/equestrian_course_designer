<template>
  <div class="shared-obstacles-view">
    <div class="view-header">
      <h2>共享障碍物</h2>
      <div class="header-actions">
        <el-input v-model="searchQuery" placeholder="搜索障碍物..." clearable class="search-input" :prefix-icon="Search" />
        <el-button @click="refreshSharedObstacles" :loading="obstacleStore.isLoadingShared">
          <el-icon>
            <Refresh />
          </el-icon>刷新
        </el-button>
      </div>
    </div>

    <!-- 筛选选项 -->
    <div class="filter-options">
      <el-select v-model="typeFilter" placeholder="类型筛选" clearable class="filter-select">
        <el-option label="全部类型" value="" />
        <el-option v-for="(name, type) in typeNames" :key="type" :label="name" :value="type" />
      </el-select>
      <el-select v-model="sortOption" placeholder="排序方式" class="filter-select">
        <el-option label="最新创建" value="newest" />
        <el-option label="最早创建" value="oldest" />
        <el-option label="按名称" value="name" />
      </el-select>
    </div>

    <!-- 未登录提示 -->
    <div v-if="!userStore.isAuthenticated" class="login-required">
      <el-empty description="请登录后查看共享障碍物">
      </el-empty>
    </div>

    <!-- 加载状态 -->
    <div v-else-if="obstacleStore.isLoadingShared && !obstacleStore.sharedObstacles.length" class="loading-state">
      <el-skeleton style="width: 100%" :rows="3" animated />
    </div>

    <!-- 加载错误 -->
    <div v-else-if="obstacleStore.hasSharedError && !obstacleStore.sharedObstacles.length" class="error-state">
      <el-empty :description="obstacleStore.sharedError?.message || '加载失败，请重试'">
        <el-button type="primary" @click="refreshSharedObstacles">重试</el-button>
      </el-empty>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!obstacleStore.sharedObstacles.length" class="empty-state">
      <el-empty description="暂无共享障碍物">
      </el-empty>
    </div>

    <!-- 搜索无结果 -->
    <div v-else-if="filteredObstacles.length === 0" class="empty-state">
      <el-empty description="没有找到匹配的障碍物">
        <el-button type="primary" @click="clearFilters">清除筛选</el-button>
      </el-empty>
    </div>

    <div v-else class="obstacle-grid">
      <!-- 加载中遮罩 -->
      <div v-if="obstacleStore.isLoadingShared" class="loading-overlay">
        <el-icon class="loading-icon">
          <Loading />
        </el-icon>
      </div>

      <div v-for="obstacle in filteredObstacles" :key="obstacle.id" class="obstacle-card">
        <div class="obstacle-preview" @click="previewObstacle(obstacle)">
          <!-- 障碍物预览 - 这里使用和CustomObstacleManager相同的预览逻辑 -->
          <div class="obstacle-content">
            <template v-if="obstacle.baseType === ObstacleType.WALL">
              <div class="wall" :style="{
                width: `${(obstacle.wallProperties?.width || 100) * previewScale}px`,
                height: `${(obstacle.wallProperties?.height || 50) * previewScale}px`,
                background: obstacle.wallProperties?.color || '#a87d46',
              }">
                <div class="wall-texture"></div>
              </div>
            </template>
            <template v-else-if="obstacle.baseType === ObstacleType.LIVERPOOL">
              <!-- 利物浦预览 -->
              <!-- ... similar to CustomObstacleManager ... -->
            </template>
            <template v-else-if="obstacle.baseType === ObstacleType.DECORATION">
              <!-- 装饰物预览 -->
              <div v-if="obstacle.decorationProperties" class="decoration" :style="{
                width: `${(obstacle.decorationProperties.width || 100) * previewScale}px`,
                height: `${(obstacle.decorationProperties.height || 50) * previewScale}px`,
                background: obstacle.decorationProperties.category === DecorationCategory.TABLE ?
                  obstacle.decorationProperties.color || '#8B4513' : 'transparent',
                border: obstacle.decorationProperties.category === DecorationCategory.FENCE ?
                  `${2 * previewScale}px solid ${obstacle.decorationProperties.color || '#8B4513'}` : 'none',
              }">
                <!-- 根据装饰物类别显示不同的形状 -->
                <div v-if="obstacle.decorationProperties.category === DecorationCategory.TABLE"
                  class="table-decoration">
                  <!-- 裁判桌文字 -->
                  <div v-if="obstacle.decorationProperties.text" class="table-text" :style="{
                    color: obstacle.decorationProperties.textColor || '#FFFFFF',
                    fontSize: `${8 * previewScale}px`
                  }">
                    {{ obstacle.decorationProperties.text }}
                  </div>
                </div>
                <div v-else-if="obstacle.decorationProperties.category === DecorationCategory.TREE"
                  class="tree-decoration" :style="{
                    '--trunk-color': obstacle.decorationProperties.color || '#8B4513',
                    '--foliage-color': obstacle.decorationProperties.secondaryColor || '#2E8B57'
                  }"></div>
                <div v-else-if="obstacle.decorationProperties.category === DecorationCategory.FLOWER"
                  class="flower-decoration" :style="{
                    '--flower-color': obstacle.decorationProperties.color || '#FF69B4'
                  }"></div>
                <!-- 自定义装饰 -->
                <div v-else-if="obstacle.decorationProperties.category === DecorationCategory.CUSTOM"
                  class="custom-decoration">
                  <img v-if="obstacle.decorationProperties.imageUrl" :src="obstacle.decorationProperties.imageUrl"
                    class="custom-image" alt="自定义装饰" />
                  <div v-else-if="obstacle.decorationProperties.svgData" class="custom-svg"
                    v-html="obstacle.decorationProperties.svgData"></div>
                  <div v-else class="custom-placeholder" :style="{
                    background: obstacle.decorationProperties.color || '#8B4513'
                  }"></div>
                </div>
              </div>
            </template>
            <template v-else>
              <div v-for="(pole, index) in obstacle.poles" :key="index" class="pole" :style="{
                width: `${pole.width * previewScale}px`,
                height: `${pole.height * previewScale}px`,
                background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
                marginBottom: pole.spacing ? `${pole.spacing * previewScale}px` : '0',
              }">
                <div class="pole-shadow"></div>
              </div>
            </template>
          </div>
        </div>

        <div class="obstacle-info">
          <h3>{{ obstacle.name }}</h3>
          <div class="labels">
            <span class="type-label">{{ typeNames[obstacle.baseType] }}</span>
            <span v-if="isCurrentUserObstacle(obstacle)" class="my-obstacle-label">我的作品</span>
          </div>
          <div class="creator-label">
            <el-tag size="small">{{ obstacle.creator || obstacle.user_username || '未知' }}</el-tag>
          </div>
        </div>

        <div class="obstacle-actions">
          <el-button-group>
            <el-button size="small" type="primary" @click="previewObstacle(obstacle)" title="预览">
              <el-icon>
                <View />
              </el-icon>
              预览
            </el-button>
            <el-button v-if="!isCurrentUserObstacle(obstacle)" size="small" type="success"
              @click="useObstacle(obstacle)" title="添加到我的障碍物">
              <el-icon>
                <Download />
              </el-icon>
              添加
            </el-button>
            <el-button v-else size="small" type="info" disabled title="这是您创建的障碍物">
              <el-icon>
                <User />
              </el-icon>
              我的作品
            </el-button>
          </el-button-group>
        </div>
      </div>
    </div>

    <!-- 障碍物预览对话框 -->
    <el-dialog v-model="previewDialogVisible" :title="currentObstacle?.name || '障碍物预览'" width="500px" destroy-on-close>
      <div class="preview-dialog-content">
        <div class="preview-large" v-if="currentObstacle">
          <!-- 大型预览 -->
          <div class="obstacle-content-large">
            <template v-if="currentObstacle.baseType === ObstacleType.WALL">
              <div class="wall" :style="{
                width: `${(currentObstacle.wallProperties?.width || 100) * 0.8}px`,
                height: `${(currentObstacle.wallProperties?.height || 50) * 0.8}px`,
                background: currentObstacle.wallProperties?.color || '#a87d46',
              }">
                <div class="wall-texture"></div>
              </div>
            </template>
            <template v-else-if="currentObstacle.baseType === ObstacleType.LIVERPOOL">
              <!-- 利物浦预览 -->
              <!-- ... similar to CustomObstacleManager ... -->
            </template>
            <template v-else-if="currentObstacle.baseType === ObstacleType.DECORATION">
              <!-- 装饰物大型预览 -->
              <div v-if="currentObstacle.decorationProperties" class="decoration" :style="{
                width: `${(currentObstacle.decorationProperties.width || 100) * 0.8}px`,
                height: `${(currentObstacle.decorationProperties.height || 50) * 0.8}px`,
                background: currentObstacle.decorationProperties.category === DecorationCategory.TABLE ?
                  currentObstacle.decorationProperties.color || '#8B4513' : 'transparent',
                border: currentObstacle.decorationProperties.category === DecorationCategory.FENCE ?
                  `${2 * 0.8}px solid ${currentObstacle.decorationProperties.color || '#8B4513'}` : 'none',
              }">
                <!-- 根据装饰物类别显示不同的形状 -->
                <div v-if="currentObstacle.decorationProperties.category === DecorationCategory.TABLE"
                  class="table-decoration">
                  <!-- 裁判桌文字 -->
                  <div v-if="currentObstacle.decorationProperties.text" class="table-text" :style="{
                    color: currentObstacle.decorationProperties.textColor || '#FFFFFF',
                    fontSize: `${12 * 0.8}px`
                  }">
                    {{ currentObstacle.decorationProperties.text }}
                  </div>
                </div>
                <div v-else-if="currentObstacle.decorationProperties.category === DecorationCategory.TREE"
                  class="tree-decoration" :style="{
                    '--trunk-color': currentObstacle.decorationProperties.color || '#8B4513',
                    '--foliage-color': currentObstacle.decorationProperties.secondaryColor || '#2E8B57'
                  }"></div>
                <div v-else-if="currentObstacle.decorationProperties.category === DecorationCategory.FLOWER"
                  class="flower-decoration" :style="{
                    '--flower-color': currentObstacle.decorationProperties.color || '#FF69B4'
                  }"></div>
                <!-- 自定义装饰 -->
                <div v-else-if="currentObstacle.decorationProperties.category === DecorationCategory.CUSTOM"
                  class="custom-decoration">
                  <img v-if="currentObstacle.decorationProperties.imageUrl"
                    :src="currentObstacle.decorationProperties.imageUrl" class="custom-image" alt="自定义装饰" />
                  <div v-else-if="currentObstacle.decorationProperties.svgData" class="custom-svg"
                    v-html="currentObstacle.decorationProperties.svgData"></div>
                  <div v-else class="custom-placeholder" :style="{
                    background: currentObstacle.decorationProperties.color || '#8B4513'
                  }"></div>
                </div>
              </div>
            </template>
            <template v-else>
              <div v-for="(pole, index) in currentObstacle.poles" :key="index" class="pole" :style="{
                width: `${pole.width * 0.8}px`,
                height: `${pole.height * 0.8}px`,
                background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
                marginBottom: pole.spacing ? `${pole.spacing * 0.8}px` : '0',
              }">
                <div class="pole-shadow"></div>
              </div>
            </template>
          </div>
        </div>

        <div class="obstacle-details" v-if="currentObstacle">
          <div class="detail-item">
            <span class="detail-label">名称:</span>
            <span class="detail-value">{{ currentObstacle.name }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">类型:</span>
            <span class="detail-value">{{ typeNames[currentObstacle.baseType] }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">创建者:</span>
            <span class="detail-value">
              {{ currentObstacle.creator || currentObstacle.user_username || '未知' }}
              <el-tag v-if="isCurrentUserObstacle(currentObstacle)" size="small" type="primary"
                effect="plain">我的作品</el-tag>
            </span>
          </div>
          <div class="detail-item">
            <span class="detail-label">创建时间:</span>
            <span class="detail-value">{{ formatDate(currentObstacle.createdAt) }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="previewDialogVisible = false">关闭</el-button>
          <el-button v-if="currentObstacle && !isCurrentUserObstacle(currentObstacle)" type="success"
            @click="useObstacle(currentObstacle); previewDialogVisible = false">
            添加到我的障碍物
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Refresh, Loading, Download, View, Search, User } from '@element-plus/icons-vue'
import { useObstacleStore } from '@/stores/obstacle'
import { useUserStore } from '@/stores/user'
import { ObstacleType, DecorationCategory } from '@/types/obstacle'
import type { CustomObstacleTemplate } from '@/types/obstacle'
import { ElMessage } from 'element-plus'

const obstacleStore = useObstacleStore()
const userStore = useUserStore()

// 搜索和筛选状态
const searchQuery = ref('')
const typeFilter = ref('')
const sortOption = ref('newest')

// 预览缩放比例
const previewScale = 0.4

// 障碍物类型映射
const typeNames = {
  [ObstacleType.SINGLE]: '单杆',
  [ObstacleType.DOUBLE]: '双杆',
  [ObstacleType.COMBINATION]: '组合',
  [ObstacleType.WALL]: '墙',
  [ObstacleType.LIVERPOOL]: '利物浦',
  [ObstacleType.WATER]: '水障',
  [ObstacleType.DECORATION]: '装饰物',
  [ObstacleType.CUSTOM]: '自定义',
}

// 预览相关
const previewDialogVisible = ref(false)
const currentObstacle = ref<CustomObstacleTemplate | null>(null)

// 筛选和排序后的障碍物列表
const filteredObstacles = computed(() => {
  let result = [...obstacleStore.sharedObstacles]

  // 应用类型筛选
  if (typeFilter.value) {
    result = result.filter(obstacle => obstacle.baseType === typeFilter.value)
  }

  // 应用搜索查询
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim()
    result = result.filter(obstacle =>
      obstacle.name.toLowerCase().includes(query) ||
      (obstacle.creator && obstacle.creator.toLowerCase().includes(query)) ||
      (obstacle.user_username && obstacle.user_username.toLowerCase().includes(query))
    )
  }

  // 应用排序
  switch (sortOption.value) {
    case 'newest':
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      break
    case 'oldest':
      result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      break
    case 'name':
      result.sort((a, b) => a.name.localeCompare(b.name))
      break
  }

  return result
})

// 清除所有筛选条件
const clearFilters = () => {
  searchQuery.value = ''
  typeFilter.value = ''
  sortOption.value = 'newest'
}

// 刷新共享障碍物列表
const refreshSharedObstacles = () => {
  obstacleStore.initSharedObstacles()
}

// 使用共享障碍物 - 保存到自己的自定义障碍物中
const useObstacle = async (obstacle: CustomObstacleTemplate | null) => {
  if (!obstacle) return;

  // 创建一个副本，移除ID和共享状态，以便作为新障碍物保存
  const newObstacle = {
    ...obstacle,
    id: '',  // 移除ID，让系统生成新ID
    isShared: false, // 设置为非共享
    name: `${obstacle.name} (副本)` // 名称添加(副本)后缀
  };

  try {
    const savedObstacle = await obstacleStore.saveCustomObstacle(newObstacle);
    if (savedObstacle) {
      ElMessage.success('已添加到您的自定义障碍物');
    }
  } catch (error) {
    console.error('保存共享障碍物失败:', error);
  }
}

// 调整颜色亮度
const adjustColor = (color: string, amount: number) => {
  const hex = color.replace('#', '')
  const num = parseInt(hex, 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

// 预览障碍物
const previewObstacle = (obstacle: CustomObstacleTemplate) => {
  currentObstacle.value = obstacle
  previewDialogVisible.value = true
}

// 格式化日期
const formatDate = (dateString: string) => {
  if (!dateString) return '未知';
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 判断是否是当前用户的障碍物
const isCurrentUserObstacle = (obstacle: CustomObstacleTemplate) => {
  const username = userStore.currentUser?.username
  return username && (obstacle.creator === username || obstacle.user_username === username)
}
</script>

<style scoped lang="scss">
.shared-obstacles-view {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 10px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding: 0 5px 10px 5px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    white-space: nowrap;
    color: var(--el-color-primary-dark-2);
    position: relative;
    padding-left: 10px;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 14px;
      background-color: var(--el-color-primary);
      border-radius: 2px;
    }
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-input {
  width: 200px;
}

.filter-options {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 15px;
  padding: 0 5px 10px 5px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-wrap: wrap;
}

.filter-select {
  width: 150px;
}

.empty-state,
.loading-state,
.error-state,
.login-required {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
}

.obstacle-grid {
  flex: 1;
  overflow-y: auto;
  padding-right: 6px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 15px;
  max-height: calc(100% - 60px);

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-track {
    background: var(--el-fill-color-lighter);
    border-radius: 2px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: var(--el-border-color);
    border-radius: 2px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background-color: var(--el-color-primary-light-5);
  }
}

.obstacle-card {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  transition: all 0.3s;
  background-color: white;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  position: relative;
  overflow: hidden;
  margin-bottom: 5px;
  min-height: 70px;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 4px;
    height: 100%;
    background: linear-gradient(to bottom, var(--el-color-success-light-7), var(--el-color-success));
    opacity: 0;
    transition: opacity 0.3s;
  }

  &:hover {
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
    border-color: var(--el-color-success-light-5);
    transform: translateY(-2px);

    &::after {
      opacity: 1;
    }
  }
}

.obstacle-preview {
  flex-shrink: 0;
  width: 60px;
  height: 60px;
  display: flex;
  justify-content: center;
  align-items: center;
  background: #f9fafc;
  border-radius: 4px;
  overflow: hidden;
  border: 1px dashed var(--el-border-color);
  transition: all 0.3s;

  &:hover {
    border-color: var(--el-color-success-light-5);
  }
}

.obstacle-info {
  flex: 1;
  min-width: 0;
  padding-right: 5px;
  overflow: hidden;

  h3 {
    margin: 0 0 5px 0;
    font-size: 14px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--el-text-color-primary);
  }

  .labels {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-bottom: 4px;
  }

  .type-label {
    padding: 2px 6px;
    color: var(--el-color-success);
    font-size: 11px;
    background-color: var(--el-color-success-light-9);
    border-radius: 4px;
    display: inline-block;
    font-weight: 500;
  }

  .my-obstacle-label {
    padding: 2px 6px;
    color: var(--el-color-primary);
    font-size: 11px;
    background-color: var(--el-color-primary-light-9);
    border-radius: 4px;
    display: inline-block;
    font-weight: 500;
  }

  .creator-label {
    margin: 4px 0 0 0;
    font-size: 11px;
  }
}

.obstacle-actions {
  flex-shrink: 0;
  margin-left: auto;
  display: flex;
  align-items: center;

  .el-button-group {
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    overflow: hidden;
  }

  .el-button {
    padding: 6px 12px;

    .el-icon {
      margin-right: 4px;
    }
  }
}

.obstacle-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  transform: scale(0.4);
  max-width: 100%;
}

.wall {
  position: relative;
  border-radius: 4px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  overflow: hidden;

  .wall-texture {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: repeating-linear-gradient(90deg,
        rgba(0, 0, 0, 0.1) 0px,
        rgba(0, 0, 0, 0.1) 2px,
        transparent 2px,
        transparent 4px),
      repeating-linear-gradient(0deg,
        rgba(0, 0, 0, 0.1) 0px,
        rgba(0, 0, 0, 0.1) 2px,
        transparent 2px,
        transparent 4px);
  }
}

.pole {
  position: relative;
  transition: all 0.3s ease;

  .pole-shadow {
    position: absolute;
    bottom: -2px;
    left: 0;
    width: 100%;
    height: 4px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 50%;
    filter: blur(2px);
  }
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10;
  border-radius: 8px;
}

.loading-icon {
  font-size: 24px;
  color: var(--el-color-primary);
  animation: rotating 2s linear infinite;
}

/* 预览对话框样式 */
.preview-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.preview-large {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px;
  background-color: #f9fafc;
  border-radius: 8px;
  min-height: 200px;
}

.obstacle-content-large {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  transform: scale(1);
}

.obstacle-details {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 15px;
  background-color: #f9fafc;
  border-radius: 8px;
}

.detail-item {
  display: flex;
  align-items: center;
}

.detail-label {
  font-weight: 600;
  color: var(--el-text-color-secondary);
  width: 80px;
}

.detail-value {
  color: var(--el-text-color-primary);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* 装饰物样式 */
.decoration {
  position: relative;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  display: flex;
  justify-content: center;
  align-items: center;
}

.table-decoration {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.table-decoration::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0.1), rgba(0, 0, 0, 0.2));
}

.tree-decoration {
  width: 100%;
  height: 100%;
  position: relative;
}

.tree-decoration::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 20%;
  height: 60%;
  background-color: var(--trunk-color);
  border-radius: 2px;
}

.tree-decoration::after {
  content: '';
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  height: 60%;
  background-color: var(--foliage-color);
  border-radius: 50% 50% 50% 50%;
}

.flower-decoration {
  width: 100%;
  height: 100%;
  position: relative;
}

.flower-decoration::before {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 10%;
  height: 50%;
  background-color: #4CAF50;
  border-radius: 2px;
}

.flower-decoration::after {
  content: '';
  position: absolute;
  top: 10%;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 40%;
  background-color: var(--flower-color);
  border-radius: 50%;
  box-shadow:
    -15px -5px 0 var(--flower-color),
    15px -5px 0 var(--flower-color),
    -10px 10px 0 var(--flower-color),
    10px 10px 0 var(--flower-color);
}

.custom-decoration {
  width: 100%;
  height: 100%;
  position: relative;
  border-radius: 4px;
  overflow: hidden;
}

.custom-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.custom-svg {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.custom-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--el-fill-color-lighter);
}

.table-text {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
}
</style>
