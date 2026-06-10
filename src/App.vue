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
  const themes = raw
    .filter(theme => theme.errors.length === 0)
    .map(buildMarkdownThemeFromRaw)
  registerCustomThemes(themes, raw)
}

onMounted(async () => {
  // Phase 0: 渲染进程关键节点计时
  const _perfEnabled = import.meta.env.DEV || import.meta.env.VITE_IWRITER_PERF === '1'
  const _perfLog = (label: string) => {
    if (!_perfEnabled) return
    console.info(`[PERF][renderer] ${label}: +${performance.now().toFixed(1)}ms`)
    performance.mark(label)
  }
  _perfLog('App.vue onMounted start')

  // Initialize
  ensureMarkdownScreenThemeStyleSheet()
  appStore.initial()
  _perfLog('appStore.initial() done')

  if (window.electronAPI) {
    window.electronAPI.onMenuAction(async (action: string) => {
      // Try to handle through editor first
      const isDone: boolean = await handleMenuAction(action)
      if (isDone == false) {
        // Fallback to app store for non-editor actions
        const handledByApp = await appStore.handleMenuAction(action)
        if (!handledByApp) {
          console.warn('Unhandled menu action:', action)
        }
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
