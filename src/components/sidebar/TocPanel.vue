<template>
  <div class="h-full flex flex-col">
    <!-- TOC Header -->
    <div class="sidebar-header h-9 flex-shrink-0 select-none">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-text-primary uppercase tracking-wide">
          Table of Contents
        </span>
      </div>
      
      <!-- Actions -->
      <div class="flex items-center gap-1">
        <button
          @click="toggleNumbering"
          class="toolbar-button"
          :class="{ 'toolbar-button-primary': showNumbering }"
          title="Toggle Numbering"
        >
          <IconNumbers class="icon-sm" />
        </button>
        <button
          @click="toggleExpandAll"
          class="toolbar-button"
          title="Toggle Expand/Collapse All"
        >
          <IconChevronDown class="icon-sm" />
        </button>
        <button
          @click="scrollToTop"
          class="toolbar-button"
          title="Scroll to Top"
        >
          <IconArrowUp class="icon-sm" />
        </button>
      </div>
   </div>
    
    <!-- TOC Content -->
    <div class="flex-1 overflow-hidden">
      <!-- Loading State -->
      <div v-if="isLoading" class="p-4 text-center text-text-primary">
        <div class="animate-spin w-6 h-6 border-2 border-gray-300 border-t-border-primary rounded-full mx-auto mb-2"></div>
        <p class="text-sm">Loading table of contents...</p>
      </div>
      
      <!-- TOC Tree -->
      <Tree
        v-else-if="hasItems"
        ref="treeRef"
        :nodes="treeNodes"
        :callbacks="treeCallbacks"
        @node-click="handleNodeClick"
      />
      
      <!-- Empty State -->
      <div v-else class="p-4 text-center select-none">
        <IconList class="w-12 h-12 mx-auto mb-2 text-text-primary" />
        <p class="text-sm font-medium text-text-secondary">{{ emptyStateMessage.title }}</p>
        <p class="text-xs text-text-tertiary mt-1 leading-relaxed">
          {{ emptyStateMessage.subtitle }}
        </p>
        <div v-if="emptyStateMessage.showProvider" class="mt-3 pt-2 border-t text-text-tertiary">
          <p class="text-xs text-gray-300">
            Provider: {{ providerInfo.name }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, toRefs, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import Tree from '@/components/common/tree/Tree.vue'
import type { TreeNode, TreeCallbacks } from '@/components/common/tree/tree'
import type { TocItem } from '@/types/toc'
import {
  IconList,
  IconArrowUp,
  IconNumbers,
  IconChevronDown,
  IconChevronRight
} from '@tabler/icons-vue'

// 使用app store获取活跃标签页
const appStore = useAppStore()

// 组件状态
const showNumbering = ref(true)
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
const tocItems = computed(() => tocProvider.value?.getTocItems() || [])
const isLoading = computed(() => tocProvider.value?.isLoading || false)
const hasItems = computed(() => tocItems.value.length > 0)

// 生成层级序号的函数
const generateHierarchicalNumbers = (nodes: TreeNode[], parentNumber = ''): void => {
  let counter = 1
  
  nodes.forEach(node => {
    const currentNumber = parentNumber ? `${parentNumber}.${counter}` : `${counter}`
    node.data.hierarchicalNumber = currentNumber
    
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
      node.label = `${node.data.hierarchicalNumber} ${node.data.originalTitle}`
    } else {
      node.label = node.data.originalTitle
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
  
  // 首先创建所有节点
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
      isExpanded: item.level <= 2, // 展开前两级标题
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
    while (stack.length > 0 && stack[stack.length - 1].data.tocItem.level >= item.level) {
      stack.pop()
    }
    
    if (stack.length === 0) {
      // 顶级节点
      nodes.push(node)
    } else {
      // 子节点
      const parent = stack[stack.length - 1]
      parent.children!.push(node)
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
  const tocItem = node.data.tocItem as TocItem
  if (tocProvider.value) {
    tocProvider.value.navigateToItem(tocItem.id)
  }
}

// 按钮功能
const toggleNumbering = () => {
  showNumbering.value = !showNumbering.value
}

const toggleExpandAll = () => {
  if (treeRef.value) {
    // 检查是否所有节点都已展开
    const allExpanded = state.treeNodes.every(node => isNodeFullyExpanded(node))
    
    if (allExpanded) {
      treeRef.value.collapseAll()
    } else {
      treeRef.value.expandAll()
    }
  }
}

// 递归检查节点是否完全展开
const isNodeFullyExpanded = (node: TreeNode): boolean => {
  if (!node.children || node.children.length === 0) {
    return true
  }
  
  if (!node.isExpanded) {
    return false
  }
  
  return node.children.every(child => isNodeFullyExpanded(child))
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
    const node: TreeNode = treeNodes.value[0]
    const tocItem = node.data.tocItem as TocItem
    if (tocProvider.value) {
      tocProvider.value.navigateToItem(tocItem.id)
    }
  }
}
</script>