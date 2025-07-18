import { ref, readonly, onUnmounted, type Ref } from 'vue'
import type { TocProvider, TocItem } from '@/types/toc'
import { EmptyTocProvider } from '@/types/toc'

// 全局 TOC provider 状态
const currentProvider = ref<TocProvider | null>(null)
const tocItems = ref<TocItem[]>([])
const isLoading = ref(false)

/**
 * TOC Provider 组合式函数
 * 用于管理当前活跃的 TOC 提供者和数据
 */
export function useTocProvider() {
  // 当前组件的取消订阅函数
  let unsubscribe: (() => void) | null = null

  /**
   * 注册新的 TOC 提供者
   * @param provider TOC 提供者实例
   */
  const registerProvider = (provider: TocProvider | null) => {
    // 清理旧的 provider
    if (currentProvider.value) {
      currentProvider.value.destroy()
    }
    
    // 清理旧的订阅
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }

    if (!provider) {
      // 如果传入 null，使用空 provider
      currentProvider.value = new EmptyTocProvider()
    } else {
      currentProvider.value = provider
    }

    // 设置加载状态
    isLoading.value = true

    // 订阅新 provider 的 TOC 更新
    unsubscribe = currentProvider.value.onTocUpdate((items) => {
      tocItems.value = items
      isLoading.value = false
    })
  }

  /**
   * 导航到指定的 TOC 项目
   * @param id TOC 项目 ID
   */
  const navigateToItem = (id: string) => {
    if (!currentProvider.value) {
      console.warn('No TOC provider is currently registered')
      return
    }

    try {
      currentProvider.value.navigateToItem(id)
    } catch (error) {
      console.error('Failed to navigate to TOC item:', error)
    }
  }

  /**
   * 获取当前的 TOC 项目列表
   */
  const getCurrentTocItems = (): TocItem[] => {
    return currentProvider.value?.getTocItems() || []
  }

  /**
   * 检查是否有活跃的 TOC 提供者
   */
  const hasActiveProvider = (): boolean => {
    return currentProvider.value !== null && !(currentProvider.value instanceof EmptyTocProvider)
  }

  /**
   * 获取当前提供者的类型信息
   */
  const getProviderInfo = () => {
    if (!currentProvider.value) {
      return { type: 'none', name: 'No Provider' }
    }
    
    if (currentProvider.value instanceof EmptyTocProvider) {
      return { type: 'empty', name: 'Empty Provider' }
    }
    
    return { 
      type: currentProvider.value.constructor.name.toLowerCase().replace('tocprovider', ''),
      name: currentProvider.value.constructor.name 
    }
  }

  /**
   * 手动刷新 TOC 数据
   */
  const refreshToc = () => {
    if (currentProvider.value) {
      const items = currentProvider.value.getTocItems()
      tocItems.value = items
    }
  }

  /**
   * 清理当前 provider
   */
  const clearProvider = () => {
    registerProvider(null)
  }

  // 组件卸载时自动清理
  onUnmounted(() => {
    if (unsubscribe) {
      unsubscribe()
    }
  })

  return {
    // 只读状态
    tocItems: readonly(tocItems),
    isLoading: readonly(isLoading),
    
    // 方法
    registerProvider,
    navigateToItem,
    getCurrentTocItems,
    hasActiveProvider,
    getProviderInfo,
    refreshToc,
    clearProvider,
    
    // 只读计算属性
    isEmpty: readonly(ref(() => tocItems.value.length === 0)),
    itemCount: readonly(ref(() => tocItems.value.length))
  }
}

/**
 * 全局 TOC 状态（只读）
 * 可以在任何组件中使用，用于访问当前的 TOC 状态
 */
export function useGlobalTocState() {
  return {
    tocItems: readonly(tocItems),
    isLoading: readonly(isLoading),
    hasItems: readonly(ref(() => tocItems.value.length > 0))
  }
}