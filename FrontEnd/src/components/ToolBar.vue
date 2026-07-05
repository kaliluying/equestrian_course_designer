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

    <!-- 路线名称下方的模板区块直接展开 -->
    <div class="scrollable-section templates-only">
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

    <!-- AI 魔法球 (悬浮在右下角) -->
    <teleport to="#app">
      <el-tooltip content="✨ 唤醒 AI 助手" placement="left" :show-after="100">
        <div class="floating-magic-orb" @click="showAIGenerate">
          <el-icon><MagicStick /></el-icon>
        </div>
      </el-tooltip>
    </teleport>

    <!-- 全局操作面板 (悬浮于顶部中央) -->
    <teleport to="#app">
      <div class="floating-global-actions">
        <el-button @click="handleSaveDesign" class="global-action-btn"
          :title="!userStore.currentUser ? '需要登录才能保存' : '保存设计'">
          <el-icon><Download /></el-icon> <span>保存</span>
        </el-button>

        <el-dropdown @command="handleUnifiedExport" trigger="hover">
          <div class="global-action-btn glass-dropdown">
            <el-icon><Download /></el-icon> <span>导出</span>
            <el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="png">导出 PNG</el-dropdown-item>
              <el-dropdown-item command="pdf">导出 PDF</el-dropdown-item>
              <el-dropdown-item command="report">导出专业报告</el-dropdown-item>
              <el-dropdown-item command="zip">批量导出 ZIP</el-dropdown-item>
              <el-dropdown-item command="json">导出 JSON</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-button class="global-action-btn" @click="triggerFileInput"
          :title="!userStore.currentUser ? '需要登录才能导入' : '导入设计'">
          <el-icon><Upload /></el-icon> <span>导入</span>
        </el-button>
        <input type="file" ref="fileInput" style="display: none" accept=".json" @change="handleFileChange" />

        <div class="global-action-divider"></div>

        <el-button @click="generateCourse" type="primary" class="global-action-btn primary-solid">
          <el-icon><Pointer /></el-icon> <span>生成路线</span>
        </el-button>

        <el-button @click="clearCourse" class="global-action-btn danger-text">
          <el-icon><Delete /></el-icon> <span>清空</span>
        </el-button>
      </div>
    </teleport>




    <!-- 导出选项对话框 -->
    <el-dialog v-model="exportOptionsVisible" title="PDF导出选项" width="500px" :close-on-click-modal="false"
      :close-on-press-escape="true">

      <!-- PDF导出选项 -->
      <div>
        <el-form label-position="top">
          <el-form-item label="纸张大小">
            <el-select v-model="exportOptions[ExportFormat.PDF].paperSize" style="width: 100%">
              <el-option label="A3" value="a3" />
              <el-option label="A4" value="a4" />
              <el-option label="A5" value="a5" />
              <el-option label="Letter" value="letter" />
            </el-select>
          </el-form-item>

          <el-form-item label="方向">
            <el-select v-model="exportOptions[ExportFormat.PDF].orientation" style="width: 100%">
              <el-option label="自动选择" value="auto" />
              <el-option label="横向" value="landscape" />
              <el-option label="纵向" value="portrait" />
            </el-select>
          </el-form-item>

          <el-form-item label="页边距">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <el-input-number v-model="exportOptions[ExportFormat.PDF].margins.top" :min="0" :max="50"
                controls-position="right" placeholder="上" />
              <el-input-number v-model="exportOptions[ExportFormat.PDF].margins.right" :min="0" :max="50"
                controls-position="right" placeholder="右" />
              <el-input-number v-model="exportOptions[ExportFormat.PDF].margins.bottom" :min="0" :max="50"
                controls-position="right" placeholder="下" />
              <el-input-number v-model="exportOptions[ExportFormat.PDF].margins.left" :min="0" :max="50"
                controls-position="right" placeholder="左" />
            </div>
          </el-form-item>

          <el-form-item label="图像质量">
            <el-slider v-model="exportOptions[ExportFormat.PDF].quality" :min="0.5" :max="1" :step="0.05"
              :format-tooltip="(value: number) => `${Math.round(value * 100)}%`" />
          </el-form-item>

          <el-form-item>
            <el-checkbox v-model="exportOptions[ExportFormat.PDF].includeFooter">包含页脚</el-checkbox>
          </el-form-item>

          <el-form-item>
            <el-checkbox v-model="exportOptions[ExportFormat.PDF].includeMetadata">包含元数据</el-checkbox>
          </el-form-item>
        </el-form>
      </div>

      <!-- 进度显示 -->
      <div v-if="exportProgress" class="export-progress">
        <el-progress :percentage="exportProgress.progress"
          :status="exportProgress.progress === 100 ? 'success' : undefined" :stroke-width="8">
          <template #default="{ percentage }">
            <span class="percentage-value">{{ percentage }}%</span>
          </template>
        </el-progress>
        <p class="progress-message">{{ exportProgress.message }}</p>
      </div>

      <template #footer>
        <el-button @click="exportOptionsVisible = false" :disabled="isExporting">取消</el-button>
        <el-button type="primary" @click="executePDFExport" :loading="isExporting">
          {{ isExporting ? '导出中...' : '开始导出' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- AI 生成对话框 -->
    <AIGenerateDialog ref="aiDialogRef" />

  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ObstacleType } from '@/types/obstacle'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import { downloadDesign } from '@/api/design'
import { triggerDesignDownload } from '@/utils/designDownload'
import { Download, Upload, Delete, Pointer, Edit, Lock, ArrowDown, MagicStick } from '@element-plus/icons-vue'
import { ElMessageBox, ElMessage, ElLoading } from 'element-plus'
import html2canvas from 'html2canvas'
import { saveDesign } from '@/api/design'
import type { SaveDesignRequest } from '@/types/design'

import CustomObstacleManager from '@/components/CustomObstacleManager.vue'
import AIGenerateDialog from '@/components/AIGenerateDialog.vue'



import { exportManager } from '@/utils/exportManager'
import { ExportFormat, ExportStage, type PDFExportOptions, type JSONExportOptions, type ProgressState, type ExportResult } from '@/types/export'

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



// 导出选项对话框状态
const exportOptionsVisible = ref(false)
const currentExportFormat = ref<ExportFormat>(ExportFormat.PNG)
const exportProgress = ref<ProgressState | null>(null)
const isExporting = ref(false)

// JSON默认配置常量
const DEFAULT_JSON_OPTIONS: JSONExportOptions = {
  includeViewportInfo: true,
  includeMetadata: true,
  minify: false,
  prettyPrint: true,
  indentSize: 2
}

// 导出选项（仅保留PDF配置）
// 注意：PNG默认配置已在exportManager.exportToPNGDirect()中定义
const exportOptions = ref({
  [ExportFormat.PDF]: {
    paperSize: 'a4',
    orientation: 'auto',
    margins: { top: 20, right: 20, bottom: 20, left: 20 },
    includeFooter: true,
    includeMetadata: true,
    quality: 0.95
  } as PDFExportOptions
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
      // 4. 使用html2canvas进行渲染
      const html2canvasOptions = {
        backgroundColor: '#ffffff',
        scale: 3,
        useCORS: true,
        allowTaint: false,
        foreignObjectRendering: false,
        logging: false,
        scrollX: -window.scrollX,
        scrollY: -window.scrollY
      }

      const imageCanvas = await html2canvas(canvas, html2canvasOptions)

      // 5. 处理生成的图像，确保合适的尺寸
      const finalWidth = imageCanvas.width
      const finalHeight = imageCanvas.height

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

      // 直接绘制图像
      ctx.drawImage(imageCanvas, 0, 0)

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

      // 生成基于路线名称的图片文件名
      const sanitizeFileName = (name: string): string => {
        return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').trim() || '未命名设计'
      }
      const imageFileName = `${sanitizeFileName(courseName.value || '未命名设计')}.png`

      // 构建保存请求数据
      const saveData: SaveDesignRequest = {
        title: courseName.value || '未命名设计',
        image: new File([imageBlob], imageFileName, { type: 'image/png' }),
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

      // 清理处理上下文（新的导出系统会自动处理）

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







// PNG直接导出函数（使用默认设置）
const executeDirectPNGExport = async () => {
  if (isExporting.value) return

  try {
    isExporting.value = true

    // 检查导出权限
    if (!checkExportPermissions()) {
      return
    }

    // 处理协作会话
    const canProceed = await handleCollaborationExport()
    if (!canProceed) {
      return
    }

    // 获取画布元素
    const canvas = document.querySelector('.course-canvas') as HTMLElement
    if (!canvas) {
      throw new Error('未找到画布元素')
    }

    // 使用导出管理器的直接PNG导出方法（使用默认设置）
    const result = await exportManager.exportToPNGDirect(
      canvas,
      {
        onProgress: (state: ProgressState) => {
          console.log('PNG导出进度:', state.message, `${state.progress}%`)
        },
        onComplete: (result: ExportResult) => {
          console.log('PNG直接导出完成:', result)

          // 通知协作者导出完成
          const canvasElement = document.querySelector('.course-canvas') as HTMLElement & { triggerExportEvent?: (type: string, data: Record<string, unknown>) => void }
          if (canvasElement && typeof canvasElement.triggerExportEvent === 'function') {
            canvasElement.triggerExportEvent('export-completed', {
              format: ExportFormat.PNG,
              success: result.success,
              userId: userStore.currentUser?.id,
              userName: userStore.currentUser?.username,
              isDirect: true
            })
          }
        },
        onError: (error: Error) => {
          console.error('PNG直接导出错误:', error)

          // 通知协作者导出失败
          const canvasElement = document.querySelector('.course-canvas') as HTMLElement & { triggerExportEvent?: (type: string, data: Record<string, unknown>) => void }
          if (canvasElement && typeof canvasElement.triggerExportEvent === 'function') {
            canvasElement.triggerExportEvent('export-failed', {
              format: ExportFormat.PNG,
              error: error.message,
              userId: userStore.currentUser?.id,
              userName: userStore.currentUser?.username,
              isDirect: true
            })
          }
        }
      }
    )

    if (result.success) {
      ElMessage.success('PNG导出成功！文件已自动下载')

      // 显示质量警告（如果有）
      if (result.warnings && result.warnings.length > 0) {
        const warningMessages = result.warnings.map(w => w.message).join('\n')
        ElMessage.warning(`导出完成，但有以下警告：\n${warningMessages}`)
      }
    } else {
      throw new Error('PNG导出失败')
    }

  } catch (error) {
    console.error('PNG直接导出失败:', error)
    ElMessageBox.alert('PNG导出失败：' + (error as Error).message, '错误', {
      confirmButtonText: '确定',
      type: 'error',
    })
  } finally {
    isExporting.value = false
  }
}

// JSON直接导出函数（使用默认设置）
const executeDirectJSONExport = async () => {
  if (isExporting.value) return

  try {
    isExporting.value = true

    // 检查导出权限
    if (!checkExportPermissions()) {
      return
    }

    // 处理协作会话
    const canProceed = await handleCollaborationExport()
    if (!canProceed) {
      return
    }

    // 获取画布元素
    const canvas = document.querySelector('.course-canvas') as HTMLElement
    if (!canvas) {
      throw new Error('未找到画布元素')
    }

    // 设置文件名
    const date = new Date()
    const formattedDateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
    const fileName = `${courseStore.currentCourse.name}-${formattedDateTime}`
    const sourceVersion = courseStore.currentCourse.renderVersion ?? 'v1'

    // 执行JSON导出（使用默认配置常量）
    const result = await exportManager.exportCanvas(
      canvas,
      ExportFormat.JSON,
      {
        ...DEFAULT_JSON_OPTIONS,
        fileName,
        sourceVersion,
        includeViewportInfo: sourceVersion === 'v1'
      },
      {
        onProgress: (state: ProgressState) => {
          console.log('JSON导出进度:', state.message, `${state.progress}%`)
        },
        onComplete: (result: ExportResult) => {
          console.log('JSON导出完成:', result)

          // 通知协作者导出完成
          const canvasElement = document.querySelector('.course-canvas') as HTMLElement & { triggerExportEvent?: (type: string, data: Record<string, unknown>) => void }
          if (canvasElement && typeof canvasElement.triggerExportEvent === 'function') {
            canvasElement.triggerExportEvent('export-completed', {
              format: ExportFormat.JSON,
              success: result.success,
              userId: userStore.currentUser?.id,
              userName: userStore.currentUser?.username,
              isDirect: true
            })
          }
        },
        onError: (error: Error) => {
          console.error('JSON导出错误:', error)

          // 通知协作者导出失败
          const canvasElement = document.querySelector('.course-canvas') as HTMLElement & { triggerExportEvent?: (type: string, data: Record<string, unknown>) => void }
          if (canvasElement && typeof canvasElement.triggerExportEvent === 'function') {
            canvasElement.triggerExportEvent('export-failed', {
              format: ExportFormat.JSON,
              error: error.message,
              userId: userStore.currentUser?.id,
              userName: userStore.currentUser?.username,
              isDirect: true
            })
          }
        }
      }
    )

    if (result.success) {
      // JSON格式直接下载字符串数据
      const jsonData = result.data as string
      const blob = new Blob([jsonData], { type: 'application/json' })
      downloadBlob(blob, `${fileName}.json`)

      ElMessage.success('JSON导出成功！文件已自动下载')

      // 显示质量警告（如果有）
      if (result.warnings && result.warnings.length > 0) {
        const warningMessages = result.warnings.map(w => w.message).join('\n')
        ElMessage.warning(`导出完成，但有以下警告：\n${warningMessages}`)
      }
    } else {
      throw new Error('JSON导出失败')
    }

  } catch (error) {
    console.error('JSON直接导出失败:', error)
    ElMessageBox.alert('JSON导出失败：' + (error as Error).message, '错误', {
      confirmButtonText: '确定',
      type: 'error',
    })
  } finally {
    isExporting.value = false
  }
}


const executeServerDownloadExport = async (fileType: 'report' | 'zip') => {
  if (!userStore.currentUser) {
    ElMessage.error('导出功能需要登录')
    return
  }

  const designId = localStorage.getItem('design_id_to_update')
  if (!designId) {
    ElMessage.warning('请先保存设计，再使用专业报告或批量导出')
    return
  }

  isExporting.value = true
  exportProgress.value = {
    stage: ExportStage.GENERATING_FILE,
    progress: 20,
    message: fileType === 'report' ? '正在生成专业报告...' : '正在生成批量导出包...',
  }

  try {
    const response = await downloadDesign(Number(designId), fileType)
    exportProgress.value = {
      stage: ExportStage.FINALIZING,
      progress: 100,
      message: '文件已生成，正在下载...',
    }
    await triggerDesignDownload(response)
    ElMessage.success(fileType === 'report' ? '专业报告导出成功' : '批量导出包已下载')
  } catch (error) {
    console.error('服务端导出失败:', error)
    ElMessage.error(fileType === 'report' ? '专业报告导出失败' : '批量导出失败')
  } finally {
    isExporting.value = false
    exportProgress.value = null
  }
}

// 统一导出处理函数
const handleUnifiedExport = async (command: string) => {
  // 检查用户是否已登录
  if (!userStore.currentUser) {
    ElMessageBox.confirm('导出功能需要登录，是否立即登录？', '提示', {
      confirmButtonText: '去登录',
      cancelButtonText: '取消',
      type: 'info',
    }).then(() => {
      emit('show-login')
    }).catch(() => { })
    return
  }

  // 根据命令类型路由到相应的导出函数
  switch (command) {
    case 'png':
      await executeDirectPNGExport()
      break
    case 'json':
      await executeDirectJSONExport()
      break
    case 'pdf':
      // 显示PDF选项对话框
      currentExportFormat.value = ExportFormat.PDF
      exportOptionsVisible.value = true
      break
    case 'report':
      await executeServerDownloadExport('report')
      break
    case 'zip':
      await executeServerDownloadExport('zip')
      break
    default:
      ElMessage.error('不支持的导出格式')
      return
  }
}

// 检查导出权限
const checkExportPermissions = (): boolean => {
  // 检查用户是否已登录
  if (!userStore.currentUser) {
    ElMessage.error('导出功能需要登录')
    return false
  }

  // 检查是否有导出权限（这里可以根据用户角色或权限进行扩展）
  // 例如：if (!userStore.currentUser.permissions.includes('export')) return false

  return true
}

// 处理协作会话期间的导出
const handleCollaborationExport = async (): Promise<boolean> => {
  // 检查是否在协作会话中
  const canvas = document.querySelector('.course-canvas') as HTMLElement & { isCollaborating?: () => boolean; triggerExportEvent?: (type: string, data: Record<string, unknown>) => void }
  if (canvas && typeof canvas.isCollaborating === 'function' && canvas.isCollaborating()) {
    // 在协作模式下，需要确保导出的是最新状态
    try {
      // 等待协作状态同步完成
      await new Promise(resolve => setTimeout(resolve, 500))

      // 通知其他协作者正在进行导出操作
      if (typeof canvas.triggerExportEvent === 'function') {
        canvas.triggerExportEvent('export-started', {
          format: currentExportFormat.value,
          userId: userStore.currentUser?.id || 0,
          userName: userStore.currentUser?.username || '未知用户'
        })
      }

      return true
    } catch (error) {
      console.error('协作导出准备失败:', error)
      ElMessage.warning('协作会话中导出可能不是最新状态')
      return true // 继续导出，但给出警告
    }
  }

  return true
}

// 执行PDF导出操作
const executePDFExport = async () => {
  if (isExporting.value) return

  try {
    // 检查导出权限
    if (!checkExportPermissions()) {
      return
    }

    isExporting.value = true
    exportProgress.value = null

    // 处理协作会话
    const canProceed = await handleCollaborationExport()
    if (!canProceed) {
      return
    }

    // 获取画布元素
    const canvas = document.querySelector('.course-canvas') as HTMLElement
    if (!canvas) {
      throw new Error('未找到画布元素')
    }

    // 获取PDF导出选项
    const options = exportOptions.value[ExportFormat.PDF]

    // 设置文件名
    const date = new Date()
    const formattedDateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
    const fileName = `${courseStore.currentCourse.name}-${formattedDateTime}`

    // 设置文件名到选项中，并添加用户信息
    const exportOptionsWithFileName = {
      ...options,
      fileName,
      sourceVersion: courseStore.currentCourse.renderVersion ?? 'v1',
      // 添加用户和协作信息到元数据
      metadata: {
        userId: userStore.currentUser?.id,
        userName: userStore.currentUser?.username,
        exportedAt: new Date().toISOString(),
        isCollaborativeSession: (() => {
          const canvasWithCollab = canvas as HTMLElement & { isCollaborating?: () => boolean }
          return canvasWithCollab && typeof canvasWithCollab.isCollaborating === 'function' ? canvasWithCollab.isCollaborating() : false
        })()
      }
    }

    // 使用导出管理器执行PDF导出
    const result = await exportManager.exportCanvas(
      canvas,
      ExportFormat.PDF,
      exportOptionsWithFileName,
      {
        onProgress: (state: ProgressState) => {
          exportProgress.value = state
        },
        onComplete: (result: ExportResult) => {
          console.log('PDF导出完成:', result)

          // 通知协作者导出完成
          const canvasElement = document.querySelector('.course-canvas') as HTMLElement & { triggerExportEvent?: (type: string, data: Record<string, unknown>) => void }
          if (canvasElement && typeof canvasElement.triggerExportEvent === 'function') {
            canvasElement.triggerExportEvent('export-completed', {
              format: ExportFormat.PDF,
              success: result.success,
              userId: userStore.currentUser?.id,
              userName: userStore.currentUser?.username
            })
          }
        },
        onError: (error: Error) => {
          console.error('PDF导出错误:', error)

          // 通知协作者导出失败
          const canvasElement = document.querySelector('.course-canvas') as HTMLElement & { triggerExportEvent?: (type: string, data: Record<string, unknown>) => void }
          if (canvasElement && typeof canvasElement.triggerExportEvent === 'function') {
            canvasElement.triggerExportEvent('export-failed', {
              format: ExportFormat.PDF,
              error: error.message,
              userId: userStore.currentUser?.id,
              userName: userStore.currentUser?.username
            })
          }
        }
      }
    )

    if (result.success) {
      // PDF格式下载Blob数据
      const blob = result.data as Blob
      downloadBlob(blob, `${fileName}.pdf`)

      ElMessage.success('PDF导出成功！文件已自动下载')

      // 显示质量警告（如果有）
      if (result.warnings && result.warnings.length > 0) {
        const warningMessages = result.warnings.map(w => w.message).join('\n')
        ElMessage.warning(`导出完成，但有以下警告：\n${warningMessages}`)
      }
    } else {
      throw new Error('PDF导出失败')
    }

  } catch (error) {
    console.error('PDF导出失败:', error)
    ElMessageBox.alert('PDF导出失败：' + (error as Error).message, '错误', {
      confirmButtonText: '确定',
      type: 'error',
    })
  } finally {
    isExporting.value = false
    exportProgress.value = null
    exportOptionsVisible.value = false
  }
}

// 下载Blob数据
const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}






// 修改 emit 定义，添加 show-login 事件
const emit = defineEmits(['show-login'])

// AI 生成对话框
const aiDialogRef = ref<InstanceType<typeof AIGenerateDialog> | null>(null)

const showAIGenerate = () => {
  if (!userStore.isAuthenticated) {
    ElMessage.warning('请先登录后再使用AI生成功能')
    emit('show-login')
    return
  }
  aiDialogRef.value?.open()
}

// 添加获取类型名称的函数，以确保类型安全
const getTypeName = (type: string) => {
  return typeNames[type as keyof typeof typeNames] || type
}






</script>

<style scoped>
.toolbar {
  padding: 12px;
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  background: transparent;
}

.section {
  background-color: transparent;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  margin-bottom: 12px;
}

.section-title {
  font-size: 15px;
  margin: 0;
  padding: 8px 12px;
  background-color: transparent;
  font-weight: 600;
  color: #0f172a;
}

.section-tabs {
  display: flex;
  background-color: rgba(241, 245, 249, 0.6);
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  padding: 4px;
  margin-bottom: 12px;
  overflow: hidden;
}

.section-tab {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  color: #64748b;
  border-radius: 8px;
}

.section-tab.active {
  color: var(--primary-color);
  background-color: #ffffff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
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
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid rgba(226, 232, 240, 0.8);
  border-radius: 12px;
  background-color: #ffffff;
  cursor: grab;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}

.obstacle-template:hover {
  transform: translateY(-3px) scale(1.02);
  border-color: var(--primary-color);
  box-shadow: 0 8px 16px rgba(99, 102, 241, 0.12);
  z-index: 2;
}

.obstacle-template:active {
  cursor: grabbing;
  transform: translateY(0) scale(0.98);
  background-color: rgba(248, 250, 252, 1);
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  transition: all 0.1s;
}

.action-button {
  position: relative;
  border-radius: 12px;
  padding: 12px 18px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  font-weight: 600;
  font-size: 14px;
  text-align: left;
  height: auto;
  margin-left: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.3px;
}

.action-button .el-icon {
  margin-right: 10px;
  font-size: 18px;
  flex-shrink: 0;
}

.action-button.el-button--default {
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #334155;
}

.action-button.el-button--primary {
  border: none;
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-dark) 100%);
  color: white !important;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

.action-button.el-button--success {
  border: none;
  background: linear-gradient(135deg, var(--success-color) 0%, #059669 100%);
  color: white !important;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2);
}

.action-button.el-button--danger {
  border: none;
  background: linear-gradient(135deg, var(--danger-color) 0%, #dc2626 100%);
  color: white !important;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
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
  box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
  filter: brightness(1.05);
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
  font-weight: 600;
  color: #334155;
  margin-left: 8px;
  flex: 1;
}

.template-preview {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px;
  width: 64px;
  height: 64px;
  justify-content: center;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
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

/* 导出进度样式 */
.export-progress {
  margin: 20px 0;
  padding: 15px;
  background-color: #f5f7fa;
  border-radius: 6px;
}

.progress-message {
  margin: 10px 0 0 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
  text-align: center;
}

.percentage-value {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

/* AI 魔法入口悬浮球 */
.floating-magic-orb {
  position: fixed;
  bottom: 84px; /* 避开下方 24px 处的比赛信息按钮 */
  right: 32px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #7F00FF 0%, #E100FF 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  box-shadow: 0 8px 32px rgba(225, 0, 255, 0.4);
  cursor: pointer;
  z-index: 2000;
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.floating-magic-orb:hover {
  transform: translateY(-5px) scale(1.1);
  box-shadow: 0 12px 40px rgba(225, 0, 255, 0.6);
  background: linear-gradient(135deg, #8A19FF 0%, #E833FF 100%);
}

.floating-magic-orb:active {
  transform: translateY(2px) scale(0.95);
}

.floating-magic-orb .el-icon {
  animation: ai-sparkle 2s infinite ease-in-out;
}

@keyframes ai-sparkle {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.2) rotate(10deg); opacity: 1; filter: drop-shadow(0 0 6px rgba(255,255,255,0.8)); }
}

/* 全局操作面板 - 顶部悬浮胶囊 */
.floating-global-actions {
  position: fixed;
  top: 24px;
  right: 360px; /* 避开右侧属性面板 */
  height: 48px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.5);
  display: flex;
  align-items: center;
  padding: 0 6px;
  z-index: 100;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.global-action-btn {
  height: 36px;
  line-height: normal;
  padding: 0 16px;
  border-radius: 18px;
  border: none;
  background: transparent;
  color: #475569;
  font-weight: 600;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: none;
  outline: none;
}

.global-action-btn:hover {
  background: rgba(241, 245, 249, 0.8);
  color: #0f172a;
}

.global-action-btn:active {
  transform: translateY(1px) scale(0.98);
}

.glass-dropdown {
  outline: none;
}

.global-action-divider {
  width: 1px;
  height: 20px;
  background-color: #cbd5e1;
  margin: 0 8px;
}

/* 生成路线按钮高亮 */
.global-action-btn.primary-solid {
  background: #3b82f6;
  color: white;
}
.global-action-btn.primary-solid:hover {
  background: #2563eb;
  color: white;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

/* 清空按钮危险色 */
.global-action-btn.danger-text {
  color: #ef4444;
}
.global-action-btn.danger-text:hover {
  background: rgba(254, 226, 226, 0.8);
  color: #b91c1c;
}

/* 适配中屏幕 */
@media screen and (max-width: 1400px) {
  .floating-global-actions {
    right: 320px;
  }
}

@media screen and (max-width: 1200px) {
  .floating-global-actions {
    right: 24px;
    top: 80px;
  }
}
</style>
