import { ref } from 'vue'
import { useAppStore } from '@/stores/app'

export function useContextFiles() {
  const appStore = useAppStore()
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
      title: '选择文件',
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
      title: '选择文件夹',
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
