<template>
  <div class="collaborator-cursors">
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
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'
import type { CollaboratorInfo } from '@/utils/websocket'

defineProps<{
  collaborators: CollaboratorInfo[]
}>()

const userStore = useUserStore()
const currentUserId = computed(() => userStore.currentUser?.id || '')
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
</style>
