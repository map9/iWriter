<template>
  <div class="h-full flex flex-col">
    <!-- Search Header -->
    <div class="sidebar-header h-9">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-gray-700 uppercase tracking-wide">
          SEARCH
        </span>
      </div>
      
      <!-- Actions -->
      <div class="flex items-center gap-1">
        <button
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          title="Search Settings"
        >
          <IconSettings class="w-5 h-5 text-gray-600" />
        </button>
      </div>
    </div>

    <!-- Search Form -->
    <div class="px-3 py-3 border-b border-gray-200 space-y-2">
      <!-- Search Input -->
      <div class="relative">
        <IconSearch class="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search"
          class="w-full pl-7 pr-3 h-6 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
      
      <!-- Replace Input -->
      <div class="relative">
        <IconReplace class="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input
          v-model="replaceQuery"
          type="text"
          placeholder="Replace"
          class="w-full pl-7 pr-3 h-6 text-sm border border-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
      
      <!-- Search Options -->
      <div class="flex items-center gap-2">
        <button
          @click="toggleOption('matchCase')"
          class="p-1 rounded transition-colors"
          :class="{ 'bg-primary-100 text-primary-700': options.matchCase, 'text-gray-600 hover:bg-gray-100': !options.matchCase }"
          title="Match Case"
        >
          Aa
        </button>
        <button
          @click="toggleOption('wholeWord')"
          class="p-1 rounded transition-colors"
          :class="{ 'bg-primary-100 text-primary-700': options.wholeWord, 'text-gray-600 hover:bg-gray-100': !options.wholeWord }"
          title="Match Whole Word"
        >
          <IconLetterCase class="w-4 h-4" />
        </button>
        <button
          @click="toggleOption('regex')"
          class="p-1 rounded transition-colors"
          :class="{ 'bg-primary-100 text-primary-700': options.regex, 'text-gray-600 hover:bg-gray-100': !options.regex }"
          title="Use Regular Expression"
        >
          .*
        </button>
      </div>
    </div>
    
    <!-- Results Header -->
    <div class="px-3 h-9 border-b border-gray-200 bg-gray-50 flex items-center">
      <span class="text-xs text-gray-600">
        {{ searchResults.length }} results in {{ fileCount }} files
      </span>
    </div>
    
    <!-- Search Results -->
    <div class="flex-1 overflow-auto">
      <div
        v-for="result in searchResults"
        :key="`${result.file}-${result.line}`"
        class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
        @click="jumpToResult(result)"
      >
        <!-- File Header -->
        <div class="px-3 py-2 bg-gray-25">
          <div class="flex items-center gap-2">
            <IconFileText class="w-5 h-5 text-gray-500" />
            <span class="text-sm font-medium">{{ result.fileName }}</span>
            <span class="text-xs text-gray-500">{{ result.matchCount }}</span>
          </div>
        </div>
        
        <!-- Match Lines -->
        <div
          v-for="match in result.matches"
          :key="match.line"
          class="px-6 py-1 text-sm"
        >
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-400 w-8 text-right">{{ match.line }}</span>
            <span class="text-gray-700">
              {{ match.content }}
            </span>
          </div>
        </div>
      </div>
      
      <!-- Empty State -->
      <div v-if="searchQuery && searchResults.length === 0" class="p-4 text-center text-gray-500">
        <IconSearchOff :size="48" class="mx-auto mb-2 text-gray-400" />
        <p class="text-sm">No results found</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  IconSearch,
  IconReplace,
  IconLetterCase,
  IconFileText,
  IconSearchOff,
  IconSettings
} from '@tabler/icons-vue'

const appStore = useAppStore()

const searchQuery = ref('')
const replaceQuery = ref('')
const options = ref({
  matchCase: false,
  wholeWord: false,
  regex: false
})

const searchResults = ref<any[]>([])

const fileCount = computed(() => {
  return new Set(searchResults.value.map(r => r.file)).size
})

function toggleOption(option: keyof typeof options.value) {
  options.value[option] = !options.value[option]
}

function jumpToResult(result: any) {
  // TODO: Implement jump to search result
  console.log('Jump to result:', result)
}

// Watch for search query changes
let searchTimeout: number | undefined
watch(searchQuery, (newQuery) => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  
  searchTimeout = window.setTimeout(() => {
    if (newQuery.length > 2) {
      performSearch()
    } else {
      searchResults.value = []
    }
  }, 300)
})

function performSearch() {
  // TODO: Implement actual search functionality
  console.log('Performing search:', searchQuery.value)
}
</script>