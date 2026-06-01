import { watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
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
  const { t } = useI18n()
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
    updateStatusItem.tooltip = t('statusBar.updateStatus.check')
    updateStatusItem.command = 'checkForUpdates'
    updateStatusItem.show()

    // 直接读 ref.value，确保 watchEffect 每次都重新建立响应式依赖
    watchEffect(() => {
      const updateStatus = updaterService.status.value
      const updateInfo = updaterService.updateInfo.value
      updateStatusItem.color = undefined

      if (updateStatus.type === 'idle') {
        updateStatusItem.text = '$(idle)'
        updateStatusItem.tooltip = t('statusBar.updateStatus.idle')
      } else if (updateStatus.type === 'checking') {
        updateStatusItem.text = '$(refresh~spin)'
        updateStatusItem.tooltip = t('statusBar.updateStatus.checking')
      } else if (updateStatus.type === 'available') {
        updateStatusItem.text = '$(check~pulse)'
        if (updateInfo) {
          updateStatusItem.tooltip = t('statusBar.updateStatus.availableDetails', { version: updateInfo.version, date: updateInfo.releaseDate })
        } else {
          updateStatusItem.tooltip = t('statusBar.updateStatus.available')
        }
      } else if (updateStatus.type === 'downloading') {
        updateStatusItem.text = `$(refresh~spin) ${updateStatus.progress ?? 0}%`
        updateStatusItem.tooltip = t('statusBar.updateStatus.downloading', { progress: updateStatus.progress ?? 0 })
      } else if (updateStatus.type === 'downloaded') {
        updateStatusItem.text = '$(download~bounce)'
        if (updateInfo) {
          updateStatusItem.tooltip = t('statusBar.updateStatus.downloadedDetails', { version: updateInfo.version, date: updateInfo.releaseDate })
        } else {
          updateStatusItem.tooltip = t('statusBar.updateStatus.downloaded')
        }
      } else if (updateStatus.type === 'installing') {
        updateStatusItem.text = '$(load~spin)'
        if (updateInfo) {
          updateStatusItem.tooltip = t('statusBar.updateStatus.installingDetails', { version: updateInfo.version, date: updateInfo.releaseDate })
        } else {
          updateStatusItem.tooltip = t('statusBar.updateStatus.installing')
        }
      } else if (updateStatus.type === 'error') {
        updateStatusItem.text = '$(exclamation-circle)'
        updateStatusItem.color = '#ff4d4f'
        updateStatusItem.tooltip = t('statusBar.updateStatus.error', { message: updateStatus.message })
      }
    })

  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}`)
  }
}
