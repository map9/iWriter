<template>
  <div ref="parentContainer" class="h-full flex flex-col">
    <!-- TOC Header -->
    <div class="sidebar-header h-9">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-gray-700 uppercase tracking-wide">
          Table of Contents
        </span>
      </div>
      
      <!-- Actions -->
      <div class="flex items-center gap-1">
        <button
          @click="scrollToTop"
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          title="Scroll to Top"
        >
          <IconArrowUp class="w-4 h-4 text-gray-600" />
        </button>
      </div>
    </div>
    
    <!-- TOC Content -->
    <div class="flex-1 overflow-y-auto overflow-x-visible table-of-contents">
      <!-- Loading State -->
      <div v-if="isLoading" class="p-4 text-center text-gray-500">
        <div class="animate-spin w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full mx-auto mb-2"></div>
        <p class="text-sm">Loading outline...</p>
      </div>
      
      <!-- TOC Items -->
      <template v-else-if="hasItems">
        <div
          v-for="(item, index) in tocItems"
          :key="item.id"
          :class="{
            'is-active': item.isActive && !item.isScrolledOver,
            'is-scrolled-over': item.isScrolledOver,
          }"
          :style="{ '--level': item.level }"
          class="toc-item"
        >
          <a 
            :href="'#' + item.id" 
            @click.prevent="onItemClick($event, item.id)"
            :data-item-index="item.metadata?.itemIndex || (index + 1)"
            :title="item.title"
            class="toc-link text-gray-700 flex gap-1 no-underline px-2 py-1.5 rounded overflow-x-hidden relative"
            @mouseenter="checkOverflow"
            @mouseleave="clearOverflow"
          >
            <span class="toc-text whitespace-nowrap transition-transform duration-1000 ease-in-out overflow-visible flex-1 min-w-0" :ref="(el) => setTextRef(el, item.id)">{{ item.title }}</span>
          </a>
        </div>
      </template>
      
      <!-- Empty State -->
      <div v-else class="empty-state p-4 text-center text-gray-500">
        <IconList :size="48" class="mx-auto mb-2 text-gray-400" />
        <p class="text-sm font-medium text-gray-600">{{ emptyStateMessage.title }}</p>
        <p class="text-xs text-gray-400 mt-1 leading-relaxed">
          {{ emptyStateMessage.subtitle }}
        </p>
        <div v-if="emptyStateMessage.showProvider" class="mt-3 pt-2 border-t border-gray-100">
          <p class="text-xs text-gray-300">
            Provider: {{ providerInfo.name }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGlobalTocState, useTocProvider } from '@/composables/useTocProvider'
import {
  IconList,
  IconArrowUp
} from '@tabler/icons-vue'

// 使用全局 TOC 状态
const { tocItems, isLoading, hasItems } = useGlobalTocState()
const { navigateToItem, getProviderInfo } = useTocProvider()

// 父容器ref
const parentContainer = ref<HTMLElement>()

// 文本溢出检测
const textRefs = ref<Map<string, HTMLElement>>(new Map())
const overflowingItems = ref<Set<string>>(new Set())

const setTextRef = (el: HTMLElement | null, id: string) => {
  if (el) {
    textRefs.value.set(id, el)
  }
}

const checkOverflow = (event: MouseEvent) => {
  const link = event.currentTarget as HTMLElement
  const textElement = link.querySelector('.toc-text') as HTMLElement
  
  if (textElement && parentContainer.value) {
    // 重置之前的样式
    textElement.style.removeProperty('--scroll-distance')
    link.classList.remove('text-overflowing')
    
    // 创建临时元素测量完整文本宽度
    const tempElement = document.createElement('span')
    tempElement.style.visibility = 'hidden'
    tempElement.style.position = 'absolute'
    tempElement.style.whiteSpace = 'nowrap'
    tempElement.style.fontSize = window.getComputedStyle(textElement).fontSize
    tempElement.style.fontFamily = window.getComputedStyle(textElement).fontFamily
    tempElement.style.fontWeight = window.getComputedStyle(textElement).fontWeight
    
    // 包含序号的完整文本
    const itemIndex = link.getAttribute('data-item-index') || ''
    const fullText = itemIndex ? `${itemIndex}. ${textElement.textContent}` : textElement.textContent
    tempElement.textContent = fullText
    
    document.body.appendChild(tempElement)
    const fullTextWidth = tempElement.offsetWidth
    document.body.removeChild(tempElement)
    
    // 计算item和parent的边界
    const itemRect = link.getBoundingClientRect()
    const parentRect = parentContainer.value.getBoundingClientRect()
    
    // 计算如果文本完全显示时item的右边界位置
    const linkStyle = window.getComputedStyle(link)
    const paddingLeft = parseFloat(linkStyle.paddingLeft)
    const paddingRight = parseFloat(linkStyle.paddingRight)
    const potentialItemRight = itemRect.left + paddingLeft + fullTextWidth + paddingRight
    
    // 计算偏移量
    const offset = potentialItemRight - parentRect.right
    
    // 检查是否需要滚动
    if (offset > 0) {
      link.classList.add('text-overflowing')
      // 设置滚动距离
      textElement.style.setProperty('--scroll-distance', `-${offset}px`)
    }
  }
}

const clearOverflow = (event: MouseEvent) => {
  const link = event.currentTarget as HTMLElement
  link.classList.remove('text-overflowing')
}

// 计算属性
const providerInfo = computed(() => getProviderInfo())

// 不同状态下的空状态消息
const emptyStateMessage = computed(() => {
  const info = providerInfo.value
  if (info.type === 'empty' || info.type === 'none') {
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

function onItemClick(event: Event, id: string) {
  event.preventDefault()
  navigateToItem(id)
}

function scrollToTop() {
  // 滚动到页面顶部
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>

<style scoped>
.table-of-contents {
  @apply flex flex-col text-sm gap-1 p-2;
  text-decoration: none;
}

.toc-item {
  @apply rounded transition-all duration-200 ease-out;
  padding-left: calc(0.875rem * (var(--level) - 1));
  transition-timing-function: cubic-bezier(0.65, 0.05, 0.36, 1);
}

.toc-item:hover {
  @apply bg-gray-100;
}

/* Custom styles for TOC text animation */
.toc-text {
  transform: translateX(0);
  line-height: 1.4;
}

.toc-link.text-overflowing:hover .toc-text {
  animation: scroll-text 3s ease-in-out infinite;
}

@keyframes scroll-text {
  0% {
    transform: translateX(0);
  }
  15% {
    transform: translateX(0);
  }
  85% {
    transform: translateX(var(--scroll-distance, -100px));
  }
  100% {
    transform: translateX(var(--scroll-distance, -100px));
  }
}

.toc-link::before {
  content: attr(data-item-index) '.';
  @apply text-gray-400 font-medium flex-shrink-0;
  margin-right: 0.25rem;
}

.toc-link:hover {
  @apply bg-gray-100;
}

.empty-state {
  @apply text-gray-500 select-none;
}

.is-active .toc-link {
  @apply text-purple-600 bg-purple-50 font-semibold;
}

.is-scrolled-over .toc-link {
  @apply text-gray-400;
}

/* Level-specific styles */
.toc-item[style*="--level: 1"] .toc-link {
  @apply font-semibold text-sm;
}

.toc-item[style*="--level: 2"] .toc-link {
  @apply font-medium text-sm;
}

.toc-item[style*="--level: 3"] .toc-link {
  @apply font-normal text-xs;
}

.toc-item[style*="--level: 4"] .toc-link,
.toc-item[style*="--level: 5"] .toc-link,
.toc-item[style*="--level: 6"] .toc-link {
  @apply font-normal text-xs text-gray-500;
}
</style>