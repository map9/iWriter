import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { i18n } from '@/i18n'

export function useContextFiles() {
  const appStore = useAppStore()
  const t = i18n.global.t
  const contextFiles = ref<string[]>([])

  function fileName(path: string): string {
    return path.split('/').pop() ?? path
  }

  function removeContextFile(i: number) {
    contextFiles.value.splice(i, 1)
  }

  async function attachCurrentFile() {
    const path = appStore.activeTab?.path
    if (path && !contextFiles.value.includes(path)) {
      contextFiles.value.push(path)
    }
  }

  async function browseFiles() {
    const result = await window.electronAPI.showOpenDialog({
      title: t('agentPanel.contextFiles.selectFilesTitle'),
      properties: ['openFile', 'multiSelections'],
    })
    if (!result.canceled) {
      for (const p of result.filePaths) {
        if (!contextFiles.value.includes(p)) contextFiles.value.push(p)
      }
    }
  }

  async function browseFolder() {
    const result = await window.electronAPI.showOpenDialog({
      title: t('agentPanel.contextFiles.selectFolderTitle'),
      properties: ['openDirectory'],
    })
    if (!result.canceled) {
      for (const p of result.filePaths) {
        if (!contextFiles.value.includes(p)) contextFiles.value.push(p)
      }
    }
  }

  return { contextFiles, fileName, removeContextFile, attachCurrentFile, browseFiles, browseFolder }
}
