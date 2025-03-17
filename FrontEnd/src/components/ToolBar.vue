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
                <el-dropdown-item command="png">导出为PNG图片</el-dropdown-item>
                <el-dropdown-item command="pdf">导出为PDF文档</el-dropdown-item>
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
      // 4. 使用html2canvas时的处理


      // 首先尝试使用更可靠的方式捕获画布内容
      const imageCanvas = await html2canvas(canvas, {
        backgroundColor: '#ffffff',
        scale: 3,                    // 高清图像
        useCORS: true,               // 处理跨域资源
        allowTaint: true,
        logging: false,
        width: originalWidth,
        height: originalHeight,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
        windowWidth: Math.max(document.documentElement.clientWidth, window.innerWidth, originalWidth * 2),
        windowHeight: Math.max(document.documentElement.clientHeight, window.innerHeight, originalHeight * 2),
        onclone: (documentClone) => {
          const clonedCanvas = documentClone.querySelector('.course-canvas') as HTMLElement
          if (clonedCanvas) {
            // 确保克隆的画布没有被截断或限制
            clonedCanvas.style.width = `${originalWidth}px`
            clonedCanvas.style.height = `${originalHeight}px`
            clonedCanvas.style.maxWidth = 'none'
            clonedCanvas.style.maxHeight = 'none'
            clonedCanvas.style.overflow = 'visible'
            clonedCanvas.style.position = 'absolute'
            clonedCanvas.style.padding = '30px'  // 增加更大的内边距确保边缘内容可见
            clonedCanvas.style.margin = '0'
            clonedCanvas.style.transformOrigin = 'top left'
            clonedCanvas.style.boxSizing = 'content-box'

            // 处理克隆的画布中的所有嵌套元素
            const allElements = clonedCanvas.querySelectorAll('*')
            allElements.forEach((element) => {
              const el = element as HTMLElement
              if (el.style.position === 'fixed') {
                el.style.position = 'absolute'  // 避免fixed定位导致元素丢失
              }

              // 确保元素不被overflow截断
              if (getComputedStyle(el).overflow !== 'visible') {
                el.style.overflow = 'visible'
              }
            })
          }
          return documentClone
        }
      })



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

    // 获取画布的原始尺寸
    const canvasRect = canvas.getBoundingClientRect()
    const originalWidth = canvasRect.width
    const originalHeight = canvasRect.height

    // 临时隐藏可能导致乱码的元素
    const textElements = canvas.querySelectorAll('.course-title, .course-info')
    const originalDisplays: { el: HTMLElement, display: string }[] = []
    textElements.forEach((el) => {
      const htmlEl = el as HTMLElement
      originalDisplays.push({ el: htmlEl, display: htmlEl.style.display })
      htmlEl.style.display = 'none'
    })

    // 清理画布中的特殊字符
    const restoreTexts = cleanupCanvasForExport(canvas)

    // 使用 html2canvas 将画布转换为图片，并指定宽高

    const imageCanvas = await html2canvas(canvas, {
      backgroundColor: '#ffffff',
      scale: 3, // 使用3倍缩放以获得更高质量的图像
      useCORS: true,
      width: originalWidth,
      height: originalHeight,
      // 确保捕获整个画布内容，即使部分内容不在视口中
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      allowTaint: true,
      foreignObjectRendering: true,
      // 设置更大的虚拟窗口尺寸，确保能捕获所有内容
      windowWidth: Math.max(document.documentElement.clientWidth, window.innerWidth, originalWidth * 2),
      windowHeight: Math.max(document.documentElement.clientHeight, window.innerHeight, originalHeight * 2),
      logging: true,
      onclone: (documentClone) => {
        // 在复制的DOM中确保所有内容都可见
        const clonedCanvas = documentClone.querySelector('.course-canvas');
        if (clonedCanvas) {
          // 添加填充以确保边缘内容都被包含
          (clonedCanvas as HTMLElement).style.padding = '20px';
          // 确保克隆的画布显示所有内容
          (clonedCanvas as HTMLElement).style.overflow = 'visible';
          // 移除可能限制尺寸的属性
          (clonedCanvas as HTMLElement).style.maxWidth = 'none';
          (clonedCanvas as HTMLElement).style.maxHeight = 'none';
        }
        return documentClone;
      },
      ignoreElements: (element) => {
        // 忽略一些UI元素，只捕获设计内容
        return element.classList && (
          element.classList.contains('control-point') ||
          element.classList.contains('control-line') ||
          element.classList.contains('rotation-handle') ||
          element.classList.contains('el-button') ||
          element.classList.contains('toolbar') ||
          element.tagName === 'BUTTON' ||
          element.classList.contains('el-dropdown') ||
          element.classList.contains('settings-panel')
        );
      }
    })

    // 恢复控制点的显示
    controlPoints.forEach((point) => {
      ; (point as HTMLElement).style.display = ''
    })

    // 恢复文本元素的显示
    originalDisplays.forEach(({ el, display }) => {
      el.style.display = display
    })

    // 恢复原始文本
    restoreTexts()

    // 获取当前日期时间格式化字符串
    const date = new Date()
    const formattedDateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
    const fileName = `${courseStore.currentCourse.name}-${formattedDateTime}`

    // 获取画布宽高
    const canvasWidth = imageCanvas.width
    const canvasHeight = imageCanvas.height

    // 确保导出的图像尺寸不小于最小值
    const minExportWidth = 800
    const minExportHeight = 600

    // 如果画布尺寸小于最小值，创建一个新的画布并进行缩放
    let finalCanvas = imageCanvas
    if (canvasWidth < minExportWidth || canvasHeight < minExportHeight) {


      // 计算缩放比例
      const scaleRatio = Math.max(
        minExportWidth / canvasWidth,
        minExportHeight / canvasHeight
      )

      // 创建新画布
      const scaledCanvas = document.createElement('canvas')
      const scaledWidth = Math.round(canvasWidth * scaleRatio)
      const scaledHeight = Math.round(canvasHeight * scaleRatio)

      scaledCanvas.width = scaledWidth
      scaledCanvas.height = scaledHeight

      // 绘制缩放后的图像
      const ctx = scaledCanvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, scaledWidth, scaledHeight)
        ctx.drawImage(imageCanvas, 0, 0, canvasWidth, canvasHeight, 0, 0, scaledWidth, scaledHeight)
        finalCanvas = scaledCanvas
      }
    }

    if (command === 'png') {
      // 导出为PNG图片
      const imageUrl = finalCanvas.toDataURL('image/png')

      // 创建下载链接
      const link = document.createElement('a')
      link.download = `${fileName}.png`
      link.href = imageUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      ElMessage.success('PNG图片导出成功！')
    }
  } catch (error) {
    ElMessageBox.alert('导出失败：' + (error as Error).message, '错误', {
      confirmButtonText: '确定',
      type: 'error',
    })
  }
}

// 同样修改exportPDF函数
const exportPDF = async () => {
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

    // 获取画布的原始尺寸
    const canvasRect = canvas.getBoundingClientRect()
    const originalWidth = canvasRect.width
    const originalHeight = canvasRect.height

    // 临时隐藏可能导致乱码的元素
    const textElements = canvas.querySelectorAll('.course-title, .course-info')
    const originalDisplays: { el: HTMLElement, display: string }[] = []
    textElements.forEach((el) => {
      const htmlEl = el as HTMLElement
      originalDisplays.push({ el: htmlEl, display: htmlEl.style.display })
      htmlEl.style.display = 'none'
    })

    // 清理画布中的特殊字符
    const restoreTexts = cleanupCanvasForExport(canvas)

    // 使用 html2canvas 将画布转换为图片，并指定宽高

    const imageCanvas = await html2canvas(canvas, {
      backgroundColor: '#ffffff',
      scale: 3, // 使用3倍缩放以获得更高质量的图像
      useCORS: true,
      width: originalWidth,
      height: originalHeight,
      // 确保捕获整个画布内容，即使部分内容不在视口中
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      allowTaint: true,
      foreignObjectRendering: true,
      // 设置更大的虚拟窗口尺寸，确保能捕获所有内容
      windowWidth: Math.max(document.documentElement.clientWidth, window.innerWidth, originalWidth * 2),
      windowHeight: Math.max(document.documentElement.clientHeight, window.innerHeight, originalHeight * 2),
      logging: true,
      onclone: (documentClone) => {
        // 在复制的DOM中确保所有内容都可见
        const clonedCanvas = documentClone.querySelector('.course-canvas');
        if (clonedCanvas) {
          // 添加填充以确保边缘内容都被包含
          (clonedCanvas as HTMLElement).style.padding = '20px';
          // 确保克隆的画布显示所有内容
          (clonedCanvas as HTMLElement).style.overflow = 'visible';
          // 移除可能限制尺寸的属性
          (clonedCanvas as HTMLElement).style.maxWidth = 'none';
          (clonedCanvas as HTMLElement).style.maxHeight = 'none';
        }
        return documentClone;
      },
      ignoreElements: (element) => {
        // 忽略一些UI元素，只捕获设计内容
        return element.classList && (
          element.classList.contains('control-point') ||
          element.classList.contains('control-line') ||
          element.classList.contains('rotation-handle') ||
          element.classList.contains('el-button') ||
          element.classList.contains('toolbar') ||
          element.tagName === 'BUTTON' ||
          element.classList.contains('el-dropdown') ||
          element.classList.contains('settings-panel')
        );
      }
    })

    // 恢复控制点的显示
    controlPoints.forEach((point) => {
      ; (point as HTMLElement).style.display = ''
    })

    // 恢复文本元素的显示
    originalDisplays.forEach(({ el, display }) => {
      el.style.display = display
    })

    // 恢复原始文本
    restoreTexts()

    // 获取当前日期时间格式化字符串
    const date = new Date()
    const formattedDateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
    const fileName = `${courseStore.currentCourse.name}-${formattedDateTime}`

    // 获取画布宽高
    const canvasWidth = imageCanvas.width
    const canvasHeight = imageCanvas.height

    // 确保导出的图像尺寸不小于最小值
    const minExportWidth = 800
    const minExportHeight = 600

    // 如果画布尺寸小于最小值，创建一个新的画布并进行缩放
    let finalCanvas = imageCanvas
    if (canvasWidth < minExportWidth || canvasHeight < minExportHeight) {


      // 计算缩放比例
      const scaleRatio = Math.max(
        minExportWidth / canvasWidth,
        minExportHeight / canvasHeight
      )

      // 创建新画布
      const scaledCanvas = document.createElement('canvas')
      const scaledWidth = Math.round(canvasWidth * scaleRatio)
      const scaledHeight = Math.round(canvasHeight * scaleRatio)

      scaledCanvas.width = scaledWidth
      scaledCanvas.height = scaledHeight

      // 绘制缩放后的图像
      const ctx = scaledCanvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, scaledWidth, scaledHeight)
        ctx.drawImage(imageCanvas, 0, 0, canvasWidth, canvasHeight, 0, 0, scaledWidth, scaledHeight)
        finalCanvas = scaledCanvas
      }
    }

    // 计算适合的PDF尺寸和方向
    // 标准A4尺寸为 210mm x 297mm，转换为像素约为 595 x 842 (at 72 dpi)
    let pdfWidth, pdfHeight

    // 根据用户选择的纸张大小设置尺寸
    switch (pdfExportOptions.value.paperSize) {
      case 'a3':
        pdfWidth = 842
        pdfHeight = 1191
        break
      case 'a5':
        pdfWidth = 420
        pdfHeight = 595
        break
      case 'letter':
        pdfWidth = 612
        pdfHeight = 792
        break
      default: // a4
        pdfWidth = 595
        pdfHeight = 842
    }

    // 确定方向
    let orientation: 'landscape' | 'portrait'
    if (pdfExportOptions.value.orientation === 'auto') {
      orientation = finalCanvas.width > finalCanvas.height ? 'landscape' : 'portrait'
    } else {
      orientation = pdfExportOptions.value.orientation as 'landscape' | 'portrait'
    }

    // 创建PDF文档
    const pdf = new jsPDF({
      orientation: orientation,
      unit: 'pt',
      format: pdfExportOptions.value.paperSize
    })

    // 设置PDF元数据 - 确保使用安全的字符串
    const safeCourseName = (courseStore.currentCourse.name || '未命名设计').replace(/[^\x00-\x7F]/g, '?')
    pdf.setProperties({
      title: safeCourseName,
      subject: '马术障碍赛路线设计',
      author: userStore.currentUser?.username || '马术障碍赛路线设计工具',
      keywords: '马术,障碍赛,路线设计',
      creator: '马术障碍赛路线设计工具'
    })

    // 计算图像在PDF中的尺寸，保持宽高比
    let imgWidth, imgHeight
    if (orientation === 'landscape') {
      // 横向
      const availableWidth = pdfHeight - 40 // 留出边距
      const availableHeight = pdfWidth - 80 // 留出标题和边距空间

      const ratio = Math.min(availableWidth / finalCanvas.width, availableHeight / finalCanvas.height)
      imgWidth = finalCanvas.width * ratio
      imgHeight = finalCanvas.height * ratio
    } else {
      // 纵向
      const availableWidth = pdfWidth - 40 // 留出边距
      const availableHeight = pdfHeight - 80 // 留出标题和边距空间

      const ratio = Math.min(availableWidth / finalCanvas.width, availableHeight / finalCanvas.height)
      imgWidth = finalCanvas.width * ratio
      imgHeight = finalCanvas.height * ratio
    }

    // 计算居中位置
    const x = orientation === 'landscape'
      ? (pdfHeight - imgWidth) / 2
      : (pdfWidth - imgWidth) / 2
    const y = 60 // 标题下方位置

    // 添加图片到PDF
    const imgData = finalCanvas.toDataURL('image/jpeg', pdfExportOptions.value.quality)
    pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight)

    // 添加页脚
    if (pdfExportOptions.value.includeFooter) {
      const footerY = orientation === 'landscape' ? pdfWidth - 20 : pdfHeight - 20
      pdf.setFontSize(8)
      pdf.text('Generated by Equestrian Obstacle Route Design Tool', orientation === 'landscape' ? 30 : 30, footerY)
    }

    // 保存PDF
    pdf.save(`${fileName}.pdf`)

    // 关闭对话框
    pdfExportOptions.value.visible = false

    ElMessage.success('PDF文档导出成功！')
  } catch (error) {
    ElMessageBox.alert('导出失败：' + (error as Error).message, '错误', {
      confirmButtonText: '确定',
      type: 'error',
    })
  }
}


// 修改 emit 定义，添加 show-login 事件
const emit = defineEmits(['show-login'])

// 添加获取类型名称的函数，以确保类型安全
const getTypeName = (type: string) => {
  return typeNames[type as keyof typeof typeNames] || type
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
