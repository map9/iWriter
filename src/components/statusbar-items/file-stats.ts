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

  const editable = computed((): string => {
    const docType = appStore.activeTab?.documentType
    if (docType) {
      return isEditable(docType) ? "Editable" : "Readonly"
    }
    else {
      return ''
    }
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

    // editable
    //const editableItem = editorStatusBarGroup.createStatusBarItem(`editable`)
    const editableItem = statusBar.createStatusBarItem({id: `editable`, alignment: StatusBarAlignment.Right, priority: 97})
    editableItem.text = editable.value
    editableItem.tooltip = 'Switch Editable/Readonly Status'
    editableItem.show()

    // fileType
    //const fileTypeItem = editorStatusBarGroup.createStatusBarItem(`file-type`)
    const fileTypeItem = statusBar.createStatusBarItem({id: `file-type`, alignment: StatusBarAlignment.Right, priority: 96})
    fileTypeItem.text = fileType.value
    fileTypeItem.tooltip = 'File Type: ' + (appStore.activeTab?.documentType ?? '')
    fileTypeItem.show()

    // fileSize
    //const fileSizeItem = editorStatusBarGroup.createStatusBarItem(`file-size`)
    const fileSizeItem = statusBar.createStatusBarItem({id: `file-size`, alignment: StatusBarAlignment.Right, priority: 95})
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
      editableItem.text = editable.value
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