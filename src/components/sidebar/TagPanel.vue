<template>
  <div class="h-full flex flex-col">
    <!-- Tag Header -->
    <div class="sidebar-header h-9">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-gray-700 uppercase tracking-wide">
          BY TAGS
        </span>
      </div>
      
      <!-- Actions -->
      <div class="flex items-center gap-1">
        <button
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          title="Refresh Tags"
        >
          <IconRefresh class="w-5 h-5 text-gray-600" />
        </button>
      </div>
    </div>

    <!-- Tag Search -->
    <div class="px-3 border-b border-gray-200 h-12 flex items-center">
      <div class="relative w-full">
        <IconSearch class="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search Tags"
          class="w-full pl-9 pr-3 h-9 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
    </div>
    
    <!-- Tag Tree -->
    <div class="flex-1 overflow-auto">
      <div
        v-for="tag in filteredTags"
        :key="tag.name"
        class="border-b border-gray-100"
      >
        <!-- Tag Header -->
        <div
          class="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
          @click="toggleTag(tag.name)"
        >
          <button class="p-0.5 mr-2 rounded hover:bg-gray-200 transition-colors">
            <IconChevronDown
              v-if="expandedTags.has(tag.name)"
              class="w-5 h-5 text-gray-500"
            />
            <IconChevronRight
              v-else
              class="w-5 h-5 text-gray-500"
            />
          </button>
          <IconTag class="w-5 h-5 mr-2 text-blue-500" />
          <span class="flex-1 text-sm font-medium">{{ tag.name }}</span>
          <span class="text-xs text-gray-400">{{ tag.files.length }}</span>
        </div>
        
        <!-- Tagged Files -->
        <div v-if="expandedTags.has(tag.name)" class="pl-8">
          <div
            v-for="file in tag.files"
            :key="file.path"
            class="flex items-center px-3 py-1 hover:bg-gray-100 cursor-pointer text-sm"
            @click="openFile(file.path)"
          >
            <IconFileText class="w-5 h-5 mr-2 text-gray-500" />
            <span class="flex-1 truncate">{{ file.name }}</span>
          </div>
        </div>
      </div>
      
      <!-- Empty State -->
      <div v-if="tags.length === 0" class="p-4 text-center text-gray-500">
        <IconTag :size="48" class="mx-auto mb-2 text-gray-400" />
        <p class="text-sm">No tagged files found</p>
        <p class="text-xs text-gray-400 mt-1">
          Add tags to your markdown files using #tag syntax
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  IconSearch,
  IconTag,
  IconFileText,
  IconChevronDown,
  IconChevronRight,
  IconRefresh
} from '@tabler/icons-vue'

const appStore = useAppStore()

const searchQuery = ref('')
const expandedTags = ref(new Set<string>())

// Mock tag data - in real implementation, this would be extracted from markdown files
const tags = ref([
  {
    name: 'project',
    files: [
      { name: 'README.md', path: '/path/to/README.md' },
      { name: 'setup.md', path: '/path/to/setup.md' }
    ]
  },
  {
    name: 'todo',
    files: [
      { name: 'tasks.md', path: '/path/to/tasks.md' }
    ]
  }
])

const filteredTags = computed(() => {
  if (!searchQuery.value) return tags.value
  
  const query = searchQuery.value.toLowerCase()
  return tags.value.filter(tag => 
    tag.name.toLowerCase().includes(query)
  )
})

function toggleTag(tagName: string) {
  if (expandedTags.value.has(tagName)) {
    expandedTags.value.delete(tagName)
  } else {
    expandedTags.value.add(tagName)
  }
}

function openFile(filePath: string) {
  appStore.openFile(filePath)
}
</script>