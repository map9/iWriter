import { computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { pathUtils } from '@/utils/pathUtils'
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
  const { t } = useI18n()
  const statusBar = useStatusBar()
  const appStore = useAppStore()
  const { isEditable, getIconByExtension } = useDocumentTypeDetector()

  setTablerIcon('sum', IconSum)

  const position = computed((): string => {
    const stats = appStore.activeTab?.docState?.fileStats

    if (stats) {
      return t('statusBar.fileStats.positionFormat', {
        line: stats.currentLine,
        col: stats.currentColumn,
        type: stats.paragraphType.toUpperCase()
      })
    } else {
      return ''
    }
  })

  const statsVisible = computed((): boolean => {
    const stats = appStore.activeTab?.docState?.fileStats
    return !!stats
  })

  const statsTooltip = computed((): string => {
    const stats = appStore.activeTab?.docState?.fileStats

    let result = ''
    if (stats) {
      if (stats.selectionCharCount > 0) {
        result = `**${t('statusBar.fileStats.statsSelection')}**<br>- **${stats.selectionCharCount}** ${t('statusBar.fileStats.statsCharacters')}<br>- **${stats.selectionWordCount}** ${t('statusBar.fileStats.statsWords')}\n\n`
      }
      return result + `**${t('statusBar.fileStats.statsDocument')}**<br>- **${stats.totalCharCount}** ${t('statusBar.fileStats.statsCharacters')}<br>- **${stats.totalWordCount}** ${t('statusBar.fileStats.statsWords')}<br>- **${stats.totalParagraphCount}** ${t('statusBar.fileStats.statsParagraphs')}`
    } else {
      return ''
    }
  })

  const lineEnding = computed((): string => {
    if (appStore.activeTab?.documentType !== DocumentType.MARKDOWN_EDITOR) {
      return ''
    }
    const lineEnding = appStore.activeTab?.docState?.editState?.lineEnding
    return lineEnding ? lineEnding : ''
  })

  const autoSaveText = computed((): string => {
    const docType = appStore.activeTab?.documentType
    if (docType && isEditable(docType)) {
      return appStore.autoSave ? t('statusBar.fileStats.autoSave') : ''
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
      return t('statusBar.fileStats.viewer')
    }

    if (tab?.fileReadonly) {
      return t('statusBar.fileStats.fileReadonly')
    }

    if (tab?.editReadonly) {
      return t('statusBar.fileStats.readonlyMode')
    }

    return t('statusBar.fileStats.editable')
  })

  const editableTooltip = computed((): string => {
    const tab = appStore.activeTab
    const docType = tab?.documentType

    if (!docType) {
      return ''
    }

    if (!isEditable(docType)) {
      return t('statusBar.fileStats.viewerTooltip')
    }

    if (tab?.fileReadonly) {
      return t('statusBar.fileStats.fileReadonlyTooltip')
    }

    if (tab?.editReadonly) {
      return t('statusBar.fileStats.readonlyModeTooltip')
    }

    return t('statusBar.fileStats.editableTooltip')
  })

  const fileType = computed((): string => {
    const docType = appStore.activeTab?.documentType
    const filepath = appStore.activeTab?.path

    if (docType && filepath) {
      return pathUtils.extension(filepath).toLowerCase()
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
    positionItem.tooltip = t('statusBar.fileStats.positionTooltip')
    positionItem.show()

    // lineEnding
    //const lineEndingItem = editorStatusBarGroup.createStatusBarItem(`line-ending`)
    const lineEndingItem = statusBar.createStatusBarItem({id: `line-ending`, alignment: StatusBarAlignment.Right, priority: 99})
    lineEndingItem.text = lineEnding.value
    lineEndingItem.tooltip = t('statusBar.fileStats.lineEndingTooltip')
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
    autoSaveItem.tooltip = t('statusBar.fileStats.autoSaveTooltip')
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
    fileTypeItem.tooltip = t('statusBar.fileStats.fileTypeTooltip', { ext: appStore.activeTab?.documentType ?? '' })
    fileTypeItem.show()

    // fileSize
    //const fileSizeItem = editorStatusBarGroup.createStatusBarItem(`file-size`)
    const fileSizeItem = statusBar.createStatusBarItem({id: `file-size`, alignment: StatusBarAlignment.Right, priority: 94})
    fileSizeItem.text = fileSize.value
    fileSizeItem.tooltip = t('statusBar.fileStats.fileSizeTooltip')
    fileSizeItem.show()

    watchEffect(() => {
      positionItem.text = position.value
      positionItem.tooltip = t('statusBar.fileStats.positionTooltip')
      statsItem.visible = statsVisible.value
      statsItem.tooltip = {
        type: 'markdown',
        content: statsTooltip.value
      }
      lineEndingItem.text = lineEnding.value
      lineEndingItem.tooltip = t('statusBar.fileStats.lineEndingTooltip')
      autoSaveItem.text = autoSaveText.value
      autoSaveItem.tooltip = t('statusBar.fileStats.autoSaveTooltip')
      editableItem.text = editable.value
      editableItem.tooltip = editableTooltip.value
      editableItem.command = appStore.activeTab?.documentType && isEditable(appStore.activeTab.documentType) ? 'toggleReadonlyMode' : undefined
      if (fileType.value.length > 0) {
        const icon = getIconByExtension(fileType.value)
        const extension = fileType.value.toUpperCase()
        setTablerIcon(extension, icon)
        fileTypeItem.text = `$(${extension}) ${extension}`
        fileTypeItem.tooltip = t('statusBar.fileStats.fileTypeTooltip', { ext: extension })
      } else {
        fileTypeItem.text = fileType.value
      }
      fileSizeItem.text = fileSize.value
      fileSizeItem.tooltip = t('statusBar.fileStats.fileSizeTooltip')
    })

  } catch (error) {
    console.error(`${error instanceof Error ? error.message : String(error)}`)
  }
}
