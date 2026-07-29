<template>
  <div class="relative z-40 h-6 w-full shrink-0 border-t border-base-300 bg-neutral text-neutral-content">
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
import { createGitStatusStatusBarGroup } from './statusbar-items/git-status'
import { useAppStore } from '@/stores/app'

const { state: notificationState, dismiss: hideNotification } = useNotification()
import { SidebarMode } from '@/types'
import { useGitStore } from '@/stores/git'
const appStore = useAppStore()
const gitStore = useGitStore()

const handleStatusBarCommand = (command: string, _item: IBasicStatusBarItem, _args?: unknown[]) => {
  switch(command) {
    case 'checkForUpdates': {
      void appStore.presentUpdateFlow()
      break
    }
    case 'toggleReadonlyMode':
      void appStore.toggleReadonlyMode()
      break
    // 版本控制：分支点击聚焦 SCM 面板；同步直接触发
    case 'scm.checkout':
      appStore.setLeftSidebarMode(SidebarMode.SOURCE_CONTROL)
      break
    case 'scm.sync':
      if (gitStore.branch?.upstream) void gitStore.sync()
      else appStore.setLeftSidebarMode(SidebarMode.SOURCE_CONTROL)
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
  createGitStatusStatusBarGroup()
})
</script>
