<template>
    <div class="image-preview-overlay" v-if="visible" @click="close">
        <div class="image-preview-container" @click.stop>
            <img :src="imageUrl" :alt="imageAlt" class="preview-image" />
            <div class="image-preview-close" @click="close">
                <el-icon>
                    <Close />
                </el-icon>
            </div>
            <div class="image-preview-title" v-if="title">{{ title }}</div>
            <div class="image-preview-hint">点击空白区域关闭预览</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { watchEffect } from 'vue';
import { Close } from '@element-plus/icons-vue';

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

const close = () => {
    emit('update:visible', false);
    emit('close');
};

// 当预览打开时禁用页面滚动
watchEffect(() => {
    if (props.visible) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
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
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
    transition: all 0.3s;
    z-index: 10;
}

.image-preview-close:hover {
    transform: rotate(90deg);
    background-color: #f56c6c;
    color: #fff;
}

.image-preview-title {
    position: absolute;
    bottom: -40px;
    left: 0;
    width: 100%;
    text-align: center;
    color: #fff;
    font-size: 18px;
    font-weight: 500;
    padding: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.image-preview-hint {
    position: absolute;
    bottom: -70px;
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
        transform: scale(0.5);
        opacity: 0;
    }

    to {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes fadeInScale {
    0% {
        opacity: 0;
        transform: scale(0.9);
    }

    100% {
        opacity: 1;
        transform: scale(1);
    }
}
</style>
