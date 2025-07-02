<template>
  <div class="h-6 bg-primary-600 text-white flex items-center justify-between px-4 text-xs">
    <!-- Left Section -->
    <div class="flex items-center gap-1">
      <span v-if="!appStore.hasOpenFolder">No Folder Opened,</span>
      <span v-else>Folder Opened,</span>
      <span v-if="!appStore.activeTab">No Documents Opened.</span>
      <span v-else>Documents Opened.</span>
    </div>
    
    <!-- Right Section -->
    <div class="flex items-center gap-1">
      <span>Selection 15 bytes, 3 words, 0 lines</span>
      <span v-if="appStore.activeTab">
        Ln {{ currentLine }}, Col {{ currentColumn }}
      </span>
      <span v-if="appStore.activeTab">
        {{ wordCount }} characters, {{ wordsCount }} words, {{ linesCount }} paragraphs
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

// Mock values - in real implementation, these would come from the editor
const currentLine = computed(() => 6)
const currentColumn = computed(() => 22)

const wordCount = computed(() => {
  if (!appStore.activeTab?.content) return 0
  return appStore.activeTab.content.length
})

const wordsCount = computed(() => {
  if (!appStore.activeTab?.content) return 0
  return appStore.activeTab.content.split(/\s+/).filter(word => word.length > 0).length
})

const linesCount = computed(() => {
  if (!appStore.activeTab?.content) return 0
  return appStore.activeTab.content.split('\n').length
})
</script>