<template>
    <div class="shared-obstacles-view">
        <div class="view-header">
            <h2>共享障碍物</h2>
            <el-button @click="refreshSharedObstacles" :loading="obstacleStore.isLoadingShared">
                <el-icon>
                    <Refresh />
                </el-icon>刷新
            </el-button>
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
            <el-empty :description="obstacleStore.sharedError || '加载失败，请重试'">
                <el-button type="primary" @click="refreshSharedObstacles">重试</el-button>
            </el-empty>
        </div>

        <div v-else-if="!obstacleStore.sharedObstacles.length" class="empty-state">
            <el-empty description="暂无共享障碍物">
            </el-empty>
        </div>

        <div v-else class="obstacle-grid">
            <!-- 加载中遮罩 -->
            <div v-if="obstacleStore.isLoadingShared" class="loading-overlay">
                <el-icon class="loading-icon">
                    <Loading />
                </el-icon>
            </div>

            <div v-for="obstacle in obstacleStore.sortedSharedObstacles" :key="obstacle.id" class="obstacle-card"
                draggable="true" @dragstart="handleDragStart($event, obstacle)">
                <div class="obstacle-preview">
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
                    <div class="creator-label">
                        <el-tag size="small">{{ obstacle.creator }}</el-tag>
                    </div>
                </div>

                <div class="obstacle-actions">
                    <el-button-group>
                        <el-button size="small" type="primary" @click="useObstacle(obstacle)" title="使用">
                            <el-icon>
                                <Download />
                            </el-icon>
                        </el-button>
                    </el-button-group>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Refresh, Loading, Download } from '@element-plus/icons-vue'
import { useObstacleStore } from '@/stores/obstacle'
import { useUserStore } from '@/stores/user'
import { ObstacleType } from '@/types/obstacle'
import type { CustomObstacleTemplate } from '@/types/obstacle'
import { ElMessage } from 'element-plus'

const obstacleStore = useObstacleStore()
const userStore = useUserStore()

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

// 刷新共享障碍物列表
const refreshSharedObstacles = () => {
    obstacleStore.initSharedObstacles()
}

// 处理拖拽开始
const handleDragStart = (event: DragEvent, obstacle: CustomObstacleTemplate) => {
    // 设置拖拽数据 - 使用SHARED前缀表示这是共享障碍物
    event.dataTransfer?.setData('text/plain', `SHARED:${obstacle.id}`)

    // 获取拖拽元素
    const dragElement = event.target as HTMLElement;

    // 创建自定义拖拽图像
    if (event.dataTransfer) {
        // 获取预览元素的位置
        const previewElement = dragElement.querySelector('.obstacle-preview');

        if (previewElement) {
            // 设置拖拽图像，并调整偏移量以确保鼠标指针位于图像中心
            const rect = previewElement.getBoundingClientRect();
            const offsetX = rect.width / 2;
            const offsetY = rect.height / 2;

            // 设置拖拽图像
            event.dataTransfer.setDragImage(previewElement, offsetX, offsetY);

            // 设置拖拽效果
            event.dataTransfer.effectAllowed = 'copy';
        }
    }

    console.log('开始拖拽共享障碍物:', obstacle.id);
}

// 使用共享障碍物 - 保存到自己的自定义障碍物中
const useObstacle = async (obstacle: CustomObstacleTemplate) => {
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

    &:active {
        cursor: grabbing;
        transform: translateY(0);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        background-color: var(--el-color-success-light-9);
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

    .type-label {
        margin: 0 0 4px 0;
        padding: 2px 6px;
        color: var(--el-color-success);
        font-size: 11px;
        background-color: var(--el-color-success-light-9);
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
        left: 2px;
        right: 2px;
        height: 2px;
        background-color: rgba(0, 0, 0, 0.1);
        border-radius: 50%;
        filter: blur(1px);
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

@keyframes rotating {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}
</style>
