<template>
  <div class="h-full flex flex-col">
    
    <!-- Explorer Header -->
    <div class="sidebar-header h-9">
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
    <div class="px-3 border-b border-gray-200 h-12 flex items-center">
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
    
    <div class="workspace-file-tree">
      <!-- Root Header with Controls - Only show when folder is open -->
      <div 
        v-if="hasRootFolder"
        class="workspace-root-header flex items-center justify-between select-none p-1 bg-gray-100 border-b border-gray-200"
      >
        <div class="flex items-center ml-2">
          <!-- Root Expand/Collapse Button -->
          <button
            @click="toggleExpandAll"
            class="expand-toggle-btn w-5 h-5 flex items-center justify-center mr-2 rounded"
          >
            <IconChevronDown v-if="isAllExpanded" class="w-3 h-3" />
            <IconChevronRight v-else class="w-3 h-3" />
          </button>
          
          <!-- Root Folder Icon and Name -->
          <IconFolder class="w-4 h-4 mr-2" />
          <span class="text-sm font-medium text-gray-700">{{ folderName }}</span>
        </div>
        
        <!-- Action Buttons -->
        <div class="flex items-center gap-1 mr-2">
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
          <div class="relative">
            <button
              @click="toggleSortMenu"
              class="action-btn flex items-center gap-1 px-1 py-1 hover:bg-gray-200 rounded text-gray-700"
              title="Sort"
            >
              <IconArrowsSort class="w-4 h-4" />
              <IconChevronDown class="w-3 h-3" />
            </button>
            
            <!-- Sort Dropdown -->
            <div
              v-if="showSortMenu"
              class="sort-menu absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50 min-w-40"
            >
              <button
                v-for="option in sortOptions"
                :key="option.value"
                @click="setSortOption(option.value)"
                class="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                :class="{ 'bg-blue-50 text-blue-600': appStore.currentFileTreeSortType === option.value }"
              >
                <component :is="option.icon" class="w-4 h-4" />
                {{ option.label }}
              </button>
            </div>
          </div>
          
          <!-- Expand/Collapse All -->
          <button
            @click="toggleExpandAll"
            class="action-btn p-1 hover:bg-gray-200 rounded"
            :title="isAllExpanded ? 'Collapse All' : 'Expand All'"
            :disabled="!hasRootFolder"
          >
            <IconFoldDown v-if="isAllExpanded" class="w-4 h-4 text-gray-600" />
            <IconFoldUp v-else class="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      <!-- Tree Content -->
      <Tree v-if="hasRootFolder"
        ref="treeRef"
        :nodes="rootChildren"
        :callbacks="fileCallbacks"
        drop-mode="inside-only"
        :initialDepth="1"
        @node-click="handleNodeClick"
        @node-drop="handleNodeDrop"
        @node-contextmenu="handleNodeContextMenu"
      />

      <!-- Context Menu -->
      <div
        v-if="contextMenu.visible"
        class="context-menu fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
        :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
      >
        <template v-if="contextMenu.node?.type === 'folder'">
          <button
            @click="openFolder(contextMenu.node)"
            class="context-menu-item w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
          >
            <IconFolderOpen class="w-4 h-4" />
            Open Folder
          </button>
          <hr class="border-gray-200 my-1" />
          <button
            @click="createFileInFolder(contextMenu.node)"
            class="context-menu-item w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
          >
            <IconFilePlus class="w-4 h-4" />
            Create File
          </button>
          <button
            @click="createFolderInFolder(contextMenu.node)"
            class="context-menu-item w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
          >
            <IconFolderPlus class="w-4 h-4" />
            New Folder
          </button>
          <hr class="border-gray-200 my-1" />
        </template>
        <template v-if="contextMenu.node?.type === 'file'">
          <button
            @click="openFile(contextMenu.node)"
            class="context-menu-item w-full text-left px-3 py-2 hover:bg-gray-100 flex items-center gap-2"
          >
            <IconFile class="w-4 h-4" />
            Open File
          </button>
          <hr class="border-gray-200 my-1" />
        </template>
        <button
          @click="deleteNode(contextMenu.node)"
          class="context-menu-item w-full text-left px-3 py-2 hover:bg-gray-100 text-red-600 flex items-center gap-2"
        >
          <IconTrash class="w-4 h-4" />
          Delete
        </button>
      </div>

      <!-- Backdrop to close context menu and sort menu -->
      <div
        v-if="contextMenu.visible || showSortMenu"
        class="fixed inset-0 z-40"
        @click="hideAllMenus"
      ></div>
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import Tree from '../common/Tree.vue'
import type { FileTreeNode, FileTreeCallbacks, FileTreeSortType } from '@/types/tree'
import { getFileIconByExtension } from '@/utils/fileIcons'
import {
  IconSearch,
  IconFolderPlus,
  IconDots,
  IconFolder,
  IconFolderOpen,
  IconFile,
  IconFilePlus,
  IconTrash,
  IconChevronRight,
  IconChevronDown,
  IconFoldUp,
  IconFoldDown,
  IconArrowsSort,
  IconSortAscending,
  IconSortDescending,
  IconCalendar,
  IconFileText
} from '@tabler/icons-vue'

const appStore = useAppStore()
const searchQuery = ref('')

const folderName = computed(() => {
  if (!appStore.currentFolder) return 'No Folder'
  return appStore.currentFolder.split('/').pop() || 'Root Folder'
})

const filteredFileTree = computed(() => {
  if (!searchQuery.value) return appStore.fileTree
  
  const query = searchQuery.value.toLowerCase()
  return appStore.fileTree.filter(item => 
    item.label.toLowerCase().includes(query)
  )
})

interface Props {
  allowCreate?: boolean
  allowDelete?: boolean
  allowRename?: boolean
  allowMove?: boolean
  rootName?: string
}

interface Emits {
  (e: 'node-click', node: FileTreeNode): void
  (e: 'file-open', node: FileTreeNode): void
  (e: 'folder-open', node: FileTreeNode): void
  (e: 'file-create', data: { parentNode: FileTreeNode; fileName: string }): void
  (e: 'folder-create', data: { parentNode: FileTreeNode; folderName: string }): void
  (e: 'file-delete', node: FileTreeNode): void
  (e: 'folder-delete', node: FileTreeNode): void
  (e: 'file-rename', data: { node: FileTreeNode; newName: string }): void
  (e: 'folder-rename', data: { node: FileTreeNode; newName: string }): void
  (e: 'file-move', data: { node: FileTreeNode; newParent: FileTreeNode }): void
  (e: 'folder-move', data: { node: FileTreeNode; newParent: FileTreeNode }): void
}

const props = withDefaults(defineProps<Props>(), {
  allowCreate: true,
  allowDelete: true,
  allowRename: true,
  allowMove: true
})

const emit = defineEmits<Emits>()
// State
const treeRef = ref<InstanceType<typeof Tree>>()
const currentCreateType = ref<'file' | 'folder'>('file')
const isAllExpanded = ref(false)
const showSortMenu = ref(false)

// Context menu
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  node: null as FileTreeNode | null
})

// Sort options
const sortOptions = [
  { value: 'none', label: 'No Sort', icon: IconArrowsSort },
  { value: 'name-asc', label: 'Name (A-Z)', icon: IconSortAscending },
  { value: 'name-desc', label: 'Name (Z-A)', icon: IconSortDescending },
  { value: 'type-asc', label: 'Type (A-Z)', icon: IconFileText },
  { value: 'type-desc', label: 'Type (Z-A)', icon: IconFileText },
  { value: 'created-asc', label: 'Created (Oldest)', icon: IconCalendar },
  { value: 'created-desc', label: 'Created (Newest)', icon: IconCalendar },
  { value: 'modified-asc', label: 'Modified (Oldest)', icon: IconCalendar },
  { value: 'modified-desc', label: 'Modified (Newest)', icon: IconCalendar }
]

const hasRootFolder = computed(() => appStore.fileTree !== null)

// Get root folder's children to display in the tree (not the root folder itself)
const rootChildren = computed(() => {
  if (!hasRootFolder.value || !appStore.fileTree || !appStore.fileTree.children) {
    return []
  }
  
  const children = [...appStore.fileTree.children]
  
  if (appStore.currentFileTreeSortType === 'none') {
    return children
  }

  const sortRecursively = (nodes: FileTreeNode[]) => {
    // Sort current level
    nodes.sort((a, b) => {
      switch (appStore.currentFileTreeSortType) {
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
          return (a.lastModified?.getTime() || 0) - (b.lastModified?.getTime() || 0)
        case 'created-desc':
          return (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0)
        case 'modified-asc':
          return (a.lastModified?.getTime() || 0) - (b.lastModified?.getTime() || 0)
        case 'modified-desc':
          return (b.lastModified?.getTime() || 0) - (a.lastModified?.getTime() || 0)
        default:
          return 0
      }
    })
    
    // Sort children recursively
    nodes.forEach(node => {
      if (node.children && node.children.length > 0) {
        sortRecursively(node.children as FileTreeNode[])
      }
    })
  }
  
  sortRecursively(children as FileTreeNode[])
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
    return getFileIconByExtension(fileNode.label)
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
    //console.log('Expanded:', node.label)
  },
  onCollapse: (node) => {
    //console.log('Collapsed:', node.label)
  },
  onRename: async (node, newName) => {
    const fileNode = node as FileTreeNode
    
    try {
      await appStore.renameFileOrFolder(fileNode, newName)
      
      if (fileNode.type === 'file') {
        emit('file-rename', { node: fileNode, newName })
      } else {
        emit('folder-rename', { node: fileNode, newName })
      }
    } catch (err) {
      const errorMessage = (err as Error).message
      throw err
    }
  },
  onAddChild: async (parentNode, newChild) => {
    try {
      await appStore.CreateFileOrFolder(parentNode as FileTreeNode, newChild as FileTreeNode)
      if (newChild.type === 'file') {
        emit('file-create', { parentNode: parentNode, fileName: newChild.label })
      } else if (newChild.type === 'folder') {
        emit('folder-create', { parentNode: parentNode, folderName: newChild.label })
      }
    } catch (err) {
      throw err
    }
  },
  onDrop: (dragNode, dropNode, position) => {
    handleFileDrop(dragNode as FileTreeNode, dropNode as FileTreeNode, position)
  }
}

// Event handlers
const handleNodeClick = (node: any) => {
  const fileNode = node as FileTreeNode
  appStore.selectedItem = fileNode
  emit('node-click', fileNode)
  
  if (fileNode.type === 'file') {
    emit('file-open', fileNode)
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
  treeRef.value?.addChildToNode(parentNode)
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
  hideAllMenus()
}

const createFolderInFolder = (folder: FileTreeNode) => {
  currentCreateType.value = 'folder'
  treeRef.value?.addChildToNode(folder)
  hideAllMenus()
}

const deleteNode = async (node: FileTreeNode | null) => {
  if (!node) return
  
  const confirmed = confirm(`Are you sure you want to delete "${node.label}"?`)
  if (confirmed) {
    try {
      const success = await appStore.deleteFileOrFolder(node)
      if (success) {
        if (node.type === 'file') {
          emit('file-delete', node)
        } else {
          emit('folder-delete', node)
        }
      }
    } catch (err) {
      
    }
  }
  hideAllMenus()
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

const toggleSortMenu = () => {
  showSortMenu.value = !showSortMenu.value
}

const setSortOption = (value: FileTreeSortType) => {
  appStore.currentFileTreeSortType = value
  showSortMenu.value = false
}

const showContextMenu = (event: MouseEvent, node: FileTreeNode | null) => {
  event.preventDefault()
  contextMenu.visible = true
  contextMenu.x = event.clientX
  contextMenu.y = event.clientY
  contextMenu.node = node
}

const hideAllMenus = () => {
  contextMenu.visible = false
  contextMenu.node = null
  showSortMenu.value = false
}

const openFolder = (folder: FileTreeNode) => {
  if (folder.type === 'folder') {
    folder.isExpanded = true
    emit('folder-open', folder)
  }
  hideAllMenus()
}

const openFile = async (file: FileTreeNode) => {
  if (file.type === 'file') {
    try {
      await appStore.openFile(file.path)
      emit('file-open', file)
    } catch (err) {
    }
  }
  hideAllMenus()
}

const handleNodeContextMenu = (data: { node: any; event: MouseEvent }) => {
  const fileNode = data.node as FileTreeNode
  showContextMenu(data.event, fileNode)
}

const handleFileDrop = async (dragNode: FileTreeNode, dropNode: FileTreeNode, position: string) => {
  try {
    let targetParent: FileTreeNode

    if (position === 'inside') {
      if (dropNode.type !== 'folder') {
        throw new Error('Cannot drop inside a file')
      }
      targetParent = dropNode
    } else {
      if (!dropNode.parent) {
        throw new Error('Cannot move to root level')
      }
      targetParent = dropNode.parent as FileTreeNode
    }

    if (isNodeChildOf(targetParent, dragNode)) {
      throw new Error('Cannot move folder into itself or its children')
    }

    if (dragNode.parent?.id === targetParent.id) {
      console.log('Moving within same parent - just reordering')
      return
    }

    const success = await appStore.moveFileOrFolder(dragNode, targetParent)
    
    if (success) {
      if (dragNode.type === 'file') {
        emit('file-move', { node: dragNode, newParent: targetParent })
      } else {
        emit('folder-move', { node: dragNode, newParent: targetParent })
      }

      console.log(`Successfully moved ${dragNode.type}: ${dragNode.label}`)
    }
  } catch (err) {
  }
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

onMounted(() => {
})

const handleNodeDrop = (data: { dragNode: any; dropNode: any; position: string }) => {
  const dragFileNode = data.dragNode as FileTreeNode
  const dropFileNode = data.dropNode as FileTreeNode
  if (dragFileNode.type === 'file') {
    emit('file-move', { node: dragFileNode, newParent: dropFileNode })
  } else {
    emit('folder-move', { node: dragFileNode, newParent: dropFileNode })
  }
}

</script>

<style scoped>
/* 滚动条悬停显示功能 */
.scrollbar-hover {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE 10+ */
}

.scrollbar-hover::-webkit-scrollbar {
  width: 0;
  height: 0;
  background: transparent;
}

.scrollbar-hover:hover {
  scrollbar-width: thin; /* Firefox */
  -ms-overflow-style: auto; /* IE 10+ */
}

.scrollbar-hover:hover::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.scrollbar-hover:hover::-webkit-scrollbar-track {
  background: #f1f1f1;
}

.scrollbar-hover:hover::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 3px;
}

.scrollbar-hover:hover::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}

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

</style>