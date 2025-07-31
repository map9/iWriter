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

async function handleMenuAction(action: string): Promise<boolean> {
  const currentRoute = router.currentRoute.value
  const routeComponent = currentRoute.matched[0]?.instances?.default

  if (routeComponent && 'handleMenuAction' in routeComponent && typeof routeComponent.handleMenuAction === 'function') {
    return await routeComponent.handleMenuAction(action)
  }

  return false
}

onMounted(() => {
  // Initialize
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
  }
})

onUnmounted(() => {
  // Destroy
  appStore.destroy()
})
</script>