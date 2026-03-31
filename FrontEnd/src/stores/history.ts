import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useHistoryStore = defineStore('history', () => {
  const stack = ref<string[]>([])
  const currentIndex = ref(-1)

  const canUndo = computed(() => currentIndex.value > 0)
  const canRedo = computed(() => currentIndex.value < stack.value.length - 1)

  /**
   * 提交一次新的历史记录
   * @param snapshot 当前状态的 JSON 字符串快照
   */
  function commit(snapshot: string) {
    // 如果我们在撤销后提交了新状态，抛弃当前指针之后的所有撤销历史
    if (currentIndex.value < stack.value.length - 1) {
      stack.value = stack.value.slice(0, currentIndex.value + 1)
    }
    
    // 如果快照和当前处于同一状态，则不重复压栈
    if (currentIndex.value >= 0 && stack.value[currentIndex.value] === snapshot) {
      return
    }

    stack.value.push(snapshot)
    currentIndex.value++

    // 限制历史记录最多 50 步，防止内存溢出
    if (stack.value.length > 50) {
      stack.value.shift()
      currentIndex.value--
    }
  }

  /**
   * 撤销并返回上一个快照
   */
  function undo(): string | null {
    if (canUndo.value) {
      currentIndex.value--
      return stack.value[currentIndex.value]
    }
    return null
  }

  /**
   * 重做并返回下一个快照
   */
  function redo(): string | null {
    if (canRedo.value) {
      currentIndex.value++
      return stack.value[currentIndex.value]
    }
    return null
  }

  /**
   * 初始化/清空历史（在加载新路线时调用）
   */
  function clear() {
    stack.value = []
    currentIndex.value = -1
  }

  return {
    stack,
    currentIndex,
    canUndo,
    canRedo,
    commit,
    undo,
    redo,
    clear
  }
})
