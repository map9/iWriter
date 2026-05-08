<template>
  <div class="iw-statusbar">
    <!-- Notification Overlay -->
    <NotificationOverlay
      :state="notificationState"
      @close="hideNotification"
    />
    <!-- StatusBar fixed at the bottom -->
    <StatusBar @command="handleStatusBarCommand" class="shrink-0" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import type { IBasicStatusBarItem } from '@/components/common/statusbar'
import { StatusBar, tooltipManager } from '@/components/common/statusbar'
import { useNotification, NotificationOverlay } from '@/components/common/statusbar'
import { createFileStatsStatusBarGroup } from './statusbar-items/file-stats'
import { createUpdateStatusStatusBarItem } from './statusbar-items/update-status'
import { useAppStore } from '@/stores/app'

const { state: notificationState, dismiss: hideNotification } = useNotification()
import updaterService from '@/updater/UpdaterService'
const appStore = useAppStore()

const handleStatusBarCommand = (command: string, _item: IBasicStatusBarItem, _args?: unknown[]) => {
  switch(command) {
    case 'checkForUpdates': {
      const type = updaterService.status.value.type
      // 有进行中的更新流程 → 重新打开 Dialog 查看
      if (updaterService.hasPendingUpdate) {
        updaterService.openDialog()
      } else if (type === 'error') {
        updaterService.checkForUpdates().catch(console.error)
      } else if (type === 'idle') {
        // 手动触发检查
        updaterService.checkForUpdates().catch(console.error)
      }
      break
    }
    case 'toggleReadonlyMode':
      void appStore.toggleReadonlyMode()
      break
    // Handle other commands as needed
    default:
      console.warn(`Unhandled command: ${command}`)
  }

}

// Set up tooltip command handler to use the same logic as StatusBar commands
const handleTooltipCommand = (_protocol: string, _command: string, _args?: unknown[]) => {

}

onMounted(() => {
  tooltipManager.setCommandHandler(handleTooltipCommand)
  createFileStatsStatusBarGroup()
  createUpdateStatusStatusBarItem()
})
</script>
