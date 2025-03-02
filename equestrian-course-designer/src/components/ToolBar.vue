<template>
  <div class="toolbar">
    <div class="section course-name-section">
      <h2 class="section-title">路线名称</h2>
      <div class="course-name">
        <el-input v-model="courseName" @change="updateName" placeholder="输入路线名称" class="course-name-input"
          :prefix-icon="Edit" />
      </div>
    </div>
    <div class="section obstacle-templates">
      <h2 class="section-title">障碍物模板</h2>

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

        <el-button @click="exportImage" type="primary" class="action-button"
          :title="!userStore.currentUser ? '需要登录才能导出图片' : '导出图片'">
          <el-icon>
            <Picture />
          </el-icon>
          导出图片
          <el-icon v-if="!userStore.currentUser" class="lock-icon">
            <Lock />
          </el-icon>
        </el-button>

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
import type { CourseDesign } from '@/types/obstacle'

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
    }).catch(() => { })
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

    // 临时隐藏控制路线弧度的控制点
    const controlPoints = canvas.querySelectorAll('.control-point, .control-line, .path-indicator .rotation-handle')
    controlPoints.forEach((point) => {
      ; (point as HTMLElement).style.display = 'none'
    })

    // 使用 html2canvas 将画布转换为图片
    console.log('开始转换画布为图片...')
    const imageCanvas = await html2canvas(canvas, {
      backgroundColor: '#ffffff',
      scale: 2,
      useCORS: true,
    })
    // 恢复控制点的显示
    controlPoints.forEach((point) => {
      ; (point as HTMLElement).style.display = ''
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

    // 检查是否包含路线数据
    if (designData.path) {
      console.log('包含路线数据，路线点数量:', designData.path.points.length)
    } else {
      console.log('没有路线数据或路线为空')
    }

    const designBlob = new Blob([JSON.stringify(designData)], { type: 'application/json' })
    console.log('设计文件大小:', designBlob.size)

    // 检查是否是更新现有设计
    const designIdToUpdate = localStorage.getItem('design_id_to_update')
    console.log('设计ID (从localStorage):', designIdToUpdate)

    // 构建保存请求数据
    const saveData: SaveDesignRequest = {
      title: courseName.value || '未命名设计',
      image: new File([imageBlob], 'design.png', { type: 'image/png' }),
      download: new File([designBlob], 'design.json', { type: 'application/json' })
    }

    // 如果是更新现有设计，添加设计ID
    if (designIdToUpdate) {
      const designId = parseInt(designIdToUpdate)
      if (isNaN(designId)) {
        console.error('设计ID无效:', designIdToUpdate)
        throw new Error('设计ID无效，无法更新')
      }
      saveData.id = designId
      console.log('更新设计，ID:', designId)
    } else {
      console.log('创建新设计')
    }

    console.log('准备发送保存请求:', saveData)
    // 发送保存请求
    try {
      const response = await saveDesign(saveData)
      console.log('保存响应:', response)

      // 如果是从管理界面打开的编辑，保存成功后清除设计ID
      if (designIdToUpdate) {
        // 向父窗口发送更新消息
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              type: 'design_updated',
              designId: designIdToUpdate
            }, '*');
            console.log('已向父窗口发送更新消息');
          }
        } catch (e) {
          console.error('发送窗口消息失败', e);
        }

        localStorage.removeItem('design_id_to_update')

        // 提示用户设计已更新
        ElMessage.success('设计已更新')

        // 如果是从管理界面打开的，可以添加一个提示询问是否关闭当前页面
        ElMessageBox.confirm('设计已成功更新，是否关闭编辑页面？', '提示', {
          confirmButtonText: '是',
          cancelButtonText: '否',
          type: 'info',
        }).then(() => {
          // 关闭当前页面
          window.close()
        }).catch(() => {
          // 用户选择继续编辑，不做操作
        })
      } else {
        ElMessage.success('保存成功')
      }
    } catch (error: unknown) {
      console.error('API请求失败:', error)

      // 尝试提取详细错误信息
      let errorMessage = '保存失败，请重试'
      if (error instanceof Error) {
        errorMessage = error.message
      }

      // 尝试从响应中提取更详细的错误信息
      if (typeof error === 'object' && error !== null && 'response' in error) {
        const responseError = error as { response?: { data?: unknown } }
        if (responseError.response?.data) {
          const data = responseError.response.data
          if (typeof data === 'string') {
            errorMessage = data
          } else if (typeof data === 'object' && data !== null) {
            const errorData = data as Record<string, unknown>
            if ('detail' in errorData && typeof errorData.detail === 'string') {
              errorMessage = errorData.detail
            } else if ('message' in errorData && typeof errorData.message === 'string') {
              errorMessage = errorData.message
            } else {
              // 尝试将整个对象转为字符串
              errorMessage = JSON.stringify(data)
            }
          }
        }
      }

      ElMessage.error(`保存失败: ${errorMessage}`)
      throw new Error(`API请求失败: ${errorMessage}`)
    }
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
    }).catch(() => { })
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
      ; (point as HTMLElement).style.display = 'none'
    })

    // 使用 html2canvas 将画布转换为图片
    const imageCanvas = await html2canvas(canvas, {
      backgroundColor: '#ffffff',
      scale: 2, // 提高导出图片的清晰度
      useCORS: true, // 允许跨域图片
    })

    // 恢复控制点的显示
    controlPoints.forEach((point) => {
      ; (point as HTMLElement).style.display = ''
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

// 检查是否有从后台导入的设计数据
onMounted(() => {
  console.log("组件挂载，检查URL参数和localStorage...");

  // 首先检查URL参数
  const urlParams = new URLSearchParams(window.location.search);
  const designId = urlParams.get('design_id');
  const jsonUrl = urlParams.get('json_url');
  const designTitle = urlParams.get('title');

  console.log("URL参数:", { designId, jsonUrl, designTitle });

  // 如果有设计ID，添加页面关闭前的消息发送
  if (designId) {
    // 添加窗口关闭事件，通知父窗口更新
    window.addEventListener('beforeunload', function () {
      // 尝试向父窗口发送消息
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage({
            type: 'design_updated',
            designId: designId
          }, '*');
          console.log('页面关闭前向父窗口发送更新消息');
        }
      } catch (e) {
        console.error('发送窗口消息失败', e);
      }
    });
  }

  // 如果URL中有设计ID和JSON URL，优先从URL加载
  if (designId && jsonUrl) {
    console.log("从URL参数加载设计:", jsonUrl);

    // 保存设计ID用于后续更新
    localStorage.setItem('design_id_to_update', designId);

    // 构建完整的JSON URL
    // 如果jsonUrl已经是完整URL，则直接使用；否则添加后端基础URL
    const fullJsonUrl = jsonUrl.startsWith('http')
      ? jsonUrl
      : `${window.location.protocol}//${window.location.hostname}:8000${jsonUrl}`;

    console.log("完整的JSON URL:", fullJsonUrl);

    // 从JSON URL加载设计数据
    fetch(fullJsonUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`获取设计数据失败: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(designData => {
        console.log("获取到的设计数据:", designData);

        // 加载设计数据
        const result = loadDesignData(designData);
        console.log("加载设计数据结果:", result);

        // 如果有标题，更新路线名称
        if (designTitle) {
          courseName.value = designTitle;
          courseStore.updateCourseName(designTitle);
        }

        // 显示成功消息
        ElMessage.success(`成功导入设计: ${designTitle || '未命名设计'}`);
      })
      .catch(error => {
        console.error("加载设计数据失败:", error);
        ElMessage.error('加载设计数据失败: ' + (error instanceof Error ? error.message : String(error)));
      });
  }
  // 如果URL中没有参数，则检查localStorage
  else {
    console.log("检查localStorage中的设计数据...");

    // 检查localStorage中是否有导入的设计数据
    const importedDesign = localStorage.getItem('imported_design');
    const importDesignTitle = localStorage.getItem('import_design_title');
    const designIdToUpdate = localStorage.getItem('design_id_to_update');

    console.log("localStorage:", {
      importedDesign: importedDesign ? "存在" : "不存在",
      importDesignTitle,
      designIdToUpdate
    });

    if (importedDesign) {
      try {
        // 解析设计数据
        const designData = JSON.parse(importedDesign);
        console.log("从localStorage解析的设计数据:", designData);

        // 加载设计数据
        const result = loadDesignData(designData);
        console.log("加载设计数据结果:", result);

        // 如果有标题，更新路线名称
        if (importDesignTitle) {
          courseName.value = importDesignTitle;
          courseStore.updateCourseName(importDesignTitle);
        }

        // 显示成功消息
        ElMessage.success(`成功导入设计: ${importDesignTitle || '未命名设计'}`);

        // 清除localStorage中的数据，防止重复导入
        localStorage.removeItem('imported_design');
        localStorage.removeItem('import_design_title');

        // 如果是从管理界面导入的，添加页面关闭前的消息发送
        if (designIdToUpdate) {
          // 添加窗口关闭事件，通知父窗口更新
          window.addEventListener('beforeunload', function () {
            // 尝试向父窗口发送消息
            try {
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage({
                  type: 'design_updated',
                  designId: designIdToUpdate
                }, '*');
              }
            } catch (e) {
              console.error('发送窗口消息失败', e);
            }
          });
        }
      } catch (error: unknown) {
        console.error('导入设计数据失败:', error);
        ElMessage.error('导入设计数据失败: ' + (error instanceof Error ? error.message : String(error)));
      }
    } else {
      console.log("没有找到导入的设计数据");
    }
  }
});

// 加载设计数据的函数
const loadDesignData = (designData: Partial<CourseDesign>) => {
  try {
    // 清空当前画布
    courseStore.currentCourse.obstacles = []

    // 加载障碍物
    if (designData.obstacles && Array.isArray(designData.obstacles)) {
      courseStore.currentCourse.obstacles = designData.obstacles
    }

    // 加载路径数据
    if (designData.path) {
      // 设置路径可见性
      courseStore.togglePathVisibility(designData.path.visible)

      // 加载路径点
      if (designData.path.points) {
        courseStore.coursePath.points = designData.path.points
      }

      // 加载起点和终点
      if (designData.path.startPoint) {
        courseStore.updateStartPoint(designData.path.startPoint)
        courseStore.updateStartRotation(designData.path.startPoint.rotation)
      }

      if (designData.path.endPoint) {
        courseStore.updateEndPoint(designData.path.endPoint)
        courseStore.updateEndRotation(designData.path.endPoint.rotation)
      }
    }

    // 更新场地尺寸
    if (designData.fieldWidth && designData.fieldHeight) {
      courseStore.updateFieldSize(designData.fieldWidth, designData.fieldHeight)
    }

    return true
  } catch (error) {
    console.error('加载设计数据失败:', error)
    return false
  }
}

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
    background-image: repeating-linear-gradient(90deg,
        rgba(0, 0, 0, 0.1) 0px,
        rgba(0, 0, 0, 0.1) 3px,
        transparent 3px,
        transparent 6px);
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
