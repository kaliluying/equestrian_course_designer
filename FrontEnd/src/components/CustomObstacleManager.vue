<template>
  <div class="custom-obstacle-manager">
    <div class="manager-header">
      <h2>自定义障碍</h2>
      <el-button type="primary" @click="showEditor(null)" :loading="obstacleStore.isLoading">
        <el-icon>
          <Plus />
        </el-icon>创建
      </el-button>
    </div>

    <!-- 未登录提示 -->
    <div v-if="!userStore.isAuthenticated" class="login-required">
      <el-empty description="请登录后使用自定义障碍功能">
      </el-empty>
    </div>

    <!-- 加载状态 -->
    <div v-else-if="obstacleStore.isLoading && !obstacleStore.customObstacles.length" class="loading-state">
      <el-skeleton style="width: 100%" :rows="3" animated />
    </div>

    <!-- 加载错误 -->
    <div v-else-if="obstacleStore.hasError && !obstacleStore.customObstacles.length" class="error-state">
      <el-empty :description="obstacleStore.error || '加载失败，请重试'">
        <el-button type="primary" @click="retryLoad">重试</el-button>
      </el-empty>
    </div>

    <div v-else-if="!obstacleStore.customObstacles.length" class="empty-state">
      <el-empty description="没有自定义障碍物">
        <el-button type="primary" @click="showEditor(null)">创建第一个</el-button>
      </el-empty>
    </div>

    <div v-else class="obstacle-grid">
      <!-- 显示数量限制信息 -->
      <div v-if="!userStore.currentUser?.is_premium_active" class="limit-info">
        已创建 {{ obstacleStore.customObstacles.length }}/10 个自定义障碍物
      </div>
      <div v-else class="limit-info premium">
        高级会员：无限制自定义障碍
      </div>

      <!-- 加载中遮罩 -->
      <div v-if="obstacleStore.isLoading" class="loading-overlay">
        <el-icon class="loading-icon">
          <Loading />
        </el-icon>
      </div>

      <div v-for="obstacle in obstacleStore.sortedObstacles" :key="obstacle.id" class="obstacle-card" draggable="true"
        @dragstart="handleDragStart($event, obstacle)">
        <div class="obstacle-preview">
          <!-- 障碍物预览 -->
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
              <div class="liverpool" :style="{
                width: `${obstacle.poles[0]?.width * previewScale || 100 * previewScale}px`,
              }">
                <template v-if="obstacle.liverpoolProperties?.hasRail">
                  <div v-for="(pole, index) in obstacle.poles" :key="index" class="pole" :style="{
                    width: '100%',
                    height: `${pole.height * previewScale}px`,
                    background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
                  }">
                    <div class="pole-shadow"></div>
                  </div>
                </template>
                <div class="water" :style="{
                  width: `${(obstacle.liverpoolProperties?.width || 80) * previewScale}px`,
                  height: `${(obstacle.liverpoolProperties?.waterDepth || 15) * previewScale}px`,
                  background: obstacle.liverpoolProperties?.waterColor || 'rgba(0, 120, 255, 0.3)',
                  marginLeft: `${(obstacle.poles[0]?.width - (obstacle.liverpoolProperties?.width || 80)) * previewScale / 2}px`,
                }"></div>
              </div>
            </template>
            <template v-else-if="obstacle.baseType === ObstacleType.DECORATION">
              <div class="decoration" :style="{
                width: `${(obstacle.decorationProperties?.width || 100) * previewScale}px`,
                height: `${(obstacle.decorationProperties?.height || 100) * previewScale}px`,
              }">
                <!-- 裁判桌预览 -->
                <template v-if="obstacle.decorationProperties?.category === DecorationCategory.TABLE">
                  <div class="decoration-table" :style="{
                    width: '100%',
                    height: '100%',
                    backgroundColor: obstacle.decorationProperties?.color || '#8B4513',
                    border: obstacle.decorationProperties?.borderWidth
                      ? `${obstacle.decorationProperties.borderWidth * previewScale}px solid ${obstacle.decorationProperties.borderColor || '#593b22'}`
                      : 'none',
                    borderRadius: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                  }">
                    <div v-if="obstacle.decorationProperties?.text" :style="{
                      color: obstacle.decorationProperties?.textColor || '#ffffff',
                      fontSize: '8px',
                      fontWeight: 'bold',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '90%',
                      textAlign: 'center'
                    }">
                      {{ obstacle.decorationProperties.text }}
                    </div>
                  </div>
                </template>

                <!-- 树预览 -->
                <template v-else-if="obstacle.decorationProperties?.category === DecorationCategory.TREE">
                  <div class="decoration-tree"
                    style="position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;">
                    <!-- 树冠 -->
                    <div :style="{
                      width: `${(obstacle.decorationProperties?.foliageRadius || 40) * previewScale}px`,
                      height: `${(obstacle.decorationProperties?.foliageRadius || 40) * previewScale}px`,
                      borderRadius: '50%',
                      backgroundColor: obstacle.decorationProperties?.secondaryColor || '#2E8B57',
                      position: 'absolute',
                      top: '0',
                      zIndex: '1'
                    }"></div>
                    <!-- 树干 -->
                    <div :style="{
                      width: `${(obstacle.decorationProperties?.trunkWidth || 15) * previewScale}px`,
                      height: `${(obstacle.decorationProperties?.trunkHeight || 60) * previewScale}px`,
                      backgroundColor: obstacle.decorationProperties?.color || '#8B4513',
                      position: 'absolute',
                      bottom: '0',
                      zIndex: '0'
                    }"></div>
                  </div>
                </template>

                <!-- 入口/出口预览 -->
                <template v-else-if="obstacle.decorationProperties?.category === DecorationCategory.ENTRANCE ||
                  obstacle.decorationProperties?.category === DecorationCategory.EXIT">
                  <div class="decoration-gate" :style="{
                    width: '100%',
                    height: '100%',
                    backgroundColor: obstacle.decorationProperties?.color ||
                      (obstacle.decorationProperties?.category === DecorationCategory.ENTRANCE ? '#4169E1' : '#FF6347'),
                    border: obstacle.decorationProperties?.borderWidth
                      ? `${obstacle.decorationProperties.borderWidth * previewScale}px solid ${obstacle.decorationProperties.borderColor || '#1E3C72'}`
                      : 'none',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }">
                    <div :style="{
                      color: obstacle.decorationProperties?.textColor || '#ffffff',
                      fontSize: '8px',
                      fontWeight: 'bold',
                    }">
                      {{ obstacle.decorationProperties?.text ||
                        (obstacle.decorationProperties?.category === DecorationCategory.ENTRANCE ? '入口' : '出口') }}
                    </div>
                  </div>
                </template>

                <!-- 花预览 -->
                <template v-else-if="obstacle.decorationProperties?.category === DecorationCategory.FLOWER">
                  <div class="decoration-flower"
                    style="position: relative; height: 100%; display: flex; flex-direction: column; align-items: center;">
                    <!-- 花朵 -->
                    <div :style="{
                      width: `${(obstacle.decorationProperties?.width || 60) * previewScale}px`,
                      height: `${(obstacle.decorationProperties?.width || 60) * previewScale}px`,
                      borderRadius: '50%',
                      backgroundColor: obstacle.decorationProperties?.color || '#FF69B4',
                      marginBottom: '-5px'
                    }"></div>
                    <!-- 叶子容器 -->
                    <div style="position: relative; width: 20px; height: 15px;">
                      <!-- 左叶子 -->
                      <div :style="{
                        width: '10px',
                        height: '15px',
                        backgroundColor: obstacle.decorationProperties?.secondaryColor || '#32CD32',
                        borderRadius: '50% 0 50% 50%',
                        transform: 'rotate(45deg)',
                        position: 'absolute',
                        left: '-5px'
                      }"></div>
                      <!-- 右叶子 -->
                      <div :style="{
                        width: '10px',
                        height: '15px',
                        backgroundColor: obstacle.decorationProperties?.secondaryColor || '#32CD32',
                        borderRadius: '0 50% 50% 50%',
                        transform: 'rotate(-45deg)',
                        position: 'absolute',
                        right: '-5px'
                      }"></div>
                    </div>
                  </div>
                </template>

                <!-- 围栏预览 -->
                <template v-else-if="obstacle.decorationProperties?.category === DecorationCategory.FENCE">
                  <div class="decoration-fence" :style="{
                    width: '100%',
                    height: '100%',
                    backgroundColor: obstacle.decorationProperties?.color || '#D2B48C',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }">
                    <!-- 栅栏柱子 -->
                    <template v-for="n in 5" :key="n">
                      <div :style="{
                        width: '2px',
                        height: '100%',
                        backgroundColor: obstacle.decorationProperties?.borderColor || '#8B7355'
                      }"></div>
                    </template>
                  </div>
                </template>

                <!-- 自定义预览 -->
                <template v-else-if="obstacle.decorationProperties?.category === DecorationCategory.CUSTOM">
                  <div v-if="obstacle.decorationProperties?.imageUrl" class="decoration-custom-image" :style="{
                    width: '100%',
                    height: '100%',
                    backgroundImage: `url(${obstacle.decorationProperties.imageUrl})`,
                    backgroundSize: 'contain',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                  }"></div>
                  <div v-else class="decoration-custom-placeholder" :style="{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px dashed #ccc',
                    fontSize: '6px',
                    color: '#999'
                  }">
                    自定义
                  </div>
                </template>
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
          <span class="type-label">{{ typeNames[obstacle.baseType] }}</span>
          <div class="date-label">{{ formatDate(obstacle.updatedAt) }}</div>
        </div>

        <div class="obstacle-actions">
          <el-button-group>
            <el-button size="small" type="primary" @click="showEditor(obstacle)" title="编辑">
              <el-icon>
                <Edit />
              </el-icon>
            </el-button>
            <el-button size="small" type="danger" @click="confirmDelete(obstacle)" title="删除">
              <el-icon>
                <Delete />
              </el-icon>
            </el-button>
            <el-button size="small" :type="obstacle.isShared ? 'success' : 'info'" @click="toggleShare(obstacle)"
              :title="obstacle.isShared ? '取消共享' : '共享'">
              <el-icon>
                <Share />
              </el-icon>
            </el-button>
          </el-button-group>
        </div>
      </div>
    </div>

    <!-- 编辑器对话框 -->
    <el-dialog v-model="editorVisible" :title="currentObstacle ? '编辑障碍物' : '创建自定义障碍物'" width="80%"
      :close-on-click-modal="false" :before-close="closeEditor">
      <!-- 编辑器内的错误提示 -->
      <div v-if="obstacleStore.hasError && obstacleStore.error" class="editor-error-tips">
        <el-alert :type="obstacleStore.error.severity" show-icon :closable="true" @close="obstacleStore.clearError"
          :title="obstacleStore.error.message">
          <template v-if="obstacleStore.error.solutions && obstacleStore.error.solutions.length > 0">
            <div class="solution-list">
              <p><strong>解决方法:</strong></p>
              <ol>
                <li v-for="(solution, index) in obstacleStore.error.solutions" :key="index">
                  {{ solution }}
                </li>
              </ol>
            </div>
          </template>
        </el-alert>
      </div>
      <ObstacleEditor v-if="editorVisible" :template="currentObstacle || undefined" @save="handleSave"
        @cancel="closeEditor" />
    </el-dialog>

    <!-- 确认删除对话框 -->
    <el-dialog v-model="deleteDialogVisible" title="确认删除" width="30%">
      <span>确定要删除障碍物"{{ obstacleToDelete?.name }}"吗？此操作不可撤销。</span>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="deleteDialogVisible = false">取消</el-button>
          <el-button type="danger" @click="deleteObstacle">确认删除</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Edit, Delete, Loading, Share } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useObstacleStore } from '@/stores/obstacle'
import { ObstacleType, DecorationCategory } from '@/types/obstacle'
import type { CustomObstacleTemplate } from '@/types/obstacle'
import ObstacleEditor from './ObstacleEditor.vue'
import { useUserStore } from '@/stores/user'

const obstacleStore = useObstacleStore()
const userStore = useUserStore()
const editorVisible = ref(false)
const currentObstacle = ref<CustomObstacleTemplate | null>(null)
const deleteDialogVisible = ref(false)
const obstacleToDelete = ref<CustomObstacleTemplate | null>(null)

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

// 重新加载数据
const retryLoad = () => {
  obstacleStore.initObstacles()
}

// 显示编辑器
const showEditor = (obstacle: CustomObstacleTemplate | null) => {
  // 检查用户是否登录
  if (!userStore.isAuthenticated) {
    ElMessage.warning('请先登录后再使用自定义障碍功能')
    return
  }

  // 如果是创建新障碍物（而非编辑现有障碍物）
  if (!obstacle) {
    // 检查非会员用户数量限制
    if (!userStore.currentUser?.is_premium_active && obstacleStore.customObstacles.length >= 10) {
      ElMessage.warning('普通用户最多创建10个自定义障碍，请升级会员享受无限创建特权')
      return
    }
  }

  // 通过所有检查后显示编辑器
  currentObstacle.value = obstacle
  editorVisible.value = true
}

// 关闭编辑器
const closeEditor = () => {
  editorVisible.value = false
  currentObstacle.value = null
}

// 处理保存
const handleSave = async (obstacle: CustomObstacleTemplate) => {
  try {
    // 保存障碍物，并获取保存结果，不使用全局提示，而是在编辑器中显示错误
    await obstacleStore.saveCustomObstacle(obstacle, false)

    // 检查是否存在错误
    if (obstacleStore.hasError) {
      // 保存失败，保持编辑器打开状态
      console.log('保存失败，错误信息:', obstacleStore.error)
      // 不关闭编辑器，允许用户修改后重试
      return
    }

    // 保存成功，关闭编辑器并显示成功消息
    editorVisible.value = false
    currentObstacle.value = null
    ElMessage.success(obstacle.id ? '障碍物已更新' : '障碍物已创建')
  } catch (error) {
    console.error('保存障碍物时出错:', error)
    // 保存出错时不关闭编辑器
  }
}

// 确认删除
const confirmDelete = (obstacle: CustomObstacleTemplate) => {
  obstacleToDelete.value = obstacle
  deleteDialogVisible.value = true
}

// 删除障碍物
const deleteObstacle = () => {
  if (obstacleToDelete.value) {
    obstacleStore.removeCustomObstacle(obstacleToDelete.value.id)
    ElMessage.success('障碍物已删除')
    deleteDialogVisible.value = false
    obstacleToDelete.value = null
  }
}

// 格式化日期
const formatDate = (dateString: string) => {
  const date = new Date(dateString)
  return date.toLocaleDateString()
}

// 处理拖拽开始
const handleDragStart = (event: DragEvent, obstacle: CustomObstacleTemplate) => {
  // 设置拖拽数据
  event.dataTransfer?.setData('text/plain', `CUSTOM:${obstacle.id}`)

  // 获取拖拽元素
  const dragElement = event.target as HTMLElement;

  // 创建自定义拖拽图像
  if (event.dataTransfer) {
    // 获取预览元素的位置
    const previewElement = dragElement.querySelector('.obstacle-preview');

    if (previewElement) {
      // 克隆预览元素以创建拖拽图像
      const clone = previewElement.cloneNode(true) as HTMLElement;
      clone.style.position = 'absolute';
      clone.style.top = '-1000px';
      clone.style.left = '-1000px';
      clone.style.opacity = '0.8';
      clone.style.transform = 'scale(1.2)'; // 稍微放大以便更好地看到
      document.body.appendChild(clone);

      // 计算鼠标相对于预览元素的精确位置
      const rect = previewElement.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      // 设置拖拽图像，使用鼠标在预览元素上的精确位置作为偏移
      event.dataTransfer.setDragImage(clone, mouseX, mouseY);

      // 设置拖拽效果
      event.dataTransfer.effectAllowed = 'copy';

      // 在下一帧移除克隆元素
      setTimeout(() => {
        document.body.removeChild(clone);
      }, 0);
    }
  }

  console.log('开始拖拽自定义障碍物:', obstacle.id);
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

// 切换障碍物共享状态
const toggleShare = async (obstacle: CustomObstacleTemplate) => {
  if (!userStore.isAuthenticated) {
    ElMessage.warning('请先登录后再操作')
    return
  }

  try {
    const success = await obstacleStore.toggleSharing(obstacle.id)
    if (success) {
      // 共享状态已在store中更新，无需额外操作
    }
  } catch (error) {
    console.error('切换共享状态失败:', error)
    ElMessage.error('操作失败，请稍后重试')
  }
}
</script>

<style scoped lang="scss">
.custom-obstacle-manager {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 10px;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  padding: 0 5px 10px 5px;
  border-bottom: 1px solid var(--el-border-color-light);
  flex-shrink: 0;
  /* 防止头部被压缩 */

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

.empty-state {
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
  /* 确保底部有足够的空间 */
  max-height: calc(100% - 60px);
  /* 考虑到header的高度 */

  /* 自定义滚动条样式 */
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
  cursor: grab;
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
    background: linear-gradient(to bottom, var(--el-color-primary-light-7), var(--el-color-primary));
    opacity: 0;
    transition: opacity 0.3s;
  }

  &:hover {
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
    border-color: var(--el-color-primary-light-5);
    transform: translateY(-2px);

    &::after {
      opacity: 1;
    }
  }

  &:active {
    cursor: grabbing;
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    background-color: var(--el-color-primary-light-9);
    transition: all 0.1s;
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
    border-color: var(--el-color-primary-light-5);
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

  .type-label {
    margin: 0 0 4px 0;
    padding: 2px 6px;
    color: var(--el-color-primary);
    font-size: 11px;
    background-color: var(--el-color-primary-light-9);
    border-radius: 4px;
    display: inline-block;
    font-weight: 500;
  }

  .date-label {
    margin: 4px 0 0 0;
    color: var(--el-text-color-secondary);
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

.liverpool {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;

  .water {
    border-radius: 2px;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
  }
}

.pole {
  position: relative;
  transition: all 0.3s ease;

  .pole-shadow {
    position: absolute;
    bottom: -2px;
    left: 2px;
    right: 2px;
    height: 2px;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    filter: blur(1px);
  }
}

/* 新增样式 */
.login-required {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 30px 0;

  .login-tip {
    margin-top: 10px;
    color: var(--el-text-color-secondary);
    font-size: 14px;
  }
}

.limit-info {
  padding: 8px 12px;
  margin-bottom: 10px;
  background-color: var(--el-color-info-light-9);
  border-radius: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  border-left: 3px solid var(--el-color-info);

  &.premium {
    background-color: var(--el-color-success-light-9);
    border-left-color: var(--el-color-success);
    color: var(--el-color-success);
  }
}

/* 响应式调整 */
@media screen and (max-height: 768px) {
  .manager-header {
    margin-bottom: 10px;
    padding: 0 5px 8px 5px;
  }

  .manager-header h2 {
    font-size: 14px;
  }

  .obstacle-card {
    min-height: 60px;
    padding: 8px;
    margin-bottom: 4px;
  }

  .obstacle-preview {
    width: 50px;
    height: 50px;
  }

  .obstacle-info h3 {
    font-size: 13px;
    margin-bottom: 3px;
  }

  .type-label {
    font-size: 10px;
    padding: 1px 5px;
  }

  .date-label {
    font-size: 10px;
  }
}

/* 超小屏幕适配 */
@media screen and (max-height: 600px) {
  .obstacle-grid {
    gap: 8px;
  }

  .custom-obstacle-manager {
    padding: 8px;
  }

  .manager-header {
    margin-bottom: 8px;
    padding: 0 3px 6px 3px;
  }

  .obstacle-card {
    gap: 6px;
  }
}

.loading-state,
.error-state {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 30px 20px;
  flex-direction: column;
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

/* 编辑器内的错误提示样式 */
.editor-error-tips {
  margin-bottom: 16px;
}

.solution-list {
  padding: 8px 0;
  font-size: 13px;
}

.solution-list p {
  margin: 4px 0;
}

.solution-list ol {
  margin: 4px 0;
  padding-left: 20px;
}

.solution-list li {
  margin: 3px 0;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}
</style>
