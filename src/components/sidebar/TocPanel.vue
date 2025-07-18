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
      <template v-if="tocItems && tocItems.length > 0">
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
            :data-item-index="item.itemIndex || (index + 1)"
            class="toc-link"
          >
            {{ item.textContent }}
          </a>
        </div>
      </template>
      
      <!-- Empty State -->
      <div v-else class="empty-state p-4 text-center text-gray-500">
        <IconList :size="48" class="mx-auto mb-2 text-gray-400" />
        <p class="text-sm">No headings found</p>
        <p class="text-xs text-gray-400 mt-1">
          Start editing your document to see the outline
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject } from 'vue'
import { TextSelection } from '@tiptap/pm/state'
import { useAppStore } from '@/stores/app'
import type { TableOfContentData } from '@tiptap/extension-table-of-contents'
import {
  IconList,
  IconArrowUp
} from '@tabler/icons-vue'

// Get the current editor instance from parent component
const appStore = useAppStore()
const tocItems = ref<TableOfContentData>([]) 

// Get TipTap editor instance from the active MarkdownEditorPage
const getActiveEditor = () => {
  // Try to get editor from the active MarkdownEditorPage component
  try {
    const editorElement = document.querySelector('.tiptap')
    if (editorElement && (editorElement as any).__vueParentComponent) {
      const editorComponent = (editorElement as any).__vueParentComponent
      return editorComponent?.editor || null
    }
  } catch (error) {
    console.warn('Could not access editor instance:', error)
  }
  return null
}

// Watch for TOC updates from the active editor
// This will be populated when the MarkdownEditorPage updates its TOC
watch(() => appStore.tocItems, (newItems) => {
  if (newItems) {
    tocItems.value = newItems
  } else {
    tocItems.value = []
  }
}, { immediate: true, deep: true })

function onItemClick(event: Event, id: string) {
  const editor = getActiveEditor()
  if (!editor) {
    // Fallback: scroll to element if editor is not available
    const element = document.querySelector(`[data-toc-id="${id}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    return
  }

  try {
    const element = editor.view.dom.querySelector(`[data-toc-id="${id}"]`)
    if (!element) return

    const pos = editor.view.posAtDOM(element, 0)

    // Set focus and selection
    const tr = editor.view.state.tr
    tr.setSelection(new TextSelection(tr.doc.resolve(pos)))
    editor.view.dispatch(tr)
    editor.view.focus()

    // Update URL hash if history API is available
    if (history.pushState) {
      history.pushState(null, null as any, `#${id}`)
    }

    // Smooth scroll to element
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  } catch (error) {
    console.warn('Failed to scroll to heading:', error)
    // Fallback: try to find and scroll to element by data attribute
    const element = document.querySelector(`[data-toc-id="${id}"]`)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }
}

function scrollToTop() {
  const editor = getActiveEditor()
  if (editor) {
    // Scroll editor to top
    const editorElement = editor.view.dom.closest('.tiptap')
    if (editorElement) {
      editorElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  } else {
    // Fallback: scroll window to top
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
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