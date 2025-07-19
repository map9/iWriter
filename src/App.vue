<template>
  <div id="app" class="h-screen flex flex-col overflow-hidden">
    <router-view ref="routerViewRef"/>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useRouter } from 'vue-router'

const router = useRouter()
const appStore = useAppStore()
const routerViewRef = ref(null)

function handleMenuAction(action: string) {
  const currentRoute = router.currentRoute.value
  const routeComponent = currentRoute.matched[0]?.instances?.default

  if (routeComponent && 'handleMenuAction' in routeComponent && typeof routeComponent.handleMenuAction === 'function') {
    return routeComponent.handleMenuAction(action)
  }

  return false
}

onMounted(() => {
  // Initialize theme system
  appStore.initTheme()
  
  if (window.electronAPI) {
    window.electronAPI.onMenuAction((action: string) => {
      // Try to handle through editor first
      const isDone: boolean = handleMenuAction(action)
      if (isDone == false) {
        // Fallback to app store for non-editor actions
        appStore.handleMenuAction(action)
      }
    })
    
  }
})

onUnmounted(() => {
  // Clean up file watching
  appStore.stopAdvancedFileWatching()
  
  if (window.electronAPI) {
    window.electronAPI.removeMenuActionListener()
    window.electronAPI.removeFileChangeListeners()
  }
})
</script>