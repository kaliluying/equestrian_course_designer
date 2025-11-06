<template>
  <div class="toolbar">
    <!-- 路线名称部分 -->
    <div class="section course-name-section">
      <h2 class="section-title">路线名称</h2>
      <div class="course-name">
        <el-input v-model="courseName" @change="updateName" placeholder="输入路线名称" class="course-name-input"
          :prefix-icon="Edit" />
      </div>
    </div>

    <!-- 可折叠区域导航 -->
    <div class="section-tabs">
      <div class="section-tab" :class="{ active: activeSection === 'templates' }" @click="activeSection = 'templates'">
        障碍物模板
      </div>
      <div class="section-tab" :class="{ active: activeSection === 'actions' }" @click="activeSection = 'actions'">
        操作
      </div>
    </div>

    <!-- 障碍物模板部分 - 可滚动区域 -->
    <div class="scrollable-section" v-show="activeSection === 'templates'">
      <div class="section obstacle-templates">
        <!-- 自定义障碍标签导航 -->
        <div class="obstacle-type-tabs">
          <div class="obstacle-type-tab" :class="{ active: activeTab === 'basic' }" @click="activeTab = 'basic'">
            基础障碍物
          </div>
          <div class="obstacle-type-tab" :class="{ active: activeTab === 'custom' }" @click="activeTab = 'custom'">
            自定义障碍物
          </div>
        </div>

        <!-- 基础障碍物内容 -->
        <div v-show="activeTab === 'basic'" class="obstacle-tab-content">
          <div class="templates-grid">
            <div v-for="type in obstacleTypes" :key="type" class="obstacle-template" draggable="true"
              @dragstart="handleDragStart($event, type)">
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
                <template v-else-if="type === 'WATER'">
                  <div class="preview-water-obstacle"></div>
                </template>
                <template v-else>
                  <div class="preview-pole"></div>
                  <div class="preview-pole"></div>
                  <div class="preview-pole"></div>
                </template>
              </div>
              <span class="template-name">{{ getTypeName(type) }}</span>
            </div>
          </div>
        </div>

        <!-- 自定义障碍物内容 -->
        <div v-show="activeTab === 'custom'" class="obstacle-tab-content">
          <CustomObstacleManager />
        </div>
      </div>
    </div>

    <!-- 操作部分 -->
    <div class="scrollable-section" v-show="activeSection === 'actions'">
      <div class="section actions">
        <div class="action-buttons">
          <el-button @click="handleSaveDesign" type="primary" class="action-button"
            :title="!userStore.currentUser ? '需要登录才能保存' : '保存设计'">
            <el-icon>
              <Download />
            </el-icon>
            保存设计
            <el-icon v-if="!userStore.currentUser" class="lock-icon">
              <Lock />
            </el-icon>
          </el-button>

          <el-dropdown @command="handleExport" trigger="click" class="export-dropdown">
            <el-button type="primary" class="action-button" :title="!userStore.currentUser ? '需要登录才能导出' : '导出设计'">
              <el-icon>
                <Picture />
              </el-icon>
              导出设计
              <el-icon class="el-icon--right">
                <ArrowDown />
              </el-icon>
              <el-icon v-if="!userStore.currentUser" class="lock-icon">
                <Lock />
              </el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="png">导出PNG</el-dropdown-item>
                <el-dropdown-item command="pdf">导出PDF</el-dropdown-item>
                <el-dropdown-item command="json">导出为JSON数据</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <el-button class="action-button" @click="triggerFileInput"
            :title="!userStore.currentUser ? '需要登录才能导入' : '导入设计'">
            <el-icon>
              <Upload />
            </el-icon>
            导入设计
            <el-icon v-if="!userStore.currentUser" class="lock-icon">
              <Lock />
            </el-icon>
          </el-button>

          <input type="file" ref="fileInput" style="display: none" accept=".json" @change="handleFileChange" />

          <el-button @click="generateCourse" type="success" class="action-button">
            <el-icon>
              <Pointer />
            </el-icon>
            自动生成路线
          </el-button>

          <el-button @click="clearCourse" type="danger" class="action-button">
            <el-icon>
              <Delete />
            </el-icon>
            清空画布
          </el-button>
        </div>
      </div>
    </div>



    <!-- 添加PDF导出选项对话框 -->
    <el-dialog v-model="pdfExportOptions.visible" title="PDF导出选项" width="400px" :close-on-click-modal="false"
      :close-on-press-escape="true">
      <el-form label-position="top">
        <el-form-item label="纸张大小">
          <el-select v-model="pdfExportOptions.paperSize" style="width: 100%">
            <el-option label="A3" value="a3" />
            <el-option label="A4" value="a4" />
            <el-option label="A5" value="a5" />
            <el-option label="Letter" value="letter" />
          </el-select>
        </el-form-item>

        <el-form-item label="方向">
          <el-select v-model="pdfExportOptions.orientation" style="width: 100%">
            <el-option label="自动选择" value="auto" />
            <el-option label="横向" value="landscape" />
            <el-option label="纵向" value="portrait" />
          </el-select>
        </el-form-item>

        <el-form-item label="图像质量">
          <el-slider v-model="pdfExportOptions.quality" :min="0.5" :max="1" :step="0.05"
            :format-tooltip="(value: number) => `${Math.round(value * 100)}%`" />
        </el-form-item>

        <el-form-item>
          <el-checkbox v-model="pdfExportOptions.includeFooter">包含页脚</el-checkbox>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="pdfExportOptions.visible = false">取消</el-button>
        <el-button type="primary" @click="exportPDF">导出PDF</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ObstacleType } from '@/types/obstacle'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import { Download, Upload, Delete, Pointer, Edit, Lock, Picture, ArrowDown } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage, ElLoading } from 'element-plus'
import html2canvas from 'html2canvas'
import { saveDesign } from '@/api/design'
import type { SaveDesignRequest } from '@/types/design'
import { jsPDF } from 'jspdf'
import CustomObstacleManager from '@/components/CustomObstacleManager.vue'


import { createEnhancedHtml2CanvasConfig, cleanupHtml2CanvasProcessing } from '@/utils/enhancedHtml2CanvasConfig'
import { smartCanvasRendering, type BackupRenderConfig } from '@/utils/canvasBackupRenderer'
import { exportErrorHandler, type ExportContext } from '@/utils/exportErrorHandler'
import { exportStatusManager, ExportProgressTracker } from '@/utils/exportProgressTracker'

const courseStore = useCourseStore()
const userStore = useUserStore()
const fileInput = ref<HTMLInputElement | null>(null)

const obstacleTypes = [
  ObstacleType.SINGLE,
  ObstacleType.DOUBLE,
  ObstacleType.COMBINATION,
  ObstacleType.WALL,
  ObstacleType.LIVERPOOL,
  ObstacleType.WATER,
]

const typeNames = {
  [ObstacleType.SINGLE]: '单横木',
  [ObstacleType.DOUBLE]: '双横木',
  [ObstacleType.COMBINATION]: '组合障碍',
  [ObstacleType.WALL]: '砖墙',
  [ObstacleType.LIVERPOOL]: '利物浦',
  [ObstacleType.WATER]: '水障',
}

const courseName = ref(courseStore.currentCourse.name)

const pdfExportOptions = ref({
  visible: false,
  quality: 0.95,
  includeObstacleNumbers: true,
  includeFooter: true,
  paperSize: 'a4',
  orientation: 'auto'
})

const activeTab = ref('basic')

const activeSection = ref('templates')



const handleDragStart = (event: DragEvent, type: ObstacleType) => {
  event.dataTransfer?.setData('text/plain', type)

  // 获取拖拽元素
  const dragElement = event.target as HTMLElement;

  // 创建自定义拖拽图像
  if (event.dataTransfer) {
    // 获取预览元素的位置
    const previewElement = dragElement.querySelector('.template-preview');

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


}

const handleSaveDesign = async () => {
  if (!userStore.currentUser) {
    ElMessageBox.confirm('保存设计需要登录，是否立即登录？', '提示', {
      confirmButtonText: '去登录',
      cancelButtonText: '取消',
      type: 'info',
    }).then(() => {
      emit('show-login')
    }).catch(() => { })
    return
  }

  try {


    // 显示加载提示
    const loadingInstance = ElLoading.service({
      lock: true,
      text: '正在生成设计图片...',
      background: 'rgba(0, 0, 0, 0.7)'
    })

    // 获取画布元素
    const canvas = document.querySelector('.course-canvas') as HTMLElement


    if (!canvas) {
      throw new Error('获取画布元素失败')
    }

    // 1. 预处理：保存元素的原始状态
    // 保存需要临时隐藏的元素的状态
    const hiddenElements = [
      ...Array.from(canvas.querySelectorAll('.control-point')),
      ...Array.from(canvas.querySelectorAll('.control-line')),
      ...Array.from(canvas.querySelectorAll('.path-indicator .rotation-handle')),
      ...Array.from(canvas.querySelectorAll('.el-button')),
      ...Array.from(canvas.querySelectorAll('.toolbar')),
      ...Array.from(canvas.querySelectorAll('.settings-panel'))
    ]

    const originalStyles: { element: HTMLElement, display: string, visibility: string }[] = []

    // 临时隐藏干扰元素
    hiddenElements.forEach(element => {
      const el = element as HTMLElement
      originalStyles.push({
        element: el,
        display: el.style.display,
        visibility: el.style.visibility
      })
      el.style.display = 'none'
      el.style.visibility = 'hidden'
    })

    // 2. 创建一个临时的包装容器，避免被父元素样式影响
    const tempWrapper = document.createElement('div')
    tempWrapper.style.position = 'absolute'
    tempWrapper.style.left = '-9999px'
    tempWrapper.style.top = '-9999px'
    tempWrapper.style.width = '100%'
    tempWrapper.style.height = '100%'
    document.body.appendChild(tempWrapper)

    // 3. 保存原始画布尺寸和位置
    const originalRect = canvas.getBoundingClientRect()
    const originalWidth = originalRect.width
    const originalHeight = originalRect.height



    try {
      // 4. 使用增强的html2canvas配置处理SVG导出
      const enhancedConfig = createEnhancedHtml2CanvasConfig(canvas, {
        backgroundColor: '#ffffff',
        scale: 3,
        quality: 1.0,
        width: originalWidth,
        height: originalHeight,
        svgRenderingMode: 'enhanced',
        forceInlineStyles: true,
        preserveSVGViewBox: true,
        enhanceSVGVisibility: true,
        enableDebugMode: false,
        logSVGProcessing: false
      })

      const imageCanvas = await html2canvas(canvas, enhancedConfig)



      // 5. 处理生成的图像，确保合适的尺寸
      const finalWidth = Math.max(800, imageCanvas.width)
      const finalHeight = Math.max(600, imageCanvas.height)

      // 创建最终输出画布
      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = finalWidth
      outputCanvas.height = finalHeight
      const ctx = outputCanvas.getContext('2d')

      if (!ctx) {
        throw new Error('无法获取画布上下文')
      }

      // 填充白色背景
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, finalWidth, finalHeight)

      // 居中绘制图像
      const x = (finalWidth - imageCanvas.width) / 2
      const y = (finalHeight - imageCanvas.height) / 2
      ctx.drawImage(imageCanvas, 0, 0, imageCanvas.width, imageCanvas.height,
        x, y, imageCanvas.width, imageCanvas.height)

      // 6. 转换为高质量Blob
      const imageBlob = await new Promise<Blob>((resolve, reject) => {
        outputCanvas.toBlob((blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('转换为图片失败'))
          }
        }, 'image/png', 1.0)  // 使用最高质量
      })



      // 7. 导出设计数据
      const designData = courseStore.exportCourse()
      const designBlob = new Blob([JSON.stringify(designData, null, 2)], { type: 'application/json' })

      // 8. 检查是否是更新现有设计
      const designIdToUpdate = localStorage.getItem('design_id_to_update')


      // 构建保存请求数据
      const saveData: SaveDesignRequest = {
        title: courseName.value || '未命名设计',
        image: new File([imageBlob], 'design.png', { type: 'image/png' }),
        download: new File([designBlob], 'design.json', { type: 'application/json' })
      }

      if (designIdToUpdate) {
        const designId = parseInt(designIdToUpdate)
        if (isNaN(designId)) {
          console.error('设计ID无效:', designIdToUpdate)
          throw new Error('设计ID无效，无法更新')
        }
        saveData.id = designId

      } else {

      }

      // 9. 发送保存请求
      const response = await saveDesign(saveData)


      if (response.id) {
        // 保存新ID到localStorage
        localStorage.setItem('design_id_to_update', response.id.toString())

        ElMessage.success('设计保存成功！')
      } else {
        throw new Error('保存响应中没有ID')
      }
    } finally {
      // 10. 恢复元素原始状态
      originalStyles.forEach(({ element, display, visibility }) => {
        element.style.display = display
        element.style.visibility = visibility
      })

      // 清理html2canvas处理上下文
      cleanupHtml2CanvasProcessing(canvas)

      // 删除临时包装容器
      if (tempWrapper && tempWrapper.parentNode) {
        tempWrapper.parentNode.removeChild(tempWrapper)
      }

      // 关闭加载提示
      loadingInstance.close()
    }
  } catch (error) {
    console.error('保存设计失败:', error)
    ElMessageBox.alert('保存设计失败：' + (error as Error).message, '错误', {
      confirmButtonText: '确定',
      type: 'error',
    })
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
    }).catch(() => { })
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
    // 使用存储中的resetCourse方法完全重置课程
    courseStore.resetCourse()

    // 如果在协作模式下，可能需要通知其他用户
    const canvas = document.querySelector('.course-canvas')
    if (canvas) {
      // 触发自定义事件，通知画布组件
      canvas.dispatchEvent(new CustomEvent('clear-canvas'))
    }

    ElMessage.success('画布已清空')
    localStorage.removeItem('design_id_to_update')
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

// 添加一个函数来清理画布中可能导致乱码的特殊字符
const cleanupCanvasForExport = (canvas: HTMLElement) => {
  // 查找所有文本节点
  const textNodes: Node[] = []
  const walker = document.createTreeWalker(
    canvas,
    NodeFilter.SHOW_TEXT,
    null
  )

  let node
  while (node = walker.nextNode()) {
    textNodes.push(node)
  }

  // 保存原始文本内容
  const originalTexts: { node: Node, text: string }[] = []

  // 临时替换特殊字符
  textNodes.forEach(node => {
    if (node.textContent) {
      originalTexts.push({ node, text: node.textContent })
      // 替换非ASCII字符为空格
      node.textContent = node.textContent.replace(/[^\x00-\x7F]/g, ' ')
    }
  })

  return () => {
    // 恢复原始文本
    originalTexts.forEach(({ node, text }) => {
      node.textContent = text
    })
  }
}





// 修改handleExport函数，使用新的清理函数
const handleExport = async (command: string) => {
  // 检查用户是否已登录
  if (!userStore.currentUser) {
    ElMessageBox.confirm('导出设计需要登录，是否立即登录？', '提示', {
      confirmButtonText: '去登录',
      cancelButtonText: '取消',
      type: 'info',
    }).then(() => {
      emit('show-login')
    }).catch(() => { })
    return
  }



  if (command === 'pdf') {
    // 显示PDF导出选项对话框
    pdfExportOptions.value.visible = true
    return
  }

  if (command === 'json') {
    try {
      // 获取当前日期时间格式化字符串
      const date = new Date()
      const formattedDateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
      const fileName = `${courseStore.currentCourse.name}-${formattedDateTime}.json`

      // 导出设计数据为JSON
      const designData = courseStore.exportCourse()

      // 创建Blob对象
      const jsonBlob = new Blob([JSON.stringify(designData, null, 2)], { type: 'application/json' })

      // 创建下载链接
      const url = URL.createObjectURL(jsonBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()

      // 清理
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      ElMessage.success('JSON数据导出成功！')
      return
    } catch (error) {
      ElMessageBox.alert('导出JSON失败：' + (error as Error).message, '错误', {
        confirmButtonText: '确定',
        type: 'error',
      })
      return
    }
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
      ; (point as HTMLElement).style.display = 'none'
    })

    // 获取当前日期时间格式化字符串
    const date = new Date()
    const formattedDateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
    const fileName = `${courseStore.currentCourse.name}-${formattedDateTime}`

    if (command === 'png') {
      // 使用优化的PNG导出函数
      try {
        await exportCanvasToPNG(canvas, fileName)
        ElMessage.success('PNG图片导出成功！')
      } catch (error) {
        console.error('PNG导出失败:', error)
        ElMessage.error('PNG导出失败：' + (error as Error).message)
      }
      return // 早期返回，避免执行后续代码
    }

    // 对于其他导出格式，恢复控制点状态
    controlPoints.forEach((point) => {
      (point as HTMLElement).style.display = ''
    })
  } catch (error) {
    ElMessageBox.alert('导出失败：' + (error as Error).message, '错误', {
      confirmButtonText: '确定',
      type: 'error',
    })
  }
}

// 同样修改exportPDF函数
// PDF导出函数，集成错误处理和进度跟踪
const exportPDF = async () => {
  const exportId = `pdf_export_${Date.now()}`
  const progressTracker = exportStatusManager.createTracker(exportId, {
    showDetailedMessages: true,
    showPercentage: true,
    enableNotifications: true
  })

  const exportContext: ExportContext = {
    operation: 'pdf_export',
    attempt: 1,
    maxAttempts: 3,
    options: {
      backgroundColor: '#ffffff',
      scale: 3,
      quality: pdfExportOptions.value.quality,
      svgRenderingMode: 'enhanced',
      forceInlineStyles: true,
      paperSize: pdfExportOptions.value.paperSize,
      orientation: pdfExportOptions.value.orientation
    }
  }

  try {
    // 开始进度跟踪
    progressTracker.startProgress()
    progressTracker.updateStage('initializing', '正在初始化PDF导出...')

    // 获取画布元素
    const canvas = document.querySelector('.course-canvas') as HTMLElement
    if (!canvas) {
      throw new Error('未找到画布元素')
    }

    exportContext.canvas = canvas

    // 使用重试机制执行导出
    await exportErrorHandler.executeWithRetry(
      async () => {
        return await performPDFExport(canvas, progressTracker)
      },
      exportContext,
      {
        maxAttempts: 3,
        delayMs: 1000,
        retryableErrors: ['svg_rendering', 'html2canvas', 'file_generation']
      }
    )

    progressTracker.completeProgress(true, 'PDF导出成功完成')

    // 关闭PDF选项对话框
    pdfExportOptions.value.visible = false
  } catch (error) {
    console.error('PDF导出失败:', error)

    // 尝试错误恢复
    const recoveryResult = await exportErrorHandler.handleHtml2CanvasError(
      error as Error,
      exportContext
    )

    if (recoveryResult.success) {
      progressTracker.completeProgress(true, `PDF导出成功 (使用${recoveryResult.fallbackMethod})`)
      pdfExportOptions.value.visible = false
    } else {
      progressTracker.completeProgress(false, 'PDF导出失败')
      ElMessageBox.alert('导出失败：' + (error as Error).message, '错误', {
        confirmButtonText: '确定',
        type: 'error',
      })
    }
  } finally {
    exportStatusManager.removeTracker(exportId)
  }
}

// 执行PDF导出的核心逻辑
const performPDFExport = async (
  canvas: HTMLElement,
  progressTracker: ExportProgressTracker
): Promise<void> => {
  // 阶段1: 准备画布
  progressTracker.updateStage('preparing_canvas', '正在准备PDF导出画布...')

  const controlPoints = canvas.querySelectorAll('.control-point, .control-line, .path-indicator .rotation-handle')
  controlPoints.forEach((point) => {
    (point as HTMLElement).style.display = 'none'
  })

  // 使用画布的原始尺寸，确保导出图片与显示一致
  const canvasRect = canvas.getBoundingClientRect()
  const originalWidth = canvasRect.width
  const originalHeight = canvasRect.height

  console.log('PDF导出使用原始画布尺寸:', {
    width: originalWidth,
    height: originalHeight
  })

  const textElements = canvas.querySelectorAll('.course-title, .course-info')
  const originalDisplays: { el: HTMLElement, display: string }[] = []
  textElements.forEach((el) => {
    const htmlEl = el as HTMLElement
    originalDisplays.push({ el: htmlEl, display: htmlEl.style.display })
    htmlEl.style.display = 'none'
  })

  progressTracker.updateSubProgress(30, '正在清理特殊字符...')
  const restoreTexts = cleanupCanvasForExport(canvas)

  // 阶段2: 使用SVG导出增强器处理SVG元素
  progressTracker.updateStage('processing_svg', '正在使用SVG导出增强器处理PDF中的SVG元素...')

  // 创建SVG导出增强器实例
  const svgEnhancer = new (await import('@/utils/svgExportEnhancer')).SVGExportEnhancer()

  progressTracker.updateSubProgress(20, '正在预处理SVG元素...')

  // 预处理SVG元素并创建备份
  const svgProcessingResult = svgEnhancer.prepareSVGForExport(canvas)

  progressTracker.updateSubProgress(50, '正在应用PDF特定的样式优化...')

  // 应用样式内联转换，PDF需要更强的样式内联
  svgEnhancer.applyStyleInlining(svgProcessingResult.processedElements)

  // PDF特定的SVG处理优化
  progressTracker.updateSubProgress(70, '正在应用PDF特定的SVG优化...')
  svgProcessingResult.processedElements.forEach(processedElement => {
    const { element } = processedElement

    // 确保PDF中的路径渲染质量
    if (element.tagName.toLowerCase() === 'path' || element.querySelector('path')) {
      // 强制设置高质量的渲染属性
      element.style.shapeRendering = 'geometricPrecision'
      element.style.textRendering = 'geometricPrecision'

      // 确保路径在PDF中可见
      const pathElements = element.tagName.toLowerCase() === 'path'
        ? [element as SVGPathElement]
        : Array.from(element.querySelectorAll('path'))

      pathElements.forEach(path => {
        // 确保路径有足够的对比度
        if (!path.getAttribute('stroke') || path.getAttribute('stroke') === 'none') {
          path.setAttribute('stroke', '#2563eb') // 使用深蓝色确保在PDF中可见
        }
        if (!path.getAttribute('stroke-width')) {
          path.setAttribute('stroke-width', '2.5') // PDF中使用稍粗的线条
        }
        // 确保路径不被填充遮盖
        if (!path.getAttribute('fill')) {
          path.setAttribute('fill', 'none')
        }
      })
    }
  })

  progressTracker.updateSubProgress(90, 'PDF SVG优化完成')

  try {
    // 阶段3: 渲染图像
    progressTracker.updateStage('rendering', '正在使用增强配置渲染PDF图像...')

    const enhancedConfig = createEnhancedHtml2CanvasConfig(canvas, {
      backgroundColor: '#ffffff',
      scale: 3, // PDF使用高分辨率
      quality: pdfExportOptions.value.quality,
      width: originalWidth,
      height: originalHeight,
      svgRenderingMode: 'enhanced',
      forceInlineStyles: true,
      preserveSVGViewBox: true,
      enhanceSVGVisibility: true,
      enableDebugMode: false,
      logSVGProcessing: true
    })

    let imageCanvas: HTMLCanvasElement

    try {
      progressTracker.updateSubProgress(30, '正在执行html2canvas渲染...')
      imageCanvas = await html2canvas(canvas, enhancedConfig)

      progressTracker.updateSubProgress(60, '正在验证PDF渲染质量...')

      // 使用质量验证器检查PDF渲染结果
      const qualityValidator = new (await import('@/utils/exportQualityValidator')).ExportQualityValidator()

      // 验证路径完整性
      const pathValidationResult = await qualityValidator.validatePathCompleteness(imageCanvas, canvas)

      // 检查SVG渲染
      const svgRenderingCheck = await qualityValidator.checkSVGRendering(imageCanvas, canvas)

      if (!pathValidationResult.isValid || svgRenderingCheck.renderingIssues.length > 0) {
        const issues = pathValidationResult.issues.map(i => i.message).concat(
          svgRenderingCheck.renderingIssues.map(i => i.description)
        )
        progressTracker.showWarning(`PDF质量验证警告: ${issues.slice(0, 3).join(', ')}${issues.length > 3 ? '...' : ''}`)
        console.warn('PDF导出质量验证未通过:', { pathValidationResult, svgRenderingCheck })
      } else {
        progressTracker.updateSubProgress(70, `PDF质量验证通过 (路径完整性: ${pathValidationResult.pathCompleteness.toFixed(1)}%)`)
      }

    } catch (html2canvasError) {
      console.warn('PDF导出中html2canvas失败，尝试Canvas备用渲染:', html2canvasError)

      progressTracker.updateSubProgress(50, '正在使用Canvas备用渲染...')

      const backupConfig: BackupRenderConfig = {
        backgroundColor: '#ffffff',
        scale: 3,
        quality: pdfExportOptions.value.quality,
        padding: 20,
        enableSVGPreprocessing: true,
        forceStyleInlining: true,
        validateSVGElements: true,
        enableQualityValidation: true, // PDF启用质量验证
        enableDebugMode: false
      }

      const renderResult = await smartCanvasRendering(canvas, backupConfig)

      if (!renderResult.success) {
        throw new Error(`Canvas备用渲染失败: ${renderResult.errors.join(', ')}`)
      }

      imageCanvas = renderResult.canvas

      if (renderResult.warnings.length > 0) {
        progressTracker.showWarning(`备用渲染完成，但有 ${renderResult.warnings.length} 个警告`)
      }
    }

    // 阶段4: 生成PDF文件
    progressTracker.updateStage('generating_file', '正在生成PDF文件...')

    // 获取当前日期时间格式化字符串
    const date = new Date()
    const formattedDateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
    const fileName = `${courseStore.currentCourse.name}-${formattedDateTime}`

    progressTracker.updateSubProgress(20, '正在处理图像尺寸...')

    // 处理图像尺寸
    const canvasWidth = imageCanvas.width
    const canvasHeight = imageCanvas.height
    const minExportWidth = 800
    const minExportHeight = 600

    let finalCanvas = imageCanvas
    if (canvasWidth < minExportWidth || canvasHeight < minExportHeight) {
      const scaleRatio = Math.max(
        minExportWidth / canvasWidth,
        minExportHeight / canvasHeight
      )

      const scaledCanvas = document.createElement('canvas')
      const scaledWidth = Math.round(canvasWidth * scaleRatio)
      const scaledHeight = Math.round(canvasHeight * scaleRatio)

      scaledCanvas.width = scaledWidth
      scaledCanvas.height = scaledHeight

      const ctx = scaledCanvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, scaledWidth, scaledHeight)
        ctx.drawImage(imageCanvas, 0, 0, canvasWidth, canvasHeight, 0, 0, scaledWidth, scaledHeight)
        finalCanvas = scaledCanvas
      }
    }

    progressTracker.updateSubProgress(40, '正在配置PDF参数...')

    // 确定方向
    let orientation: 'landscape' | 'portrait'
    if (pdfExportOptions.value.orientation === 'auto') {
      orientation = finalCanvas.width > finalCanvas.height ? 'landscape' : 'portrait'
    } else {
      orientation = pdfExportOptions.value.orientation as 'landscape' | 'portrait'
    }

    progressTracker.updateSubProgress(60, '正在创建PDF文档...')

    // 创建PDF文档
    const pdf = new jsPDF({
      orientation: orientation,
      unit: 'pt',
      format: pdfExportOptions.value.paperSize
    })

    // 设置PDF元数据
    const safeCourseName = (courseStore.currentCourse.name || '未命名设计').replace(/[^\x00-\x7F]/g, '?')
    pdf.setProperties({
      title: safeCourseName,
      subject: '马术障碍赛路线设计',
      author: userStore.currentUser?.username || '马术障碍赛路线设计工具',
      keywords: '马术,障碍赛,路线设计',
      creator: '马术障碍赛路线设计工具'
    })

    // 获取PDF页面尺寸
    const pageSize = pdf.internal.pageSize
    const pdfWidth = pageSize.getWidth()
    const pdfHeight = pageSize.getHeight()

    // 计算图像在PDF中的尺寸，保持宽高比
    const availableWidth = pdfWidth - 40 // 留出边距
    const availableHeight = pdfHeight - 80 // 留出标题和边距空间

    const ratio = Math.min(availableWidth / finalCanvas.width, availableHeight / finalCanvas.height)
    const imgWidth = finalCanvas.width * ratio
    const imgHeight = finalCanvas.height * ratio

    // 计算居中位置
    const x = (pdfWidth - imgWidth) / 2
    const y = 60 // 标题下方位置

    progressTracker.updateSubProgress(80, '正在添加图像到PDF...')

    // 添加图像到PDF，使用JPEG格式以获得更好的压缩和质量平衡
    const imgData = finalCanvas.toDataURL('image/jpeg', Math.max(0.9, pdfExportOptions.value.quality))
    pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight)

    // 添加页脚
    if (pdfExportOptions.value.includeFooter) {
      const footerY = pdfHeight - 20
      pdf.setFontSize(8)
      pdf.text('Generated by Equestrian Obstacle Route Design Tool', 30, footerY)
    }

    // 阶段5: 完成处理
    progressTracker.updateStage('finalizing', '正在保存PDF文件...')

    // 保存PDF
    pdf.save(`${fileName}.pdf`)

  } finally {
    // 恢复所有元素状态
    controlPoints.forEach((point) => {
      (point as HTMLElement).style.display = ''
    })

    originalDisplays.forEach(({ el, display }) => {
      el.style.display = display
    })

    restoreTexts()

    // 恢复SVG处理结果
    svgEnhancer.restoreProcessingResult(svgProcessingResult)

    cleanupHtml2CanvasProcessing(canvas)

    // 清理SVG增强器缓存
    svgEnhancer.clearCache()
  }
}


// 修改 emit 定义，添加 show-login 事件
const emit = defineEmits(['show-login'])

// 添加获取类型名称的函数，以确保类型安全
const getTypeName = (type: string) => {
  return typeNames[type as keyof typeof typeNames] || type
}

// Canvas备用渲染导出函数，集成进度跟踪
const exportCanvasWithBackupRendering = async (
  canvas: HTMLElement,
  fileName: string,
  progressTracker?: ExportProgressTracker
) => {
  try {
    // 如果没有传入进度跟踪器，创建一个简单的加载提示
    let loadingInstance = null
    if (!progressTracker) {
      loadingInstance = ElLoading.service({
        lock: true,
        text: '正在使用Canvas备用渲染导出...',
        background: 'rgba(0, 0, 0, 0.7)'
      })
    } else {
      progressTracker.updateSubProgress(10, '正在配置Canvas备用渲染...')
    }

    // 配置Canvas备用渲染
    const backupConfig: BackupRenderConfig = {
      backgroundColor: '#ffffff',
      scale: 3,
      quality: 1.0,
      padding: 20,
      enableSVGPreprocessing: true,
      forceStyleInlining: true,
      validateSVGElements: true,
      enableQualityValidation: true,
      enableDebugMode: false,
      logProcessingSteps: true
    }

    if (progressTracker) {
      progressTracker.updateSubProgress(30, '正在执行智能Canvas渲染...')
    }

    // 执行智能Canvas渲染
    const renderResult = await smartCanvasRendering(canvas, backupConfig)

    if (loadingInstance) {
      loadingInstance.close()
    }

    if (renderResult.success) {
      if (progressTracker) {
        progressTracker.updateSubProgress(70, '正在生成PNG文件...')
      }

      // 导出为PNG
      const imageUrl = renderResult.canvas.toDataURL('image/png')
      const link = document.createElement('a')
      link.download = `${fileName}.png`
      link.href = imageUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // 显示成功信息和质量报告
      let message = 'Canvas备用渲染导出成功！'
      if (renderResult.qualityScore !== undefined) {
        message += ` 质量评分: ${(renderResult.qualityScore * 100).toFixed(1)}%`
      }
      if (renderResult.warnings.length > 0) {
        message += ` (${renderResult.warnings.length} 个警告)`
        if (progressTracker) {
          progressTracker.showWarning(`备用渲染完成，但有 ${renderResult.warnings.length} 个警告`)
        }
      }

      if (!progressTracker) {
        ElMessage.success(message)
      }

      return true
    } else {
      const errorMessage = `Canvas备用渲染失败: ${renderResult.errors.join(', ')}`
      if (progressTracker) {
        progressTracker.showError(errorMessage)
      }
      throw new Error(errorMessage)
    }
  } catch (error) {
    console.error('Canvas备用渲染导出失败:', error)
    if (progressTracker) {
      progressTracker.showError('Canvas备用渲染导出失败')
    }
    throw error
  }
}

// 专门的PNG导出函数，优化SVG路径导出，集成错误处理和进度跟踪
const exportCanvasToPNG = async (canvas: HTMLElement, fileName: string) => {
  const exportId = `png_export_${Date.now()}`
  const progressTracker = exportStatusManager.createTracker(exportId, {
    showDetailedMessages: true,
    showPercentage: true,
    enableNotifications: true
  })

  const exportContext: ExportContext = {
    operation: 'png_export',
    canvas,
    fileName,
    attempt: 1,
    maxAttempts: 3,
    options: {
      backgroundColor: '#ffffff',
      scale: 3,
      quality: 1.0,
      svgRenderingMode: 'enhanced',
      forceInlineStyles: true,
      preserveSVGViewBox: true,
      enhanceSVGVisibility: true
    }
  }

  try {
    // 开始进度跟踪
    progressTracker.startProgress()
    progressTracker.updateStage('initializing', '正在初始化PNG导出...')

    // 使用重试机制执行导出
    const result = await exportErrorHandler.executeWithRetry(
      async () => {
        return await performPNGExport(canvas, fileName, progressTracker)
      },
      exportContext,
      {
        maxAttempts: 3,
        delayMs: 1000,
        retryableErrors: ['svg_rendering', 'html2canvas']
      }
    )

    progressTracker.completeProgress(true, 'PNG导出成功完成')
    return result
  } catch (error) {
    console.error('PNG导出失败:', error)

    // 尝试错误恢复
    const recoveryResult = await exportErrorHandler.handleHtml2CanvasError(
      error as Error,
      exportContext
    )

    if (recoveryResult.success) {
      progressTracker.completeProgress(true, `PNG导出成功 (使用${recoveryResult.fallbackMethod})`)
      return recoveryResult.result
    } else {
      progressTracker.completeProgress(false, 'PNG导出失败')
      throw error
    }
  } finally {
    exportStatusManager.removeTracker(exportId)
  }
}

// 执行PNG导出的核心逻辑
const performPNGExport = async (
  canvas: HTMLElement,
  fileName: string,
  progressTracker: ExportProgressTracker
): Promise<boolean> => {
  // 阶段1: 准备画布
  progressTracker.updateStage('preparing_canvas', '正在隐藏控制元素...')

  const controlPoints = canvas.querySelectorAll('.control-point, .control-line, .path-indicator .rotation-handle')
  controlPoints.forEach((point) => {
    (point as HTMLElement).style.display = 'none'
  })

  // 使用画布的原始尺寸，确保导出图片与显示一致
  const canvasRect = canvas.getBoundingClientRect()
  const originalWidth = canvasRect.width
  const originalHeight = canvasRect.height

  console.log('PNG导出使用原始画布尺寸:', {
    width: originalWidth,
    height: originalHeight
  })

  const textElements = canvas.querySelectorAll('.course-title, .course-info')
  const originalDisplays: { el: HTMLElement, display: string }[] = []
  textElements.forEach((el) => {
    const htmlEl = el as HTMLElement
    originalDisplays.push({ el: htmlEl, display: htmlEl.style.display })
    htmlEl.style.display = 'none'
  })

  progressTracker.updateSubProgress(30, '正在清理文本元素...')

  // 清理特殊字符
  const restoreTexts = cleanupCanvasForExport(canvas)

  // 阶段2: 使用SVG导出增强器处理SVG元素
  progressTracker.updateStage('processing_svg', '正在使用SVG导出增强器处理路径元素...')

  // 创建SVG导出增强器实例
  const svgEnhancer = new (await import('@/utils/svgExportEnhancer')).SVGExportEnhancer()

  progressTracker.updateSubProgress(20, '正在预处理SVG元素...')

  // 预处理SVG元素并创建备份
  const svgProcessingResult = svgEnhancer.prepareSVGForExport(canvas)

  progressTracker.updateSubProgress(50, '正在应用样式内联转换...')

  // 应用样式内联转换
  svgEnhancer.applyStyleInlining(svgProcessingResult.processedElements)

  progressTracker.updateSubProgress(80, 'SVG增强处理完成')

  try {
    // 阶段3: 渲染图像
    progressTracker.updateStage('rendering', '正在使用增强的html2canvas配置渲染...')

    const enhancedConfig = createEnhancedHtml2CanvasConfig(canvas, {
      backgroundColor: '#ffffff',
      scale: 3,
      quality: 1.0,
      width: originalWidth,
      height: originalHeight,
      svgRenderingMode: 'enhanced',
      forceInlineStyles: true,
      preserveSVGViewBox: true,
      enhanceSVGVisibility: true,
      enableDebugMode: false,
      logSVGProcessing: true
    })

    progressTracker.updateSubProgress(30, '正在执行html2canvas渲染...')
    const imageCanvas = await html2canvas(canvas, enhancedConfig)

    progressTracker.updateSubProgress(70, '正在验证渲染质量...')

    // 使用质量验证器检查渲染结果
    const qualityValidator = new (await import('@/utils/exportQualityValidator')).ExportQualityValidator()

    // 验证路径完整性
    const pathValidationResult = await qualityValidator.validatePathCompleteness(imageCanvas, canvas)

    // 检查SVG渲染
    const svgRenderingCheck = await qualityValidator.checkSVGRendering(imageCanvas, canvas)

    if (!pathValidationResult.isValid || svgRenderingCheck.renderingIssues.length > 0) {
      const issues = pathValidationResult.issues.map(i => i.message).concat(
        svgRenderingCheck.renderingIssues.map(i => i.description)
      )
      progressTracker.showWarning(`质量验证警告: ${issues.slice(0, 3).join(', ')}${issues.length > 3 ? '...' : ''}`)
      console.warn('PNG导出质量验证未通过:', { pathValidationResult, svgRenderingCheck })
    } else {
      progressTracker.updateSubProgress(80, `质量验证通过 (路径完整性: ${pathValidationResult.pathCompleteness.toFixed(1)}%)`)
    }

    // 阶段4: 生成文件
    progressTracker.updateStage('generating_file', '正在生成PNG文件...')

    // 确保导出的图像尺寸合适
    const canvasWidth = imageCanvas.width
    const canvasHeight = imageCanvas.height
    const minExportWidth = 800
    const minExportHeight = 600

    let finalCanvas = imageCanvas
    if (canvasWidth < minExportWidth || canvasHeight < minExportHeight) {
      progressTracker.updateSubProgress(30, '正在调整图像尺寸...')

      const scaleRatio = Math.max(
        minExportWidth / canvasWidth,
        minExportHeight / canvasHeight
      )

      const scaledCanvas = document.createElement('canvas')
      const scaledWidth = Math.round(canvasWidth * scaleRatio)
      const scaledHeight = Math.round(canvasHeight * scaleRatio)

      scaledCanvas.width = scaledWidth
      scaledCanvas.height = scaledHeight

      const ctx = scaledCanvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, scaledWidth, scaledHeight)
        ctx.drawImage(imageCanvas, 0, 0, canvasWidth, canvasHeight, 0, 0, scaledWidth, scaledHeight)
        finalCanvas = scaledCanvas
      }
    }

    progressTracker.updateSubProgress(70, '正在创建下载链接...')

    // 导出为PNG
    const imageUrl = finalCanvas.toDataURL('image/png')
    const link = document.createElement('a')
    link.download = `${fileName}.png`
    link.href = imageUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // 阶段5: 完成处理
    progressTracker.updateStage('finalizing', '正在清理资源...')

    return true
  } catch (html2canvasError) {
    console.warn('html2canvas导出失败，尝试Canvas备用渲染:', html2canvasError)

    // 恢复元素状态后再尝试备用渲染
    controlPoints.forEach((point) => {
      (point as HTMLElement).style.display = ''
    })

    originalDisplays.forEach(({ el, display }) => {
      el.style.display = display
    })

    restoreTexts()

    // 恢复SVG状态
    svgEnhancer.restoreProcessingResult(svgProcessingResult)
    cleanupHtml2CanvasProcessing(canvas)

    // 使用Canvas备用渲染
    progressTracker.updateStage('rendering', '正在使用Canvas备用渲染...')

    try {
      await exportCanvasWithBackupRendering(canvas, fileName, progressTracker)
      return true
    } catch (backupError) {
      console.error('Canvas备用渲染也失败了:', backupError)
      throw new Error(`导出失败: html2canvas错误 - ${html2canvasError instanceof Error ? html2canvasError.message : String(html2canvasError)}; 备用渲染错误 - ${backupError instanceof Error ? backupError.message : String(backupError)}`)
    }
  } finally {
    // 恢复所有元素状态
    controlPoints.forEach((point) => {
      (point as HTMLElement).style.display = ''
    })

    originalDisplays.forEach(({ el, display }) => {
      el.style.display = display
    })

    restoreTexts()

    // 恢复SVG处理结果
    svgEnhancer.restoreProcessingResult(svgProcessingResult)

    // 清理html2canvas处理上下文
    cleanupHtml2CanvasProcessing(canvas)

    // 清理SVG增强器缓存
    svgEnhancer.clearCache()
  }
}
</script>

<style scoped>
.toolbar {
  padding: 10px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
}

/* 导出加载样式 */
:deep(.export-loading) {
  background: rgba(0, 0, 0, 0.8) !important;
}

:deep(.export-loading .el-loading-text) {
  color: #ffffff !important;
  font-size: 14px !important;
  line-height: 1.4 !important;
  white-space: pre-line !important;
  text-align: center !important;
}

:deep(.export-loading .el-loading-spinner) {
  margin-top: -40px !important;
}

.section {
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin-bottom: 10px;
}

.section-title {
  font-size: 16px;
  margin: 0;
  padding: 12px 15px;
  background-color: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
  font-weight: 500;
}

.section-tabs {
  display: flex;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.1);
  margin-bottom: 10px;
  overflow: hidden;
}

.section-tab {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  border-bottom: 3px solid transparent;
  color: var(--el-text-color-secondary);
}

.section-tab.active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
  background-color: var(--el-color-primary-light-9);
}

.scrollable-section {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding-bottom: 10px;
}

.obstacle-templates {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.obstacle-tabs {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.obstacle-tab-pane {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.templates-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  max-height: 100%;
  scrollbar-width: thin;
}

/* 自定义滚动条样式 */
.templates-grid::-webkit-scrollbar {
  width: 5px;
}

.templates-grid::-webkit-scrollbar-track {
  background: #f1f1f1;
  border-radius: 5px;
}

.templates-grid::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 5px;
}

.templates-grid::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

.actions {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 15px;
}

/* 小屏幕优化 */
@media screen and (max-height: 700px) {
  .action-buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding: 10px;
  }

  .action-button {
    padding: 8px 10px;
    font-size: 12px;
  }

  .export-dropdown,
  .action-button:last-child {
    grid-column: span 2;
  }

  .section-title {
    padding: 8px 12px;
    font-size: 14px;
  }

  .section-tab {
    padding: 8px 0;
    font-size: 13px;
  }
}

/* 超小屏幕优化 */
@media screen and (max-height: 500px) {
  .toolbar {
    padding: 5px;
  }

  .section {
    margin-bottom: 5px;
  }

  .section-tabs {
    margin-bottom: 5px;
  }

  .action-buttons {
    padding: 8px;
    gap: 4px;
  }

  .action-button {
    padding: 6px 8px;
    font-size: 11px;
  }

  .section-tab {
    padding: 6px 0;
    font-size: 12px;
  }
}

.course-name-section {
  flex-shrink: 0;
}

.course-name {
  padding: 12px;
}

.course-name-input {
  width: 100%;
}

.obstacle-template {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  background-color: white;
  cursor: grab;
  transition: all 0.3s ease;
}

.obstacle-template:hover {
  background-color: #f0f0f0;
  border-color: var(--primary-color);
  transform: translateY(-2px);
}

.obstacle-template:active {
  cursor: grabbing;
  transform: translateY(0);
  background-color: var(--el-color-primary-light-9);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  transition: all 0.1s;
}

.action-button {
  position: relative;
  border-radius: 6px;
  padding: 10px 15px;
  transition: all 0.3s ease;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
  font-weight: 500;
  font-size: 14px;
  text-align: left;
  height: auto;
  margin-left: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-button .el-icon {
  margin-right: 8px;
  font-size: 16px;
  flex-shrink: 0;
}

.action-button.el-button--default {
  background-color: white;
  color: var(--el-text-color-primary);
}

.action-button.el-button--primary {
  border: none;
  color: white !important;
}

.action-button.el-button--success {
  border: none;
  color: white !important;
}

.action-button.el-button--danger {
  border: none;
  color: white !important;
}

.action-button .lock-icon {
  position: absolute;
  right: 15px;
  color: rgba(255, 255, 255, 0.8);
  background-color: rgba(245, 108, 108, 1);
  border-radius: 50%;
  padding: 3px;
}

.action-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
}

.action-button:active {
  transform: translateY(0);
}

.export-dropdown {
  flex-direction: column;
}

/* 添加Tab相关样式 */
:deep(.el-tabs__header) {
  margin-bottom: 0;
  padding: 0 10px;
  flex-shrink: 0;
}

:deep(.el-tabs__content) {
  height: auto;
  overflow: hidden;
  flex: 1;
  display: flex;
  flex-direction: column;
}

:deep(.el-tab-pane) {
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:deep(.custom-tab) {
  padding: 0 !important;
  height: 100%;
  overflow: hidden;
}

:deep(.custom-obstacle-manager) {
  height: 100%;
  overflow: hidden;
}

.template-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  margin-left: 5px;
  flex: 1;
}

.template-preview {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 8px;
  width: 60px;
  height: 60px;
  justify-content: center;
  background-color: #f9fafc;
  border-radius: 4px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  overflow: visible;
  pointer-events: none;
}

.preview-pole,
.preview-wall,
.preview-liverpool,
.preview-water-obstacle {
  background-color: var(--obstacle-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transform-origin: center;
  border-radius: 2px;
  position: relative;
  pointer-events: none;
}

.preview-pole {
  width: 60px;
  height: 10px;
  background: linear-gradient(90deg, #8B4513 0%, #A0522D 100%);
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.preview-wall {
  width: 60px;
  height: 30px;
  background-color: #8B4513;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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

.preview-liverpool {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.preview-water {
  width: 50px;
  height: 5px;
  background-color: rgba(0, 100, 255, 0.3);
  border-radius: 2px;
  margin-top: 5px;
}

.preview-water-obstacle {
  width: 70px;
  height: 15px;
  background-color: rgba(0, 100, 255, 0.4);
  border: 1px solid rgba(0, 50, 150, 0.5);
  border-radius: 4px;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}

.obstacle-type-tabs {
  display: flex;
  border-bottom: 1px solid var(--el-border-color-light);
  background-color: #f5f7fa;
  flex-shrink: 0;
}

.obstacle-type-tab {
  padding: 8px 20px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  color: var(--el-text-color-secondary);
  position: relative;
  text-align: center;
  flex: 1;
}

.obstacle-type-tab.active {
  color: var(--el-color-primary);
  background-color: white;
}

.obstacle-type-tab.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 0;
  width: 100%;
  height: 2px;
  background-color: var(--el-color-primary);
}

.obstacle-type-tab:hover {
  color: var(--el-color-primary);
}

.obstacle-tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.templates-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  max-height: 100%;
  scrollbar-width: thin;
}

.custom-tab {
  height: 100%;
  overflow: hidden;
}
</style>
