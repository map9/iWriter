import { merge } from 'lodash'
import { defineStore } from 'pinia'
import { ref, computed, watch, reactive } from 'vue'
import { undoDepth } from '@tiptap/pm/history'
import type { FileTab, FileOperationResult, FileChange, EditSetting } from '@/types'
import { SidebarMode, DocumentType } from '@/types'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import { pathUtils } from '@/utils/pathUtils'
import { notify } from '@/utils/notifications'
import type { FileTreeNode, FileTreeSortType } from '@/components/common/tree'
import { availableThemes, getThemeById, applyThemeColors, type Theme, applySystemColors, type ThemeColors } from '@/utils/themes'
import updaterService from '@/updater/UpdaterService'
import {
  TEXT_MD_EXTENSIONS,
  TEXT_TXT_EXTENSIONS,
  TEXT_IWT_EXTENSIONS,
  TEXT_EXTENSIONS,
  IMAGE_EXTENSIONS,
  PDF_EXTENSIONS,
} from '@/types'
import { convertContentTo } from '@/import-export/'

export const useAppStore = defineStore('app', () => {
  // 文件监听和类型检测
  const { detectFromPath } = useDocumentTypeDetector()
  
  // UI State
  const isLeftSidebarVisible = ref(true)
  const isRightSidebarVisible = ref(false)
  const isStatusbarVisible = ref(true)  
  const leftSidebarMode = ref<SidebarMode>(SidebarMode.START)
  const leftSidebarWidth = ref(288) // 默认宽度
  const minSidebarWidth = 256 // 最小宽度 - 对应TOC按钮右边缘
  const globalEditSetting = reactive<EditSetting>({
    autoSave: true,
    lineEnding: 'LF',
    invisibleCharacters: true,
    firstLineIndent: true,
    smartPunctuation: true,
    showProofreadErrors: true,
    proofread: true
  })

  // Heart beat
  let sayHelloTimeout: ReturnType<typeof setTimeout> | null = null
  const SAY_HELLO_TIMEOUT = 1000

  // Theme System
  const currentThemeId = ref<string>('system')
  const systemPrefersDark = ref(false)
  
  // Folder and Files
  const currentFolder = ref<string | null>(null)
  const fileTree = ref<FileTreeNode | null>(null)
  const selectedItem = ref<FileTreeNode | null>(null)
  const currentFileTreeSortType = ref<FileTreeSortType>('type-asc')
  const filetreeUntitledCounter = ref<Map<string, number>>(new Map<string, number>)

  // Tabs
  const tabs = ref<FileTab[]>([])
  const activeTabId = ref<string | null>(null)
  const untitledCounter = ref(1)
  
  // Computed
  const activeTab = computed(() => {
    return tabs.value.find(tab => tab.id === activeTabId.value)
  })
  
  const hasOpenFolder = computed(() => {
    return currentFolder.value !== null
  })
  
  // Update menu when theme changes
  watch(() => currentThemeId.value, (themeId) => {
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        view: {
          theme: themeId,
        },
      })
    }
    //applyCurrentTheme()
  }, { immediate: true })

  // Update menu when tabs change
  watch(() => tabs.value.length, (newLength) => {
    const hasActiveDocument = newLength > 0
    if (window.electronAPI?.windowContentChange) {
      window.electronAPI.windowContentChange({
        hasActiveDocument: hasActiveDocument,
        autoSave: globalEditSetting.autoSave,
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
        hasActiveDocument: hasActiveDocument,
        autoSave: globalEditSetting.autoSave,
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
        hasFolderOpen: hasFolderOpen,
      })
    }
  }, { immediate: true })

  // Initial
  function initial() {
    initTheme();

    function startSayHello(windowId: number) {
      sayHelloTimeout = setTimeout(() => {
        window.electronAPI.hello(windowId);
        //console.debug(`window ${windowId} say hello.`)
        startSayHello(windowId)
      }, SAY_HELLO_TIMEOUT)
    }

    // Detect system theme preference
    if (window.electronAPI) {
      window.electronAPI.onWindowId(async (windowId: number)=>{
        startSayHello(windowId)
      })

      window.electronAPI.onRequestWindowClose(async (windowId: number)=>{
        let resultClosed: boolean = false

        try {
          if (currentFolder.value) {
            resultClosed = await closeFolder()
          } else {
            resultClosed = await closeAllTab();
          }

          console.log({
            function: 'onRequestWindowClose',
            wID: windowId,
            isClosing: resultClosed,
          })
          window.electronAPI.windowCloseConfirm(windowId, resultClosed);
        } catch(error) {
          console.error(`窗口${windowId}任务失败:`, error);
          // 提示用户后决定是否强制退出​
          const result = await window.electronAPI.showMessageBox({
            message: 'Failed to close the window. Do you want to continue?',
            type: 'question',
            buttons: ['Close', 'Cancel'],
            defaultId: 0,
            title: 'Close Window',
            detail: 'Some opened files and configuration settings could not be properly closed or saved during the process.',
            cancelId: 1
          })
      
          if (result.response === 0) {
            window.electronAPI.windowCloseConfirm(windowId, true);
          } else {
            window.electronAPI.windowCloseConfirm(windowId, false);
          }
        }
      })
    }
  }

  // Destroy
  function destroy() {
    // Clean up file watching
    stopAdvancedFileWatching()
    if (sayHelloTimeout) {
      clearTimeout(sayHelloTimeout)
      sayHelloTimeout = null
    }
    if (window.electronAPI) {
      window.electronAPI.removeMenuActionListener()
      window.electronAPI.removeFileChangeListeners()
      window.electronAPI.removeSystemColorsChangedListeners()
      window.electronAPI.removeWindowStateChangedListeners()
      window.electronAPI.removeRequestWindowCloseListeners()
      window.electronAPI.removeWindowIdListeners()
    }
  }

  // Actions
  function showLeftSidebar(show: boolean = true) {
    if (isLeftSidebarVisible.value === show) return
    isLeftSidebarVisible.value = show
    window.electronAPI?.windowContentChange?.({
      view: {
        leftSidebar: isLeftSidebarVisible.value,
      },
    })
  }

  function toggleLeftSidebar() {
    showLeftSidebar(!isLeftSidebarVisible.value)
  }
  
  function showRightSidebar(show: boolean = true) {
    if (isLeftSidebarVisible.value === show) return
    isLeftSidebarVisible.value = show
    window.electronAPI?.windowContentChange?.({
      view: {
        rightSidebar: isRightSidebarVisible.value,
      },
    })
  }

  function toggleRightSidebar() {
    showRightSidebar(!isRightSidebarVisible.value)
  }

  function showStatusbar(show: boolean = true) {
    if (isLeftSidebarVisible.value === show) return
    isLeftSidebarVisible.value = show
    window.electronAPI?.windowContentChange?.({
      view: {
        statusbar: isStatusbarVisible.value,
      },
    })
  }

  function setLeftSidebarMode(mode: SidebarMode) {
    if (
      (mode === SidebarMode.TOC && tabs.value.length === 0) ||
      (mode !== SidebarMode.TOC && hasOpenFolder.value === false)
    ) {
      leftSidebarMode.value = SidebarMode.START
    } else { 
      leftSidebarMode.value = mode
    }
    showLeftSidebar(true)
  }
  
  function setLeftSidebarWidth(width: number) {
    if (width < minSidebarWidth) {
      // 如果宽度小于最小值，自动隐藏sidebar
      showLeftSidebar(false)
    } else {
      leftSidebarWidth.value = width
      showLeftSidebar(true)
    }
  }
  
  function toggleStatusbar() {
    showStatusbar(!isStatusbarVisible.value)
  }

  // Update window title based on current state
  function updateWindowTitle() {
    if (!window.electronAPI?.updateWindowTitle) return
    
    let title = 'iWriter'
    
    if (currentFolder.value && activeTab.value) {
      const folderName = pathUtils.basename(currentFolder.value)
      title = `${activeTab.value.name} - ${folderName}`
    } else if (activeTab.value) {
      title = activeTab.value.name
    } else if (currentFolder.value) {
      const folderName = pathUtils.basename(currentFolder.value)
      title = folderName
    }
    
    window.electronAPI.updateWindowTitle(title).catch(error => {
      console.error('Failed to update window title:', error)
    })
  }

  function toggleAutoSave() {
    if (!window.electronAPI?.windowContentChange) return

    if (
      activeTab.value && 
      (activeTab.value.documentType === DocumentType.MARKDOWN_EDITOR) &&
      activeTab.value.editState?.autoSave
    ) {
      activeTab.value.editState.autoSave = !activeTab.value.editState.autoSave
      window.electronAPI.windowContentChange({autoSave: activeTab.value.editState.autoSave})
    } else {
      globalEditSetting.autoSave = !globalEditSetting.autoSave
      window.electronAPI.windowContentChange(
        {
          edit: {
            autoSave: globalEditSetting.autoSave
          }
        }
      )
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
    
    const files = await window.electronAPI.getFiles(filePath, true)
    if (!files || files.length === 0 || !files[0] || files[0].isDirectory === true) {
      notify.error(`${filePath}不是文件或不存在`, '文件打开错误')
      return
    }
    
    const documentType = detectFromPath(filePath)
    createTab(pathUtils.basename(filePath), filePath, documentType)
  }

  /* for debug
  function logFileTreeNode(node: FileTreeNode | null) {
    if (!node) {
      console.log('Invalid node provided to logFileTreeNode') 
      return
    }
    
    // 如果是文件，直接返回
    if (node.type === 'file') {
      console.log(`Traversing file: ${node.parent?.label} ${node.type} ${node.path}`)
      return
    }
    
    // 如果是目录，递归遍历子节点
    if (node.children && node.children.length > 0) {
      console.log(`Traversing folder: ${node.parent?.label} ${node.type} ${node.path}`)
      node.children.forEach(child => {
        logFileTreeNode(child as FileTreeNode)
      })
    }
    return
  }
  */

  // File or Folder operations
  async function openFolder() {
    if (!window.electronAPI) return

    const result = await window.electronAPI.showOpenDialog({ properties: ['openDirectory'] })
    if (!result.canceled && result.filePaths.length > 0) {
      const folderPath = result.filePaths[0]!

      if (folderPath === currentFolder.value) {
        notify.success(`${folderPath} 已打开`, '文件操作')
        return
      }

      let resultClosed: boolean = false
      if (currentFolder.value) {
        resultClosed = await closeFolder()
      } else {
        resultClosed = await closeAllTab();
      }
      if (resultClosed === false)
        return

      currentFolder.value = folderPath
      leftSidebarMode.value = SidebarMode.EXPLORER
      await loadFileTree()
      startAdvancedFileWatching() // Start advanced file watching
      
      // 成功通知
      const folderName = pathUtils.basename(folderPath)
      notify.success(`${folderName} 打开成功`, '文件操作')
    }
  }
  
  async function closeFolder(): Promise<boolean> {
    if (currentFolder.value !== null) {
      // Close all tabs since no folder is open
      const result = await closeAllTab();
      
      if (result) {
        stopAdvancedFileWatching() // Stop file watching when folder is closed
        currentFolder.value = null
        fileTree.value = null
        selectedItem.value = null
        leftSidebarMode.value = SidebarMode.START
      }

      return result
    }

    return true
  }

  async function loadFileTree() {
    if (!currentFolder.value || !window.electronAPI) return

    try {
      // 使用 await 等待异步操作完成
      const files = await window.electronAPI.getFiles(currentFolder.value, true)
      if (!files || files.length === 0 || !files[0] || files[0].isDirectory === false) {
        throw(new Error('文件不是目录'))
      }
      const file = files[0]
      fileTree.value = {
        id: generateId(),
        label: file.name,
        path: file.path,
        type: 'folder',
        children: [],
        isExpanded: false,
        isVisible: true,
        isEnabled: true,
        data: {},
        isOpen: false,
        created: file.created,
        modified: file.modified,
      }

      // 使用 await 等待异步操作完成
      fileTree.value.children = await traverseFileTree(currentFolder.value, fileTree.value)
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件树加载错误')
      return []
    }
  }

  async function traverseFileTree(dirPath: string, parent?: FileTreeNode): Promise<FileTreeNode[] | undefined> {
    if (!dirPath || !window.electronAPI) return undefined
    
    try {
      // 使用 await 等待异步操作完成
      const files = await window.electronAPI.getFiles(dirPath)
      if (files && Array.isArray(files)) {
        // 使用 Promise.all 处理所有子目录的异步操作
        const fileTree = await Promise.all(
          files.map(async (file) => {
            const node: FileTreeNode = {
              id: generateId(),
              label: file.name,
              path: file.path,
              type: file.isDirectory ? 'folder' : 'file',
              children: file.isDirectory ? [] : undefined,
              parent: parent,
              isExpanded: file.isDirectory ? false : undefined,
              isVisible: true,
              isEnabled: true,
              data: {},
              isOpen: false,
              created: file?.created,
              modified: file?.modified,
            }

            // 如果是目录，递归读取子内容
            if (file.isDirectory) {
              node.children = await traverseFileTree(file.path, node)
            }
            
            return node
          })
        )
        
        return fileTree
      }      
    } catch (error) {
      throw(error)
    }
  }
  
  function generateId(): string {
    return Math.random().toString(36).substring(2, 11)
  }

  // Generate untitled name with counter
  function generateUntitledName(type: string, parentPath: string): string {
    const key = `${parentPath}/${type}`
    const counter = filetreeUntitledCounter.value.get(key) || 0
    const newCounter = counter + 1
    filetreeUntitledCounter.value.set(key, newCounter)

    const paddedNumber = newCounter.toString().padStart(2, '0')
    
    if (type === 'folder') {
      return `Untitled-${paddedNumber}`
    } else {
      return `Untitled-${paddedNumber}.${type}`
    }
  }

  function sortFileTreeNodes(nodes: FileTreeNode[], sortType: FileTreeSortType) {
    // Sort current level
    nodes.sort((a, b) => {
      switch (sortType) {
        case 'name-asc':
          return a.label.localeCompare(b.label)
        case 'name-desc':
          return b.label.localeCompare(a.label)
        case 'type-asc':
          if (a.type !== b.type) {
            return a.type === 'folder' ? -1 : 1
          }
          return a.label.localeCompare(b.label)
        case 'type-desc':
          if (a.type !== b.type) {
            return a.type === 'file' ? -1 : 1
          }
          return a.label.localeCompare(b.label)
        case 'created-asc':
          return (a.created?.getTime() || 0) - (b.created?.getTime() || 0)
        case 'created-desc':
          return (b.created?.getTime() || 0) - (a.created?.getTime() || 0)
        case 'modified-asc':
          return (a.modified?.getTime() || 0) - (b.modified?.getTime() || 0)
        case 'modified-desc':
          return (b.modified?.getTime() || 0) - (a.modified?.getTime() || 0)
        default:
          return 0
      }
    })

    // Sort children recursively
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        sortFileTreeNodes(node.children as FileTreeNode[], sortType)
      }
    })
  }

  function queryFileTreeNodes(nodes: FileTreeNode[], query: string) {
    // Sort children recursively
    nodes.forEach(node => {
      if (query && query !== '') {
        node.isVisible = node.label.toLowerCase().includes(query)
      } else {
        node.isVisible = true
      }

      if (node.children && node.children.length > 0) {
        queryFileTreeNodes(node.children as FileTreeNode[], query)
      }
    })
  }

  
  function setSelectedItem(node: FileTreeNode | null) {
    selectedItem.value = node
  }

  function updateFileTreeNodePath(node: FileTreeNode, dir: string, filename: string) {
    const sourcePath = node.path
    node.id = generateId()
    node.label = filename
    node.path = `${dir}/${filename}`
    console.debug(`updateFileTreeNodePath: ${sourcePath} -> ${node.path}`)

    if (node.type === 'file') {
      const openTab = tabs.value.find(tab => tab.path === sourcePath)
      if (openTab) {
        openTab.path = node.path
      }
    }
    else if (node.type === 'folder') {
      node?.children?.forEach(child => {
        updateFileTreeNodePath(child as FileTreeNode, `${dir}/${node.label}`, child.label)
      });
    }
  }

  async function openFileDialog() {
    if (!window.electronAPI) return
    
    const result = await window.electronAPI.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Text and Markdown Files', extensions: [...TEXT_EXTENSIONS] },
        { name: 'Image Files', extensions: [...IMAGE_EXTENSIONS] },
        { name: 'PDF Files', extensions: [...PDF_EXTENSIONS] },
        { 
          name: 'All Files',
          extensions: [
            ...TEXT_EXTENSIONS,
            ...IMAGE_EXTENSIONS,
            ...PDF_EXTENSIONS,
          ]
        }
      ]
    })
    if (!result.canceled && result.filePaths.length > 0) {
      return openFile(result.filePaths[0]!)
    }
  }
  
  // Create a new file
  async function createFile(parentNode: FileTreeNode, customName?: string): Promise<FileTreeNode | null> {
    if (!window.electronAPI) return null

    try {
      if (parentNode.type !== 'folder') {
        throw new Error('Invalid parent directory')
      }

      const fileName = customName || generateUntitledName('txt', parentNode.path)
      const filePath = await window.electronAPI.createFile(parentNode.path, fileName)
      if (filePath) {
        const date = new Date()

        const newNode: FileTreeNode = {
          id: generateId(),
          label: pathUtils.basename(filePath),
          path: filePath,
          type: 'file',
          parent: parentNode,
          isVisible: true,
          isEnabled: true,
          data: {},
          size: 0,
          created: date,
          modified: date,
        }

        if (!parentNode.children) {
          parentNode.children = []
        }
        parentNode.children.push(newNode)
        //sortFileTreeNodes(parentNode.children as FileTreeNode[], currentFileTreeSortType.value)
        setSelectedItem(newNode)
        notify.success(`${fileName} 创建成功`, '文件操作')

        return newNode
      }

      return null;
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件创建错误')
      return null
    }
  }
  
  // Create a new folder
  async function createFolder(parentNode: FileTreeNode, customName?: string): Promise<FileTreeNode | null> {
    if (!window.electronAPI) return null

    try {
      if (parentNode.type !== 'folder') {
        throw new Error('Invalid parent directory')
      }

      const folderName = customName || generateUntitledName('folder', parentNode.path)
      const folderPath = await window.electronAPI.createFolder(parentNode.path, folderName)
      if (folderPath) {
        const date = new Date()

        const newNode: FileTreeNode = {
          id: generateId(),
          label: pathUtils.basename(folderPath),
          path: folderPath,
          type: 'folder',
          parent: parentNode,
          children: [],
          isVisible: true,
          isEnabled: true,
          data: {},
          created: date,
          modified: date,
        }

        if (!parentNode.children) {
          parentNode.children = []
        }

        parentNode.children.push(newNode)
        //sortFileTreeNodes(parentNode.children as FileTreeNode[], currentFileTreeSortType.value)
        setSelectedItem(newNode)
        notify.success(`${folderName} 创建成功`, '文件操作')
        
        return newNode
      }

      return null;
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件夹创建错误')
      return null
    }
  }

    // Create a file or folder by input node parameters
  async function CreateFileOrFolder(parentNode: FileTreeNode, childNode: FileTreeNode): Promise<boolean> {
    if (!window.electronAPI) return false
    const date = new Date()

    try {
      if (childNode.type === 'file') {
        const filePath = await window.electronAPI.createFile(parentNode.path, childNode.label)
        if (filePath) {
          childNode.label = pathUtils.basename(filePath)
          childNode.path = filePath
          childNode.data = {}
          childNode.created = date
          childNode.modified = date
          notify.success(`${filePath} 创建成功`, '文件操作')
        }
      } else if (childNode.type === 'folder') {
        const folderPath = await window.electronAPI.createFolder(parentNode.path, childNode.label)
        if (folderPath) {
          childNode.label = pathUtils.basename(folderPath)
          childNode.path = folderPath
          childNode.data = {}
          childNode.created = date
          childNode.modified = date
          notify.success(`${folderPath} 创建成功`, '文件操作')
        }
      }
      
      return true
    } catch (error) {
      if (childNode.type === 'file') {
        notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件创建错误')
      } else if (childNode.type === 'folder') {
        notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件夹创建错误')
      }
      return false
    }

  }

  // Delete a file or folder
  async function deleteFileOrFolder(node: FileTreeNode): Promise<boolean> {
    if (!window.electronAPI) return false

    try {
      const result = await window.electronAPI.deleteFile(node.path)
      
      if (result) {
        // Remove from parent's children
        if (node.parent?.children) {
          const index = node.parent.children.findIndex(child => child.id === node.id)
          if (index > -1) {
            node.parent.children.splice(index, 1)
          }
        }
        notify.success(`${node.path} 删除成功`, '文件操作')

        // Close tabs for deleted files (including files inside deleted folders)
        const tabsToClose = tabs.value.filter(tab => {
          return tab.path && (tab.path === node.path || tab.path.startsWith(node.path + '/'))
        })

        // Close all tabs since no folder is open
        for (const tab of tabsToClose) {
          tab.path = undefined
          await closeTab(tab.id)
        }
        setSelectedItem(null)

        return true
      }

      return false
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件删除错误')
      return false
    }
  }

  // Rename a file or folder
  async function renameFileOrFolder(node: FileTreeNode, newName: string): Promise<boolean> {
    if (!window.electronAPI) return false

    try {
      const newPath = await window.electronAPI.renameFile(node.path, newName)

      if (newPath) {
        // Update tab if the renamed file was open
        const openTab = tabs.value.find(tab => tab.path === node.path)
        if (openTab) {
          openTab.path = newPath
          openTab.name = pathUtils.basename(newPath)
        }
        updateFileTreeNodePath(node, pathUtils.dirname(newPath), pathUtils.basename(newPath))

        // Sort parent's children
        //if (node.parent) {
        //  sortFileTreeNodes(node.parent.children as FileTreeNode[], currentFileTreeSortType.value)
        //}
        setSelectedItem(node)

        notify.success(`${node.path} -> ${newName} 重命名成功`, '文件操作')
        return true
      }

      return false
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件重命名错误')
      return false
    }
  }

  async function moveFileOrFolder(sourceNode: FileTreeNode, targetParentNode: FileTreeNode): Promise<FileOperationResult | null> {
    if (!window.electronAPI) return null

    const sourcePath: string = sourceNode.path
    const targetDir: string = targetParentNode.path
    try {
      const result = await window.electronAPI.moveFile(sourcePath, targetDir)
      
      if (!result) {
        throw new Error('Unknown error')
      }
      
      if (result.success) {
        // Remove from source parent's children
        if (sourceNode.parent?.children) {
          const sourceParentChildren = sourceNode.parent.children as FileTreeNode[]
          const index = sourceParentChildren.findIndex(child => child.id === sourceNode.id)
          if (index > -1) {
            sourceParentChildren.splice(index, 1)
          }
        }

        // 如果是替换模式
        if (result.conflictAction === 'replace') {
          const targetParentChildren = targetParentNode.children as FileTreeNode[]
          let index = targetParentChildren.findIndex(child => child.label === sourceNode.label && child.type === sourceNode.type)
          if (index === -1)
            index = targetParentChildren.findIndex(child => {
              const targetLabel = child.label.toUpperCase()
              const sourceLabel = sourceNode.label.toUpperCase()
              return targetLabel === sourceLabel && child.type === sourceNode.type
          })
          
          // Remove replaced from target parent's children
          targetParentChildren.splice(index, 1)
        }
         
        // update sourceNode path to target path
        updateFileTreeNodePath(sourceNode, pathUtils.dirname(result.newPath), pathUtils.basename(result.newPath))

        // Add to Target parent's children
        if (!targetParentNode.children) {
          targetParentNode.children = []
        }
        (targetParentNode.children as FileTreeNode[]).push(sourceNode)
        sourceNode.parent = targetParentNode
    
        //sortFileTreeNodes(targetParentNode.children as FileTreeNode[], currentFileTreeSortType.value)
        setSelectedItem(sourceNode)
        notify.success(`${sourcePath} -> ${result.newPath} 移动成功`, '文件操作')

        return result
      }

      return result
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)} 移动失败`, '文件移动错误')
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
        // 监听文件变化事件
        window.electronAPI.onFileChange((change) => {
          handleFileChange(change)
        })
        
        // 监听错误事件
        window.electronAPI.onFileWatchError((error) => {
          notify.warning(`${error.message}`, '文件监听')
        })
      }
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件监听无法启动')
    }
  }
  
  // 停止高级文件监听
  async function stopAdvancedFileWatching() {
    if (!currentFolder.value || !window.electronAPI) return
    
    try {
      await window.electronAPI.stopFileWatching(currentFolder.value)
      window.electronAPI.removeFileChangeListeners()
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件监听无法停止')
    }
  }
  
  // 根据路径在文件树中查找节点
  function findNodeByPath(targetPath: string, tree?: FileTreeNode): FileTreeNode | null {
    const rootNode = tree || fileTree.value
    if (!rootNode) return null
    
    // 检查当前节点
    if (rootNode.path === targetPath) {
      return rootNode
    }
    
    // 递归搜索子节点
    if (rootNode.children && rootNode.children.length > 0) {
      for (const child of rootNode.children) {
        const found = findNodeByPath(targetPath, child as FileTreeNode)
        if (found) {
          return found
        }
      }
    }
    
    return null
  }

  // 从文件树中移除节点（基于 deleteFileOrFolder 的逻辑，但不实际删除文件）
  function removeNodeFromFileTreeByFilePath(targetPath: string): boolean {
    const node = findNodeByPath(targetPath)
    if (!node) return false
    
    try {
      // Remove from parent's children
      if (node.parent?.children) {
        const index = node.parent.children.findIndex(child => child.id === node.id)
        if (index > -1) {
          node.parent.children.splice(index, 1)
        }
      }
      notify.success(`${node.path} 结点删除成功`, '文件树更新')

      // Close tabs for deleted files (including files inside deleted folders)
      const tabsToClose = tabs.value.filter(tab => {
        return tab.path && (tab.path === targetPath || tab.path.startsWith(targetPath + '/'))
      })

      // Close all matching tabs
      for (const tab of tabsToClose) {
        tab.path = undefined
        closeTab(tab.id)
      }
      
      // Clear selection if the deleted node was selected
      if (selectedItem.value?.path === targetPath || 
          (selectedItem.value?.path && selectedItem.value.path.startsWith(targetPath + '/'))) {
        setSelectedItem(null)
      }

      return true
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件树更新错误')
      return false
    }
  }

  // 向文件树添加节点
  async function addNodeToFileTreeByFilePath(filePath: string): Promise<boolean> {
    if (!window.electronAPI) return false
    // 文件或者文件夹已经存在
    const node = findNodeByPath(filePath)
    if (node) return false

    try {
      const parentPath = pathUtils.dirname(filePath)
      const parentNode = findNodeByPath(parentPath)
      if (!parentNode) {
        throw new Error(`Parent node not found for path: ${parentPath}`)
      }
      
      // 使用 await 等待异步操作完成
      const files = await window.electronAPI.getFiles(filePath, true)
      if (!files || files.length === 0 || !files[0]) {
        throw new Error(`获取 ${parentPath} 信息失败`)
      }
      const newNode: FileTreeNode = {
        id: generateId(),
        label: files[0].name,
        path: files[0].path,
        type: files[0].isDirectory ? 'folder' : 'file',
        parent: parentNode,
        isVisible: true,
        isEnabled: true,
        data: {},
        size: files[0].size || 0,
        created: files[0].created,
        modified: files[0].modified,
      }
      if (files[0].isDirectory) {
        newNode.children = await traverseFileTree(files[0].path, newNode)
      }
      if (!parentNode.children) {
        parentNode.children = []
      }
      parentNode.children.push(newNode)

      notify.success(`${filePath} 结点添加成功`, '文件树更新')

      // Sort children based on current sort type
      //sortFileTreeNodes(parentNode.children as FileTreeNode[], currentFileTreeSortType.value)
      
      return true
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件树更新错误')
      return false
    }
  }

  // 通过文件路径，更新fileTree中path=给定path的FileTreeNode的状态size，created，modified
  async function updateFileTreeNodeInfo(filePath: string) {
    if (!window.electronAPI) return
    const node = findNodeByPath(filePath)
    if (!node) return
    
    try {
      // 使用 getFiles 获取单个文件信息
      const parentPath = pathUtils.dirname(filePath)
      const fileInfos = await window.electronAPI.getFiles(parentPath, true)
      const fileName = pathUtils.basename(filePath)
      const fileInfo = fileInfos.find(info => info.name === fileName)
      
      if (fileInfo) {
        node.size = fileInfo.size
        if (fileInfo.created) node.created = fileInfo.created
        if (fileInfo.modified) node.modified = fileInfo.modified
      }
    } catch (error) {
      notify.error(`文件树更新 ${node.path} 结点信息失败：${error instanceof Error ? error.message : String(error)}`, '文件树更新')
    }
  }

  // 处理文件变化
  function handleFileChange(change: FileChange) {    
    // 根据变化类型文件树更新
    switch (change.type) {
      case 'add':
      case 'addDir':
        // 外部添加的文件或文件夹，添加到文件树
        addNodeToFileTreeByFilePath(change.path)
        break
      case 'unlink':
      case 'unlinkDir':
        // 外部删除的文件或文件夹，从文件树中移除
        removeNodeFromFileTreeByFilePath(change.path)
        break
      case 'change':
        // 文件内容变化，更新文件信息
        updateFileTreeNodeInfo(change.path)
        break
    }
  }
  
  function createTab(name?: string, path?: string, documentType?: DocumentType) {
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
      isDirty: false,
      isActive: true,
      documentType: documentType || (path ? detectFromPath(path) : DocumentType.MARKDOWN_EDITOR),
      editState: globalEditSetting
    }
    
    // Deactivate all other tabs
    tabs.value.forEach(tab => {
      tab.isActive = false
    })
    
    tabs.value.push(newTab)
    activeTabId.value = id

    notify.success(`${path? path : tabName} 打开成功`, '文件操作')
    
    return newTab
  }
  
  async function closeTab(tabId: string): Promise<boolean> {
    const index = tabs.value.findIndex(tab => tab.id === tabId)
    if (index === -1) return false
    
    const tab = tabs.value[index]
    
    // Check if tab has unsaved changes
    if (tab && tab.isDirty) {
      if (!window.electronAPI?.showMessageBox) {
        console.warn('showMessageBox not available')
        return false
      }
      
      const result = await window.electronAPI.showMessageBox({
        message: `Do you want to save the changes you made to "${tab.name}"?`,
        type: 'question',
        buttons: ['Save', 'Don\'t Save', 'Cancel'],
        defaultId: 0,
        title: 'Save Changes',
        detail: 'Your changes will be lost if you don\'t save them.',
        cancelId: 2
      })
      
      switch (result.response) {
        //'save'
        case 0:
          // Save the file first
          if (await saveTab(tab) === false) {
            return false // If save failed, don't close the tab
          }
          break
        // 'dontSave'
        case 1:
          // User chose not to save, continue closing
          break
        // 'cancel'
        case 2:
          // User cancelled, don't close the tab
          return false
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
        if (tabs.value[newActiveIndex]) {
          activeTabId.value = tabs.value[newActiveIndex].id
          tabs.value[newActiveIndex].isActive = true
          return true
        }
      }
      activeTabId.value = null
    }
    
    return true
  }
  
  async function closeAllTab(): Promise<boolean> {
    let result: boolean = true

    const tabIds = tabs.value.map(tab => tab.id)
    for (const tabId of tabIds) {
      const closeResult = await closeTab(tabId)
      if (closeResult === false) {
        result = false
        break
      }
    }
  
    return result
  }

  function setActiveTab(tabId: string) {
    tabs.value.forEach(tab => {
      tab.isActive = tab.id === tabId
    })
    activeTabId.value = tabId
  }
  
  async function saveTab(tab: FileTab, saveAs: boolean = false): Promise<boolean> {
    if (!tab || !window.electronAPI) return false
    
    try {
      let originalPath: string | undefined = tab.path
      if (saveAs === true || !originalPath) {
        const result = await window.electronAPI.showSaveDialog({
          filters: [
            { name: 'iWriter Files', extensions: [...TEXT_IWT_EXTENSIONS] },
            { name: 'Markdown Files', extensions: [...TEXT_MD_EXTENSIONS] },
            { name: 'Text Files', extensions: [...TEXT_TXT_EXTENSIONS] },
            { name: 'All Files', extensions: [...TEXT_EXTENSIONS] }
          ]
        })
        if (!result.canceled && result.filePath) {
          originalPath = result.filePath
        } else {
          return false
        }
      }

      if (originalPath != null) {
        const content = convertContentTo(tab, pathUtils.extension(originalPath))
        if (content === null) {
          throw new Error('Unsupport file format')
        }
        const result = await window.electronAPI.saveFile(content, originalPath)

        if (result === true) {
          tab.path = originalPath
          tab.isDirty = false
          tab.name = pathUtils.basename(originalPath)
          tab.savedCheckPoint = undoDepth((tab.editorInstance as import('@tiptap/core').Editor).state)
          
          notify.success(`${originalPath} 保存成功`, '文件操作')
          return true
        }
      }
    } catch(error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '文件保存错误')
    }

    return false 
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

  function updateTabState(tabId: string, updates: Partial<FileTab>) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) {
      merge(tab, updates)
    }
  }

  function cleanTab(tabId: string) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab?.tocProvider) {
      tab.tocProvider.destroy()
      tab.tocProvider = undefined
    }
    if (tab?.editorInstance) {
      tab.editorInstance = undefined
    }
  }

  // Theme System Functions
  function initTheme() {
    // Load saved theme preference
    const savedThemeId = localStorage.getItem('iwriter-theme') || 'system'
    const theme = getThemeById(savedThemeId)
    
    if (theme) {
      currentThemeId.value = savedThemeId
    } else {
      // Fallback to system theme if saved theme is not found
      currentThemeId.value = 'system'
    }
    
    // Detect system theme preference
    if (window.electronAPI) {
      window.electronAPI.onSystemColorsChanged((themeAndColors: { theme: 'light' | 'dark' | 'unknown', newColors: ThemeColors }) => {
        // Re-apply theme if current theme is system
        const currentTheme = getThemeById(currentThemeId.value)
        if (currentTheme?.isSystem) {
          applySystemColors(themeAndColors)
        }
      })
    }
    
    // Apply initial theme
    applyCurrentTheme()
  }
  
  function setTheme(themeId: string) {
    const theme = getThemeById(themeId)
    if (!theme) {
      notify.error(`主题 ${themeId} 不存在`, '主题设置错误')
      return
    }
    
    currentThemeId.value = themeId
    localStorage.setItem('iwriter-theme', themeId)
    applyCurrentTheme()
  }
  
  function applyCurrentTheme() {
    const theme = getThemeById(currentThemeId.value)
    if (!theme) return
    applyThemeColors(theme)
  }
  
  function getCurrentTheme(): Theme | undefined {
    return getThemeById(currentThemeId.value)
  }
  
  function getAvailableThemes(): Theme[] {
    return availableThemes
  }

  // Handle print functionality
  async function handlePrint() {
    const activeTab = tabs.value.find(tab => tab.id === activeTabId.value)
    if (!activeTab) {
      notify.warning('No document to print')
      return
    }

    try {
      // Prepare print options based on document type
      const printOptions = preparePrintOptions(activeTab)
      
      // Call Electron's native print function
      const result = await window.electronAPI.print(printOptions)
      
      if (result.success) {
        notify.success(`${activeTab.name} 打印成功`, '打印操作')
      } else if (result.cancelled) {
        console.info('Print operation cancelled by user')
      } else {
        notify.error(result.error || 'Unknown error', '打印失败')
      }
      
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, '打印错误')
    }
  }

  // Prepare print options based on document type
  function preparePrintOptions(tab: FileTab) {
    const printOptions: Electron.WebContentsPrintOptions = {
      printBackground: true,
      color: true,
      pageSize: 'A4',
      margins: { marginType: 'default' }
    }

    // Customize options based on document type
    switch (tab.documentType) {
      case DocumentType.MARKDOWN_EDITOR:
        // Markdown/Text documents - ensure proper styling
        printOptions.printBackground = true
        printOptions.scaleFactor = 1.0
        break
      case DocumentType.IMAGE_VIEWER:
        // Image documents - fit to page
        printOptions.scaleFactor = 1.0
        printOptions.landscape = false
        break
      case DocumentType.PDF_VIEWER:
        // PDF documents - maintain original formatting
        printOptions.printBackground = false
        printOptions.scaleFactor = 1.0
        break
      default:
        // Default settings for other document types
        break
    }

    return printOptions
  }

  // Handle menu actions for the application
  // There are Paragraph / Format Menu Actions handled in MarkdownEditor.vue
  async function handleMenuAction(action: string): Promise<boolean> {
    switch (action) {
      // File Menu Actions
      case 'new-file':
        createTab(undefined, undefined, DocumentType.MARKDOWN_EDITOR)
        return true
      case 'new-from-template':
        notify.error(`${action}`, 'Not implemented')
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
      case 'print':
        await handlePrint()
        return true
      case 'close-file':
        if (activeTabId.value) {
          await closeTab(activeTabId.value)
        }
        return true
      case 'close-folder':
        closeFolder()
        return true
      
      // Edit Menu Actions

      // View Menu Actions
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
      
      case 'view-theme-follow-system':
        setTheme('system')
        return true
      case 'view-theme-light':
        setTheme('light')
        return true
      case 'view-theme-dark':
        setTheme('dark')
        return true
      case 'view-theme-ocean':
        setTheme('ocean')
        return true
      case 'view-theme-forest':
        setTheme('forest')
        return true
      case 'view-theme-sunset':
        setTheme('sunset')
        return true
      case 'view-theme-settings':
        notify.error(`${action}`, 'Not implemented')
        return true
      
      case 'check-update':
        try {
          await updaterService.checkForUpdates()
        } catch (error) {
          notify.error(`${error instanceof Error ? error.message : String(error)}`, '检查更新失败')
        }
        return true
      
      case 'auto-update-settings':
        notify.info('自动更新设置', '此功能正在开发中')
        return true
      
      case 'help-changelog':
        try {
          updaterService.openReleaseNotes()
        } catch (error) {
          console.error('Error opening changelog:', error)
          window.electronAPI?.openWithShell?.('https://github.com/map9/iWriter/releases')
        }
        return true
      
      default:
        console.warn('Unhandled menu action in app:', action)
        return false
    }
  }
  
  return {
    // State
    isLeftSidebarVisible,
    isRightSidebarVisible,
    isStatusbarVisible,
    leftSidebarMode,
    leftSidebarWidth,
    minSidebarWidth,
    currentThemeId,
    systemPrefersDark,
    currentFolder,
    fileTree,
    selectedItem,
    currentFileTreeSortType,
    tabs,
    activeTabId,
    
    // Computed
    activeTab,
    hasOpenFolder,
    
    initial,
    destroy,

    // Actions
    toggleLeftSidebar,
    toggleRightSidebar,
    toggleStatusbar,
    setLeftSidebarMode,
    setLeftSidebarWidth,
    toggleAutoSave,
    updateWindowTitle,
    
    // Theme actions
    initTheme,
    setTheme,
    applyCurrentTheme,
    getCurrentTheme,
    getAvailableThemes,

    // File operations
    openFile,
    openFolder,
    closeFolder,
    loadFileTree,
    sortFileTreeNodes,
    queryFileTreeNodes,
    setSelectedItem,
    openFileDialog,
    createFile,
    createFolder,
    CreateFileOrFolder,
    deleteFileOrFolder,
    renameFileOrFolder,
    moveFileOrFolder,
    startAdvancedFileWatching,
    stopAdvancedFileWatching,

    // Tab operations
    createTab,
    closeTab,
    closeAllTab,
    saveTab,
    setActiveTab,
    saveActiveTab,
    saveActiveTabAs,
    saveAllTabs,
    cleanTab,
    updateTabState,

    // Menu actions
    handleMenuAction,
  }
})