<template>
    <div class="resizable-divider"
        :class="{ 'vertical': direction === 'vertical', 'horizontal': direction === 'horizontal' }"
        @mousedown="startResize">
        <div class="divider-handle"></div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
    direction: 'vertical' | 'horizontal';
    minSize?: number;
    maxSize?: number;
}>();

const emit = defineEmits(['resize']);

// 默认值
const minSize = props.minSize || 200;
const maxSize = props.maxSize || 600;

// 拖拽状态
let isResizing = false;
let startPosition = 0;
let startSize = 0;

// 开始调整大小
const startResize = (e: MouseEvent) => {
    isResizing = true;
    startPosition = props.direction === 'vertical' ? e.clientX : e.clientY;

    // 获取当前大小
    const panel = props.direction === 'vertical'
        ? e.currentTarget.previousElementSibling
        : e.currentTarget.previousElementSibling;

    if (panel) {
        startSize = props.direction === 'vertical'
            ? panel.getBoundingClientRect().width
            : panel.getBoundingClientRect().height;
    }

    // 添加全局事件监听
    document.addEventListener('mousemove', handleResize);
    document.addEventListener('mouseup', stopResize);

    // 改变光标样式
    document.body.style.cursor = props.direction === 'vertical' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
};

// 处理调整大小
const handleResize = (e: MouseEvent) => {
    if (!isResizing) return;

    const currentPosition = props.direction === 'vertical' ? e.clientX : e.clientY;
    const delta = currentPosition - startPosition;

    // 计算新的尺寸
    let newSize = startSize + delta;

    // 限制尺寸范围
    if (newSize < minSize) newSize = minSize;
    if (newSize > maxSize) newSize = maxSize;

    // 发出事件
    emit('resize', newSize);
};

// 停止调整大小
const stopResize = () => {
    isResizing = false;
    document.removeEventListener('mousemove', handleResize);
    document.removeEventListener('mouseup', stopResize);

    // 恢复光标样式
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
};
</script>

<style scoped>
.resizable-divider {
    position: relative;
    flex-shrink: 0;
    /* z-index: 10; */
    display: flex;
    align-items: center;
    justify-content: center;
}

.vertical {
    cursor: col-resize;
    width: 6px;
    height: 100%;
    background-color: #f0f0f0;
    transition: background-color 0.2s;
}

.horizontal {
    cursor: row-resize;
    height: 6px;
    width: 100%;
    background-color: #f0f0f0;
    transition: background-color 0.2s;
}

.resizable-divider:hover,
.resizable-divider:active {
    background-color: #e0e0e0;
}

.divider-handle {
    position: absolute;
    background-color: #bbb;
    opacity: 0;
    transition: opacity 0.2s;
    border-radius: 2px;
}

.vertical .divider-handle {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 2px;
    height: 40px;
}

.horizontal .divider-handle {
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    height: 2px;
    width: 40px;
}

.resizable-divider:hover .divider-handle {
    opacity: 0.6;
}

.resizable-divider:active .divider-handle {
    opacity: 0.8;
}
</style>
