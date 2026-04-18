<template>
  <div class="h-full flex flex-col">
    <!-- TOC Header -->
    <div class="iw-sidebar-section border-b border-base-300">
      <div class="flex items-center gap-2">
        <span class="iw-sidebar-section-header">
          Outline
        </span>
      </div>
      
      <!-- Actions -->
      <div class="flex shrink-0 items-center gap-1">
        <button
          @click="toggleNumbering"
          class="iw-toolbar-btn btn-xs"
          :class="{ 'iw-toolbar-btn-active': showNumbering }"
          title="Toggle Numbering"
        >
          <IconNumbers class="icon-xs" />
        </button>

        <!-- Separator -->
        <div class="flex h-9 w-4 items-center justify-center">
          <div class="h-1/2 w-px bg-base-300"></div>
        </div>

        <!-- Heading Level Filter Buttons -->
        <div class="join">
          <button
            @click="setExpandLevel(2)"
            class="iw-toolbar-btn btn-xs join-item"
            :class="{ 'iw-toolbar-btn-active': expandLevel === 2 }"
            title="Collapse to H2 level"
          >
            <p class="icon-xs text-xs">H2</p>
          </button>
          <button
            @click="setExpandLevel(3)"
            class="iw-toolbar-btn btn-xs join-item"
            :class="{ 'iw-toolbar-btn-active': expandLevel === 3 }"
            title="Collapse to H3 level"
          >
            <p class="icon-xs text-xs">H3</p>
          </button>
          <button
            @click="setExpandLevel(4)"
            class="iw-toolbar-btn btn-xs join-item"
            :class="{ 'iw-toolbar-btn-active': expandLevel === 4 }"
            title="Collapse to H4 level"
          >
            <p class="icon-xs text-xs">H4</p>
          </button>
          <button
            @click="setExpandLevel(6)"
            class="iw-toolbar-btn btn-xs join-item"
            :class="{ 'iw-toolbar-btn-active': expandLevel === 6 }"
            title="Expand all levels"
          >
            <p class="icon-xs text-xs">All</p>
          </button>
        </div>

        <!-- Separator -->
        <div class="join-item flex h-9 w-4 items-center justify-center">
          <div class="h-1/2 w-px bg-base-300"></div>
        </div>

        <button
          @click="scrollToTop"
          class="iw-toolbar-btn btn-xs"
          title="Scroll to Top"
        >
          <IconArrowUp class="icon-xs" />
        </button>
      </div>
   </div>
    
    <!-- TOC Content -->
    <div class="flex-1 overflow-hidden">
      <!-- Loading State -->
      <div v-if="isLoading" class="p-4 text-center text-base-content">
        <span class="loading loading-spinner loading-md mb-2"></span>
        <p class="text-sm">Loading table of contents...</p>
      </div>
      
      <!-- TOC Tree -->
      <Tree
        v-else-if="hasItems"
        ref="treeRef"
        class="toc-tree"
        :nodes="treeNodes"
        :callbacks="treeCallbacks"
        @node-click="handleNodeClick"
      />
      
      <!-- Empty State -->
      <div v-else class="p-4 text-center select-none">
        <IconList class="mx-auto mb-2 h-12 w-12 text-base-content/60" />
        <p class="text-sm font-medium text-base-content/75">{{ emptyStateMessage.title }}</p>
        <p class="mt-1 text-xs leading-relaxed text-base-content/55">
          {{ emptyStateMessage.subtitle }}
        </p>
        <div v-if="emptyStateMessage.showProvider" class="mt-3 border-t border-base-300 pt-2 text-base-content/55">
          <p class="text-xs">
            Provider: {{ providerInfo.name }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, toRefs, watch, onBeforeUnmount } from 'vue'
import { useAppStore } from '@/stores/app'
import Tree from '@/components/common/tree/Tree.vue'
import type { TreeNode, TreeCallbacks } from '@/components/common/tree'
import type { TocItem, UnsubscribeFn } from '@/types/toc'
import {
  IconList,
  IconArrowUp,
  IconNumbers,
  IconChevronDown,
  IconChevronRight
} from '@tabler/icons-vue'

interface NodeData{
  tocItem: TocItem, 
  itemIndex: number,
  hierarchicalNumber: string,
  originalTitle: string
}

// 使用app store获取活跃标签页
const appStore = useAppStore()

// 组件状态
const showNumbering = ref(true)
const expandLevel = ref(6) // 默认展开所有级别
const treeRef = ref<InstanceType<typeof Tree>>()

// 使用reactive管理状态
const state = reactive({
  treeNodes: [] as TreeNode[]
})

// 使用toRefs让treeNodes可以在模板中使用
const { treeNodes } = toRefs(state)

// 计算属性 - 获取当前活跃tab的TOC相关数据
const activeTab = computed(() => appStore.activeTab)
const tocProvider = computed(() => activeTab.value?.tocProvider)
const tocItemsState = ref<TocItem[]>([])
const isLoadingState = ref(false)
let unsubscribeTocUpdate: UnsubscribeFn | null = null

const normalizeTocItems = (items: TocItem[] | undefined | null): TocItem[] => {
  return Array.isArray(items) ? items : []
}

const tocItems = computed(() => tocItemsState.value)
const isLoading = computed(() => isLoadingState.value)
const hasItems = computed(() => tocItems.value.length > 0)

watch(tocProvider, provider => {
  unsubscribeTocUpdate?.()
  unsubscribeTocUpdate = null

  if (!provider) {
    tocItemsState.value = []
    isLoadingState.value = false
    return
  }

  tocItemsState.value = normalizeTocItems(provider.getTocItems())
  isLoadingState.value = provider.isLoading
  unsubscribeTocUpdate = provider.onTocUpdate(items => {
    tocItemsState.value = normalizeTocItems(items)
    isLoadingState.value = provider.isLoading
  })
}, { immediate: true })

onBeforeUnmount(() => {
  unsubscribeTocUpdate?.()
  unsubscribeTocUpdate = null
})

// 生成层级序号的函数
const generateHierarchicalNumbers = (nodes: TreeNode[], parentNumber = ''): void => {
  let counter = 1
  let currentNumber: string = ''

  nodes.forEach(node => {
    currentNumber = parentNumber !== '' ? `${parentNumber}.${counter}` : `${counter}`
    if (node.data) (node.data as NodeData).hierarchicalNumber = currentNumber
    
    if (node.children && node.children.length > 0) {
      generateHierarchicalNumbers(node.children, currentNumber)
    }
    
    counter++
  })
}

// 更新节点标题的函数
const updateNodeLabels = (nodes: TreeNode[]): void => {
  if (!nodes) return
  
  nodes.forEach(node => {
    if (showNumbering.value) {
      node.label = `${(node.data as NodeData).hierarchicalNumber} ${(node.data as NodeData).originalTitle}`
    } else {
      node.label = (node.data as NodeData).originalTitle
    }
    
    if (node.children && node.children.length > 0) {
      updateNodeLabels(node.children)
    }
  })
}

// 生成TreeNode的函数
const generateTreeNodes = (): TreeNode[] => {
  const nodes: TreeNode[] = []
  const nodeMap = new Map<string, TreeNode>()
  
  // 创建所有节点，保持所有内容
  if (!tocItems.value) return nodes
  
  tocItems.value.forEach((item, index) => {
    const node: TreeNode = reactive({
      id: item.id,
      label: item.title, // 先设置原始标题
      type: 'toc-item',
      data: { 
        tocItem: item, 
        itemIndex: item.metadata?.itemIndex || (index + 1),
        hierarchicalNumber: '',
        originalTitle: item.title // 保存原始标题
      },
      isExpanded: item.level < expandLevel.value, // 只展开小于expandLevel的级别
      isSelected: item.isActive === true,
      isVisible: true,
      isEnabled: true,
      children: []
    })
    nodeMap.set(item.id, node)
  })
  
  // 根据level构建层级结构
  const sortedItems = [...tocItems.value].sort((a, b) => {
    // 按照在原数组中的顺序排序
    const aIndex = tocItems.value.findIndex(item => item.id === a.id)
    const bIndex = tocItems.value.findIndex(item => item.id === b.id)
    return aIndex - bIndex
  })
  
  const stack: TreeNode[] = []
  
  sortedItems.forEach(item => {
    const node = nodeMap.get(item.id)!
    
    // 找到合适的父节点
    while (stack.length > 0 && (stack[stack.length - 1]!.data as NodeData).tocItem.level >= item.level) {
      stack.pop()
    }
    
    if (stack.length === 0) {
      // 顶级节点
      nodes.push(node)
    } else {
      // 子节点
      const parent = stack[stack.length - 1]
      parent!.children!.push(node)
      node.parent = parent
    }
    
    stack.push(node)
  })
  
  // 生成层级序号
  generateHierarchicalNumbers(nodes)
  
  // 根据showNumbering状态更新标题
  updateNodeLabels(nodes)
  
  return nodes
}

// 监听tocItems变化，重新生成treeNodes
watch(tocItems, () => {
  state.treeNodes = generateTreeNodes()
}, { immediate: true })

// 监听showNumbering变化，更新节点标题
watch(showNumbering, () => {
  updateNodeLabels(state.treeNodes)
})

// 监听expandLevel变化，重新生成treeNodes并收起超出级别的项
watch(expandLevel, () => {
  state.treeNodes = generateTreeNodes()
  // 如果有tree引用，立即应用收起逻辑
  if (treeRef.value) {
    collapseToLevel(expandLevel.value)
  }
})

// Tree组件的回调配置
const treeCallbacks: TreeCallbacks = {
  // 获取展开图标
  getExpandIcon: () => IconChevronRight,
  
  // 获取折叠图标
  getCollapseIcon: () => IconChevronDown,
  
  // 获取右侧内容 - 暂时为空
  getRightContent: () => {
    return null
  },
}

// 处理节点点击
const handleNodeClick = (node: TreeNode) => {
  const tocItem = (node.data as NodeData).tocItem as TocItem
  if (tocProvider.value) {
    tocProvider.value.navigateToItem(tocItem.id)
  }
}

// 按钮功能
const toggleNumbering = () => {
  showNumbering.value = !showNumbering.value
}

const setExpandLevel = (level: number) => {
  expandLevel.value = level
}

// 收起到指定级别的函数
const collapseToLevel = (level: number) => {
  if (!treeRef.value) return
  
  const collapseNode = (node: TreeNode) => {
    // 如果当前节点的级别大于等于指定级别，收起它
    if ((node.data as NodeData).tocItem.level >= level) {
      node.isExpanded = false
    }
    
    // 递归处理子节点
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => collapseNode(child))
    }
  }
  
  // 对所有根节点应用收起逻辑
  state.treeNodes.forEach(node => collapseNode(node))
}

// 计算属性 - 提供者信息和空状态消息
const providerInfo = computed(() => {
  if (!tocProvider.value) {
    return { type: 'none', name: 'No Provider' }
  }
  
  return { 
    type: tocProvider.value.constructor.name.toLowerCase().replace('tocprovider', ''),
    name: tocProvider.value.constructor.name 
  }
})

// 不同状态下的空状态消息
const emptyStateMessage = computed(() => {
  const info = providerInfo.value
  if (info.type === 'none') {
    return {
      title: 'No document open',
      subtitle: 'Open a Markdown document to see its outline',
      showProvider: false
    }
  } else if (info.type === 'markdown') {
    return {
      title: 'No headings found',
      subtitle: 'Add headings (# ## ###) to your document to see the outline',
      showProvider: true
    }
  } else {
    return {
      title: 'No table of contents',
      subtitle: 'This document type may not support outline generation',
      showProvider: true
    }
  }
})

function scrollToTop() {
  if (treeNodes.value.length > 0) {
    const node = treeNodes.value[0]
    if (node) {
      const tocItem = (node.data as NodeData).tocItem as TocItem
      if (tocProvider.value) {
        tocProvider.value.navigateToItem(tocItem.id)
        treeRef.value?.focusNode(node)
      }
    }
  }
}
</script>

<style scoped>

.toc-tree {
  --tree-font-size: 12px;
  --tree-font-weight: 500;
  --tree-text-color: var(--color-base-content);
  --tree-background-color: var(--color-base-100);
  --tree-hover-color: var(--color-base-200);

  --tree-selected-background: var(--color-primary);
  --tree-selected-color: var(--color-primary-content);

  --tree-focus-outline: 1px solid var(--color-primary);
  --tree-focus-outline-offset: -2px;

  --tree-selected-focused-background: var(--color-primary);
  --tree-selected-focused-color: var(--color-primary-content);

  --tree-input-background: transparent;
  --tree-input-border: 1px solid var(--color-primary);

  --tree-badge-background: var(--color-base-100);
  --tree-badge-color: var(--color-base-content);
  --tree-badge-height: 20px;
  --tree-badge-border-radius: var(--radius-selector);

  --tree-drop-border-color: transparent;
  --tree-drop-background: var(--color-base-300);
}

</style>
