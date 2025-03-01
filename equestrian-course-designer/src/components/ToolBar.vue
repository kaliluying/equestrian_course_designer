<template>
  <div class="toolbar">
    <div class="section course-name-section">
      <h2 class="section-title">路线名称</h2>
      <div class="course-name">
        <el-input
          v-model="courseName"
          @change="updateName"
          placeholder="输入路线名称"
          class="course-name-input"
          :prefix-icon="Edit"
        />
      </div>
    </div>
    <div class="section obstacle-templates">
      <h2 class="section-title">障碍物模板</h2>

      <div class="templates-grid">
        <div
          v-for="type in obstacleTypes"
          :key="type"
          class="obstacle-template"
          draggable="true"
          @dragstart="handleDragStart($event, type)"
        >
          <div class="template-preview">
            <template v-if="type === 'SINGLE'">
              <div class="preview-pole"></div>
            </template>
            <template v-else-if="type === 'DOUBLE'">
              <div class="preview-pole"></div>
              <div class="preview-pole"></div>
            </template>
            <template v-else-if="type === 'WALL'">
              <div class="preview-wall"></div>
            </template>
            <template v-else-if="type === 'LIVERPOOL'">
              <div class="preview-liverpool">
                <div class="preview-pole"></div>
                <div class="preview-water"></div>
              </div>
            </template>
            <template v-else>
              <div class="preview-pole"></div>
              <div class="preview-pole"></div>
              <div class="preview-pole"></div>
            </template>
          </div>
          <span class="template-name">{{ typeNames[type] }}</span>
        </div>
      </div>
    </div>

    <div class="section actions">
      <h2 class="section-title">操作</h2>

      <div class="action-buttons">
        <el-button
          @click="handleSaveDesign"
          type="primary"
          class="action-button"
          :title="!userStore.currentUser ? '需要登录才能保存' : '保存设计'"
        >
          <el-icon><Download /></el-icon>
          保存设计
          <el-icon v-if="!userStore.currentUser" class="lock-icon"><Lock /></el-icon>
        </el-button>

        <el-button
          @click="exportImage"
          type="primary"
          class="action-button"
          :title="!userStore.currentUser ? '需要登录才能导出图片' : '导出图片'"
        >
          <el-icon><Picture /></el-icon>
          导出图片
          <el-icon v-if="!userStore.currentUser" class="lock-icon"><Lock /></el-icon>
        </el-button>

        <el-button
          class="action-button"
          @click="triggerFileInput"
          :title="!userStore.currentUser ? '需要登录才能导入' : '导入设计'"
        >
          <el-icon><Upload /></el-icon>
          导入设计
          <el-icon v-if="!userStore.currentUser" class="lock-icon"><Lock /></el-icon>
        </el-button>

        <input
          type="file"
          ref="fileInput"
          style="display: none"
          accept=".json"
          @change="handleFileChange"
        />

        <el-button @click="generateCourse" type="success" class="action-button">
          <el-icon><Pointer /></el-icon>
          自动生成路线
        </el-button>

        <el-button @click="clearCourse" type="danger" class="action-button">
          <el-icon><Delete /></el-icon>
          清空画布
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ObstacleType } from '@/types/obstacle'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import { Download, Upload, Delete, Pointer, Edit, Lock, Picture } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage } from 'element-plus'
import html2canvas from 'html2canvas'
import { saveDesign } from '@/api/design'
import type { SaveDesignRequest } from '@/types/design'

const courseStore = useCourseStore()
const userStore = useUserStore()
const fileInput = ref<HTMLInputElement | null>(null)

const obstacleTypes = [
  ObstacleType.SINGLE,
  ObstacleType.DOUBLE,
  ObstacleType.COMBINATION,
  ObstacleType.WALL,
  ObstacleType.LIVERPOOL,
]

const typeNames = {
  [ObstacleType.SINGLE]: '单横木',
  [ObstacleType.DOUBLE]: '双横木',
  [ObstacleType.COMBINATION]: '组合障碍',
  [ObstacleType.WALL]: '砖墙',
  [ObstacleType.LIVERPOOL]: '利物浦',
}

const courseName = ref(courseStore.currentCourse.name)

const handleDragStart = (event: DragEvent, type: ObstacleType) => {
  event.dataTransfer?.setData('obstacleType', type)
}

const handleSaveDesign = async () => {
  if (!userStore.currentUser) {
    ElMessageBox.confirm('保存设计需要登录，是否立即登录？', '提示', {
      confirmButtonText: '去登录',
      cancelButtonText: '取消',
      type: 'info',
    }).then(() => {
      emit('show-login')
    }).catch(() => {})
    return
  }

  try {
    console.log('开始保存设计...')

    // 获取画布数据
    const canvas = document.querySelector('.course-canvas') as HTMLElement
    console.log('画布元素:', canvas)

    if (!canvas) {
      throw new Error('获取画布元素失败')
    }

    // 使用 html2canvas 将画布转换为图片
    console.log('开始转换画布为图片...')
    const imageCanvas = await html2canvas(canvas, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    })

    // 将 canvas 转换为 blob
    const imageBlob = await new Promise<Blob>((resolve, reject) => {
      try {
        imageCanvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('转换为 blob 失败'))
          }
        }, 'image/png')
      } catch (error) {
        reject(error)
      }
    })

    console.log('图片转换完成，大小:', imageBlob.size)

    // 创建设计文件
    const designData = courseStore.exportCourse()
    console.log('设计数据:', designData)

    const designBlob = new Blob([JSON.stringify(designData)], { type: 'application/json' })
    console.log('设计文件大小:', designBlob.size)

    // 构建保存请求数据
    const saveData: SaveDesignRequest = {
      title: courseName.value || '未命名设计',
      image: new File([imageBlob], 'design.png', { type: 'image/png' }),
      download: new File([designBlob], 'design.json', { type: 'application/json' })
    }

    console.log('准备发送保存请求...')
    // 发送保存请求
    const response = await saveDesign(saveData)
    console.log('保存响应:', response)

    ElMessage.success('保存成功')
  } catch (error) {
    console.error('保存失败，详细错误:', error)
    ElMessage.error(error instanceof Error ? error.message : '保存失败，请重试')
  }
}

const triggerFileInput = () => {
  if (!userStore.currentUser) {
    ElMessageBox.confirm('导入设计需要登录，是否立即登录？', '提示', {
      confirmButtonText: '去登录',
      cancelButtonText: '取消',
      type: 'info',
    }).then(() => {
      emit('show-login')
    }).catch(() => {})
    return
  }

  fileInput.value?.click()
}

const handleFileChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    await courseStore.loadCourse(file)
    courseName.value = courseStore.currentCourse.name
    ElMessageBox.alert('导入成功！', '提示', {
      confirmButtonText: '确定',
      type: 'success',
    })
  } catch (error) {
    ElMessageBox.alert('导入失败：' + (error as Error).message, '错误', {
      confirmButtonText: '确定',
      type: 'error',
    })
  } finally {
    input.value = '' // 清空文件输入，允许重复选择同一个文件
  }
}

const clearCourse = async () => {
  try {
    await ElMessageBox.confirm('确定要清空当前设计吗？', '警告', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    courseStore.currentCourse.obstacles = []
  } catch {
    // 用户取消操作
  }
}

const generateCourse = async () => {
  try {
    await ElMessageBox.confirm('这将清空当前设计并生成新的路线，是否继续？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
    // 发出自定义事件，让 CourseCanvas 组件处理
    const canvas = document.querySelector('.course-canvas')
    if (!canvas) return
    canvas.dispatchEvent(new CustomEvent('generate-course-path'))
  } catch {
    // 用户取消操作
  }
}

const updateName = () => {
  courseStore.updateCourseName(courseName.value)
}

const exportImage = async () => {
  // 检查用户是否已登录
  if (!userStore.currentUser) {
    ElMessageBox.confirm('导出图片需要登录，是否立即登录？', '提示', {
      confirmButtonText: '去登录',
      cancelButtonText: '取消',
      type: 'info',
    }).then(() => {
      emit('show-login')
    }).catch(() => {})
    return
  }

  try {
    // 获取画布元素
    const canvas = document.querySelector('.course-canvas') as HTMLElement
    if (!canvas) {
      throw new Error('未找到画布元素')
    }

    // 临时隐藏控制路线弧度的控制点
    const controlPoints = canvas.querySelectorAll('.control-point, .control-line, .path-indicator .rotation-handle')
    controlPoints.forEach((point) => {
      ;(point as HTMLElement).style.display = 'none'
    })

    // 使用 html2canvas 将画布转换为图片
    const imageCanvas = await html2canvas(canvas, {
      backgroundColor: '#ffffff',
      scale: 2, // 提高导出图片的清晰度
      useCORS: true, // 允许跨域图片
    })

    // 恢复控制点的显示
    controlPoints.forEach((point) => {
      ;(point as HTMLElement).style.display = ''
    })

    // 将 canvas 转换为图片 URL
    const imageUrl = imageCanvas.toDataURL('image/png')

    // 创建下载链接
    const link = document.createElement('a')
    const date = new Date()
    const formattedDateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
    link.download = `${courseStore.currentCourse.name}-${formattedDateTime}.png`
    link.href = imageUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    ElMessageBox.alert('导出成功！', '提示', {
      confirmButtonText: '确定',
      type: 'success',
    })
  } catch (error) {
    ElMessageBox.alert('导出失败：' + (error as Error).message, '错误', {
      confirmButtonText: '确定',
      type: 'error',
    })
  }
}

onMounted(() => {
  courseName.value = courseStore.currentCourse.name
})

// const addCoursePath = () => {
//   // 在画布中心添加起终点
//   const canvas = document.querySelector('.course-canvas')
//   if (!canvas) return

//   const rect = canvas.getBoundingClientRect()
//   const centerX = rect.width / 2
//   const centerY = rect.height / 2

//   // 发出自定义事件，让 CourseCanvas 组件处理
//   canvas.dispatchEvent(
//     new CustomEvent('add-course-path', {
//       detail: {
//         startPoint: { x: centerX - 100, y: centerY },
//         endPoint: { x: centerX + 100, y: centerY },
//       },
//     }),
//   )
// }

// 修改 emit 定义，添加 show-login 事件
const emit = defineEmits(['show-login'])
</script>

<style scoped lang="scss">
.toolbar {
  height: 100%;
  background-color: white;
  display: flex;
  flex-direction: column;
}

.section {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);

  &.obstacle-templates {
    flex: 1;
    overflow-y: auto;
  }

  &.actions {
    flex-shrink: 0;
    background-color: white;
  }
}

.section-title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-color);
}

.templates-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding-bottom: 16px;
}

.obstacle-template {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: move;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.3s ease;

  &:hover {
    background-color: var(--secondary-color);
    border-color: var(--primary-color);
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }
}

.template-preview {
  width: 50px;
  height: 50px;
  background-color: white;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border-color);

  .preview-pole {
    width: 100%;
    height: 6px;
    background: linear-gradient(90deg, #8b4513 0%, #a0522d 100%);
    border-radius: 2px;
    box-shadow: 0 1px 2px rgba(139, 69, 19, 0.2);
  }
}

.template-name {
  font-size: 13px;
  color: var(--text-color);
  font-weight: 500;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 20px;

  .action-button {
    width: 100%;
    justify-content: center;
    gap: 8px;
    padding: 12px 20px;
    font-size: 14px;
    border-radius: 6px;
    margin-left: 0;
    position: relative;

    .lock-icon {
      position: absolute;
      right: 12px;
      font-size: 14px;
      opacity: 0.7;
    }

    &:not(.el-button--primary):not(.el-button--danger) {
      background-color: var(--secondary-color);
      border-color: var(--border-color);
      color: var(--text-color);

      &:hover {
        background-color: #e6f0ff;
        border-color: var(--primary-color);
        color: var(--primary-color);
      }
    }
  }
}

.preview-wall {
  width: 100%;
  height: 24px;
  background: linear-gradient(90deg, #8b4513 0%, #a0522d 100%);
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(139, 69, 19, 0.2);
  position: relative;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-image: repeating-linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.1) 0px,
      rgba(0, 0, 0, 0.1) 3px,
      transparent 3px,
      transparent 6px
    );
  }
}

.preview-liverpool {
  width: 100%;
  height: 24px;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;

  .preview-pole {
    width: 100%;
    height: 6px;
    background: linear-gradient(90deg, #8b4513 0%, #a0522d 100%);
    border-radius: 2px;
    margin-bottom: 2px;
  }

  .preview-water {
    width: 100%;
    height: 12px;
    background: rgba(0, 100, 255, 0.3);
    border-radius: 2px;
  }
}

.path-template {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  transition: all 0.3s ease;
  margin-top: 8px;

  &:hover {
    background-color: var(--secondary-color);
    border-color: var(--primary-color);
    transform: translateY(-2px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .template-preview {
    width: 50px;
    height: 50px;
    background-color: white;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--border-color);
    padding: 8px;
  }

  .preview-path {
    width: 100%;
    height: 100%;
  }
}

.course-name-section {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);

  .course-name {
    display: flex;
    align-items: center;
  }

  :deep(.el-input) {
    .el-input__wrapper {
      box-shadow: none;
      background-color: var(--secondary-color);
      border: 1px solid var(--border-color);
      transition: all 0.3s ease;

      &:hover {
        border-color: var(--primary-color);
      }

      &.is-focus {
        box-shadow: 0 0 0 1px var(--primary-color);
        border-color: var(--primary-color);
      }
    }

    .el-input__inner {
      height: 36px;
      font-size: 14px;
      color: var(--text-color);

      &::placeholder {
        color: #909399;
      }
    }
  }
}

.course-name {
  margin: 0;
}

.course-name-input {
  width: 100%;
}
</style>
