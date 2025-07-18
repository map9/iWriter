<template>
  <div class="h-full flex flex-col">
    <!-- TOC Header -->
    <div class="sidebar-header h-9">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-gray-700 uppercase tracking-wide">
          OUTLINE
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
    <div class="flex-1 overflow-auto table-of-contents">
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
            class="toc-link"
          >
            {{ item.title }}
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
import { computed } from 'vue'
import { useGlobalTocState, useTocProvider } from '@/composables/useTocProvider'
import {
  IconList,
  IconArrowUp
} from '@tabler/icons-vue'

// 使用全局 TOC 状态
const { tocItems, isLoading, hasItems } = useGlobalTocState()
const { navigateToItem, getProviderInfo } = useTocProvider()

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
  display: flex;
  flex-direction: column;
  font-size: 0.875rem;
  gap: 0.25rem;
  overflow: auto;
  text-decoration: none;
  padding: 0.5rem;
}

.toc-item {
  border-radius: 0.25rem;
  padding-left: calc(0.875rem * (var(--level) - 1));
  transition: all 0.2s cubic-bezier(0.65, 0.05, 0.36, 1);
}

.toc-item:hover {
  background-color: rgb(243 244 246); /* gray-100 */
}

.toc-link {
  color: rgb(55 65 81); /* gray-700 */
  display: flex;
  gap: 0.25rem;
  text-decoration: none;
  padding: 0.375rem 0.5rem;
  border-radius: 0.25rem;
  word-break: break-word;
  line-height: 1.4;
}

.toc-link::before {
  content: attr(data-item-index) '.';
  color: rgb(156 163 175); /* gray-400 */
  font-weight: 500;
  flex-shrink: 0;
}

.toc-link:hover {
  background-color: rgb(243 244 246); /* gray-100 */
}

.empty-state {
  color: rgb(107 114 128); /* gray-500 */
  user-select: none;
}

.is-active .toc-link {
  color: rgb(147 51 234); /* purple-600 */
  background-color: rgb(243 232 255); /* purple-50 */
  font-weight: 600;
}

.is-scrolled-over .toc-link {
  color: rgb(156 163 175); /* gray-400 */
}

/* Level-specific styles */
.toc-item[style*="--level: 1"] .toc-link {
  font-weight: 600;
  font-size: 0.875rem;
}

.toc-item[style*="--level: 2"] .toc-link {
  font-weight: 500;
  font-size: 0.875rem;
}

.toc-item[style*="--level: 3"] .toc-link {
  font-weight: 400;
  font-size: 0.8125rem;
}

.toc-item[style*="--level: 4"] .toc-link,
.toc-item[style*="--level: 5"] .toc-link,
.toc-item[style*="--level: 6"] .toc-link {
  font-weight: 400;
  font-size: 0.75rem;
  color: rgb(107 114 128); /* gray-500 */
}
</style>