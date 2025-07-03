import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { FileTab, FileTreeItem, FileOperationResult, ConflictAction } from '@/types'
import { SidebarMode, ErrorType, ErrorSeverity, DocumentType } from '@/types'
import { useFileWatcher } from '@/utils/FileWatcher'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import { notify } from '@/utils/notifications'

export const useAppStore = defineStore('app', () => {
  // 文件监听和类型检测
  const { watchFolder, stopWatching, stopAllWatchers } = useFileWatcher()
  const { detectFromPath } = useDocumentTypeDetector()
  
  // UI State
  const showLeftSidebar = ref(true)
  const showRightSidebar = ref(false)
  const showStatusbar = ref(true)  
  const leftSidebarMode = ref<SidebarMode>(SidebarMode.START)
  const leftSidebarWidth = ref(288) // 默认宽度
  const minSidebarWidth = 256 // 最小宽度 - 对应TOC按钮右边缘
  const autoSave = ref(true)
  
  // Folder and Files
  const currentFolder = ref<string | null>(null)
  const fileTree = ref<FileTreeItem[]>([])
  const selectedItem = ref<FileTreeItem | null>(null)
  
  // Tabs
  const tabs = ref<FileTab[]>([])
  const activeTabId = ref<string | null>(null)
  const untitledCounter = ref(1)
  
  // Search
  const searchQuery = ref('')
  const searchResults = ref<any[]>([])
  
  // Computed
  const activeTab = computed(() => {
    return tabs.value.find(tab => tab.id === activeTabId.value)
  })
  
  const hasOpenFolder = computed(() => {
    return currentFolder.value !== null
  })
  
  // 使用高效的文件监听代替定时器
  const isFileWatchingEnabled = ref(true)

  // Update menu when showLeftSidebar state changes
  watch(() => showLeftSidebar.value, (status) => {
    const leftSidebar = !!status
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        type: 'tiptap-editor',
        view: {
          leftSidebar: leftSidebar,
          rightSidebar: showRightSidebar.value,
          statusbar: showStatusbar.value,
        },
      })
    }
  }, { immediate: true })

  // Update menu when showRightSidebar state changes
  watch(() => showRightSidebar.value, (status) => {
    const rightSidebar = !!status
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        type: 'tiptap-editor',
        view: {
          leftSidebar: showLeftSidebar.value,
          rightSidebar: rightSidebar,
          statusbar: showStatusbar.value,
        },
      })
    }
  }, { immediate: true })

  // Update menu when showRightSidebar state changes
  watch(() => showStatusbar.value, (status) => {
    const statusbar = !!status
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        type: 'tiptap-editor',
        view: {
          leftSidebar: showLeftSidebar.value,
          rightSidebar: showRightSidebar.value,
          statusbar: statusbar,
        },
      })
    }
  }, { immediate: true })

  // Update menu when tabs change
  watch(() => tabs.value.length, (newLength) => {
    const hasActiveDocument = newLength > 0
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        type: 'tiptap-editor',
        hasActiveDocument: hasActiveDocument,
      })
    }
  })
  
  // Update menu when active tab changes
  watch(() => activeTab.value, (newTab) => {
    // Update window title when active tab changes
    updateWindowTitle()

    const hasActiveDocument = !!newTab
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        type: 'tiptap-editor',
        hasActiveDocument: hasActiveDocument,
      })
    }
  }, { immediate: true })
  
  // Update menu when folder state changes
  watch(() => currentFolder.value, (newFolder) => {
    // Update window title when folder state changes
    updateWindowTitle()

    const hasFolderOpen = !!newFolder
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        type: 'tiptap-editor',
        hasFolderOpen: hasFolderOpen,
      })
    }
  }, { immediate: true })

  // Actions
  function toggleLeftSidebar() {
    showLeftSidebar.value = !showLeftSidebar.value
  }
  
  // Update window title based on current state
  function updateWindowTitle() {
    if (!window.electronAPI?.updateWindowTitle) return
    
    let title = 'iWriter'
    
    // Check current state and generate appropriate title
    if (currentFolder.value && activeTab.value) {
      // File opened with folder open: "文件名 - folder名"
      const folderName = currentFolder.value.split('/').pop() || 'Folder'
      title = `${activeTab.value.name} - ${folderName}`
    } else if (activeTab.value) {
      // File opened without folder: "文件名"
      title = activeTab.value.name
    } else if (currentFolder.value) {
      // Only folder opened: "folder名"
      const folderName = currentFolder.value.split('/').pop() || 'Folder'
      title = folderName
    }
    
    window.electronAPI.updateWindowTitle(title).catch(error => {
      console.error('Failed to update window title:', error)
    })
  }
  
  function toggleRightSidebar() {
    showRightSidebar.value = !showRightSidebar.value
  }

  function toggleStatusbar() {
    showStatusbar.value = !showStatusbar.value
  }

  function setLeftSidebarMode(mode: SidebarMode) {
    if (hasOpenFolder.value === false) {
      leftSidebarMode.value = SidebarMode.START
    } else { 
      leftSidebarMode.value = mode
    }
    showLeftSidebar.value = true
  }
  
  function setLeftSidebarWidth(width: number) {
    if (width < minSidebarWidth) {
      // 如果宽度小于最小值，自动隐藏sidebar
      showLeftSidebar.value = false
    } else {
      leftSidebarWidth.value = width
      showLeftSidebar.value = true
    }
  }
  
  function toggleAutoSave() {
    autoSave.value = !autoSave.value
    if (window.electronAPI?.setAutoSave) {
      window.electronAPI.setAutoSave(autoSave.value)
    }
  }

  async function openFile(filePath: string) {
    if (!window.electronAPI) return
    
    // Check if file is already open
    const existingTab = tabs.value.find(tab => tab.path === filePath)
    if (existingTab) {
      setActiveTab(existingTab.id)
      return
    }
    
    const content = await window.electronAPI.readFile(filePath)
    if (content !== null) {
      const fileName = filePath.split('/').pop() || 'Untitled'
      const documentType = detectFromPath(filePath)
      createNewTab(fileName, filePath, content, documentType)
    }
  }

  async function openFolder() {
    if (!window.electronAPI) return
    
    const folderPath = await window.electronAPI.openFolder()
    if (folderPath) {
      currentFolder.value = folderPath
      leftSidebarMode.value = SidebarMode.EXPLORER
      await loadFileTree()
      startAdvancedFileWatching() // Start advanced file watching
      
      // 成功通知
      const folderName = folderPath.split('/').pop() || 'folder'
      notify.success(`已成功打开文件夹：${folderName}`, '文件夹操作')
    }
  }
  
  function closeFolder() {
    stopAdvancedFileWatching() // Stop file watching when folder is closed
    currentFolder.value = null
    fileTree.value = []
    selectedItem.value = null
    leftSidebarMode.value = SidebarMode.START
    
    // Close all tabs since no folder is open
    tabs.value.forEach(tab => {
      closeTab(tab.id)
    })
  }

  async function loadFileTree() {
    if (!currentFolder.value || !window.electronAPI) return
    
    try {
      const files = await window.electronAPI.getFiles(currentFolder.value)
      fileTree.value = files.map(file => ({
        name: file.name,
        path: file.path,
        isDirectory: file.isDirectory,
        children: file.isDirectory ? [] : undefined,
        isOpen: false,
        childCount: file.childCount || 0
      }))
    } catch (error) {
      notify.error(`无法加载文件树: ${error instanceof Error ? error.message : String(error)}`, '文件系统错误')
    }
  }

  function selectItem(item: FileTreeItem) {
    selectedItem.value = item
  }
  
  // Helper function to update childCount for a specific directory
  function updateDirectoryChildCount(dirPath: string) {
    const updateChildCountRecursive = (items: FileTreeItem[]): boolean => {
      for (const item of items) {
        if (item.path === dirPath && item.isDirectory) {
          // Update childCount by re-reading directory
          window.electronAPI?.getFiles(dirPath).then(files => {
            item.childCount = files.length
          }).catch(error => {
            notify.warning(`更新目录文件数失败: ${error instanceof Error ? error.message : String(error)}`, '文件系统')
          })
          return true
        }
        if (item.children && updateChildCountRecursive(item.children)) {
          return true
        }
      }
      return false
    }
    
    updateChildCountRecursive(fileTree.value)
  }

  async function openFileDialog() {
    if (!window.electronAPI) return
    
    const filePath = await window.electronAPI.openFile()
    if (filePath) {
      await openFile(filePath)
    }
  }
  
  // File operations
  async function createNewFile(parentPath: string, fileName: string) {
    if (!window.electronAPI) return null
    
    try {
      const filePath = await window.electronAPI.createFile(parentPath, fileName)
      await loadFileTree() // Refresh the tree
      updateDirectoryChildCount(parentPath) // Update parent directory count
      notify.success(`文件创建成功: ${fileName}`, '文件操作')
      return filePath
    } catch (error) {
      notify.error(`无法创建文件: ${error instanceof Error ? error.message : String(error)}`, '文件系统错误')
      throw error
    }
  }
  
  async function createNewFolder(parentPath: string, folderName: string) {
    if (!window.electronAPI) return null
    
    try {
      const folderPath = await window.electronAPI.createFolder(parentPath, folderName)
      await loadFileTree() // Refresh the tree
      updateDirectoryChildCount(parentPath) // Update parent directory count
      notify.success(`文件夹创建成功: ${folderName}`, '文件操作')
      return folderPath
    } catch (error) {
      notify.error(`无法创建文件夹: ${error instanceof Error ? error.message : String(error)}`, '文件系统错误')
      throw error
    }
  }
  
  async function deleteFileOrFolder(filePath: string) {
    if (!window.electronAPI) return false
    
    try {
      await window.electronAPI.deleteFile(filePath)
      
      // Close tabs for deleted files (including files inside deleted folders)
      const tabsToClose = tabs.value.filter(tab => {
        return tab.path && (tab.path === filePath || tab.path.startsWith(filePath + '/'))
      })
      
      tabsToClose.forEach(tab => {
        closeTab(tab.id)
      })
      
      // Update parent directory count
      const parentPath = filePath.substring(0, filePath.lastIndexOf('/'))
      if (parentPath) {
        updateDirectoryChildCount(parentPath)
      }
      
      await loadFileTree() // Refresh the tree
      return true
    } catch (error) {
      notify.error(`无法删除文件或文件夹: ${error instanceof Error ? error.message : String(error)}`, '文件系统错误')
      throw error
    }
  }
  
  async function renameFileOrFolder(oldPath: string, newName: string) {
    if (!window.electronAPI) return null
    
    try {
      const newPath = await window.electronAPI.renameFile(oldPath, newName)
      
      // Update tab if the renamed file was open
      const openTab = tabs.value.find(tab => tab.path === oldPath)
      if (openTab) {
        openTab.path = newPath
        // Extract filename from newPath instead of using newName directly
        const fileName = newPath.split('/').pop() || newName
        openTab.name = fileName
      }
      
      await loadFileTree() // Refresh the tree
      return newPath
    } catch (error) {
      notify.error(`无法重命名文件或文件夹: ${error instanceof Error ? error.message : String(error)}`, '文件系统错误')
      throw error
    }
  }
  
  async function moveFileOrFolder(sourcePath: string, targetDir: string, conflictAction?: ConflictAction): Promise<FileOperationResult | null> {
    if (!window.electronAPI) return null
    
    
    try {
      const result = await window.electronAPI.moveFile(sourcePath, targetDir, conflictAction)
      
      if (result.conflict) {
        // Return conflict info for UI to handle
        return result
      }
      
      if (result.success && result.newPath) {
        // Update tab if the moved file was open
        const openTab = tabs.value.find(tab => tab.path === sourcePath)
        if (openTab) {
          openTab.path = result.newPath
        }
        
        // Update child counts for both source and target directories
        const sourceParentPath = sourcePath.substring(0, sourcePath.lastIndexOf('/'))
        const targetParentPath = result.newPath.substring(0, result.newPath.lastIndexOf('/'))
        
        if (sourceParentPath && sourceParentPath !== targetParentPath) {
          updateDirectoryChildCount(sourceParentPath) // Update source directory
        }
        if (targetParentPath) {
          updateDirectoryChildCount(targetParentPath) // Update target directory
        }
        
        await loadFileTree() // Refresh the tree
        return result
      }
      
      return result
    } catch (error) {
      notify.error(`无法移动文件或文件夹: ${error instanceof Error ? error.message : String(error)}`, '文件系统错误')
      throw error
    }
  }

  // 启动高级文件监听
  async function startAdvancedFileWatching() {
    if (!currentFolder.value || !window.electronAPI) return
    
    try {
      // 启动原生文件监听
      const result = await window.electronAPI.startFileWatching(currentFolder.value)
      if (result.success) {
        console.log('Advanced file watching started for:', currentFolder.value)
        
        // 监听文件变化事件
        window.electronAPI.onFileChange?.((change) => {
          handleFileChange(change)
        })
        
        // 监听错误事件
        window.electronAPI.onFileWatchError?.((error) => {
          notify.warning(`文件监听错误: ${error.message}`, '文件监听')
        })
      }
    } catch (error) {
      notify.error(`无法启动文件监听: ${error instanceof Error ? error.message : String(error)}`, '文件监听')
    }
  }
  
  // 停止高级文件监听
  async function stopAdvancedFileWatching() {
    if (!currentFolder.value || !window.electronAPI) return
    
    try {
      await window.electronAPI.stopFileWatching(currentFolder.value)
      window.electronAPI.removeFileChangeListeners?.()
      console.log('Advanced file watching stopped')
    } catch (error) {
      notify.error(`无法停止文件监听: ${error instanceof Error ? error.message : String(error)}`, '文件监听')
    }
  }
  
  // 处理文件变化
  function handleFileChange(change: any) {
    console.log('File change detected:', change)
    
    // 根据变化类型更新文件树
    switch (change.type) {
      case 'add':
      case 'addDir':
      case 'unlink':
      case 'unlinkDir':
        // 文件/文件夹添加或删除，重新加载文件树
        loadFileTree()
        break
      case 'change':
        // 文件内容变化，可以选择性更新
        break
    }
  }
  
  function createNewTab(name?: string, path?: string, content: string = '', documentType?: DocumentType) {
    const id = Date.now().toString()
    
    // Generate untitled name if not provided
    let tabName = name
    if (!tabName) {
      const formattedNumber = untitledCounter.value.toString().padStart(2, '0')
      tabName = `Untitled-${formattedNumber}.iwt`
      
      // Increment counter and cycle back to 01 after 99
      untitledCounter.value = untitledCounter.value >= 99 ? 1 : untitledCounter.value + 1
    }
    
    const newTab: FileTab = {
      id,
      name: tabName,
      path,
      content,
      isDirty: false,
      isActive: true,
      documentType: documentType || (path ? detectFromPath(path) : DocumentType.TEXT_EDITOR)
    }
    
    // Deactivate all other tabs
    tabs.value.forEach(tab => {
      tab.isActive = false
    })
    
    tabs.value.push(newTab)
    activeTabId.value = id
    
    return newTab
  }
  
  async function closeTab(tabId: string): Promise<boolean> {
    const index = tabs.value.findIndex(tab => tab.id === tabId)
    if (index === -1) return false
    
    const tab = tabs.value[index]
    
    // Check if tab has unsaved changes
    if (tab.isDirty) {
      if (!window.electronAPI?.showSaveDialog) {
        console.warn('showSaveDialog not available')
        return false
      }
      
      const result = await window.electronAPI.showSaveDialog(tab.name)
      
      switch (result) {
        case 'save':
          // Save the file first
          if (await saveTab(tab) === false) {
            return false // If save failed, don't close the tab
          }
          break
        case 'cancel':
          // User cancelled, don't close the tab
          return false
        case 'dontSave':
          // User chose not to save, continue closing
          break
        default:
          return false
      }
    }
    
    // Remove the tab
    tabs.value.splice(index, 1)
    
    // If closing active tab, activate another tab
    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const newActiveIndex = Math.min(index, tabs.value.length - 1)
        activeTabId.value = tabs.value[newActiveIndex].id
        tabs.value[newActiveIndex].isActive = true
      } else {
        activeTabId.value = null
      }
    }
    
    return true
  }
  
  function setActiveTab(tabId: string) {
    tabs.value.forEach(tab => {
      tab.isActive = tab.id === tabId
    })
    activeTabId.value = tabId
  }
  
  function updateTabContent(tabId: string, content: string) {
    const tab = tabs.value.find(tab => tab.id === tabId)
    if (tab) {
      tab.content = content
      tab.isDirty = true
    }
  }
  
  async function saveTab(tab: FileTab, saveAs: boolean = false): Promise<boolean> {
    if (!tab || !window.electronAPI) return false
    
    const originalPath = tab.path
    const savedPath = await window.electronAPI.saveFile(
      tab.content,
      saveAs ? undefined : tab.path // If saveAs is true, use the current path, otherwise prompt for a new path
    )
    
    if (savedPath) {
      tab.path = savedPath
      tab.isDirty = false
      // Always update tab name to match the saved file name
      const fileName = savedPath.split('/').pop() || 'Untitled'
      tab.name = fileName
      
      // Refresh file tree if this was a new file or saved to a different location
      if (!originalPath || savedPath !== originalPath) {
        await loadFileTree()
      }
      
      // 成功通知
      notify.success(`文件已保存：${fileName}`, '文件操作')
    }

    return !!savedPath
  }

  async function saveActiveTab() {
    if (!activeTab.value || !window.electronAPI) return
    
    saveTab(activeTab.value)
  }

  async function saveActiveTabAs() {
    if (!activeTab.value || !window.electronAPI) return
    
    saveTab(activeTab.value, true)
  }
  
  // 或者使用 Promise.all（但要处理对话框冲突）
  async function saveAllTabs() {
    const dirtyTabs = tabs.value.filter(tab => tab.isDirty)

    // 分别处理有路径和无路径的文件
    const tabsWithPath = dirtyTabs.filter(tab => tab.path)
    const tabsWithoutPath = dirtyTabs.filter(tab => !tab.path)

    // 先保存有路径的文件（不需要对话框）
    await Promise.all(tabsWithPath.map(tab => saveTab(tab)))

    // 然后顺序保存无路径的文件（需要对话框）
    for (const tab of tabsWithoutPath) {
      await saveTab(tab)
    }
  }

  // Handle menu actions for the application
  // There are Paragraph / Format Menu Actions handled in MarkdownEditor.vue
  async function handleMenuAction(action: string): Promise<boolean> {
    switch (action) {
      case 'new-file':
        createNewTab(undefined, undefined, '', DocumentType.TEXT_EDITOR)
        return true
      case 'new-from-template':
        console.error('New from template action is not implemented yet')
        return true
      case 'open-file':
        await openFileDialog()
        return true
      case 'open-folder':
        await openFolder()
        return true
      case 'save':
        await saveActiveTab()
        return true
      case 'save-as':
        await saveActiveTabAs()
        return true
      case 'toggle-auto-save':
        toggleAutoSave()
        return true
      case 'save-all':
        await saveAllTabs()
        return true
      case 'page-setting':
        console.error('page-setting action is not implemented yet')
        return true
      case 'print':
        console.error('print action is not implemented yet')
        return true
      case 'close-file':
        if (activeTabId.value) {
          await closeTab(activeTabId.value)
        }
        return true
      case 'close-folder':
        closeFolder()
        return true

      case 'view-toggle-left-sidebar':
        toggleLeftSidebar()
        return true
      case 'view-toggle-right-sidebar':
        toggleRightSidebar()
        return true
      case 'view-toggle-statusbar':
        toggleStatusbar()
        return true
      case 'view-explorer':
      case 'view-search':
      case 'view-tag':
      case 'view-toc':
        const mode = action.replace('view-', '') as keyof typeof SidebarMode
        setLeftSidebarMode(SidebarMode[mode.toUpperCase() as keyof typeof SidebarMode])
        return true
      
      default:
        console.log('Unhandled menu action in app:', action)
        return false
    }

    return false
  }
  
  return {
    // State
    showLeftSidebar,
    showRightSidebar,
    showStatusbar,
    leftSidebarMode,
    leftSidebarWidth,
    minSidebarWidth,
    autoSave,
    currentFolder,
    fileTree,
    selectedItem,
    tabs,
    activeTabId,
    searchQuery,
    searchResults,
    
    // Computed
    activeTab,
    hasOpenFolder,
    
    // Actions
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleStatusbar,
    setLeftSidebarMode,
    setLeftSidebarWidth,
    toggleAutoSave,
    updateWindowTitle,

    // File operations
    openFile,
    openFolder,
    closeFolder,
    loadFileTree,
    selectItem,
    updateDirectoryChildCount,
    openFileDialog,
    createNewFile,
    createNewFolder,
    deleteFileOrFolder,
    renameFileOrFolder,
    moveFileOrFolder,
    startAdvancedFileWatching,
    stopAdvancedFileWatching,

    // Tab operations
    createNewTab,
    closeTab,
    saveTab,
    setActiveTab,
    updateTabContent,
    saveActiveTab,
    saveActiveTabAs,
    saveAllTabs,

    // Menu actions
    handleMenuAction,
  }
})