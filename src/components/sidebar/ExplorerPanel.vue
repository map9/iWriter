<template>
  <div class="h-full flex flex-col">
    
    <!-- Explorer Header -->
    <div class="sidebar-header h-9 flex-shrink-0 select-none">
      <div class="flex items-center gap-2">
        <span class="text-xs font-medium text-gray-700 uppercase tracking-wide">
          EXPLORER
        </span>
      </div>
      
      <!-- Actions -->
      <div class="flex items-center gap-1">
        <button
          @click="appStore.openFolder"
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          title="Open Folder"
        >
          <IconFolderOpen class="w-4 h-4 text-gray-700" />
        </button>
        <button
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          title="More actions"
        >
          <IconDots class="w-4 h-4 text-gray-700" />
        </button>
      </div>
    </div>

    <!-- Search Files -->
    <div class="flex items-center h-9 flex-shrink-0 select-none px-3 border-b border-gray-200 ">
      <div class="relative w-full">
        <IconSearch class="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search Files"
          class="w-full pl-7 pr-3 h-6 text-sm border border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
    </div>
    
    <!-- Root Header with Controls - Only show when folder is open -->
    <div class="h-full flex flex-col"
      @mouseenter="handleTreeMouseEnter"
      @mouseleave="handleTreeMouseLeave"
    >
      <div 
        v-if="hasRootFolder"
        class="flex items-center justify-between h-9 flex-shrink-0 select-none p-1 bg-gray-100 border-b border-gray-200"
      >
        <div class="flex items-center ml-2">
          <!-- Root Folder Icon and Name -->
          <IconFolder class="w-4 h-4 mr-2" />
          <span class="text-sm font-medium text-gray-700">{{ folderName }}</span>
        </div>
        
        <!-- Action Buttons -->
        <div 
          class="flex items-center gap-1 mr-2 transition-opacity duration-200"
          :class="isTreeHovered ? 'opacity-100' : 'opacity-0'"
        >
          <!-- Create File -->
          <button
            @click="createFile"
            class="action-btn p-1 hover:bg-gray-200 rounded"
            title="Create File"
          >
            <IconFilePlus class="w-4 h-4" />
          </button>
          
          <!-- Create Folder -->
          <button
            @click="createFolder"
            class="action-btn p-1 hover:bg-gray-200 rounded"
            title="Create Folder"
          >
            <IconFolderPlus class="w-4 h-4" />
          </button>
          
          <!-- Sort Menu -->
          <button
            @click="showSortContextMenu"
            class="action-btn flex items-center gap-1 px-1 py-1 hover:bg-gray-200 rounded text-gray-700"
            title="Sort"
          >
            <IconArrowsSort class="w-4 h-4" />
            <IconChevronDown class="w-3 h-3" />
          </button>
          
          <!-- Expand/Collapse All -->
          <button
            @click="collapseAll"
            class="action-btn p-1 hover:bg-gray-200 rounded"
            title="Collapse All"
            :disabled="!hasRootFolder"
          >
            <IconFoldUp class="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      <!-- Tree Content -->
      <div 
        class="flex-1  bg-white transition-all duration-200"
        :class="[
          isTreeHovered ? 'overflow-auto' : 'overflow-hidden'
        ]"
      >
        <Tree v-if="hasRootFolder"
          ref="treeRef"
          :nodes="rootChildren"
          :callbacks="fileCallbacks"
          drop-mode="inside-only"
          :initialDepth="1"
          @node-click="handleNodeClick"
          @node-drop="handleNodeDrop"
          @node-contextmenu="handleNodeContextMenu"
          @contextmenu="handleContextMenu"
        />
      </div>
    </div>  
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted } from 'vue'
import { useAppStore } from '@/stores/app'
import type { FileTreeNode, FileTreeCallbacks, FileTreeSortType } from '../common/tree'
import type { ContextMenuItem } from '@/types'
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
  IconFoldDown,
  IconArrowsSort,
} from '@tabler/icons-vue'

const appStore = useAppStore()
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
  if (!appStore.currentFolder) return 'No Folder'
  return appStore.currentFolder.split('/').pop() || 'Root Folder'
})

// State
const treeRef = ref<InstanceType<typeof Tree>>()
const currentCreateType = ref<'file' | 'folder'>('file')
const isAllExpanded = ref(false)
const currentContextNode = ref<FileTreeNode | null>(null)
const isTreeHovered = ref(false)
const hasRootFolder = computed(() => appStore.fileTree !== null)

// Get root folder's children to display in the tree (not the root folder itself)
const rootChildren = computed(() => {
  if (!hasRootFolder.value || !appStore.fileTree || !appStore.fileTree.children) {
    return []
  }
  
  const children = [...appStore.fileTree.children]
  
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
  canRename: (node) => props.allowRename,
  canDrag: (node) => props.allowMove,
  canAddChild: (node) => node.type === 'folder',
  canDelete: (node) => props.allowDelete,
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
  getDefaultChildType: (parentNode) => {
    return currentCreateType.value || 'file'
  },
  getDefaultChildLabel: (parentNode) => {
    const fileParentNode = parentNode as FileTreeNode
    
    if (currentCreateType.value === 'folder') {
      return generateUniqueFileSystemName('Untitled', fileParentNode, 'folder')
    }
    return generateUniqueFileSystemName('Untitled', fileParentNode, 'txt')
  },
  onExpand: (node) => {
  },
  onCollapse: (node) => {
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

// Event handlers
const handleNodeClick = async (node: any) => {
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

const toggleExpandAll = () => {
  if (isAllExpanded.value) {
    treeRef.value?.collapseAll()
    isAllExpanded.value = false
  } else {
    treeRef.value?.expandAll()
    isAllExpanded.value = true
  }
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
      label: 'No Sort',
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'none',
    },
    { type: 'separator' },
    {
      id: 'filetree-sort-name-asc',
      label: 'Name (A-Z)',
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'name-asc',
    },
    {
      id: 'filetree-sort-name-desc',
      label: 'Name (Z-A)',
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'name-desc',
    },
    {
      id: 'filetree-sort-type-asc',
      label: 'Type (A-Z)',
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'type-asc',
    },
    {
      id: 'filetree-sort-type-desc',
      label: 'Type (Z-A)',
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'type-desc',
    },
    {
      id: 'filetree-sort-created-asc',
      label: 'Created (Oldest)',
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'created-asc',
    },
    {
      id: 'filetree-sort-created-desc',
      label: 'Created (Newest)',
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'created-desc',
    },
    {
      id: 'filetree-sort-modified-asc',
      label: 'Modified (Oldest)',
      type: 'checkbox',
      checked: appStore.currentFileTreeSortType === 'modified-asc',
    },
    {
      id: 'filetree-sort-modified-desc',
      label: 'Modified (Newest)',
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
const handleNodeContextMenu = async (data: { node: any; event: MouseEvent }) => {
  const fileNode = data.node as FileTreeNode

  const menuItems: ContextMenuItem[] = []
  if (!fileNode || (fileNode && fileNode.type === 'folder')) {
    menuItems.push(
      {
        id: 'explorer-new-file',
        label: 'New Document...',
      },
      {
        id: 'explorer-new-folder',
        label: 'New Folder...',
      },
      {
        id: 'explorer-reveal-in-folder',
        label: 'Reveal in Folder',
      },
      { type: 'separator' },
      {
        id: 'explorer-find-in-folder',
        label: 'Find in Folder...',
      },
      { type: 'separator' },
    )
  }

  if (fileNode && fileNode.type === 'file') {
    menuItems.push(
      {
        id: 'explorer-open-file',
        label: 'Open',
      },
      {
        id: 'explorer-reveal-in-folder',
        label: 'Reveal in Folder',
      },
      { type: 'separator' },
    )
  }

  if (fileNode) {
    menuItems.push(
      {
        role: 'cut'
      },
      {
        role: 'copy'
      },
    )
  }

  if (!fileNode || (fileNode && fileNode.type === 'folder')) {
    menuItems.push(
      {
        role: 'paste'
      },
      { type: 'separator' },
    )
  }
  
    if (fileNode) {
    menuItems.push(
      {
        id: 'explorer-rename-file-or-folder',
        label: 'Rename...',
        accelerator: 'Enter',
      },
      {
        role: 'delete'
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

  const success = await appStore.moveFileOrFolder(dragNode, targetParent)
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
const handleMenuAction = (action: string) => {
  if (action.startsWith('filetree-sort-')) {
    const sortType = action.replace('filetree-sort-', '') as FileTreeSortType
    setSortOption(sortType)
    return
  }

  const node = currentContextNode.value
  if (!node) return
  
  switch (action) {
    case 'explorer-open-file':
      openFile(node)
      break
    case 'explorer-new-file':
      createFileInFolder(node)
      break
    case 'explorer-new-folder':
      createFolderInFolder(node)
      break
    case 'explorer-reveal-in-folder':
      window.electronAPI.revealInFolder(node.path)
      break
    case 'explorer-rename-file-or-folder':
      treeRef.value?.startRenameNode(node.id)
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
  window.electronAPI.removeMenuActionListener()
})

const handleNodeDrop = (data: { dragNode: any; dropNode: any; position: string }) => {
  const dragFileNode = data.dragNode as FileTreeNode
  const dropFileNode = data.dropNode as FileTreeNode

}

</script>

<style scoped>
.workspace-file-tree {
  @apply bg-white border border-gray-200 overflow-hidden;
}

.workspace-root-header {
  @apply border-b border-gray-200;
}

.action-btn {
  @apply transition-colors duration-200;
}

.action-btn:disabled {
  @apply opacity-50 cursor-not-allowed;
}

.sort-menu {
  min-width: 180px;
}

.context-menu {
  min-width: 150px;
}

.context-menu-item {
  font-size: 0.875rem;
  border: none;
  background: none;
  cursor: pointer;
}

.context-menu-item:hover {
  background-color: #f3f4f6;
}

.tree-wrapper {
  @apply pl-1 pr-1;
}

/* 自定义滚动条样式 */
.scrollbar-thin::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}

.scrollbar-thumb-gray-400::-webkit-scrollbar-thumb {
  background-color: rgb(156 163 175);
  border-radius: 3px;
}

.scrollbar-thumb-gray-400:hover::-webkit-scrollbar-thumb {
  background-color: rgb(107 114 128);
}

/* Firefox 滚动条 */
.scrollbar-thin {
  scrollbar-width: thin;
  scrollbar-color: rgb(156 163 175) transparent;
}

</style>