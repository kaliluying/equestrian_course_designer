import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { CollaboratorInfo, CollaborationSession, ChatMessage } from '@/utils/websocket'

export const useCollaborationStore = defineStore('collaboration', () => {
  // 协作会话状态
  const currentSession = ref<CollaborationSession | null>(null)

  // 协作者列表
  const collaborators = ref<CollaboratorInfo[]>([])

  // 聊天消息历史
  const chatHistory = ref<ChatMessage[]>([])

  // 是否正在协作中
  const isCollaborating = ref(false)

  // 连接状态（0: 连接中, 1: 已连接, 2: 断开连接中, 3: 已断开, 4: 错误）
  const connectionStatus = ref(3) // 默认为已断开

  // 计算属性：在线协作者数量
  const onlineCollaboratorsCount = computed(() => collaborators.value.length)

  // 设置当前会话
  const setCurrentSession = (session: CollaborationSession | null) => {
    currentSession.value = session

    if (session) {
      collaborators.value = session.collaborators
      isCollaborating.value = true
    } else {
      collaborators.value = []
      isCollaborating.value = false
    }
  }

  // 更新协作者列表
  const updateCollaborators = (newCollaborators: CollaboratorInfo[]) => {
    collaborators.value = newCollaborators
  }

  // 添加协作者
  const addCollaborator = (collaborator: CollaboratorInfo) => {
    // 检查是否已存在
    const index = collaborators.value.findIndex((c) => c.id === collaborator.id)

    if (index === -1) {
      collaborators.value.push(collaborator)
    } else {
      // 更新现有协作者信息
      collaborators.value[index] = { ...collaborators.value[index], ...collaborator }
    }
  }

  // 删除协作者
  const removeCollaborator = (collaboratorId: string) => {
    collaborators.value = collaborators.value.filter((c) => c.id !== collaboratorId)
  }

  // 添加聊天消息
  const addChatMessage = (message: ChatMessage) => {
    chatHistory.value.push(message)
  }

  // 清空聊天历史
  const clearChatHistory = () => {
    chatHistory.value = []
  }

  // 设置连接状态
  const setConnectionStatus = (status: number) => {
    connectionStatus.value = status
  }

  // 设置协作状态
  const setCollaboratingState = (state: boolean) => {
    isCollaborating.value = state

    if (!state) {
      // 重置协作相关状态
      currentSession.value = null
      collaborators.value = []
    }
  }

  return {
    currentSession,
    collaborators,
    chatHistory,
    isCollaborating,
    connectionStatus,
    onlineCollaboratorsCount,
    setCurrentSession,
    updateCollaborators,
    addCollaborator,
    removeCollaborator,
    addChatMessage,
    clearChatHistory,
    setConnectionStatus,
    setCollaboratingState,
  }
})
