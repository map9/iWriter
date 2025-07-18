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
          @click="refreshToc"
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          title="Refresh"
        >
          <IconRefresh class="w-5 h-5 text-gray-600" />
        </button>
      </div>
    </div>
    
    <!-- TOC Tree -->
    <div class="flex-1 overflow-auto">
      <div
        v-for="heading in tocItems"
        :key="heading.id"
        class="flex items-center px-3 py-1 hover:bg-gray-100 cursor-pointer text-sm group"
        :class="{ 'bg-primary-50 text-primary-700': heading.isActive }"
        :style="{ paddingLeft: `${12 + heading.level * 12}px` }"
        @click="scrollToHeading(heading.id)"
      >
        <!-- Heading Level Indicator -->
        <div
          class="w-1 h-4 rounded mr-3 flex-shrink-0"
          :class="getHeadingLevelColor(heading.level)"
        />
        
        <!-- Heading Text -->
        <span class="flex-1 truncate" :title="heading.text">
          {{ heading.text }}
        </span>
        
        <!-- Line Number -->
        <span class="text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
          {{ heading.line }}
        </span>
      </div>
      
      <!-- Empty State -->
      <div v-if="tocItems.length === 0" class="p-4 text-center text-gray-500">
        <IconList :size="48" class="mx-auto mb-2 text-gray-400" />
        <p class="text-sm">No headings found</p>
        <p class="text-xs text-gray-400 mt-1">
          Add headings to your document to see the table of contents
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  IconList,
  IconRefresh
} from '@tabler/icons-vue'

interface TocItem {
  id: string
  text: string
  level: number
  line: number
  isActive: boolean
}

const appStore = useAppStore()
const tocItems = ref<TocItem[]>([])

// Watch active tab content changes to update TOC
watch(() => appStore.activeTab?.content, (newContent) => {
  if (newContent) {
    generateToc(newContent)
  } else {
    tocItems.value = []
  }
}, { immediate: true })

function generateToc(content: string) {
  const lines = content.split('\n')
  const headings: TocItem[] = []
  
  lines.forEach((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1].length
      const text = match[2].trim()
      const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      
      headings.push({
        id,
        text,
        level,
        line: index + 1,
        isActive: false
      })
    }
  })
  
  tocItems.value = headings
}

function scrollToHeading(headingId: string) {
  // TODO: Implement scroll to heading in editor
  console.log('Scroll to heading:', headingId)
  
  // Update active state
  tocItems.value.forEach(item => {
    item.isActive = item.id === headingId
  })
}

function refreshToc() {
  if (appStore.activeTab?.content) {
    generateToc(appStore.activeTab.content)
  }
}

function getHeadingLevelColor(level: number) {
  const colors = [
    'bg-red-400',    // H1
    'bg-orange-400', // H2
    'bg-yellow-400', // H3
    'bg-green-400',  // H4
    'bg-blue-400',   // H5
    'bg-purple-400'  // H6
  ]
  return colors[level - 1] || 'bg-gray-400'
}
</script>