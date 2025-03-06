<template>
  <div class="obstacle-editor">
    <h2 class="editor-title">{{ isEditing ? '编辑障碍物' : '创建自定义障碍物' }}</h2>

    <div class="editor-form">
      <div class="form-group">
        <label>障碍物名称</label>
        <el-input v-model="obstacleData.name" placeholder="输入障碍物名称" />
      </div>

      <div class="form-group">
        <label>障碍物类型</label>
        <el-select v-model="obstacleData.baseType" class="full-width" @change="handleTypeChange">
          <el-option v-for="(name, type) in typeNames" :key="type" :label="name" :value="type" />
        </el-select>
      </div>

      <!-- 通用属性配置 -->
      <div class="section-title">通用属性</div>

      <!-- 装饰物配置 -->
      <template v-if="obstacleData.baseType === ObstacleType.DECORATION">
        <div class="decoration-container">
          <div class="form-group">
            <label>装饰物类别</label>
            <el-select v-model="obstacleData.decorationProperties.category" class="full-width"
              @change="handleDecorationCategoryChange">
              <el-option v-for="(name, category) in decorationCategoryNames" :key="category" :label="name"
                :value="category" />
            </el-select>
          </div>

          <div class="form-group">
            <label>宽度 (px)</label>
            <el-input-number v-model="obstacleData.decorationProperties.width" :min="20" :max="500" :step="10"
              class="full-width" />
          </div>

          <div class="form-group">
            <label>高度 (px)</label>
            <el-input-number v-model="obstacleData.decorationProperties.height" :min="20" :max="500" :step="10"
              class="full-width" />
          </div>

          <div class="form-group">
            <label>主颜色</label>
            <el-color-picker v-model="obstacleData.decorationProperties.color" class="color-picker" />
          </div>

          <!-- 特定装饰物属性 -->
          <!-- 裁判桌特有属性 -->
          <template v-if="obstacleData.decorationProperties.category === DecorationCategory.TABLE">
            <div class="form-group">
              <label>边框颜色</label>
              <el-color-picker v-model="obstacleData.decorationProperties.borderColor" class="color-picker" />
            </div>
            <div class="form-group">
              <label>边框宽度 (px)</label>
              <el-input-number v-model="obstacleData.decorationProperties.borderWidth" :min="0" :max="10" :step="1"
                class="full-width" />
            </div>
            <div class="form-group">
              <label>文本内容</label>
              <el-input v-model="obstacleData.decorationProperties.text" placeholder="输入显示文本" />
            </div>
            <div class="form-group">
              <label>文本颜色</label>
              <el-color-picker v-model="obstacleData.decorationProperties.textColor" class="color-picker" />
            </div>
          </template>

          <!-- 树特有属性 -->
          <template v-if="obstacleData.decorationProperties.category === DecorationCategory.TREE">
            <div class="form-group">
              <label>树干高度 (px)</label>
              <el-input-number v-model="obstacleData.decorationProperties.trunkHeight" :min="20" :max="200" :step="5"
                class="full-width" />
            </div>
            <div class="form-group">
              <label>树干宽度 (px)</label>
              <el-input-number v-model="obstacleData.decorationProperties.trunkWidth" :min="5" :max="50" :step="1"
                class="full-width" />
            </div>
            <div class="form-group">
              <label>树冠半径 (px)</label>
              <el-input-number v-model="obstacleData.decorationProperties.foliageRadius" :min="20" :max="150" :step="5"
                class="full-width" />
            </div>
            <div class="form-group">
              <label>树干颜色</label>
              <el-color-picker v-model="obstacleData.decorationProperties.color" class="color-picker" />
            </div>
            <div class="form-group">
              <label>树冠颜色</label>
              <el-color-picker v-model="obstacleData.decorationProperties.secondaryColor" class="color-picker" />
            </div>
          </template>

          <!-- 入口/出口特有属性 -->
          <template v-if="obstacleData.decorationProperties.category === DecorationCategory.ENTRANCE ||
            obstacleData.decorationProperties.category === DecorationCategory.EXIT">
            <div class="form-group">
              <label>背景颜色</label>
              <el-color-picker v-model="obstacleData.decorationProperties.color" class="color-picker" />
            </div>
            <div class="form-group">
              <label>边框颜色</label>
              <el-color-picker v-model="obstacleData.decorationProperties.borderColor" class="color-picker" />
            </div>
            <div class="form-group">
              <label>边框宽度 (px)</label>
              <el-input-number v-model="obstacleData.decorationProperties.borderWidth" :min="0" :max="10" :step="1"
                class="full-width" />
            </div>
            <div class="form-group">
              <label>文本内容</label>
              <el-input v-model="obstacleData.decorationProperties.text"
                :placeholder="obstacleData.decorationProperties.category === DecorationCategory.ENTRANCE ? '入口' : '出口'" />
            </div>
            <div class="form-group">
              <label>文本颜色</label>
              <el-color-picker v-model="obstacleData.decorationProperties.textColor" class="color-picker" />
            </div>
          </template>

          <!-- 自定义装饰物属性 -->
          <template v-if="obstacleData.decorationProperties.category === DecorationCategory.CUSTOM">
            <div class="form-group">
              <label>上传图片</label>
              <el-upload action="#" :auto-upload="false" :show-file-list="false" :on-change="handleImageUpload"
                accept="image/*">
                <el-button type="primary">选择图片</el-button>
              </el-upload>
            </div>
            <div v-if="imagePreview" class="image-preview">
              <img :src="imagePreview" alt="Preview" />
            </div>
          </template>
        </div>
      </template>

      <!-- 横木配置 -->
      <template v-if="['SINGLE', 'DOUBLE', 'COMBINATION', 'LIVERPOOL'].includes(obstacleData.baseType)">
        <div class="poles-container">
          <div v-for="(pole, index) in obstacleData.poles" :key="index" class="pole-item">
            <div class="pole-header">
              <span>横木 #{{ index + 1 }}</span>
              <el-button v-if="obstacleData.poles.length > 1" type="danger" size="small" circle
                @click="removePole(index)" :icon="Delete" />
            </div>

            <div class="pole-form">
              <el-form-item label="高度 (px)">
                <el-input-number v-model="pole.height" :min="5" :max="100" :step="5" />
              </el-form-item>

              <el-form-item label="宽度 (px)">
                <el-input-number v-model="pole.width" :min="50" :max="300" :step="10" />
              </el-form-item>

              <el-form-item label="颜色">
                <el-color-picker v-model="pole.color" />
              </el-form-item>

              <el-form-item label="间距 (px)" v-if="index < obstacleData.poles.length - 1">
                <el-input-number v-model="pole.spacing" :min="0" :max="100" :step="5" />
              </el-form-item>
            </div>
          </div>

          <el-button type="primary" @click="addPole" icon="Plus" class="add-pole-btn">
            添加横木
          </el-button>
        </div>
      </template>

      <!-- 墙壁属性 -->
      <template v-if="obstacleData.baseType === 'WALL'">
        <div class="wall-properties">
          <el-form-item label="高度 (px)">
            <el-input-number v-model="obstacleData.wallProperties.height" :min="20" :max="200" :step="10" />
          </el-form-item>

          <el-form-item label="宽度 (px)">
            <el-input-number v-model="obstacleData.wallProperties.width" :min="50" :max="300" :step="10" />
          </el-form-item>

          <el-form-item label="颜色">
            <el-color-picker v-model="obstacleData.wallProperties.color" />
          </el-form-item>
        </div>
      </template>

      <!-- 利物浦属性 -->
      <template v-if="obstacleData.baseType === 'LIVERPOOL'">
        <div class="liverpool-properties">
          <el-form-item label="水深 (px)">
            <el-input-number v-model="obstacleData.liverpoolProperties.waterDepth" :min="5" :max="50" :step="5" />
          </el-form-item>

          <el-form-item label="水宽 (px)">
            <el-input-number v-model="obstacleData.liverpoolProperties.width" :min="50" :max="300" :step="10" />
          </el-form-item>

          <el-form-item label="水颜色">
            <el-color-picker v-model="obstacleData.liverpoolProperties.waterColor" show-alpha />
          </el-form-item>

          <el-form-item>
            <el-checkbox v-model="obstacleData.liverpoolProperties.hasRail">包含横杆</el-checkbox>
          </el-form-item>

          <el-form-item v-if="obstacleData.liverpoolProperties.hasRail" label="横杆高度 (px)">
            <el-input-number v-model="obstacleData.liverpoolProperties.railHeight" :min="5" :max="50" :step="5" />
          </el-form-item>
        </div>
      </template>

      <!-- 水障属性 -->
      <template v-if="obstacleData.baseType === 'WATER'">
        <div class="water-properties">
          <el-form-item label="宽度 (px)">
            <el-input-number v-model="obstacleData.waterProperties.width" :min="50" :max="300" :step="10" />
          </el-form-item>

          <el-form-item label="深度 (px)">
            <el-input-number v-model="obstacleData.waterProperties.depth" :min="5" :max="50" :step="5" />
          </el-form-item>

          <el-form-item label="水颜色">
            <el-color-picker v-model="obstacleData.waterProperties.color" show-alpha />
          </el-form-item>

          <el-form-item label="边框颜色">
            <el-color-picker v-model="obstacleData.waterProperties.borderColor" show-alpha />
          </el-form-item>

          <el-form-item label="边框宽度 (px)">
            <el-input-number v-model="obstacleData.waterProperties.borderWidth" :min="0" :max="5" :step="1" />
          </el-form-item>
        </div>
      </template>
    </div>

    <div class="preview-section">
      <div class="section-title">预览</div>
      <div class="obstacle-preview">
        <!-- 障碍物预览 -->
        <div class="obstacle-content">
          <template v-if="obstacleData.baseType === 'WALL'">
            <div class="wall" :style="{
              width: `${obstacleData.wallProperties.width}px`,
              height: `${obstacleData.wallProperties.height}px`,
              background: obstacleData.wallProperties.color,
            }">
              <div class="wall-texture"></div>
            </div>
          </template>
          <template v-else-if="obstacleData.baseType === 'LIVERPOOL'">
            <div class="liverpool" :style="{
              width: `${obstacleData.poles[0]?.width || 100}px`,
            }">
              <template v-if="obstacleData.liverpoolProperties.hasRail">
                <div v-for="(pole, index) in obstacleData.poles" :key="index" class="pole" :style="{
                  width: '100%',
                  height: `${pole.height}px`,
                  background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
                }">
                  <div class="pole-shadow"></div>
                </div>
              </template>
              <div class="water" :style="{
                width: `${obstacleData.liverpoolProperties.width}px`,
                height: `${obstacleData.liverpoolProperties.waterDepth}px`,
                background: obstacleData.liverpoolProperties.waterColor,
                marginLeft: `${(obstacleData.poles[0]?.width - obstacleData.liverpoolProperties.width) / 2}px`,
              }"></div>
            </div>
          </template>
          <template v-else-if="obstacleData.baseType === 'WATER'">
            <div class="water-obstacle" :style="{
              width: `${obstacleData.waterProperties.width}px`,
              height: `${obstacleData.waterProperties.depth}px`,
              background: obstacleData.waterProperties.color,
              borderColor: obstacleData.waterProperties.borderColor,
              borderWidth: `${obstacleData.waterProperties.borderWidth}px`,
              borderStyle: 'solid'
            }"></div>
          </template>
          <!-- 添加装饰物预览 -->
          <template v-else-if="obstacleData.baseType === 'DECORATION'">
            <!-- 裁判桌预览 -->
            <template v-if="obstacleData.decorationProperties.category === DecorationCategory.TABLE">
              <div class="decoration-table" :style="{
                width: `${obstacleData.decorationProperties.width}px`,
                height: `${obstacleData.decorationProperties.height}px`,
                backgroundColor: obstacleData.decorationProperties.color,
                border: obstacleData.decorationProperties.borderWidth ?
                  `${obstacleData.decorationProperties.borderWidth}px solid ${obstacleData.decorationProperties.borderColor}` : 'none',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }">
                <div v-if="obstacleData.decorationProperties.text" :style="{
                  color: obstacleData.decorationProperties.textColor,
                  fontSize: '16px',
                  fontWeight: 'bold'
                }">
                  {{ obstacleData.decorationProperties.text }}
                </div>
              </div>
            </template>

            <!-- 树预览 -->
            <template v-else-if="obstacleData.decorationProperties.category === DecorationCategory.TREE">
              <div class="decoration-tree"
                style="position: relative; display: flex; flex-direction: column; align-items: center;">
                <!-- 树冠 -->
                <div :style="{
                  width: `${obstacleData.decorationProperties.foliageRadius * 2}px`,
                  height: `${obstacleData.decorationProperties.foliageRadius * 2}px`,
                  borderRadius: '50%',
                  backgroundColor: obstacleData.decorationProperties.secondaryColor,
                  marginBottom: '-10px',
                  zIndex: '1'
                }"></div>
                <!-- 树干 -->
                <div :style="{
                  width: `${obstacleData.decorationProperties.trunkWidth}px`,
                  height: `${obstacleData.decorationProperties.trunkHeight}px`,
                  backgroundColor: obstacleData.decorationProperties.color,
                  zIndex: '0'
                }"></div>
              </div>
            </template>

            <!-- 入口/出口预览 -->
            <template v-else-if="obstacleData.decorationProperties.category === DecorationCategory.ENTRANCE ||
              obstacleData.decorationProperties.category === DecorationCategory.EXIT">
              <div class="decoration-gate" :style="{
                width: `${obstacleData.decorationProperties.width}px`,
                height: `${obstacleData.decorationProperties.height}px`,
                backgroundColor: obstacleData.decorationProperties.color,
                border: obstacleData.decorationProperties.borderWidth ?
                  `${obstacleData.decorationProperties.borderWidth}px solid ${obstacleData.decorationProperties.borderColor}` : 'none',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }">
                <div :style="{
                  color: obstacleData.decorationProperties.textColor,
                  fontSize: '16px',
                  fontWeight: 'bold'
                }">
                  {{ obstacleData.decorationProperties.text ||
                    (obstacleData.decorationProperties.category === DecorationCategory.ENTRANCE ? '入口' :
                      '出口') }}
                </div>
              </div>
            </template>

            <!-- 花预览 -->
            <template v-else-if="obstacleData.decorationProperties.category === DecorationCategory.FLOWER">
              <div class="decoration-flower"
                style="position: relative; display: flex; flex-direction: column; align-items: center;">
                <!-- 花朵 -->
                <div :style="{
                  width: `${obstacleData.decorationProperties.width}px`,
                  height: `${obstacleData.decorationProperties.width}px`,
                  borderRadius: '50%',
                  backgroundColor: obstacleData.decorationProperties.color,
                  marginBottom: '-5px'
                }"></div>
                <!-- 叶子容器 -->
                <div style="position: relative; width: 20px; height: 15px;">
                  <!-- 左叶子 -->
                  <div :style="{
                    width: '15px',
                    height: '20px',
                    backgroundColor: obstacleData.decorationProperties.secondaryColor,
                    borderRadius: '50% 0 50% 50%',
                    transform: 'rotate(45deg)',
                    position: 'absolute',
                    left: '-15px'
                  }"></div>
                  <!-- 右叶子 -->
                  <div :style="{
                    width: '15px',
                    height: '20px',
                    backgroundColor: obstacleData.decorationProperties.secondaryColor,
                    borderRadius: '0 50% 50% 50%',
                    transform: 'rotate(-45deg)',
                    position: 'absolute',
                    right: '-15px'
                  }"></div>
                </div>
              </div>
            </template>

            <!-- 围栏预览 -->
            <template v-else-if="obstacleData.decorationProperties.category === DecorationCategory.FENCE">
              <div class="decoration-fence" :style="{
                width: `${obstacleData.decorationProperties.width}px`,
                height: `${obstacleData.decorationProperties.height}px`,
                backgroundColor: obstacleData.decorationProperties.color,
                display: 'flex',
                justifyContent: 'space-between'
              }">
                <!-- 围栏柱子 -->
                <template v-for="n in 5" :key="n">
                  <div :style="{
                    width: '4px',
                    height: '100%',
                    backgroundColor: obstacleData.decorationProperties.borderColor
                  }"></div>
                </template>
              </div>
            </template>

            <!-- 自定义预览 -->
            <template v-else-if="obstacleData.decorationProperties.category === DecorationCategory.CUSTOM">
              <div v-if="imagePreview" class="decoration-custom-image" :style="{
                width: `${obstacleData.decorationProperties.width}px`,
                height: `${obstacleData.decorationProperties.height}px`,
                backgroundImage: `url(${imagePreview})`,
                backgroundSize: 'contain',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat'
              }"></div>
              <div v-else class="decoration-custom-placeholder" :style="{
                width: `${obstacleData.decorationProperties.width}px`,
                height: `${obstacleData.decorationProperties.height}px`,
                backgroundColor: '#f0f0f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px dashed #ccc',
                fontSize: '12px',
                color: '#999'
              }">
                无图片
              </div>
            </template>
          </template>
          <template v-else>
            <div v-for="(pole, index) in obstacleData.poles" :key="index" class="pole" :style="{
              width: `${pole.width}px`,
              height: `${pole.height}px`,
              background: `linear-gradient(90deg, ${pole.color} 0%, ${adjustColor(pole.color, 20)} 100%)`,
              marginBottom: pole.spacing ? `${pole.spacing}px` : '0',
            }">
              <div class="pole-shadow"></div>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div class="editor-actions">
      <el-button @click="$emit('cancel')">取消</el-button>
      <el-button type="primary" @click="saveObstacle">保存</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed, onMounted, nextTick } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { ObstacleType, DecorationCategory } from '@/types/obstacle'
import type { Pole, WallProperties, LiverpoolProperties, CustomObstacleTemplate, DecorationProperties } from '@/types/obstacle'
import { useObstacleStore } from '@/stores/obstacle'
import { ElMessage } from 'element-plus'
import { cloneDeep } from 'lodash'

const props = defineProps<{
  template?: CustomObstacleTemplate
}>()

const emit = defineEmits(['save', 'cancel'])

const obstacleStore = useObstacleStore()
const isEditing = computed(() => !!props.template)

// 障碍物类型映射
const typeNames = {
  [ObstacleType.SINGLE]: '单杆',
  [ObstacleType.DOUBLE]: '双杆',
  [ObstacleType.COMBINATION]: '组合',
  [ObstacleType.WALL]: '墙',
  [ObstacleType.LIVERPOOL]: '利物浦',
  [ObstacleType.WATER]: '水障',
  [ObstacleType.DECORATION]: '装饰物',
}

// 装饰物类型名称映射
const decorationCategoryNames = {
  [DecorationCategory.TABLE]: '裁判桌',
  [DecorationCategory.TREE]: '树',
  [DecorationCategory.ENTRANCE]: '入口',
  [DecorationCategory.EXIT]: '出口',
  [DecorationCategory.FLOWER]: '花',
  [DecorationCategory.FENCE]: '围栏',
  [DecorationCategory.CUSTOM]: '自定义装饰',
}

// 障碍物数据
const obstacleData = reactive<CustomObstacleTemplate>({
  id: '',
  name: '',
  baseType: ObstacleType.SINGLE,
  poles: [
    {
      height: 20,
      width: 100,
      color: '#8B4513',
      spacing: 0
    }
  ],
  wallProperties: {
    height: 60,
    width: 100,
    color: '#8B4513'
  },
  liverpoolProperties: {
    height: 20,
    width: 100,
    waterDepth: 10,
    waterColor: 'rgba(0, 100, 255, 0.3)',
    hasRail: true,
    railHeight: 20
  },
  waterProperties: {
    width: 100,
    depth: 10,
    color: 'rgba(0, 100, 255, 0.3)',
    borderColor: 'rgba(0, 70, 180, 0.5)',
    borderWidth: 2
  },
  decorationProperties: {
    category: DecorationCategory.TABLE,
    width: 120,
    height: 80,
    color: '#8B4513',
    borderColor: '#593b22',
    borderWidth: 2,
    text: '裁判桌',
    textColor: '#ffffff'
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
})

// 图片预览
const imagePreview = ref<string | null>(null)

// 初始化数据
onMounted(() => {
  // 如果是编辑现有模板
  if (props.template) {
    // 克隆模板数据
    const templateData = cloneDeep(props.template)

    // 确保有默认的基础属性
    obstacleData.id = templateData.id
    obstacleData.name = templateData.name
    obstacleData.baseType = templateData.baseType
    obstacleData.updatedAt = templateData.updatedAt || new Date().toISOString()

    // 复制特定属性
    if (templateData.poles) obstacleData.poles = cloneDeep(templateData.poles)
    if (templateData.wallProperties) obstacleData.wallProperties = cloneDeep(templateData.wallProperties)
    if (templateData.liverpoolProperties) obstacleData.liverpoolProperties = cloneDeep(templateData.liverpoolProperties)
    if (templateData.waterProperties) obstacleData.waterProperties = cloneDeep(templateData.waterProperties)
    if (templateData.decorationProperties) obstacleData.decorationProperties = cloneDeep(templateData.decorationProperties)
  }

  // 不再需要初始化装饰物预览
})

// 处理类型变更
const handleTypeChange = (newType: ObstacleType) => {
  console.log('类型变更为:', newType)

  // 根据新类型设置默认值
  if (newType === ObstacleType.DECORATION && !obstacleData.decorationProperties) {
    obstacleData.decorationProperties = {
      category: DecorationCategory.TABLE,
      width: 120,
      height: 80,
      color: '#8B4513',
      borderColor: '#593b22',
      borderWidth: 2,
      text: '裁判桌',
      textColor: '#ffffff'
    }
  }

  // 不再需要更新装饰物预览
}

// 处理装饰物类别变更
const handleDecorationCategoryChange = (newCategory: DecorationCategory) => {
  // 根据新类别设置默认属性
  switch (newCategory) {
    case DecorationCategory.TABLE:
      obstacleData.decorationProperties = {
        ...obstacleData.decorationProperties,
        category: newCategory,
        width: 120,
        height: 80,
        color: '#8B4513',
        borderColor: '#593b22',
        borderWidth: 2,
        text: '裁判桌',
        textColor: '#ffffff'
      }
      break;
    case DecorationCategory.TREE:
      obstacleData.decorationProperties = {
        ...obstacleData.decorationProperties,
        category: newCategory,
        width: 80,
        height: 120,
        color: '#8B4513', // 树干颜色
        secondaryColor: '#2E8B57', // 树冠颜色
        trunkHeight: 60,
        trunkWidth: 15,
        foliageRadius: 40
      }
      break;
    case DecorationCategory.ENTRANCE:
      obstacleData.decorationProperties = {
        ...obstacleData.decorationProperties,
        category: newCategory,
        width: 150,
        height: 100,
        color: '#4169E1',
        borderColor: '#1E3C72',
        borderWidth: 2,
        text: '入口',
        textColor: '#ffffff'
      }
      break;
    case DecorationCategory.EXIT:
      obstacleData.decorationProperties = {
        ...obstacleData.decorationProperties,
        category: newCategory,
        width: 150,
        height: 100,
        color: '#FF6347',
        borderColor: '#8B3E2F',
        borderWidth: 2,
        text: '出口',
        textColor: '#ffffff'
      }
      break;
    case DecorationCategory.FLOWER:
      obstacleData.decorationProperties = {
        ...obstacleData.decorationProperties,
        category: newCategory,
        width: 60,
        height: 60,
        color: '#FF69B4', // 花朵颜色
        secondaryColor: '#32CD32', // 叶子颜色
      }
      break;
    case DecorationCategory.FENCE:
      obstacleData.decorationProperties = {
        ...obstacleData.decorationProperties,
        category: newCategory,
        width: 200,
        height: 40,
        color: '#D2B48C',
        borderColor: '#8B7355',
        borderWidth: 1,
      }
      break;
    case DecorationCategory.CUSTOM:
      obstacleData.decorationProperties = {
        ...obstacleData.decorationProperties,
        category: newCategory,
        width: 100,
        height: 100,
        color: '#FFFFFF',
        imageUrl: '',
      }
      imagePreview.value = null
      break;
  }
}

// 处理图片上传
const handleImageUpload = (file: any) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const result = e.target?.result
    if (typeof result === 'string') {
      imagePreview.value = result
      if (obstacleData.decorationProperties) {
        obstacleData.decorationProperties.imageUrl = result
      }
    }
  }
  reader.readAsDataURL(file.raw)
}

// 添加横木
const addPole = () => {
  // 复制最后一个横木的属性
  const lastPole = obstacleData.poles[obstacleData.poles.length - 1]
  const newPole = { ...lastPole, spacing: 0 }

  // 如果上一个横木有间距，将其复制
  if (obstacleData.poles.length > 0) {
    obstacleData.poles[obstacleData.poles.length - 1].spacing = 20
  }

  obstacleData.poles.push(newPole)
}

// 移除横木
const removePole = (index: number) => {
  obstacleData.poles.splice(index, 1)
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

// 保存障碍物
const saveObstacle = async () => {
  if (!obstacleData.name.trim()) {
    ElMessage.warning('请输入障碍物名称')
    return
  }

  // 确保最后一个横木没有间距
  if (obstacleData.poles.length > 0) {
    obstacleData.poles[obstacleData.poles.length - 1].spacing = 0
  }

  // 更新时间
  obstacleData.updatedAt = new Date().toISOString()

  // 如果是新建，设置创建时间
  if (!obstacleData.id) {
    obstacleData.createdAt = obstacleData.updatedAt
  }

  try {
    // 通过store保存到后端
    const savedObstacle = await obstacleStore.saveCustomObstacle(obstacleData)

    if (savedObstacle) {
      // 使用从后端返回的数据更新本地数据
      Object.assign(obstacleData, savedObstacle)
      emit('save', savedObstacle)
    }
  } catch (error) {
    console.error('保存障碍物失败:', error)
    // 错误处理由store内部完成，这里不需要额外处理
  }
}
</script>

<style scoped lang="scss">
.obstacle-editor {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.editor-title {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.editor-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-weight: 500;
  color: var(--el-text-color-regular);
}

.section-title {
  font-weight: 600;
  margin: 10px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--el-border-color-light);
}

.full-width {
  width: 100%;
}

.poles-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.pole-item {
  padding: 15px;
  border-radius: 4px;
  background-color: var(--el-fill-color-light);
}

.pole-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-weight: 500;
}

.pole-form {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.add-pole-btn {
  align-self: center;
  margin-top: 10px;
}

.preview-section {
  margin-top: 20px;
  background-color: #fff;
  border-radius: 8px;
  padding: 15px;
}

.obstacle-preview {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
  padding: 20px;
  border: 1px dashed var(--el-border-color);
  border-radius: 4px;
}

.obstacle-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}

.pole {
  position: relative;
  transition: all 0.3s ease;

  .pole-shadow {
    position: absolute;
    bottom: -4px;
    left: 4px;
    right: 4px;
    height: 4px;
    background-color: rgba(0, 0, 0, 0.1);
    border-radius: 50%;
    filter: blur(2px);
  }
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
        rgba(0, 0, 0, 0.1) 4px,
        transparent 4px,
        transparent 8px),
      repeating-linear-gradient(0deg,
        rgba(0, 0, 0, 0.1) 0px,
        rgba(0, 0, 0, 0.1) 4px,
        transparent 4px,
        transparent 8px);
  }
}

.liverpool {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;

  .water {
    border-radius: 4px;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
  }
}

.water-obstacle {
  border-radius: 4px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;
}

.decoration-container {
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 20px;
}

.image-preview {
  width: 100%;
  max-height: 150px;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
  margin-top: 10px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.image-preview img {
  max-width: 100%;
  max-height: 150px;
  object-fit: contain;
}

.color-picker {
  width: 100%;
}

.custom-upload {
  max-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 15px;
  margin-bottom: 20px;
}
</style>
