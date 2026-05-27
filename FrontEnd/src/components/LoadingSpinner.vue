<template>
  <transition name="fade">
    <div v-if="visible" class="loading-spinner" :class="{ fullscreen, overlay }">
      <div class="spinner-container" :style="containerStyle">
        <div class="spinner" :style="spinnerStyle">
          <div class="spinner-circle"></div>
        </div>
        <p v-if="text" class="loading-text">{{ text }}</p>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  visible?: boolean
  fullscreen?: boolean
  overlay?: boolean
  text?: string
  size?: 'small' | 'medium' | 'large'
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  visible: true,
  fullscreen: false,
  overlay: true,
  text: '',
  size: 'medium',
  color: '#3a6af8'
})

const sizeMap = {
  small: 32,
  medium: 48,
  large: 64
}

const spinnerSize = computed(() => sizeMap[props.size])

const containerStyle = computed(() => ({
  '--spinner-size': `${spinnerSize.value}px`
}))

const spinnerStyle = computed(() => ({
  '--spinner-color': props.color
}))
</script>

<style scoped lang="scss">
.loading-spinner {
  display: flex;
  align-items: center;
  justify-content: center;
  
  &.fullscreen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9999;
  }
  
  &.overlay {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }
  
  &:not(.fullscreen) {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 100;
  }
}

.spinner-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.spinner {
  width: var(--spinner-size);
  height: var(--spinner-size);
  position: relative;
}

.spinner-circle {
  width: 100%;
  height: 100%;
  border: 3px solid rgba(58, 106, 248, 0.1);
  border-top-color: var(--spinner-color);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  margin: 0;
  font-size: 14px;
  color: #606266;
  font-weight: 500;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
