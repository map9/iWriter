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
          <IconFolderOpen :size="20" class="text-gray-600" />
        </button>
        <button
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          title="More actions"
        >
          <IconDots :size="20" class="text-gray-600" />
        </button>
      </div>
    </div>

    <!-- Search Files -->
    <div class="px-3 border-b border-gray-200 h-12 flex items-center">
      <div class="relative w-full">
        <IconSearch :size="16" class="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Search Files"
          class="w-full pl-7 pr-3 h-6 text-sm border border-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-transparent"
        />
      </div>
    </div>
    
    <!-- File Tree Header -->
    <div class="flex items-center justify-between px-3 h-9 border-b border-gray-200 bg-gray-50">
      <span class="text-xs font-medium text-gray-700 uppercase tracking-wide">
        {{ folderName }}
      </span>
      <div class="flex items-center gap-1">
        <button
          @click.stop="handleNewFile"
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          title="New File"
        >
          <IconFileText :size="20" class="text-gray-600" />
        </button>
        <button
          @click.stop="handleNewFolder"
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          title="New Folder"
        >
          <IconFolderPlus :size="20" class="text-gray-600" />
        </button>
        <button
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          title="Change Sort Order"
        >
          <IconArrowsSort :size="20" class="text-gray-600" />
        </button>
        <button
          @click.stop="toggleAllFolders"
          class="p-1 rounded hover:bg-gray-200 transition-colors"
          :title="allExpanded ? 'Collapse All' : 'Expand All'"
        >
          <IconChevronDown
            v-if="allExpanded"
            :size="20"
            class="text-gray-600"
          />
          <IconChevronRight
            v-else
            :size="20"
            class="text-gray-600"
          />
        </button>
      </div>
    </div>
    
    <!-- File Tree -->
    <div 
      class="flex-1 overflow-auto"
      @dragover.prevent="handleRootDragOver"
      @dragleave="handleRootDragLeave"
      @drop.prevent="handleRootDrop"
      :class="{ 
        'bg-blue-50 rounded-none': isRootDragOver
      }"
    >
      <FileTreeItem
        v-for="item in filteredFileTree"
        :key="item.path"
        :item="item"
        :level="0"
        @select="handleFileSelect"
        @show-conflict="handleShowConflict"
      />
      
      <!-- Root drop area when no files -->
      <div
        v-if="filteredFileTree.length === 0"
        class="p-8 text-center text-gray-500"
      >
        <p class="text-sm">Folder is empty</p>
        <p class="text-xs mt-1">Drop files here to move them to this folder</p>
      </div>
    </div>
    
    <!-- Input Dialog -->
    <InputDialog
      :is-visible="showInputDialog"
      :title="dialogConfig.title"
      :placeholder="dialogConfig.placeholder"
      :default-value="dialogConfig.defaultValue"
      :confirm-text="dialogConfig.confirmText"
      @confirm="handleDialogConfirm"
      @cancel="handleDialogCancel"
    />
    
    <!-- Conflict Dialog -->
    <ConflictDialog
      :is-visible="showConflictDialog"
      :title="conflictInfo.title"
      :message="conflictInfo.message"
      @keep-both="handleConflictKeepBoth"
      @replace="handleConflictReplace"
      @cancel="handleConflictCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useAppStore } from '@/stores/app'
import {
  IconSearch,
  IconFileText,
  IconFolderPlus,
  IconFolderOpen,
  IconArrowsSort,
  IconChevronDown,
  IconChevronRight,
  IconDots
} from '@tabler/icons-vue'
import FileTreeItem from './FileTreeItem.vue'
import InputDialog from '../dialogs/InputDialog.vue'
import ConflictDialog from '../dialogs/ConflictDialog.vue'

const appStore = useAppStore()
const searchQuery = ref('')
const allExpanded = ref(false)

// Dialog state
const showInputDialog = ref(false)
const dialogConfig = ref({
  title: '',
  placeholder: '',
  defaultValue: '',
  confirmText: 'OK'
})
const pendingAction = ref<'file' | 'folder' | null>(null)
const isRootDragOver = ref(false)

// Conflict dialog state
const showConflictDialog = ref(false)
const conflictInfo = ref({
  title: '',
  message: ''
})
const pendingMove = ref<{
  sourcePath: string
  targetDir: string
} | null>(null)

const folderName = computed(() => {
  if (!appStore.currentFolder) return 'No Folder'
  return appStore.currentFolder.split('/').pop() || 'Root Folder'
})

const filteredFileTree = computed(() => {
  if (!searchQuery.value) return appStore.fileTree
  
  const query = searchQuery.value.toLowerCase()
  return appStore.fileTree.filter(item => 
    item.name.toLowerCase().includes(query)
  )
})

function handleFileSelect(item: any) {
  // Always select the item (both files and folders)
  appStore.selectItem(item)
  
  // Only open files, not folders
  if (!item.isDirectory) {
    appStore.openFile(item.path)
  }
}

function toggleAllFolders() {
  console.log('toggleAllFolders called, current state:', allExpanded.value)
  allExpanded.value = !allExpanded.value
  console.log('New state:', allExpanded.value)
  // TODO: Implement expand/collapse all logic
}

async function handleNewFile() {
  if (!appStore.currentFolder) {
    alert('Please open a folder first')
    return
  }
  
  // Ask user to choose file type
  const fileType = confirm('Create iWriter file (.iwt)?\nClick OK for .iwt or Cancel for .md')
  const extension = fileType ? '.iwt' : '.md'
  
  try {
    // Create file with chosen extension
    const filePath = await appStore.createNewFile(appStore.currentFolder, `new-file${extension}`)
    if (filePath) {
      // Open the new file in editor
      await appStore.openFile(filePath)
      
      // Wait for DOM to update completely before triggering rename
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100)) // Small delay
      
      triggerRename(filePath)
    }
  } catch (error) {
    alert('Error creating file: ' + (error as Error).message)
  }
}

async function handleNewFolder() {
  if (!appStore.currentFolder) {
    alert('Please open a folder first')
    return
  }
  
  try {
    // Create folder with default name
    const folderPath = await appStore.createNewFolder(appStore.currentFolder, 'new-folder')
    if (folderPath) {
      // Wait for DOM to update completely before triggering rename
      await nextTick()
      await new Promise(resolve => setTimeout(resolve, 100)) // Small delay
      
      triggerRename(folderPath)
    }
  } catch (error) {
    alert('Error creating folder: ' + (error as Error).message)
  }
}

async function handleDialogConfirm(value: string) {
  showInputDialog.value = false
  
  if (!appStore.currentFolder || !pendingAction.value) return
  
  try {
    if (pendingAction.value === 'file') {
      const filePath = await appStore.createNewFile(appStore.currentFolder, value)
      if (filePath) {
        // Open the new file
        await appStore.openFile(filePath)
      }
    } else if (pendingAction.value === 'folder') {
      await appStore.createNewFolder(appStore.currentFolder, value)
    }
  } catch (error) {
    alert('Error creating ' + pendingAction.value + ': ' + (error as Error).message)
  } finally {
    pendingAction.value = null
  }
}

function handleDialogCancel() {
  showInputDialog.value = false
  pendingAction.value = null
}

// Root directory drag and drop
function handleRootDragOver(event: DragEvent) {
  if (appStore.currentFolder && event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
    isRootDragOver.value = true
  }
}

function handleRootDragLeave() {
  isRootDragOver.value = false
}

async function handleRootDrop(event: DragEvent) {
  isRootDragOver.value = false
  
  if (!appStore.currentFolder || !event.dataTransfer) return
  
  const sourcePath = event.dataTransfer.getData('text/plain')
  if (!sourcePath) return
  
  
  // Don't allow dropping root folder into itself
  if (sourcePath === appStore.currentFolder) return
  
  try {
    const result = await appStore.moveFileOrFolder(sourcePath, appStore.currentFolder)
    
    if (result && result.conflict) {
      // Show conflict dialog
      const fileType = result.isDirectory ? '文件夹' : '文件'
      conflictInfo.value = {
        title: '文件冲突',
        message: `此位置已经存在名为"${result.fileName}"的${fileType}。你要使用正在移动的项目进行替换吗？`
      }
      pendingMove.value = {
        sourcePath,
        targetDir: appStore.currentFolder
      }
      showConflictDialog.value = true
    }
  } catch (error) {
    alert('Error moving file: ' + (error as Error).message)
  }
}

async function handleConflictKeepBoth() {
  showConflictDialog.value = false
  if (!pendingMove.value) return
  
  try {
    await appStore.moveFileOrFolder(pendingMove.value.sourcePath, pendingMove.value.targetDir, 'keepBoth')
  } catch (error) {
    alert('Error moving file: ' + (error as Error).message)
  } finally {
    pendingMove.value = null
  }
}

async function handleConflictReplace() {
  showConflictDialog.value = false
  if (!pendingMove.value) return
  
  try {
    await appStore.moveFileOrFolder(pendingMove.value.sourcePath, pendingMove.value.targetDir, 'replace')
  } catch (error) {
    alert('Error moving file: ' + (error as Error).message)
  } finally {
    pendingMove.value = null
  }
}

function handleConflictCancel() {
  showConflictDialog.value = false
  pendingMove.value = null
}

function handleShowConflict(conflictData: any) {
  const fileType = conflictData.isDirectory ? '文件夹' : '文件'
  conflictInfo.value = {
    title: '文件冲突',
    message: `此位置已经存在名为"${conflictData.fileName}"的${fileType}。你要使用正在移动的项目进行替换吗？`
  }
  pendingMove.value = {
    sourcePath: conflictData.sourcePath,
    targetDir: conflictData.targetDir
  }
  showConflictDialog.value = true
}

// Store path for pending rename
const pendingRenamePath = ref<string | null>(null)

function triggerRename(itemPath: string) {
  pendingRenamePath.value = itemPath
  // Emit event to trigger rename in FileTreeItem
  const event = new CustomEvent('trigger-rename', { detail: { path: itemPath } })
  document.dispatchEvent(event)
}
</script>