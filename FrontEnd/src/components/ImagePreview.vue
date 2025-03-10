<template>
    <div class="image-preview-overlay" v-if="visible" @click="close">
        <div class="image-preview-container" @click.stop>
            <img
                :src="imageUrl"
                :alt="imageAlt"
                class="preview-image"
                ref="imageRef"
                @mousedown="startDrag"
                @touchstart="startDrag"
                @wheel="handleZoom"
            />
            <div class="image-preview-controls">
                <button class="zoom-button" @click="zoomIn" title="放大">
                    <el-icon>
                        <ZoomIn />
                    </el-icon>
                </button>
                <button class="zoom-button" @click="zoomOut" title="缩小">
                    <el-icon>
                        <ZoomOut />
                    </el-icon>
                </button>
                <button class="zoom-button" @click="resetZoom" title="重置">
                    <el-icon>
                        <RefreshRight />
                    </el-icon>
                </button>
            </div>
            <div class="image-preview-close" @click="close">
                <el-icon>
                    <Close />
                </el-icon>
            </div>
            <div class="image-preview-title" v-if="title">{{ title }}</div>
            <div class="image-preview-hint">点击空白区域关闭预览 | 鼠标滚轮缩放 | 拖动移动图片</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { watchEffect, ref, onMounted, onUnmounted } from 'vue';
import { Close, ZoomIn, ZoomOut, RefreshRight } from '@element-plus/icons-vue';

const props = defineProps({
    visible: {
        type: Boolean,
        default: false
    },
    imageUrl: {
        type: String,
        required: true
    },
    imageAlt: {
        type: String,
        default: '图片预览'
    },
    title: {
        type: String,
        default: ''
    }
});

const emit = defineEmits(['update:visible', 'close']);
const imageRef = ref<HTMLImageElement | null>(null);
const scale = ref(1);
const dragging = ref(false);
const dragStart = ref({ x: 0, y: 0 });
const position = ref({ x: 0, y: 0 });

const close = () => {
    emit('update:visible', false);
    emit('close');
    // 重置缩放和位置
    resetZoom();
};

const zoomIn = () => {
    scale.value = Math.min(scale.value * 1.2, 5);
    applyTransform();
};

const zoomOut = () => {
    scale.value = Math.max(scale.value / 1.2, 0.2);
    applyTransform();
};

const resetZoom = () => {
    scale.value = 1;
    position.value = { x: 0, y: 0 };
    applyTransform();
};

const handleZoom = (event: WheelEvent) => {
    event.preventDefault();
    if (event.deltaY < 0) {
        zoomIn();
    } else {
        zoomOut();
    }
};

const startDrag = (event: MouseEvent | TouchEvent) => {
    if (!imageRef.value) return;

    dragging.value = true;

    if (event instanceof MouseEvent) {
        dragStart.value = {
            x: event.clientX - position.value.x,
            y: event.clientY - position.value.y
        };

        window.addEventListener('mousemove', onDrag);
        window.addEventListener('mouseup', stopDrag);
    } else if (event instanceof TouchEvent && event.touches.length === 1) {
        dragStart.value = {
            x: event.touches[0].clientX - position.value.x,
            y: event.touches[0].clientY - position.value.y
        };

        window.addEventListener('touchmove', onDrag);
        window.addEventListener('touchend', stopDrag);
    }
};

const onDrag = (event: MouseEvent | TouchEvent) => {
    if (!dragging.value) return;

    if (event instanceof MouseEvent) {
        position.value = {
            x: event.clientX - dragStart.value.x,
            y: event.clientY - dragStart.value.y
        };
    } else if (event instanceof TouchEvent && event.touches.length === 1) {
        position.value = {
            x: event.touches[0].clientX - dragStart.value.x,
            y: event.touches[0].clientY - dragStart.value.y
        };
    }

    applyTransform();
};

const stopDrag = () => {
    dragging.value = false;
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
    window.removeEventListener('touchmove', onDrag);
    window.removeEventListener('touchend', stopDrag);
};

const applyTransform = () => {
    if (!imageRef.value) return;
    imageRef.value.style.transform = `translate(${position.value.x}px, ${position.value.y}px) scale(${scale.value})`;
};

// 当预览打开时禁用页面滚动
watchEffect(() => {
    if (props.visible) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
});

onMounted(() => {
    if (imageRef.value) {
        applyTransform();
    }
});

onUnmounted(() => {
    window.removeEventListener('mousemove', onDrag);
    window.removeEventListener('mouseup', stopDrag);
    window.removeEventListener('touchmove', onDrag);
    window.removeEventListener('touchend', stopDrag);
});
</script>

<style scoped>
.image-preview-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.85);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    animation: fadeIn 0.3s ease;
    backdrop-filter: blur(3px);
}

.image-preview-container {
    position: relative;
    max-width: 90%;
    max-height: 90%;
    animation: zoomIn 0.3s ease;
}

.preview-image {
    max-width: 100%;
    max-height: 90vh;
    border-radius: 4px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
    animation: fadeInScale 0.4s ease-out;
    object-fit: contain;
    background-color: rgba(255, 255, 255, 0.05);
    padding: 10px;
    transition: transform 0.1s ease-out;
    transform-origin: center;
    cursor: grab;
}

.preview-image:active {
    cursor: grabbing;
}

.image-preview-controls {
    position: absolute;
    bottom: 20px;
    right: 20px;
    display: flex;
    gap: 10px;
}

.zoom-button {
    width: 40px;
    height: 40px;
    background-color: rgba(255, 255, 255, 0.8);
    border: none;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    font-size: 18px;
    color: #333;
    transition: background-color 0.3s ease, transform 0.2s ease;
}

.zoom-button:hover {
    background-color: white;
    transform: translateY(-2px);
}

.image-preview-close {
    position: absolute;
    top: -20px;
    right: -20px;
    width: 40px;
    height: 40px;
    background-color: #fff;
    border-radius: 50%;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    color: #333;
    font-size: 20px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    transition: transform 0.2s ease, background-color 0.3s ease;
    z-index: 10;
}

.image-preview-close:hover {
    transform: rotate(90deg);
    background-color: #f5f5f5;
}

.image-preview-title {
    position: absolute;
    top: -40px;
    left: 0;
    right: 0;
    text-align: center;
    color: #ffffff;
    font-size: 18px;
    font-weight: bold;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}

.image-preview-hint {
    position: absolute;
    bottom: -30px;
    left: 0;
    width: 100%;
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
    font-size: 14px;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes zoomIn {
    from {
        transform: scale(0.95);
        opacity: 0;
    }
    to {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes fadeInScale {
    from {
        opacity: 0.5;
        transform: scale(0.98);
    }
    to {
        opacity: 1;
        transform: scale(1);
    }
}

@media (max-width: 768px) {
    .image-preview-close {
        top: 10px;
        right: 10px;
    }

    .image-preview-title {
        top: 10px;
        font-size: 16px;
    }

    .image-preview-hint {
        font-size: 12px;
    }
}
</style>
