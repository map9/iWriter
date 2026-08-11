import { ref } from 'vue'
import { useAppStore } from '@/stores/app'
import { i18n } from '@/i18n'
import type { ContextAttachment } from '@/ai/types'

export function useContextFiles() {
  const appStore = useAppStore()
  const t = i18n.global.t
  const contextFiles = ref<ContextAttachment[]>([])

  function addAttachment(path: string, kind: ContextAttachment['kind']) {
    if (!contextFiles.value.some(attachment => attachment.path === path)) {
      contextFiles.value.push({ path, kind })
    }
  }

  function removeContextFile(i: number) {
    contextFiles.value.splice(i, 1)
  }

  async function attachCurrentFile() {
    const path = appStore.activeTab?.path
    if (path) addAttachment(path, 'file')
  }

  async function browseFiles() {
    const result = await window.electronAPI.showOpenDialog({
      title: t('agentPanel.contextFiles.selectFilesTitle'),
      properties: ['openFile', 'multiSelections'],
    })
    if (!result.canceled) {
      for (const p of result.filePaths) {
        addAttachment(p, 'file')
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
        addAttachment(p, 'directory')
      }
    }
  }

  return { contextFiles, removeContextFile, attachCurrentFile, browseFiles, browseFolder }
}
