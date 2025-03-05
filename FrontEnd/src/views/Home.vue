<template>
    <div class="home-container">
        <ToolBar class="toolbar" />
        <CourseCanvas class="canvas" ref="canvasRef" />
        <PropertiesPanel class="properties-panel" />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import ToolBar from '@/components/ToolBar.vue'
import CourseCanvas from '@/components/CourseCanvas.vue'
import PropertiesPanel from '@/components/PropertiesPanel.vue'
import { useCourseStore } from '@/stores/course'
import { useUserStore } from '@/stores/user'
import { ElMessage } from 'element-plus'

const canvasRef = ref<InstanceType<typeof CourseCanvas> | null>(null)
const route = useRoute()
const courseStore = useCourseStore()
const userStore = useUserStore()
const isCollaborating = ref(false)

// 监听协作事件
onMounted(() => {
    console.log('Home.vue已挂载，初始化事件监听器')

    // 处理协作路由
    if (route.name === 'collaborate' && route.params.designId) {
        handleCollaborationRoute()
    }

    // 监听协作停止事件
    const handleCollaborationStopped = () => {
        isCollaborating.value = false
    }

    // 监听协作连接成功事件
    const handleCollaborationConnected = () => {
        isCollaborating.value = true
    }

    document.addEventListener('collaboration-stopped', handleCollaborationStopped as EventListener)
    document.addEventListener('collaboration-connected', handleCollaborationConnected as EventListener)

    // 在组件卸载时移除事件监听
    onUnmounted(() => {
        document.removeEventListener('collaboration-stopped', handleCollaborationStopped as EventListener)
        document.removeEventListener('collaboration-connected', handleCollaborationConnected as EventListener)
    })
})

// 处理协作路由
const handleCollaborationRoute = async () => {
    if (!route.params.designId) return

    const designId = route.params.designId as string
    console.log('协作路由包含设计ID:', designId)

    // 确保用户已登录
    if (!userStore.isAuthenticated) {
        console.log('用户未登录，存储协作信息')
        localStorage.setItem('pendingCollaboration', JSON.stringify({
            designId,
            timestamp: Date.now()
        }))
        return
    }

    // 设置当前设计ID
    courseStore.setCurrentCourseId(designId)
}

// 导出canvasRef，以便父组件访问
defineExpose({
    canvasRef
})
</script>

<style scoped>
.home-container {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
}

.toolbar {
    width: 300px;
    background-color: white;
    border-right: 1px solid var(--border-color);
    overflow-y: auto;
}

.canvas {
    flex: 1;
    background-color: white;
    overflow: hidden;
}

.properties-panel {
    width: 300px;
    background-color: white;
    border-left: 1px solid var(--border-color);
    overflow-y: auto;
}
</style>
