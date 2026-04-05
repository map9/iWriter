import { computed, watchEffect } from 'vue'
import path from 'path-browserify'
import { useStatusBar, StatusBarAlignment, setTablerIcon } from '@/components/common/statusbar'
import { useAppStore } from '@/stores/app'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import  { DocumentType } from '@/types'
import {
  IconSum,
} from '@tabler/icons-vue'

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export const createFileStatsStatusBarGroup = () => {
  const statusBar = useStatusBar()
  const appStore = useAppStore()
  const { isEditable, getIconByExtension } = useDocumentTypeDetector()

  setTablerIcon('sum', IconSum)

  const position = computed((): string => {
    const stats = appStore.activeTab?.fileStats

    if (stats) {
      return `Ln ${stats.currentLine}, Col ${stats.currentColumn} ${stats.paragraphType.toUpperCase()}`
    } else {
      return ''
    }
  })

  const statsVisible = computed((): boolean => {
    const stats = appStore.activeTab?.fileStats
    return !!stats
  })

  const statsTooltip = computed((): string => {
    const stats = appStore.activeTab?.fileStats

    let result = ''
    if (stats) {
      if (stats.selectionCharCount > 0) {
        result = `**Selection**<br>- **${stats.selectionCharCount}** characters<br>- **${stats.selectionWordCount}** words\n\n`
      }
      return result + `**Document**<br>- **${stats.totalCharCount}** characters<br>- **${stats.totalWordCount}** words<br>- **${stats.totalParagraphCount}** paragraphs`
    } else {
      return ''
    }
  })

  const lineEnding = computed((): string => {
    const lineEnding = appStore.activeTab?.editState?.lineEnding
    return lineEnding ? lineEnding : ''
  })

  const autoSaveText = computed((): string => {
    const docType = appStore.activeTab?.documentType
    if (docType && isEditable(docType)) {
      return appStore.autoSave ? 'Auto Save' : ''
    }
    return ''
  })

  const editable = computed((): string => {
    const tab = appStore.activeTab
    const docType = tab?.documentType

    if (!docType) {
      return ''
    }

    if (!isEditable(docType)) {
      return 'Viewer'
    }

    if (tab?.fileReadonly) {
      return 'File Read-Only'
    }

    if (tab?.editReadonly) {
      return 'Read-Only Mode'
    }

    return 'Editable'
  })

  const editableTooltip = computed((): string => {
    const tab = appStore.activeTab
    const docType = tab?.documentType

    if (!docType) {
      return ''
    }

    if (!isEditable(docType)) {
      return 'Viewer. This document type is not editable.'
    }

    if (tab?.fileReadonly) {
      return 'File Read-Only. This file is read-only on disk. Use Save As to create an editable copy.'
    }

    if (tab?.editReadonly) {
      return 'Read-Only Mode. Click to disable it.'
    }

    return 'Editable. Click to enable read-only mode.'
  })

  const fileType = computed((): string => {
    const docType = appStore.activeTab?.documentType
    const filepath = appStore.activeTab?.path

    if (docType && filepath) {
      return path.extname(filepath).replace('.', '').toLowerCase()
    } else {
      return ''
    }
  })

  const fileSize = computed((): string => {
    const docType = appStore.activeTab?.documentType
    const dataSize = appStore.activeTab?.metadata?.size
    if (
      docType && 
      (docType === DocumentType.IMAGE_VIEWER || docType === DocumentType.PDF_VIEWER) &&
      dataSize
    ) {
      return formatFileSize(dataSize)
    } else {
      return ''
    }
  })

  try {
    /*
    const editorStatusBarGroup = statusBar.createStatusBarGroup({
      id: `group-file-stats`,
      alignment: StatusBarAlignment.Right,
      priority: 100,
      //separator: '|'
    })
    editorStatusBarGroup.show()
    */

    // position
    //const positionItem = editorStatusBarGroup.createStatusBarItem(`position`)
    const positionItem = statusBar.createStatusBarItem({id: `position`, alignment: StatusBarAlignment.Right, priority: 100})
    positionItem.text = position.value
    positionItem.tooltip = 'Go to Line/Column'
    positionItem.show()

    // lineEnding
    //const lineEndingItem = editorStatusBarGroup.createStatusBarItem(`line-ending`)
    const lineEndingItem = statusBar.createStatusBarItem({id: `line-ending`, alignment: StatusBarAlignment.Right, priority: 99})
    lineEndingItem.text = lineEnding.value
    lineEndingItem.tooltip = 'Select End of Line Sequence'
    lineEndingItem.show()

    // stats
    //const statsItem = editorStatusBarGroup.createStatusBarItem(`selection-stats`)
    const statsItem = statusBar.createStatusBarItem({id: `selection-stats`, alignment: StatusBarAlignment.Right, priority: 98})
    statsItem.text = '$(sum)'
    statsItem.tooltip = {
      type: 'markdown',
      content: statsTooltip.value
    }
    statsItem.show()

    // autoSave
    const autoSaveItem = statusBar.createStatusBarItem({id: `auto-save`, alignment: StatusBarAlignment.Right, priority: 97})
    autoSaveItem.text = autoSaveText.value
    autoSaveItem.tooltip = 'Auto Save'
    autoSaveItem.show()

    // editable
    //const editableItem = editorStatusBarGroup.createStatusBarItem(`editable`)
    const editableItem = statusBar.createStatusBarItem({id: `editable`, alignment: StatusBarAlignment.Right, priority: 96})
    editableItem.text = editable.value
    editableItem.tooltip = editableTooltip.value
    editableItem.command = 'toggleReadonlyMode'
    editableItem.show()

    // fileType
    //const fileTypeItem = editorStatusBarGroup.createStatusBarItem(`file-type`)
    const fileTypeItem = statusBar.createStatusBarItem({id: `file-type`, alignment: StatusBarAlignment.Right, priority: 95})
    fileTypeItem.text = fileType.value
    fileTypeItem.tooltip = 'File Type: ' + (appStore.activeTab?.documentType ?? '')
    fileTypeItem.show()

    // fileSize
    //const fileSizeItem = editorStatusBarGroup.createStatusBarItem(`file-size`)
    const fileSizeItem = statusBar.createStatusBarItem({id: `file-size`, alignment: StatusBarAlignment.Right, priority: 94})
    fileSizeItem.text = fileSize.value
    fileSizeItem.tooltip = 'File Size'
    fileSizeItem.show()

    watchEffect(() => {
      positionItem.text = position.value
      statsItem.visible = statsVisible.value
      statsItem.tooltip = {
        type: 'markdown',
        content: statsTooltip.value
      }
      lineEndingItem.text = lineEnding.value
      autoSaveItem.text = autoSaveText.value
      editableItem.text = editable.value
      editableItem.tooltip = editableTooltip.value
      editableItem.command = appStore.activeTab?.documentType && isEditable(appStore.activeTab.documentType) ? 'toggleReadonlyMode' : undefined
      if (fileType.value.length > 0) {
        const icon = getIconByExtension(fileType.value)
        const extension = fileType.value.toUpperCase()
        setTablerIcon(extension, icon)
        fileTypeItem.text = `$(${extension}) ${extension}`
        fileTypeItem.tooltip = `File Type: ${extension}`
      } else {
        fileTypeItem.text = fileType.value
      }
      fileSizeItem.text = fileSize.value
    })

  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}`)
  }
}
