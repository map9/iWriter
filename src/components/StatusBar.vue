<template>
  <div class="statusbar">
    <!-- Notification Overlay -->
    <NotificationOverlay
      :state="notificationState"
      @close="hideNotification"
    />
    <!-- StatusBar fixed at the bottom -->
    <StatusBar @command="handleStatusBarCommand" class="flex-shrink-0" />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import type { IBasicStatusBarItem, StatusBarItem } from '@/components/common/statusbar'
import { StatusBar, tooltipManager } from '@/components/common/statusbar'
import { useNotification, NotificationOverlay } from '@/components/common/statusbar'
import { createFileStatsStatusBarGroup } from './statusbar-items/file-stats'
import { createUpdateStatusStatusBarItem } from './statusbar-items/update-status'

const { state: notificationState, dismiss: hideNotification } = useNotification()
import updaterService from '@/updater/UpdaterService'

const handleStatusBarCommand = (command: string, item: IBasicStatusBarItem, args?: unknown[]) => {
  console.debug('StatusBar command executed:', { command, item: { id: item.id, name: (item as StatusBarItem).name }, args })

  switch(command) {
    case 'checkForUpdates':
      const type = updaterService.status.value.type
      if (type === 'downloaded') {
        // 可以安装更新
        updaterService.installUpdate().catch(console.error)
      } else if (type === 'error') {
        // 显示错误详情或重试
        updaterService.checkForUpdates().catch(console.error)
      }
      console.debug('Checking for updates...')
      break
    // Handle other commands as needed
    default:
      console.warn(`Unhandled command: ${command}`)
  }

}

// Set up tooltip command handler to use the same logic as StatusBar commands
const handleTooltipCommand = (protocol: string, command: string, args?: unknown[]) => {
  console.debug('Tooltip command executed:', { protocol, command, args })

}

onMounted(() => {
  tooltipManager.setCommandHandler(handleTooltipCommand)
  createFileStatsStatusBarGroup()
  createUpdateStatusStatusBarItem()
})
</script>