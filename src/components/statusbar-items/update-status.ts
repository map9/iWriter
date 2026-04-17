import { watchEffect } from 'vue'
import { useStatusBar, StatusBarAlignment, setTablerIcon } from '@/components/common/statusbar'
import updaterService from '@/updater/UpdaterService'
import {
  IconBellPause, 
  IconLoader,
  IconRefresh,
  IconDownload,
  IconCheck,
  IconExclamationCircle,
} from '@tabler/icons-vue'

export const createUpdateStatusStatusBarItem = () => {
  const statusBar = useStatusBar()

  setTablerIcon('idle', IconBellPause)
  setTablerIcon('load', IconLoader)
  setTablerIcon('refresh', IconRefresh)
  setTablerIcon('download', IconDownload)
  setTablerIcon('check', IconCheck)
  setTablerIcon('exclamation-circle', IconExclamationCircle)

  try {
    // updateStatus
    const updateStatusItem = statusBar.createStatusBarItem({id: `update-status`, alignment: StatusBarAlignment.Left, priority: 100})
    updateStatusItem.text = '$(refresh)'
    updateStatusItem.tooltip = 'Check for Updates'
    updateStatusItem.command = 'checkForUpdates'
    updateStatusItem.show()

    // 直接读 ref.value，确保 watchEffect 每次都重新建立响应式依赖
    watchEffect(() => {
      const updateStatus = updaterService.status.value
      const updateInfo = updaterService.updateInfo.value
      updateStatusItem.color = undefined

      if (updateStatus.type === 'idle') {
        updateStatusItem.text = '$(idle)'
        updateStatusItem.tooltip = 'Update not available!'
      } else if (updateStatus.type === 'checking') {
        updateStatusItem.text = '$(refresh~spin)'
        updateStatusItem.tooltip = 'Checking for updates...'
      } else if (updateStatus.type === 'available') {
        updateStatusItem.text = '$(check~pulse)'
        if (updateInfo) {
          updateStatusItem.tooltip = `Update available!\nVersion:${updateInfo.version}\nRelease Date:${updateInfo.releaseDate}\nClick to view details.`
        } else {
          updateStatusItem.tooltip = 'Update available!'
        }
      } else if (updateStatus.type === 'downloading') {
        updateStatusItem.text = `$(refresh~spin) ${updateStatus.progress ?? 0}%`
        updateStatusItem.tooltip = `Downloading update... ${updateStatus.progress ?? 0}%\nClick to open details.`
      } else if (updateStatus.type === 'downloaded') {
        updateStatusItem.text = '$(download~bounce)'
        if (updateInfo) {
          updateStatusItem.tooltip = `Update downloaded!\nVersion:${updateInfo.version}\nRelease Date:${updateInfo.releaseDate}\nClick to install.`
        } else {
          updateStatusItem.tooltip = `Update downloaded! Click to install.`
        }
      } else if (updateStatus.type === 'installing') {
        updateStatusItem.text = '$(load~spin)'
        if (updateInfo) {
          updateStatusItem.tooltip = `Installing a new version...\nVersion:${updateInfo.version}\nRelease Date:${updateInfo.releaseDate}`
        } else {
          updateStatusItem.tooltip = `Installing a new version...`
        }
      } else if (updateStatus.type === 'error') {
        updateStatusItem.text = '$(exclamation-circle)'
        updateStatusItem.color = '#ff4d4f'
        updateStatusItem.tooltip = `Update error: ${updateStatus.message},\nClick to retry.`
      }
    })

  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}`)
  }
}
