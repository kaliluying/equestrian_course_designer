<template>
  <div class="collaborator-cursors">
    <!-- 添加调试信息 -->
    <div class="debug-info" v-if="showDebugInfo">
      协作者数量: {{ collaborators.length }}
      <div v-if="collaborators.length === 0" style="color: red; font-weight: bold;">
        警告：协作者列表为空！
        <button @click="addDebugCollaborator">添加测试协作者</button>
      </div>
      <ul>
        <li v-for="c in collaborators" :key="c.id">
          {{ c.username }} - 光标: {{ c.cursor ? `(${c.cursor.x}, ${c.cursor.y})` : '无' }}
        </li>
      </ul>
    </div>

    <!-- 添加调试光标，在调试模式下始终显示 -->
    <div v-if="showDebugInfo && debugCollaborator" class="collaborator-cursor debug-cursor" :style="{
      left: `${debugCollaborator.cursor?.x || 100}px`,
      top: `${debugCollaborator.cursor?.y || 100}px`,
      backgroundColor: debugCollaborator.color
    }">
      <div class="cursor-pointer"></div>
      <div class="cursor-label" :style="{ backgroundColor: debugCollaborator.color }">
        {{ debugCollaborator.username }} (测试)
      </div>
    </div>

    <div v-for="collaborator in collaborators" :key="collaborator.id"
      v-show="collaborator.cursor && collaborator.id !== currentUserId" class="collaborator-cursor" :style="{
        left: `${collaborator.cursor?.x || 0}px`,
        top: `${collaborator.cursor?.y || 0}px`,
        backgroundColor: collaborator.color
      }">
      <div class="cursor-pointer"></div>
      <div class="cursor-label" :style="{ backgroundColor: collaborator.color }">
        {{ collaborator.username }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import type { CollaboratorInfo } from '@/utils/websocket'

const props = defineProps<{
  collaborators: CollaboratorInfo[]
}>()

const userStore = useUserStore()
const currentUserId = computed(() => userStore.currentUser?.id || '')

// 添加调试模式开关
const showDebugInfo = ref(false)

// 添加调试用的虚拟协作者
const debugCollaborator = ref<CollaboratorInfo | null>(null)

// 添加测试协作者的方法
const addDebugCollaborator = () => {
  debugCollaborator.value = {
    id: 'debug-user',
    username: '测试用户',
    color: '#FF5733',
    cursor: { x: 100, y: 100 },
    lastActive: new Date(),
    role: 'collaborator'
  }
  console.log('已添加测试协作者:', debugCollaborator.value)
}

// 在组件挂载时添加调试信息
onMounted(() => {
  console.log('CollaboratorCursors组件已挂载，当前协作者数量:', props.collaborators.length)

  // 按下Ctrl+Shift+D显示调试信息
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      showDebugInfo.value = !showDebugInfo.value
      console.log('调试信息显示状态:', showDebugInfo.value)

      // 如果开启调试模式且协作者列表为空，自动添加测试协作者
      if (showDebugInfo.value && props.collaborators.length === 0 && !debugCollaborator.value) {
        addDebugCollaborator()
      }
    }
  }

  window.addEventListener('keydown', handleKeyDown)

  // 在组件卸载时移除事件监听
  return () => {
    window.removeEventListener('keydown', handleKeyDown)
  }
})

// 监听协作者列表变化
watch(() => props.collaborators, (newCollaborators) => {
  console.log('CollaboratorCursors - 协作者列表已更新:',
    newCollaborators.map(c => ({
      id: c.id,
      username: c.username,
      hasCursor: !!c.cursor
    }))
  )
}, { deep: true })
</script>

<style scoped>
.collaborator-cursors {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 1000;
}

.collaborator-cursor {
  position: absolute;
  transform: translate(-4px, -4px);
  transition: left 0.1s ease, top 0.1s ease;
}

.cursor-pointer {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background-color: inherit;
  position: relative;
}

.cursor-pointer::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 8px 6px 0 0;
  border-color: inherit transparent transparent transparent;
  transform: rotate(45deg);
}

.cursor-label {
  position: absolute;
  top: 12px;
  left: 0;
  padding: 2px 6px;
  border-radius: 4px;
  color: white;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0.8;
}

/* 调试信息样式 */
.debug-info {
  position: absolute;
  top: 10px;
  right: 10px;
  background-color: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 10px;
  border-radius: 5px;
  font-size: 12px;
  z-index: 2000;
  pointer-events: auto;
  max-width: 300px;
  max-height: 300px;
  overflow: auto;
}

.debug-info ul {
  margin: 5px 0;
  padding-left: 20px;
}

.debug-info li {
  margin-bottom: 3px;
}

/* 调试光标样式 */
.debug-cursor {
  z-index: 1001;
  opacity: 0.8;
  border: 2px dashed white;
}
</style>
