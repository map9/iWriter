<template>
  <div class="h-full flex flex-col">
    
    <!-- Explorer Header -->
    <div class="iw-sidebar-section">
      <div class="flex items-center gap-2">
        <span class="iw-sidebar-section-header">
          {{ t('explorer.title') }}
        </span>
      </div>
      
      <!-- Actions -->
      <div class="flex shrink-0 items-center gap-1">
        <button
          @click="appStore.openFolder"
          class="iw-toolbar-btn btn-xs"
          :title="t('explorer.openFolder')"
        >
          <IconFolderOpen class="icon-xs" />
        </button>
        <button
          class="iw-toolbar-btn btn-xs"
          :title="t('explorer.moreActions')"
        >
          <IconDots class="icon-xs" />
        </button>
      </div>
    </div>

    <!-- Search Files -->
    <div class="flex shrink-0 items-center border-b border-base-300 bg-base-200 p-2 select-none">
      <label class="iw-input">
        <IconSearch class="icon-xs text-base-content" />
        <input 
          v-model="searchQuery"
          type="search"
          class="grow"
          :placeholder="t('explorer.searchFiles')"
        />
      </label>
    </div>
    
    <!-- Root Header with Controls -->
    <div class="h-full flex flex-col overflow-hidden"
      @mouseenter="handleTreeMouseEnter"
      @mouseleave="handleTreeMouseLeave"
    >
      <div 
        v-if="hasRootFolder"
        class="flex items-center justify-between h-9 px-2 py-1 select-none shrink-0"
      >
        <div class="flex items-center gap-1">
          <!-- Root Folder Icon and Name -->
          <IconFolder class="icon-sm" />
          <span class="text-sm font-medium text-base-content whitespace-nowrap overflow-hidden text-ellipsis">{{ folderName }}</span>
        </div>
        
        <!-- Action Buttons -->
        <div 
          class="flex items-center gap-1 pl-1 transition-opacity duration-200"
          :class="isTreeHovered ? 'opacity-100' : 'opacity-0'"
        >
          <!-- Create File -->
          <button
            @click="createFile"
            class="iw-toolbar-btn btn-xs"
            :title="t('explorer.createFile')"
          >
            <IconFilePlus class="icon-xs" />
          </button>
          
          <!-- Create Folder -->
          <button
            @click="createFolder"
            class="iw-toolbar-btn btn-xs"
            :title="t('explorer.createFolder')"
          >
            <IconFolderPlus class="icon-xs" />
          </button>
          
          <!-- Sort Menu -->
          <button
            @click="showSortContextMenu"
            class="iw-toolbar-btn btn-xs w-auto gap-1 px-1"
            :title="t('explorer.sortTitle')"
          >
            <IconArrowsSort class="icon-xs" />
            <IconChevronDown class="icon-2xs" />
          </button>
          
          <!-- Expand/Collapse All -->
          <button
            @click="collapseAll"
            class="iw-toolbar-btn btn-xs"
            :title="t('explorer.collapseAll')"
            :disabled="!hasRootFolder"
          >
            <IconFoldUp class="icon-xs" />
          </button>
        </div>
      </div>

      <!-- Tree Content -->
      <Tree v-if="hasRootFolder"
        ref="treeRef"
        :nodes="rootChildren"
        class="file-tree"
        :callbacks="fileCallbacks"
        drop-mode="inside-only"
        item-click-mode="expand"
        :initialDepth="0"
        @node-click="handleNodeClick"
        @node-contextmenu="handleNodeContextMenu"
        @contextmenu="handleContextMenu"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import type { FileTreeNode, FileTreeCallbacks, FileTreeSortType } from '../common/tree'
import type { ContextMenuItem } from '@/types'
import { TEXT_IWT_EXTENSION } from '@/types'
import Tree from '../common/tree/Tree.vue'
import pathUtils from '@/utils/pathUtils'
import { useDocumentTypeDetector } from '@/utils/DocumentTypeDetector'
import {
  IconSearch,
  IconFolderPlus,
  IconDots,
  IconFolder,
  IconFolderOpen,
  IconFilePlus,
  IconChevronRight,
  IconChevronDown,
  IconFoldUp,
  IconArrowsSort,
  IconLock,
} from '@tabler/icons-vue'

const appStore = useAppStore()
const { t } = useI18n()
const searchQuery = ref('')
const { getIconByExtension } = useDocumentTypeDetector()

interface Props {
  allowCreate?: boolean
  allowDelete?: boolean
  allowRename?: boolean
  allowMove?: boolean
  rootName?: string
}

const props = withDefaults(defineProps<Props>(), {
  allowCreate: true,
  allowDelete: true,
  allowRename: true,
  allowMove: true
})

const folderName = computed(() => {
  if (!appStore.currentFolder) return t('explorer.noFolder')
  return appStore.currentFolder.split('/').pop() || t('explorer.rootFolder')
})

// State
const treeRef = ref<InstanceType<typeof Tree>>()
const currentCreateType = ref<'file' | 'folder'>('file')
const isAllExpanded = ref(false)
const currentContextNode = ref<FileTreeNode | null>(null)
const isTreeHovered = ref(false)
const fileClipboard = ref<{
  operation: 'cut' | 'copy'
  sourcePath: string
} | null>(null)
const hasRootFolder = computed(() => appStore.fileTree !== null)

// Get root folder's children to display in the tree (not the root folder itself)
const rootChildren = computed(() => {
  if (!hasRootFolder.value || !appStore.fileTree || !appStore.fileTree.children) {
    return []
  }
  
  const children = [...appStore.fileTree.children]
  children.forEach(child => applyNodeAppearance(child as FileTreeNode))
  
  if (appStore.currentFileTreeSortType !== 'none') {
    appStore.sortFileTreeNodes(children as FileTreeNode[], appStore.currentFileTreeSortType)
  }
  appStore.queryFileTreeNodes(children as FileTreeNode[], searchQuery.value)

  return children
})

// Generate unique name for file system
const generateUniqueFileSystemName = (baseName: string, parentNode: FileTreeNode, type: string): string => {
  if (!parentNode.children || parentNode.children.length === 0) {
    return type === 'folder' ? `${baseName}-01` : `${baseName}-01.${type}`
  }
  
  const existingLabels = new Set(parentNode.children.map(child => child.label))
  
  let counter = 1
  let newLabel = type === 'folder' ? 
    `${baseName}-${counter.toString().padStart(2, '0')}` : 
    `${baseName}-${counter.toString().padStart(2, '0')}.${type}`
  
  while (existingLabels.has(newLabel)) {
    counter++
    newLabel = type === 'folder' ? 
      `${baseName}-${counter.toString().padStart(2, '0')}` : 
      `${baseName}-${counter.toString().padStart(2, '0')}.${type}`
  }
  
  return newLabel
}

// File callbacks
const fileCallbacks: FileTreeCallbacks = {
  canRename: () => props.allowRename,
  canDrag: () => props.allowMove,
  canAddChild: (node) => node.type === 'folder',
  canDelete: () => props.allowDelete,
  canDrop: (dragNode, dropNode, position) => {
    if (!props.allowMove && position !== 'inside') return false
    
    const fileDragNode = dragNode as FileTreeNode
    const fileDropNode = dropNode as FileTreeNode
    
    if (fileDragNode.id === fileDropNode.id) return false
    if (fileDropNode.type !== 'folder') return false
    if (isNodeChildOf(fileDropNode, fileDragNode)) return false
    if (fileDragNode.parent?.id === fileDropNode.id) return false
    
    if (fileDragNode.type === 'folder') {
      let current: FileTreeNode | null = fileDropNode
      while (current) {
        if (current.id === fileDragNode.id) return false
        current = current.parent as FileTreeNode | null
      }
    }
    
    return true
  },
  getExpandIcon: (node) => (node as FileTreeNode).type === 'folder' ? IconChevronRight : undefined,
  getCollapseIcon: (node) => (node as FileTreeNode).type === 'folder' ? IconChevronDown : undefined,
  getTypeIcon: (node) => {
    const fileNode = node as FileTreeNode
    if (fileNode.isReadonly) {
      return IconLock
    }
    if (fileNode.type === 'folder') {
      return fileNode.isExpanded && ((fileNode.children?.length ?? 0) > 0) ? IconFolderOpen : IconFolder
    }
    return getIconByExtension(pathUtils.extension(fileNode.label))
  },
  getRightContent: (node) => {
    const fileNode = node as FileTreeNode
    if (fileNode.type === 'folder' && fileNode.children) {
      const fileCount = fileNode.children.filter(child => 
        (child as FileTreeNode).type === 'file'
      ).length
      return fileCount > 0 ? `${fileCount}` : null
    }
    return null
  },
  getDefaultChildType: () => {
    return currentCreateType.value || 'file'
  },
  getDefaultChildLabel: (parentNode) => {
    const fileParentNode = parentNode as FileTreeNode
    
    if (currentCreateType.value === 'folder') {
      return generateUniqueFileSystemName('Untitled', fileParentNode, 'folder')
    }
    return generateUniqueFileSystemName('Untitled', fileParentNode, TEXT_IWT_EXTENSION)
  },
  onExpand: () => {
  },
  onCollapse: () => {
  },
  onRename: async (node, newName) => {
    const fileNode = node as FileTreeNode
    await appStore.renameFileOrFolder(fileNode, newName)
  },
  onAddChild: async (parentNode, newChild) => {
    try {
      await appStore.CreateFileOrFolder(parentNode as FileTreeNode, newChild as FileTreeNode)
      if (newChild.type === 'file' && newChild.path) {
        await appStore.openFile(newChild.path)
      }
      appStore.setSelectedItem(newChild as FileTreeNode)
    } catch (err) {
      throw err
    }
  },
  onDrop: (dragNode, dropNode, position) => {
    handleFileDrop(dragNode as FileTreeNode, dropNode as FileTreeNode, position)
  }
}

const applyNodeAppearance = (node: FileTreeNode) => {
  const isDimmed = node.isHidden === true || node.isReadonly === true
  node.data = {
    ...(typeof node.data === 'object' && node.data !== null ? node.data : {}),
    treeIconClass: isDimmed ? { opacity: '0.6' } : undefined,
    treeLabelStyle: isDimmed ? { opacity: '0.6' } : undefined,
  }

  node.children?.forEach(child => applyNodeAppearance(child as FileTreeNode))
}

// Event handlers
const handleNodeClick = async (node: unknown) => {
  const fileNode = node as FileTreeNode
  appStore.setSelectedItem(fileNode)
  
  if (fileNode.type === 'file') {
    await appStore.openFile(fileNode.path)
  }
}

const createFolder = () => {
  let parentNode = null
  if (appStore.selectedItem) {
    if (appStore.selectedItem.type === 'folder') {
      parentNode = appStore.selectedItem
    } else {
      parentNode = appStore.selectedItem.parent as FileTreeNode | null
    }
  }
  
  if (!parentNode) {
    parentNode = appStore.fileTree
  }
  
  currentCreateType.value = 'folder'
  treeRef.value?.addChildToNode(parentNode as FileTreeNode)
}

const createFile = () => {
  let parentNode = null
  if (appStore.selectedItem) {
    if (appStore.selectedItem.type === 'folder') {
      parentNode = appStore.selectedItem
    } else {
      parentNode = appStore.selectedItem.parent as FileTreeNode | null
    }
  }
  
  if (!parentNode) {
    parentNode = appStore.fileTree
  }

  currentCreateType.value = 'file'
  treeRef.value?.addChildToNode(parentNode as FileTreeNode)
}

const createFileInFolder = (folder: FileTreeNode) => {
  currentCreateType.value = 'file'
  treeRef.value?.addChildToNode(folder)
}

const createFolderInFolder = (folder: FileTreeNode) => {
  currentCreateType.value = 'folder'
  treeRef.value?.addChildToNode(folder)
}

const deleteNode = async (node: FileTreeNode | null) => {
  if (!node) return
  
  await appStore.deleteFileOrFolder(node)
}

const getRootNode = (): FileTreeNode | null => {
  return appStore.fileTree
}

const getContextTargetNode = (): FileTreeNode | null => {
  return currentContextNode.value ?? getRootNode()
}

const canPasteInto = (targetNode: FileTreeNode | null): boolean => {
  if (!targetNode || targetNode.type !== 'folder' || !fileClipboard.value) {
    return false
  }

  if (fileClipboard.value.operation === 'cut' || fileClipboard.value.operation === 'copy') {
    const sourceNode = appStore.findNodeByPath(fileClipboard.value.sourcePath)
    if (!sourceNode) {
      return false
    }

    if (targetNode.path === sourceNode.path) return false
    if (fileClipboard.value.operation === 'cut' && sourceNode.parent?.path === targetNode.path) return false
    if (sourceNode.type === 'folder' && (targetNode.path === sourceNode.path || targetNode.path.startsWith(`${sourceNode.path}/`))) {
      return false
    }
  }

  return true
}

const setClipboardFromNode = (node: FileTreeNode, operation: 'cut' | 'copy') => {
  fileClipboard.value = {
    operation,
    sourcePath: node.path,
  }
}

const pasteIntoNode = async (targetNode: FileTreeNode | null) => {
  if (!targetNode || targetNode.type !== 'folder' || !fileClipboard.value) return

  const clipboardEntry = fileClipboard.value
  const sourceNode = appStore.findNodeByPath(clipboardEntry.sourcePath)

  if (!sourceNode) {
    return
  }

  if (clipboardEntry.operation === 'cut') {
    await appStore.moveFileOrFolder(sourceNode, targetNode)
    fileClipboard.value = null
    return
  }

  await appStore.copyFileOrFolder(sourceNode, targetNode)
}

const collapseAll = () => {
  treeRef.value?.collapseAll()
  isAllExpanded.value = false
}

// 显示排序上下文菜单
const showSortContextMenu = async (event: MouseEvent) => {
  const menuItems: ContextMenuItem[] = [
    {
      id: 'filetree-sort-none',
      label: t('explorer.sort.none'),
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'none',
    },
    { type: 'separator' },
    {
      id: 'filetree-sort-name-asc',
      label: t('explorer.sort.nameAsc'),
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'name-asc',
    },
    {
      id: 'filetree-sort-name-desc',
      label: t('explorer.sort.nameDesc'),
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'name-desc',
    },
    {
      id: 'filetree-sort-type-asc',
      label: t('explorer.sort.typeAsc'),
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'type-asc',
    },
    {
      id: 'filetree-sort-type-desc',
      label: t('explorer.sort.typeDesc'),
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'type-desc',
    },
    {
      id: 'filetree-sort-created-asc',
      label: t('explorer.sort.createdAsc'),
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'created-asc',
    },
    {
      id: 'filetree-sort-created-desc',
      label: t('explorer.sort.createdDesc'),
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'created-desc',
    },
    {
      id: 'filetree-sort-modified-asc',
      label: t('explorer.sort.modifiedAsc'),
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'modified-asc',
    },
    {
      id: 'filetree-sort-modified-desc',
      label: t('explorer.sort.modifiedDesc'),
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'modified-desc',
    },
  ]

  const position = {
    x: event.clientX,
    y: event.clientY
  }

  try {
    await window.electronAPI.showContextMenu(menuItems, position)
  } catch (error) {
    console.error('Error showing sort context menu:', error)
  }
}

const setSortOption = (value: FileTreeSortType) => {
  appStore.currentFileTreeSortType = value
}

const openFile = async (file: FileTreeNode) => {
  if (file.type === 'file') {
    await appStore.openFile(file.path)
  }
}

// 处理节点右键上下文菜单
const handleNodeContextMenu = async (data: { node: unknown; event: MouseEvent }) => {
  const fileNode = data.node as FileTreeNode
  const targetNode = fileNode ?? getRootNode()
  if (!targetNode) return

  const menuItems: ContextMenuItem[] = []
  if (!fileNode || fileNode.type === 'folder') {
    menuItems.push(
      {
        id: 'explorer-new-file',
        label: t('explorer.menu.newDocument'),
      },
      {
        id: 'explorer-new-folder',
        label: t('explorer.menu.newFolder'),
      },
      {
        id: 'explorer-reveal-in-folder',
        label: t('explorer.menu.revealInFolder'),
      },
      { type: 'separator' },
      {
        id: fileNode ? 'explorer-find-in-folder' : 'explorer-find-in-files',
        label: fileNode ? t('explorer.menu.findInFolder') : t('explorer.menu.findInFiles'),
      },
      { type: 'separator' },
    )
  }

  if (fileNode && fileNode.type === 'file') {
    menuItems.push(
      {
        id: 'explorer-open-file',
        label: t('explorer.menu.open'),
      },
      {
        id: 'explorer-reveal-in-folder',
        label: t('explorer.menu.revealInFolder'),
      },
      { type: 'separator' },
    )
  }

  if (fileNode) {
    menuItems.push(
      {
        id: 'explorer-cut',
        label: t('explorer.menu.cut'),
      },
      {
        id: 'explorer-copy',
        label: t('explorer.menu.copy'),
      },
    )
  }

  if (!fileNode || (fileNode && fileNode.type === 'folder')) {
    menuItems.push(
      {
        id: 'explorer-paste',
        label: t('explorer.menu.paste'),
        enabled: canPasteInto(targetNode),
      },
      { type: 'separator' },
    )
  }
  
  if (fileNode) {
    menuItems.push(
      {
        id: 'explorer-rename-file-or-folder',
        label: t('explorer.menu.rename'),
        accelerator: 'Enter',
      },
      {
        id: 'explorer-delete',
        label: t('explorer.menu.delete'),
      },
    )
  }
  
  const position = {
    x: data.event.clientX,
    y: data.event.clientY
  }
  
  // 临时存储节点信息，用于菜单动作处理
  currentContextNode.value = fileNode

  try {
    await window.electronAPI.showContextMenu(menuItems, position)
  } catch (error) {
    console.error('Error showing context menu:', error)
  }
}

const handleContextMenu = async (event: MouseEvent) => {
  await handleNodeContextMenu({ node: null, event })
}

const handleFileDrop = async (dragNode: FileTreeNode, dropNode: FileTreeNode, position: string) => {
  let targetParent: FileTreeNode

  if (position === 'inside') {
    if (dropNode.type !== 'folder') {
      return
    }
    targetParent = dropNode
  } else {
    if (!dropNode.parent) {
      return
    }
    targetParent = dropNode.parent as FileTreeNode
  }

  if (isNodeChildOf(targetParent, dragNode)) {
    return
  }

  if (dragNode.parent?.id === targetParent.id) {
    return
  }

  await appStore.moveFileOrFolder(dragNode, targetParent)
}

const isNodeChildOf = (potentialChild: FileTreeNode, potentialParent: FileTreeNode): boolean => {
  let current = potentialChild.parent
  while (current) {
    if (current.id === potentialParent.id) {
      return true
    }
    current = current.parent
  }
  return false
}

// 菜单动作处理器
const handleMenuAction = async (action: string) => {
  if (action.startsWith('filetree-sort-')) {
    const sortType = action.replace('filetree-sort-', '') as FileTreeSortType
    setSortOption(sortType)
    return
  }

  const node = currentContextNode.value
  const targetNode = getContextTargetNode()
  if (!targetNode) return
  
  switch (action) {
    case 'explorer-open-file':
      if (node) {
        openFile(node)
      }
      break
    case 'explorer-new-file':
      createFileInFolder(targetNode)
      break
    case 'explorer-new-folder':
      createFolderInFolder(targetNode)
      break
    case 'explorer-reveal-in-folder':
      window.electronAPI.revealInFolder(targetNode.path)
      break
    case 'explorer-find-in-folder':
      appStore.searchInFolder(targetNode.path)
      break
    case 'explorer-find-in-files':
      appStore.searchInWorkspace()
      break
    case 'explorer-cut':
      if (node) {
        setClipboardFromNode(node, 'cut')
      }
      break
    case 'explorer-copy':
      if (node) {
        setClipboardFromNode(node, 'copy')
      }
      break
    case 'explorer-paste':
      await pasteIntoNode(targetNode)
      break
    case 'explorer-rename-file-or-folder':
      if (node) {
        treeRef.value?.startRenameNode(node.id)
      }
      break
    case 'explorer-delete':
      if (node) {
        await deleteNode(node)
      }
      break
    default:
      break
  }
  
  // 清除当前上下文节点
  currentContextNode.value = null
}

// 鼠标事件处理函数
const handleTreeMouseEnter = () => {
  isTreeHovered.value = true
}

const handleTreeMouseLeave = () => {
  isTreeHovered.value = false
}

onMounted(() => {
  // 监听菜单动作
  window.electronAPI.onMenuAction(handleMenuAction)
})

onUnmounted(() => {
  // 清理菜单动作监听器
  window.electronAPI.removeMenuActionListener(handleMenuAction)
})

</script>

<style scoped>

.file-tree {
  --tree-font-size: 12px;
  --tree-font-weight: 500;
  --tree-text-color: var(--color-base-content);
  --tree-background-color: var(--color-base-100);
  --tree-container-padding: 0 0 56px 0;
  --tree-hover-color: var(--color-base-200);

  --tree-selected-background: var(--color-primary);
  --tree-selected-color: var(--color-primary-content);

  --tree-focus-outline: 1px solid var(--color-primary);
  --tree-focus-outline-offset: -2px;

  --tree-selected-focused-background: var(--color-primary);
  --tree-selected-focused-color: var(--color-primary-content);

  --tree-input-background: transparent;
  --tree-input-border: 1px solid var(--color-primary);

  --tree-badge-background: var(--color-base-100);
  --tree-badge-color: var(--color-base-content);
  --tree-badge-font-size: 10px;
  --tree-badge-height: 20px;
  --tree-badge-border-radius: var(--radius-selector);

  --tree-drop-border-color: transparent;
  --tree-drop-background: var(--color-base-300);
}

</style>
