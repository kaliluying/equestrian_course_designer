<!--
  属性面板组件
  用于显示和编辑选中障碍物的属性或路径设置
  包括：基本信息、横木设置、水障设置等
-->
<template>
  <div class="properties-panel">
    <!-- 当选中障碍物时显示障碍物属性编辑界面 -->
    <template v-if="selectedObstacle">
      <div class="panel-header">
        <h2 class="panel-title">属性编辑</h2>
        <el-button type="danger" circle size="small" :icon="Delete" @click="removeObstacle" />
      </div>

      <div class="panel-content">
        <el-form label-position="top">
          <!-- 基本信息部分 -->
          <div class="form-section">
            <h3 class="section-title">基本信息</h3>
            <el-form-item label="障碍编号">
              <el-input v-model="selectedObstacle.number" maxlength="3" placeholder="输入编号（仅限数字）" class="full-width"
                @input="validateObstacleNumber" />
              <div v-if="numberError" class="error-message" style="color: #F56C6C; font-size: 12px; margin-top: 5px;">
                {{ numberError }}
              </div>
            </el-form-item>

            <el-form-item label="旋转角度">
              <el-slider :model-value="selectedObstacle.rotation" :min="0" :max="360" show-input
                :format-tooltip="formatRotation" @update:model-value="updateRotation" />
            </el-form-item>
          </div>

          <!-- 装饰物设置部分 - 仅当选中障碍物类型为DECORATION时显示 -->
          <template v-if="selectedObstacle.type === ObstacleType.DECORATION">
            <div class="form-section">
              <h3 class="section-title">装饰物设置</h3>
              <el-form-item>
                <el-checkbox :model-value="selectedObstacle.decorationProperties?.showDirectionArrow"
                  @update:model-value="updateShowDirectionArrow">
                  显示方向箭头
                </el-checkbox>
              </el-form-item>
            </div>
          </template>

          <!-- 利物浦水障设置部分 - 仅当选中障碍物类型为LIVERPOOL时显示 -->
          <template v-if="selectedObstacle.type === ObstacleType.LIVERPOOL">
            <div class="form-section">
              <h3 class="section-title">水障设置</h3>
              <el-form-item label="水障长度 (m)">
                <el-input-number :model-value="Math.round(
                  ((selectedObstacle.liverpoolProperties?.width ?? 0) / meterScale) * 10,
                ) / 10
                  " @update:model-value="updateWaterWidth" :step="0.1" :precision="1" controls-position="right"
                  class="full-width" />
              </el-form-item>

              <el-form-item label="水宽 (cm)">
                <el-input-number :model-value="Math.round(
                  ((selectedObstacle.liverpoolProperties?.waterDepth ?? 0) / meterScale) * 100,
                )
                  " @update:model-value="updateWaterDepth" :step="5" controls-position="right" class="full-width" />
              </el-form-item>

              <el-form-item label="水的颜色">
                <el-color-picker v-model="waterColor" show-alpha @change="updateWaterColor" />
              </el-form-item>

              <el-form-item>
                <el-checkbox :model-value="selectedObstacle.liverpoolProperties?.hasRail"
                  @update:model-value="updateHasRail">
                  显示横杆
                </el-checkbox>
              </el-form-item>
            </div>
          </template>

          <!-- 水障设置部分 - 仅当选中障碍物类型为WATER时显示 -->
          <template v-if="selectedObstacle.type === ObstacleType.WATER">
            <div class="form-section">
              <h3 class="section-title">水障设置</h3>
              <el-form-item label="宽度 (m)">
                <el-input-number :model-value="Math.round(
                  ((selectedObstacle.waterProperties?.width ?? 0) / meterScale) * 10,
                ) / 10
                  " @update:model-value="updateWaterObstacleWidth" :step="0.1" :precision="1" controls-position="right"
                  class="full-width" />
              </el-form-item>

              <el-form-item label="深度 (cm)">
                <el-input-number :model-value="Math.round(
                  ((selectedObstacle.waterProperties?.depth ?? 0) / meterScale) * 100,
                )
                  " @update:model-value="updateWaterObstacleDepth" :step="5" controls-position="right"
                  class="full-width" />
              </el-form-item>

              <el-form-item label="水的颜色">
                <el-color-picker v-model="waterObstacleColor" show-alpha @change="updateWaterObstacleColor" />
              </el-form-item>

              <el-form-item label="边框颜色">
                <el-color-picker v-model="waterObstacleBorderColor" show-alpha
                  @change="updateWaterObstacleBorderColor" />
              </el-form-item>

              <el-form-item label="边框宽度 (px)">
                <el-input-number :model-value="selectedObstacle.waterProperties?.borderWidth ?? 1"
                  @update:model-value="updateWaterObstacleBorderWidth" :step="1" controls-position="right"
                  class="full-width" />
              </el-form-item>
            </div>
          </template>

          <!-- 横木设置部分 - 所有带横木的障碍物都会显示 -->
          <div class="form-section">
            <h3 class="section-title">横木设置</h3>
            <!-- 遍历所有横木并显示其设置项 -->
            <div v-for="(pole, index) in selectedObstacle.poles" :key="index" class="pole-settings">
              <div class="pole-header">
                <span class="pole-title">横木 {{ index + 1 }}</span>
                <el-button v-if="canRemovePole" type="danger" circle size="small" :icon="Delete"
                  @click="removePole(index)" />
              </div>

              <!-- 横木预览 -->
              <div class="pole-preview" :style="{
                background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
                width: `${pole.width * 0.4}px`,
                height: `${pole.height * 0.4}px`,
              }">
                <div class="pole-shadow"></div>
              </div>

              <el-form-item label="编号">
                <el-input v-model="pole.number" maxlength="3" placeholder="输入编号（仅限数字）" class="full-width"
                  @input="(value) => validatePoleNumber(index, value)" />
                <div v-if="poleNumberErrors[index]" class="error-message"
                  style="color: #F56C6C; font-size: 12px; margin-top: 5px;">
                  {{ poleNumberErrors[index] }}
                </div>
              </el-form-item>

              <el-form-item label="宽度 (cm)">
                <el-input-number :model-value="Math.round((pole.height / meterScale) * 100)"
                  @update:model-value="(val: number) => updatePoleHeight(index, val)" :step="5"
                  controls-position="right" class="full-width" />
              </el-form-item>

              <el-form-item label="长度 (m)">
                <el-input-number :model-value="Math.round((pole.width / meterScale) * 10) / 10"
                  @update:model-value="(val: number) => updatePoleWidth(index, val)" :step="0.1" :precision="1"
                  controls-position="right" class="full-width" />
              </el-form-item>

              <el-form-item label="颜色">
                <el-color-picker v-model="pole.color" show-alpha />
              </el-form-item>

              <!-- 组合障碍物特有的间距设置 -->
              <template v-if="
                selectedObstacle.type === ObstacleType.COMBINATION &&
                index < selectedObstacle.poles.length - 1
              ">
                <el-form-item :label="`与下一个障碍间距 (m)`">
                  <el-input-number :model-value="Math.round(((pole.spacing || 0) / meterScale) * 10) / 10"
                    @update:model-value="(val: number) => updatePoleSpacing(index, val)" :step="0.1" :precision="1"
                    controls-position="right" class="full-width" />
                </el-form-item>
              </template>
            </div>

            <!-- 添加横木按钮 - 仅在可添加横木时显示 -->
            <el-button v-if="canAddPole" type="primary" plain class="add-pole-button" :icon="Plus" @click="addPole">
              添加横木
            </el-button>
          </div>
        </el-form>
      </div>
    </template>

    <!-- 当路径可见但未选中障碍物时显示路径设置界面 -->
    <template v-else-if="pathVisible">
      <div class="panel-header">
        <h2 class="panel-title">路径设置</h2>
      </div>

      <div class="panel-content">
        <el-form label-position="top">
          <!-- 起点设置 -->
          <div class="form-section">
            <h3 class="section-title">起点设置</h3>
            <el-form-item label="旋转角度">
              <el-slider v-model="startRotation" :min="0" :max="360" show-input :format-tooltip="formatRotation" />
            </el-form-item>
          </div>

          <!-- 终点设置 -->
          <div class="form-section">
            <h3 class="section-title">终点设置</h3>
            <el-form-item label="旋转角度">
              <el-slider v-model="endRotation" :min="0" :max="360" show-input :format-tooltip="formatRotation" />
            </el-form-item>
          </div>
        </el-form>
      </div>
    </template>

    <!-- 未选中任何内容时显示空状态 -->
    <el-empty v-else description="请选择一个障碍物或点击路径" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { useCourseStore } from '@/stores/course'
import type { Pole, Obstacle } from '@/types/obstacle'
import { ObstacleType } from '@/types/obstacle'
import { useWebSocketStore } from '@/stores/websocket'

// 添加障碍物编号错误提示
const numberError = ref('')
// 添加横木编号错误提示
const poleNumberErrors = ref<Record<number, string>>({})

/**
 * 验证障碍物编号，确保只能输入数字
 * @param value 输入的编号值
 */
const validateObstacleNumber = (value: string) => {
  if (!selectedObstacle.value) return

  // 如果输入为空，清除错误
  if (!value) {
    numberError.value = ''
    return
  }

  // 检查是否只包含数字
  if (!/^\d+$/.test(value)) {
    numberError.value = '障碍编号只能包含数字'
    // 移除非数字字符
    selectedObstacle.value.number = value.replace(/\D/g, '')
  } else {
    numberError.value = ''
    // 更新障碍物编号
    updateObstacleWithCollaboration(
      selectedObstacle.value.id,
      { number: value }
    )
  }
}

/**
 * 验证横木编号，确保只能输入数字
 * @param index 横木索引
 * @param value 输入的编号值
 */
const validatePoleNumber = (index: number, value: string) => {
  if (!selectedObstacle.value) return

  // 如果输入为空，清除错误
  if (!value) {
    poleNumberErrors.value[index] = ''
    return
  }

  // 检查是否只包含数字
  if (!/^\d+$/.test(value)) {
    poleNumberErrors.value[index] = '横木编号只能包含数字'
    // 移除非数字字符
    const newPoles = [...selectedObstacle.value.poles]
    newPoles[index] = {
      ...newPoles[index],
      number: value.replace(/\D/g, '')
    }
    // 更新障碍物
    updateObstacleWithCollaboration(
      selectedObstacle.value.id,
      { poles: newPoles }
    )
  } else {
    poleNumberErrors.value[index] = ''
    // 更新横木编号
    const newPoles = [...selectedObstacle.value.poles]
    newPoles[index] = {
      ...newPoles[index],
      number: value
    }
    // 更新障碍物
    updateObstacleWithCollaboration(
      selectedObstacle.value.id,
      { poles: newPoles }
    )
  }
}

// 获取课程存储
const courseStore = useCourseStore()
// 获取当前选中的障碍物
const selectedObstacle = computed(() => courseStore.selectedObstacle)
// 获取路径是否可见
const pathVisible = computed(() => courseStore.coursePath.visible)
// 起点旋转角度的计算属性（双向绑定）
const startRotation = computed({
  get: () => courseStore.startPoint.rotation,
  set: (value) => courseStore.updateStartRotation(value),
})
// 终点旋转角度的计算属性（双向绑定）
const endRotation = computed({
  get: () => courseStore.endPoint.rotation,
  set: (value) => courseStore.updateEndRotation(value),
})

const webSocketStore = useWebSocketStore()
const { isCollaborating, sendObstacleUpdate } = webSocketStore

/**
 * 判断是否可以添加横木
 * 根据障碍物类型限制横木数量：
 * - 单横木(SINGLE)：最多1个
 * - 双横木(DOUBLE)：最多2个
 * - 组合障碍(COMBINATION)：最多6个
 */
const canAddPole = computed(() => {
  if (!selectedObstacle.value) return false
  if (selectedObstacle.value.type === ObstacleType.SINGLE) {
    return selectedObstacle.value.poles.length < 1
  }
  if (selectedObstacle.value.type === ObstacleType.DOUBLE) {
    return selectedObstacle.value.poles.length < 2
  }
  return selectedObstacle.value.poles.length < 6
})

/**
 * 判断是否可以移除横木
 * 至少保留一个横木
 */
const canRemovePole = computed(() => {
  if (!selectedObstacle.value) return false
  return selectedObstacle.value.poles.length > 1
})

/**
 * 计算米到像素的比例
 * 根据画布宽度和场地实际宽度计算
 */
const meterScale = computed(() => {
  const canvas = document.querySelector('.course-canvas')
  if (!canvas) return 1
  return canvas.clientWidth / courseStore.currentCourse.fieldWidth
})

/**
 * 调整颜色亮度
 * @param color 原始颜色（十六进制）
 * @param amount 调整量
 * @returns 调整后的颜色（十六进制）
 */
const adjustColor = (color: string, amount: number): string => {
  const hex = color.replace('#', '')
  const num = parseInt(hex, 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

/**
 * 更新障碍物并发送协作消息
 * @param obstacleId 障碍物ID
 * @param updates 更新内容
 */
const updateObstacleWithCollaboration = (
  obstacleId: string,
  updates: Partial<Obstacle>
) => {
  // 更新本地障碍物，但不触发事件
  courseStore.updateObstacle(obstacleId, updates, false)

  // 如果在协作模式下，直接发送障碍物更新消息
  if (isCollaborating) {
    // 创建一个新的更新对象，避免引用问题
    const updatesToSend = { ...updates }

    // 如果包含position，创建一个新的position对象
    if (updatesToSend.position) {
      updatesToSend.position = { ...updatesToSend.position }
    }

    // 发送更新消息
    sendObstacleUpdate(obstacleId, updatesToSend)
  }
}

/**
 * 添加横木
 * 创建一个新的横木对象并添加到障碍物中
 */
const addPole = (): void => {
  if (!selectedObstacle.value) return

  // 创建新横木的初始参数
  const newPole: Pole = {
    height: (50 * meterScale.value) / 100,  // 高度：20厘米（转换为像素）
    width: 3.5 * meterScale.value,            // 宽度：4米（转换为像素）
    color: '#8B4513',                       // 颜色：棕色
  }

  // 添加到障碍物的横木数组中
  selectedObstacle.value.poles.push(newPole)
  // 更新障碍物
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { poles: selectedObstacle.value.poles }
  )
}

/**
 * 移除横木
 * @param index 要移除的横木索引
 */
const removePole = (index: number): void => {
  if (!selectedObstacle.value || !canRemovePole.value) return

  // 从数组中移除指定索引的横木
  selectedObstacle.value.poles.splice(index, 1)
  // 更新障碍物
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { poles: selectedObstacle.value.poles }
  )
}

/**
 * 移除当前选中的障碍物
 */
const removeObstacle = (): void => {
  if (!selectedObstacle.value) return
  courseStore.removeObstacle(selectedObstacle.value.id)
  courseStore.selectedObstacle = null
}

/**
 * 格式化旋转角度显示
 * @param val 角度值
 * @returns 格式化后的角度字符串
 */
const formatRotation = (val: number): string => `${val}°`

/**
 * 更新障碍物旋转角度
 * @param val 新的旋转角度
 */
const updateRotation = (val: number): void => {
  if (!selectedObstacle.value) return
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { rotation: val }
  )
}

/**
 * 更新横木高度
 * @param index 横木索引
 * @param heightInCm 高度（厘米）
 */
const updatePoleHeight = (index: number, heightInCm: number): void => {
  if (!selectedObstacle.value) return
  const newPoles = [...selectedObstacle.value.poles]
  newPoles[index] = {
    ...newPoles[index],
    height: (heightInCm / 100) * meterScale.value,  // 厘米转像素
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { poles: newPoles }
  )
}

/**
 * 更新横木宽度
 * @param index 横木索引
 * @param widthInMeters 宽度（米）
 */
const updatePoleWidth = (index: number, widthInMeters: number): void => {
  if (!selectedObstacle.value) return
  const newPoles = [...selectedObstacle.value.poles]
  newPoles[index] = {
    ...newPoles[index],
    width: widthInMeters * meterScale.value,  // 米转像素
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { poles: newPoles }
  )
}

/**
 * 更新横木间距
 * @param index 横木索引
 * @param spacingInMeters 间距（米）
 */
const updatePoleSpacing = (index: number, spacingInMeters: number): void => {
  if (!selectedObstacle.value) return
  const newPoles = [...selectedObstacle.value.poles]
  newPoles[index] = {
    ...newPoles[index],
    spacing: spacingInMeters * meterScale.value,  // 米转像素
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { poles: newPoles }
  )
}

// ===== 利物浦水障相关方法 =====

/**
 * 更新利物浦水障宽度
 * @param widthInMeters 宽度（米）
 */
const updateWaterWidth = (widthInMeters: number): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.liverpoolProperties) return
  const newProperties = {
    ...selectedObstacle.value.liverpoolProperties,
    width: widthInMeters * meterScale.value,  // 米转像素
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { liverpoolProperties: newProperties }
  )
}

/**
 * 更新利物浦水障深度
 * @param depthInCm 深度（厘米）
 */
const updateWaterDepth = (depthInCm: number): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.liverpoolProperties) return
  const newProperties = {
    ...selectedObstacle.value.liverpoolProperties,
    waterDepth: (depthInCm / 100) * meterScale.value,  // 厘米转像素
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { liverpoolProperties: newProperties }
  )
}

/**
 * 更新利物浦水障颜色
 * @param color 颜色值
 */
const updateWaterColor = (color: string): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.liverpoolProperties) return
  const newProperties = {
    ...selectedObstacle.value.liverpoolProperties,
    waterColor: color,
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { liverpoolProperties: newProperties }
  )
}

/**
 * 更新利物浦水障是否显示横杆
 * @param hasRail 是否显示横杆
 */
const updateHasRail = (hasRail: boolean): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.liverpoolProperties) return
  const newProperties = {
    ...selectedObstacle.value.liverpoolProperties,
    hasRail,
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { liverpoolProperties: newProperties }
  )
}

/**
 * 利物浦水障颜色的计算属性（双向绑定）
 */
const waterColor = computed({
  get: () => selectedObstacle.value?.liverpoolProperties?.waterColor ?? '',
  set: (value) => {
    if (selectedObstacle.value?.liverpoolProperties) {
      updateWaterColor(value)
    }
  }
})

// ===== 水障设置相关方法 =====

/**
 * 更新水障宽度
 * @param widthInMeters 宽度（米）
 */
const updateWaterObstacleWidth = (widthInMeters: number): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.waterProperties) return
  const newProperties = {
    ...selectedObstacle.value.waterProperties,
    width: widthInMeters * meterScale.value,  // 米转像素
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { waterProperties: newProperties }
  )
}

/**
 * 更新水障深度
 * @param depthInCm 深度（厘米）
 */
const updateWaterObstacleDepth = (depthInCm: number): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.waterProperties) return
  const newProperties = {
    ...selectedObstacle.value.waterProperties,
    depth: (depthInCm / 100) * meterScale.value,  // 厘米转像素
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { waterProperties: newProperties }
  )
}

/**
 * 更新水障颜色
 * @param color 颜色值
 */
const updateWaterObstacleColor = (color: string): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.waterProperties) return
  const newProperties = {
    ...selectedObstacle.value.waterProperties,
    color: color,
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { waterProperties: newProperties }
  )
}

/**
 * 更新水障边框颜色
 * @param color 颜色值
 */
const updateWaterObstacleBorderColor = (color: string): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.waterProperties) return
  const newProperties = {
    ...selectedObstacle.value.waterProperties,
    borderColor: color,
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { waterProperties: newProperties }
  )
}

/**
 * 更新水障边框宽度
 * @param width 宽度（像素）
 */
const updateWaterObstacleBorderWidth = (width: number): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.waterProperties) return
  const newProperties = {
    ...selectedObstacle.value.waterProperties,
    borderWidth: width,
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { waterProperties: newProperties }
  )
}

/**
 * 水障颜色的计算属性（双向绑定）
 */
const waterObstacleColor = computed({
  get: () => selectedObstacle.value?.waterProperties?.color ?? '',
  set: (value) => {
    if (selectedObstacle.value?.waterProperties) {
      updateWaterObstacleColor(value)
    }
  }
})

/**
 * 水障边框颜色的计算属性（双向绑定）
 */
const waterObstacleBorderColor = computed({
  get: () => selectedObstacle.value?.waterProperties?.borderColor ?? '',
  set: (value) => {
    if (selectedObstacle.value?.waterProperties) {
      updateWaterObstacleBorderColor(value)
    }
  }
})

/**
 * 更新装饰物方向箭头显示状态
 * @param show 是否显示方向箭头
 */
const updateShowDirectionArrow = (show: boolean): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.decorationProperties) return
  const newProperties = {
    ...selectedObstacle.value.decorationProperties,
    showDirectionArrow: show,
  }
  updateObstacleWithCollaboration(
    selectedObstacle.value.id,
    { decorationProperties: newProperties }
  )
}
</script>

<style scoped lang="scss">
/* 属性面板容器样式 */
.properties-panel {
  height: 100%;
  background-color: white;
  display: flex;
  flex-direction: column;
}

/* 面板头部样式 */
.panel-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  gap: 12px;
}

/* 面板标题样式 */
.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-color);
  flex: 1;
}

/* 面板内容区域样式 */
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;

  /* 自定义滚动条样式 */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background-color: #dcdfe6;
    border-radius: 3px;
  }

  &::-webkit-scrollbar-track {
    background-color: transparent;
  }
}

/* 表单分区样式 */
.form-section {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

/* 分区标题样式 */
.section-title {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

/* 横木设置卡片样式 */
.pole-settings {
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--bg-color);
}

/* 横木卡片头部样式 */
.pole-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}

/* 横木标题样式 */
.pole-title {
  font-weight: 500;
  color: var(--text-color);
  flex: 1;
}

/* 横木预览样式 */
.pole-preview {
  position: relative;
  margin: 0 auto 16px;

  /* 横木阴影效果 */
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

/* 全宽元素样式 */
.full-width {
  width: 100%;
}

/* 添加横木按钮样式 */
.add-pole-button {
  width: 100%;
  margin-top: 8px;
  border-style: dashed;
}

/* Element Plus 组件样式覆盖 */
:deep(.el-form-item) {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 0;
  }

  .el-form-item__label {
    padding: 0 0 8px;
    font-size: 14px;
    color: #606266;
  }
}

:deep(.el-slider) {
  margin-top: 8px;
}

:deep(.el-input-number) {
  .el-input__wrapper {
    padding-left: 12px;
  }
}

:deep(.el-empty) {
  padding: 60px 0;
}

:deep(.el-button) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;

  &.is-circle {
    padding: 8px;
  }
}

:deep(.el-button--small) {
  &.is-circle {
    padding: 6px;
  }
}

:deep(.el-slider__runway.show-input) {
  margin-right: 10px;
}
</style>
