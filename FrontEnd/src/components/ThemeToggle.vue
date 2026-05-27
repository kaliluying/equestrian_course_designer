<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <el-button class="theme-toggle-btn" :class="{ dark: themeStore.isDark }">
      <el-icon :size="18">
        <component :is="currentIcon" />
      </el-icon>
      <span class="theme-text">{{ currentThemeText }}</span>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="light" :class="{ active: themeStore.mode === 'light' }">
          <el-icon><Sunny /></el-icon>
          <span>浅色模式</span>
        </el-dropdown-item>
        <el-dropdown-item command="dark" :class="{ active: themeStore.mode === 'dark' }">
          <el-icon><Moon /></el-icon>
          <span>深色模式</span>
        </el-dropdown-item>
        <el-dropdown-item command="auto" :class="{ active: themeStore.mode === 'auto' }">
          <el-icon><Monitor /></el-icon>
          <span>跟随系统</span>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Sunny, Moon, Monitor } from '@element-plus/icons-vue'
import { useThemeStore, type ThemeMode } from '@/stores/theme'

const themeStore = useThemeStore()

const currentIcon = computed(() => {
  switch (themeStore.mode) {
    case 'light':
      return Sunny
    case 'dark':
      return Moon
    case 'auto':
      return Monitor
    default:
      return Sunny
  }
})

const currentThemeText = computed(() => {
  switch (themeStore.mode) {
    case 'light':
      return '浅色'
    case 'dark':
      return '深色'
    case 'auto':
      return '自动'
    default:
      return '主题'
  }
})

const handleCommand = (command: ThemeMode) => {
  themeStore.setMode(command)
}
</script>

<style scoped lang="scss">
.theme-toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background-color: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
  font-weight: 600;
  transition: all 0.3s ease;

  &:hover {
    background-color: #f1f5f9;
    color: var(--primary-color);
    transform: translateY(-1px);
  }

  &.dark {
    background-color: #334155;
    border-color: #475569;
    color: #f1f5f9;

    &:hover {
      background-color: #475569;
      border-color: #64748b;
    }
  }

  .el-icon {
    flex-shrink: 0;
  }

  .theme-text {
    font-size: 14px;
  }
}

:deep(.el-dropdown-menu__item) {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;

  &.active {
    color: var(--el-color-primary);
    background-color: var(--el-color-primary-light-9);
  }

  .el-icon {
    font-size: 16px;
  }
}
</style>
