<template>
  <div>
    <div
      class="flex items-center px-3 py-1 cursor-pointer group text-sm rounded-sm mx-1"
      :class="{ 
        'bg-blue-100 text-blue-700': isSelected,
        'hover:bg-gray-100': !isSelected && !isDragOver,
        'bg-blue-50': isDragOver 
      }"
      :style="{ 
        paddingLeft: `${12 + level * 16}px`,
        boxShadow: isDragOver ? 'inset 0 0 0 2px #3b82f6' : 'none'
      }"
      @click="handleClick"
      @contextmenu.prevent="handleRightClick"
      draggable="true"
      @dragstart="handleDragStart"
      @dragover.prevent="handleDragOver"
      @dragleave="handleDragLeave"
      @drop.prevent.stop="handleDrop"
    >
      <!-- Expand/Collapse Icon -->
      <button
        v-if="item.isDirectory"
        @click.stop="toggleExpand"
        class="p-0.5 mr-1 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
      >
        <IconChevronDown
          v-if="item.isOpen"
          :size="20"
          class="text-gray-500"
        />
        <IconChevronRight
          v-else
          :size="20"
          class="text-gray-500"
        />
      </button>
      <div v-else class="w-5 mr-1" />
      
      <!-- File/Folder Icon -->
      <IconFolder
        v-if="item.isDirectory"
        :size="20"
        class="mr-2 text-blue-500 flex-shrink-0"
      />
      <IconFileText
        v-else
        :size="20"
        class="mr-2 text-gray-500 flex-shrink-0"
      />
      
      <!-- Name -->
      <input
        v-if="isRenaming"
        ref="renameInput"
        v-model="newName"
        @blur="handleRenameSubmit"
        @keydown.enter.prevent="handleRenameSubmit"
        @keydown.escape="cancelRename"
        class="flex-1 px-1 text-sm border border-blue-500 rounded"
        @click.stop
      />
      <span v-else class="flex-1 truncate">{{ item.name }}</span>
      
      <!-- File Count for directories -->
      <span
        v-if="item.isDirectory"
        class="text-xs text-gray-400 ml-2"
      >
        {{ item.childCount || 0 }}
      </span>
    </div>
    
    <!-- Children -->
    <template v-if="item.isDirectory && item.isOpen && item.children">
      <FileTreeItem
        v-for="child in item.children"
        :key="child.path"
        :item="child"
        :level="level + 1"
        @select="$emit('select', $event)"
        @show-conflict="$emit('showConflict', $event)"
      />
    </template>
    
    <!-- Context Menu -->
    <div
      v-if="showContextMenu"
      class="fixed bg-white border border-gray-200 rounded-md shadow-lg py-1 z-50"
      :style="{ left: contextMenuPosition.x + 'px', top: contextMenuPosition.y + 'px' }"
      @click.stop
    >
      <button
        @click="startRename"
        class="w-full px-3 py-1 text-left text-sm hover:bg-gray-100"
      >
        Rename
      </button>
      <button
        @click="handleDelete"
        class="w-full px-3 py-1 text-left text-sm hover:bg-gray-100 text-red-600"
      >
        Delete
      </button>
      <hr class="my-1 border-gray-200" />
      <button
        @click="handleCopy"
        class="w-full px-3 py-1 text-left text-sm hover:bg-gray-100"
      >
        Copy
      </button>
      <button
        @click="handleCut"
        class="w-full px-3 py-1 text-left text-sm hover:bg-gray-100"
      >
        Cut
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, nextTick, onMounted, onUnmounted } from 'vue'
import { useAppStore, type FileTreeItem as FileTreeItemType } from '@/stores/app'
import { notify } from '@/utils/notifications'
import {
  IconChevronDown,
  IconChevronRight,
  IconFolder,
  IconFileText
} from '@tabler/icons-vue'

interface Props {
  item: FileTreeItemType
  level: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  select: [item: FileTreeItemType]
  showConflict: [{
    sourcePath: string
    targetDir: string
    fileName: string
    isDirectory: boolean
  }]
}>()

const appStore = useAppStore()

// State
const isRenaming = ref(false)
const newName = ref('')
const renameInput = ref<HTMLInputElement>()
const showContextMenu = ref(false)
const contextMenuPosition = ref({ x: 0, y: 0 })
const isDragOver = ref(false)
const isRenameSubmitting = ref(false) // Prevent double submission
const lastClickTime = ref(0)
const clickTimeout = ref<number | null>(null)

const isSelected = computed(() => {
  return appStore.selectedItem?.path === props.item.path
})

function handleClick() {
  const currentTime = Date.now()
  const timeSinceLastClick = currentTime - lastClickTime.value
  
  // Clear any existing timeout
  if (clickTimeout.value) {
    clearTimeout(clickTimeout.value)
    clickTimeout.value = null
  }
  
  // If item is already selected and clicked within reasonable time (slow click to rename)
  if (isSelected.value && timeSinceLastClick > 300 && timeSinceLastClick < 2000) {
    // Start rename after a short delay to distinguish from double-click
    clickTimeout.value = setTimeout(() => {
      startRename()
    }, 200)
  } else {
    // First click or too fast/slow - just select the item
    emit('select', props.item)
  }
  
  lastClickTime.value = currentTime
}

async function toggleExpand() {
  console.log('toggleExpand called for:', props.item.name, 'isDirectory:', props.item.isDirectory)
  if (!props.item.isDirectory) return
  
  props.item.isOpen = !props.item.isOpen
  console.log('Toggled to:', props.item.isOpen)
  
  // Load children if not loaded yet
  if (props.item.isOpen && (!props.item.children || props.item.children.length === 0)) {
    try {
      const files = await window.electronAPI?.getFiles(props.item.path)
      if (files) {
        props.item.children = files.map(file => ({
          name: file.name,
          path: file.path,
          isDirectory: file.isDirectory,
          children: file.isDirectory ? [] : undefined,
          isOpen: false,
          childCount: file.childCount || 0
        }))
      }
    } catch (error) {
      notify.error(`无法加载文件夹内容: ${error instanceof Error ? error.message : String(error)}`, '文件系统错误')
    }
  }
}

// Context menu and operations
function handleRightClick(event: MouseEvent) {
  // Cancel any pending rename when right-clicking
  if (clickTimeout.value) {
    clearTimeout(clickTimeout.value)
    clickTimeout.value = null
  }
  
  showContextMenu.value = true
  contextMenuPosition.value = {
    x: event.clientX,
    y: event.clientY
  }
}

function hideContextMenu() {
  showContextMenu.value = false
}

function startRename() {
  isRenaming.value = true
  newName.value = props.item.name
  hideContextMenu()
  
  nextTick(() => {
    if (renameInput.value) {
      renameInput.value.focus()
      renameInput.value.select()
    }
  })
}

async function handleRenameSubmit() {
  // Prevent double submission
  if (isRenameSubmitting.value) {
    return
  }
  
  const trimmedName = newName.value.trim()
  if (!trimmedName || trimmedName === props.item.name) {
    cancelRename()
    return
  }
  
  isRenameSubmitting.value = true
  
  try {
    const result = await appStore.renameFileOrFolder(props.item.path, trimmedName)
    if (result) {
      isRenaming.value = false
    } else {
      cancelRename()
    }
  } catch (error) {
    notify.error(`重命名失败: ${error instanceof Error ? error.message : String(error)}`, '文件操作错误')
    cancelRename()
  } finally {
    isRenameSubmitting.value = false
  }
}

function cancelRename() {
  isRenaming.value = false
  newName.value = ''
  isRenameSubmitting.value = false // Reset submitting state
}

async function handleDelete() {
  hideContextMenu()
  
  const confirmMessage = props.item.isDirectory 
    ? `Are you sure you want to delete the folder "${props.item.name}" and all its contents?`
    : `Are you sure you want to delete the file "${props.item.name}"?`
  
  if (confirm(confirmMessage)) {
    try {
      await appStore.deleteFileOrFolder(props.item.path)
    } catch (error) {
      alert('Error deleting: ' + (error as Error).message)
    }
  }
}

function handleCopy() {
  hideContextMenu()
  // TODO: Implement copy functionality
  console.log('Copy:', props.item.path)
}

function handleCut() {
  hideContextMenu()
  // TODO: Implement cut functionality
  console.log('Cut:', props.item.path)
}

// Global click listener to hide context menu
function handleGlobalClick() {
  hideContextMenu()
}

function handleTriggerRename(event: CustomEvent) {
  if (event.detail.path === props.item.path) {
    startRename()
  }
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick)
  document.addEventListener('trigger-rename', handleTriggerRename as EventListener)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
  document.removeEventListener('trigger-rename', handleTriggerRename as EventListener)
  
  // Clear any pending timeout
  if (clickTimeout.value) {
    clearTimeout(clickTimeout.value)
  }
})

// Drag and drop functionality
function handleDragStart(event: DragEvent) {
  // Cancel any pending rename when starting drag
  if (clickTimeout.value) {
    clearTimeout(clickTimeout.value)
    clickTimeout.value = null
  }
  
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', props.item.path)
    event.dataTransfer.effectAllowed = 'move'
  }
}

function handleDragOver(event: DragEvent) {
  if (props.item.isDirectory && event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
    isDragOver.value = true
  }
}

function handleDragLeave() {
  isDragOver.value = false
}

async function handleDrop(event: DragEvent) {
  isDragOver.value = false
  
  if (!props.item.isDirectory || !event.dataTransfer) return
  
  const sourcePath = event.dataTransfer.getData('text/plain')
  if (!sourcePath || sourcePath === props.item.path) return
  
  
  // Prevent dropping a parent folder into its child
  if (props.item.path.startsWith(sourcePath)) {
    alert('Cannot move a folder into its own subfolder')
    return
  }
  
  try {
    const result = await appStore.moveFileOrFolder(sourcePath, props.item.path)
    
    if (result && result.conflict) {
      // Show conflict dialog by emitting to parent
      emit('showConflict', {
        sourcePath,
        targetDir: props.item.path,
        fileName: result.fileName,
        isDirectory: result.isDirectory
      })
    }
  } catch (error) {
    alert('Error moving file: ' + (error as Error).message)
  }
}
</script>