<template>
  <div class="properties-panel">
    <template v-if="selectedObstacle">
      <div class="panel-header">
        <h2 class="panel-title">属性编辑</h2>
        <el-button type="danger" circle size="small" :icon="Delete" @click="removeObstacle" />
      </div>

      <div class="panel-content">
        <el-form label-position="top">
          <div class="form-section">
            <h3 class="section-title">基本信息</h3>
            <el-form-item label="障碍编号">
              <el-input
                v-model="selectedObstacle.number"
                maxlength="3"
                placeholder="输入编号（如：1, A, 2A）"
                class="full-width"
              />
            </el-form-item>

            <el-form-item label="旋转角度">
              <el-slider
                :model-value="selectedObstacle.rotation"
                :min="0"
                :max="360"
                show-input
                :format-tooltip="formatRotation"
                @update:model-value="updateRotation"
              />
            </el-form-item>
          </div>

          <!-- 利物浦水障设置 -->
          <template v-if="selectedObstacle.type === ObstacleType.LIVERPOOL">
            <div class="form-section">
              <h3 class="section-title">水障设置</h3>
              <el-form-item label="水障宽度 (m)">
                <el-input-number
                  :model-value="
                    Math.round(
                      ((selectedObstacle.liverpoolProperties?.width ?? 0) / meterScale) * 10,
                    ) / 10
                  "
                  @update:model-value="updateWaterWidth"
                  :min="1"
                  :max="4"
                  :step="0.1"
                  :precision="1"
                  controls-position="right"
                  class="full-width"
                />
              </el-form-item>

              <el-form-item label="水深 (cm)">
                <el-input-number
                  :model-value="
                    Math.round(
                      ((selectedObstacle.liverpoolProperties?.waterDepth ?? 0) / meterScale) * 100,
                    )
                  "
                  @update:model-value="updateWaterDepth"
                  :min="10"
                  :max="50"
                  :step="5"
                  controls-position="right"
                  class="full-width"
                />
              </el-form-item>

              <el-form-item label="水的颜色">
                <el-color-picker
                  v-model="waterColor"
                  show-alpha
                  @change="updateWaterColor"
                />
              </el-form-item>

              <el-form-item>
                <el-checkbox
                  :model-value="selectedObstacle.liverpoolProperties?.hasRail"
                  @update:model-value="updateHasRail"
                >
                  显示横杆
                </el-checkbox>
              </el-form-item>
            </div>
          </template>

          <div class="form-section">
            <h3 class="section-title">横木设置</h3>
            <div v-for="(pole, index) in selectedObstacle.poles" :key="index" class="pole-settings">
              <div class="pole-header">
                <span class="pole-title">横木 {{ index + 1 }}</span>
                <el-button
                  v-if="canRemovePole"
                  type="danger"
                  circle
                  size="small"
                  :icon="Delete"
                  @click="removePole(index)"
                />
              </div>

              <div
                class="pole-preview"
                :style="{
                  background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
                  width: `${pole.width * 0.4}px`,
                  height: `${pole.height * 0.4}px`,
                }"
              >
                <div class="pole-shadow"></div>
              </div>

              <el-form-item label="编号">
                <el-input
                  v-model="pole.number"
                  maxlength="3"
                  placeholder="输入编号（如：1, A, 2A）"
                  class="full-width"
                />
              </el-form-item>

              <el-form-item label="宽度 (cm)">
                <el-input-number
                  :model-value="Math.round((pole.height / meterScale) * 100)"
                  @update:model-value="(val: number) => updatePoleHeight(index, val)"
                  :min="10"
                  :max="50"
                  :step="5"
                  controls-position="right"
                  class="full-width"
                />
              </el-form-item>

              <el-form-item label="长度 (m)">
                <el-input-number
                  :model-value="Math.round((pole.width / meterScale) * 10) / 10"
                  @update:model-value="(val: number) => updatePoleWidth(index, val)"
                  :min="2"
                  :max="6"
                  :step="0.1"
                  :precision="1"
                  controls-position="right"
                  class="full-width"
                />
              </el-form-item>

              <el-form-item label="颜色">
                <el-color-picker v-model="pole.color" show-alpha />
              </el-form-item>

              <template
                v-if="
                  selectedObstacle.type === ObstacleType.COMBINATION &&
                  index < selectedObstacle.poles.length - 1
                "
              >
                <el-form-item :label="`与下一个障碍间距 (m)`">
                  <el-input-number
                    :model-value="Math.round(((pole.spacing || 0) / meterScale) * 10) / 10"
                    @update:model-value="(val: number) => updatePoleSpacing(index, val)"
                    :min="2"
                    :max="4"
                    :step="0.1"
                    :precision="1"
                    controls-position="right"
                    class="full-width"
                  />
                </el-form-item>
              </template>
            </div>

            <el-button
              v-if="canAddPole"
              type="primary"
              plain
              class="add-pole-button"
              :icon="Plus"
              @click="addPole"
            >
              添加横木
            </el-button>
          </div>
        </el-form>
      </div>
    </template>
    <template v-else-if="pathVisible">
      <div class="panel-header">
        <h2 class="panel-title">路径设置</h2>
      </div>

      <div class="panel-content">
        <el-form label-position="top">
          <div class="form-section">
            <h3 class="section-title">起点设置</h3>
            <el-form-item label="旋转角度">
              <el-slider
                v-model="startRotation"
                :min="0"
                :max="360"
                show-input
                :format-tooltip="formatRotation"
              />
            </el-form-item>
          </div>

          <div class="form-section">
            <h3 class="section-title">终点设置</h3>
            <el-form-item label="旋转角度">
              <el-slider
                v-model="endRotation"
                :min="0"
                :max="360"
                show-input
                :format-tooltip="formatRotation"
              />
            </el-form-item>
          </div>
        </el-form>
      </div>
    </template>
    <el-empty v-else description="请选择一个障碍物或点击路径" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { useCourseStore } from '@/stores/course'
import type { Pole } from '@/types/obstacle'
import { ObstacleType } from '@/types/obstacle'

const courseStore = useCourseStore()
const selectedObstacle = computed(() => courseStore.selectedObstacle)
const pathVisible = computed(() => courseStore.coursePath.visible)
const startRotation = computed({
  get: () => courseStore.startPoint.rotation,
  set: (value) => courseStore.updateStartRotation(value),
})
const endRotation = computed({
  get: () => courseStore.endPoint.rotation,
  set: (value) => courseStore.updateEndRotation(value),
})

const canAddPole = computed(() => {
  if (!selectedObstacle.value) return false
  if (selectedObstacle.value.type === ObstacleType.SINGLE) {
    return selectedObstacle.value.poles.length < 1
  }
  if (selectedObstacle.value.type === ObstacleType.DOUBLE) {
    return selectedObstacle.value.poles.length < 2
  }
  return selectedObstacle.value.poles.length < 4
})

const canRemovePole = computed(() => {
  if (!selectedObstacle.value) return false
  return selectedObstacle.value.poles.length > 1
})

const meterScale = computed(() => {
  const canvas = document.querySelector('.course-canvas')
  if (!canvas) return 1
  return canvas.clientWidth / courseStore.currentCourse.fieldWidth
})

// 整颜色亮度
const adjustColor = (color: string, amount: number): string => {
  const hex = color.replace('#', '')
  const num = parseInt(hex, 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + amount))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + amount))
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + amount))
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
}

const addPole = (): void => {
  if (!selectedObstacle.value || !canAddPole.value) return

  const newPole: Pole = {
    height: (20 * meterScale.value) / 100,
    width: 4 * meterScale.value,
    color: '#8B4513',
  }

  selectedObstacle.value.poles.push(newPole)
  courseStore.updateObstacle(selectedObstacle.value.id, {
    poles: selectedObstacle.value.poles,
  })
}

const removePole = (index: number): void => {
  if (!selectedObstacle.value || !canRemovePole.value) return

  selectedObstacle.value.poles.splice(index, 1)
  courseStore.updateObstacle(selectedObstacle.value.id, {
    poles: selectedObstacle.value.poles,
  })
}

const removeObstacle = (): void => {
  if (!selectedObstacle.value) return
  courseStore.removeObstacle(selectedObstacle.value.id)
  courseStore.selectedObstacle = null
}

const formatRotation = (val: number): string => `${val}°`

const updateRotation = (val: number): void => {
  if (!selectedObstacle.value) return
  courseStore.updateObstacle(selectedObstacle.value.id, {
    rotation: val,
  })
}

// 更新横木高度（厘米转像素）
const updatePoleHeight = (index: number, heightInCm: number): void => {
  if (!selectedObstacle.value) return
  const newPoles = [...selectedObstacle.value.poles]
  newPoles[index] = {
    ...newPoles[index],
    height: (heightInCm / 100) * meterScale.value,
  }
  courseStore.updateObstacle(selectedObstacle.value.id, { poles: newPoles })
}

// 更新横木宽度（米转像素）
const updatePoleWidth = (index: number, widthInMeters: number): void => {
  if (!selectedObstacle.value) return
  const newPoles = [...selectedObstacle.value.poles]
  newPoles[index] = {
    ...newPoles[index],
    width: widthInMeters * meterScale.value,
  }
  courseStore.updateObstacle(selectedObstacle.value.id, { poles: newPoles })
}

// 更新横木间距（米转像素）
const updatePoleSpacing = (index: number, spacingInMeters: number): void => {
  if (!selectedObstacle.value) return
  const newPoles = [...selectedObstacle.value.poles]
  newPoles[index] = {
    ...newPoles[index],
    spacing: spacingInMeters * meterScale.value,
  }
  courseStore.updateObstacle(selectedObstacle.value.id, { poles: newPoles })
}

// 添加利物浦水障相关的方法
const updateWaterWidth = (widthInMeters: number): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.liverpoolProperties) return
  const newProperties = {
    ...selectedObstacle.value.liverpoolProperties,
    width: widthInMeters * meterScale.value,
  }
  courseStore.updateObstacle(selectedObstacle.value.id, {
    liverpoolProperties: newProperties,
  })
}

const updateWaterDepth = (depthInCm: number): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.liverpoolProperties) return
  const newProperties = {
    ...selectedObstacle.value.liverpoolProperties,
    waterDepth: (depthInCm / 100) * meterScale.value,
  }
  courseStore.updateObstacle(selectedObstacle.value.id, {
    liverpoolProperties: newProperties,
  })
}

const updateWaterColor = (color: string): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.liverpoolProperties) return
  const newProperties = {
    ...selectedObstacle.value.liverpoolProperties,
    waterColor: color,
  }
  courseStore.updateObstacle(selectedObstacle.value.id, {
    liverpoolProperties: newProperties,
  })
}

const updateHasRail = (hasRail: boolean): void => {
  if (!selectedObstacle.value || !selectedObstacle.value.liverpoolProperties) return
  const newProperties = {
    ...selectedObstacle.value.liverpoolProperties,
    hasRail,
  }
  courseStore.updateObstacle(selectedObstacle.value.id, {
    liverpoolProperties: newProperties,
  })
}

const waterColor = computed({
  get: () => selectedObstacle.value?.liverpoolProperties?.waterColor ?? '',
  set: (value) => {
    if (selectedObstacle.value?.liverpoolProperties) {
      updateWaterColor(value)
    }
  }
})
</script>

<style scoped lang="scss">
.properties-panel {
  height: 100%;
  background-color: white;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  gap: 12px;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-color);
  flex: 1;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;

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

.form-section {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.section-title {
  margin: 0 0 16px;
  font-size: 14px;
  font-weight: 500;
  color: #606266;
}

.pole-settings {
  padding: 20px;
  margin-bottom: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--bg-color);
}

.pole-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  gap: 12px;
}

.pole-title {
  font-weight: 500;
  color: var(--text-color);
  flex: 1;
}

.pole-preview {
  position: relative;
  margin: 0 auto 16px;

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

.full-width {
  width: 100%;
}

.add-pole-button {
  width: 100%;
  margin-top: 8px;
  border-style: dashed;
}

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
</style>
