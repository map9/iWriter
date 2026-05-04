<template>
  <router-view ref="routerViewRef"/>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRouter } from 'vue-router'
import {
  ensureMarkdownScreenThemeStyleSheet,
  buildMarkdownThemeFromRaw,
  registerCustomThemes,
} from '@/components/print/markdownThemes'
import type { RawCustomTheme } from '@/types'

const router = useRouter()
const appStore = useAppStore()
const routerViewRef = ref(null)

async function handleMenuAction(action: string): Promise<boolean> {
  const currentRoute = router.currentRoute.value
  const routeComponent = currentRoute.matched[0]?.instances?.default

  if (routeComponent && 'handleMenuAction' in routeComponent && typeof routeComponent.handleMenuAction === 'function') {
    return await routeComponent.handleMenuAction(action)
  }

  return false
}

function applyRawCustomThemes(rawThemes: unknown[]): void {
  const raw = rawThemes as RawCustomTheme[]
  const themes = raw.map(buildMarkdownThemeFromRaw)
  registerCustomThemes(themes, raw)
}

onMounted(async () => {
  // Initialize
  ensureMarkdownScreenThemeStyleSheet()
  appStore.initial()

  if (window.electronAPI) {
    window.electronAPI.onMenuAction(async (action: string) => {
      // Try to handle through editor first
      const isDone: boolean = await handleMenuAction(action)
      if (isDone == false) {
        // Fallback to app store for non-editor actions
        appStore.handleMenuAction(action)
      }
    })

    // Load custom themes and watch for changes
    if (window.electronAPI.customThemes) {
      try {
        const rawThemes = await window.electronAPI.customThemes.load()
        applyRawCustomThemes(rawThemes)
      } catch {
        // Custom themes are non-critical — silently ignore load failures
      }

      window.electronAPI.customThemes.onChanged(applyRawCustomThemes)
    }
  }
})

onUnmounted(() => {
  window.electronAPI?.customThemes?.removeChangedListeners()
})

onUnmounted(() => {
  appStore.destroy()
})
</script>
