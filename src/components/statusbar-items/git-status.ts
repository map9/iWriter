import { computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useStatusBar, StatusBarAlignment, setTablerIcon } from '@/components/common/statusbar'
import { useGitStore } from '@/stores/git'
import { IconGitBranch, IconRefresh } from '@tabler/icons-vue'

/**
 * 版本控制状态栏组件：分支 + 领先/落后（同步）。
 * 与 file-stats / update-status 一致的工厂式注册。
 */
export const createGitStatusStatusBarGroup = () => {
  const statusBar = useStatusBar()
  const gitStore = useGitStore()
  const { t } = useI18n()

  setTablerIcon('git-branch', IconGitBranch)
  setTablerIcon('git-sync', IconRefresh)

  const visible = computed(() => gitStore.availability.available && gitStore.isRepo)

  const branchText = computed(() => {
    const b = gitStore.branch
    if (!b) return ''
    return `$(git-branch) ${b.current || '—'}`
  })

  const syncText = computed(() => {
    const b = gitStore.branch
    if (!b) return '$(git-sync)'
    return `$(git-sync) ↓${b.behind} ↑${b.ahead}`
  })

  try {
    const branchItem = statusBar.createStatusBarItem({ id: 'git-branch', alignment: StatusBarAlignment.Left, priority: 100 })
    branchItem.text = branchText.value
    branchItem.tooltip = t('sourceControl.branch.switch')
    branchItem.command = 'scm.checkout'
    branchItem.show()

    const syncItem = statusBar.createStatusBarItem({ id: 'git-sync', alignment: StatusBarAlignment.Left, priority: 99 })
    syncItem.text = syncText.value
    syncItem.tooltip = t('sourceControl.remote.sync')
    syncItem.command = 'scm.sync'
    syncItem.show()

    watchEffect(() => {
      branchItem.visible = visible.value
      branchItem.text = branchText.value
      branchItem.tooltip = t('sourceControl.branch.switch')
      syncItem.visible = visible.value
      syncItem.text = syncText.value
      syncItem.tooltip = t('sourceControl.remote.sync')
    })
  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}`)
  }
}
