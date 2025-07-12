<template>
  <div class="editor-toolbar">
    <!-- Undo/Redo Group -->
    <div class="toolbar-group">
      <button
        @click="props.editor?.chain().focus().undo().run()"
        :disabled="!editor || !props.editor?.can().undo()"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        title="Undo (⌘Z)"
      >
        <IconArrowBackUp :size="20" />
      </button>
      <button
        @click="props.editor?.chain().focus().redo().run()"
        :disabled="!editor || !props.editor?.can().redo()"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors"
        title="Redo (⌘⇧Z)"
      >
        <IconArrowForwardUp :size="20" />
      </button>
    </div>
    
    <div class="toolbar-separator" />
    
    <!-- Heading Dropdown -->
    <div class="toolbar-group">
      <select
        v-model="currentHeading"
        @change="setHeading(props.editor, currentHeading)"
        :disabled="!props.editor"
        class="px-3 text-sm border-none border-gray-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary-500 h-7 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
        <option value="4">Heading 4</option>
        <option value="5">Heading 5</option>
        <option value="6">Heading 6</option>
        <option value="paragraph">Paragraph</option>
      </select>
    </div>
        
    <!-- Text Formatting Group -->
    <div class="toolbar-group">
      <button
        @click="props.editor?.chain().focus().toggleBold().run()"
        :disabled="!props.editor"
        :class="{ 'bg-gray-200': props.editor?.isActive('bold') }"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Bold (⌘B)"
      >
        <IconBold :size="20" />
      </button>
      <button
        @click="props.editor?.chain().focus().toggleItalic().run()"
        :disabled="!props.editor"
        :class="{ 'bg-gray-200': props.editor?.isActive('italic') }"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Italic (⌘I)"
      >
        <IconItalic :size="20" />
      </button>
      <button
        @click="props.editor?.chain().focus().toggleUnderline().run()"
        :disabled="!props.editor"
        :class="{ 'bg-gray-200': props.editor?.isActive('underline') }"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Underline (⌘U)"
      >
        <IconUnderline :size="20" />
      </button>
      <button
        @click="props.editor?.chain().focus().toggleStrike().run()"
        :disabled="!props.editor"
        :class="{ 'bg-gray-200': props.editor?.isActive('strike') }"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Strikethrough (⌘⇧X)"
      >
        <IconStrikethrough :size="20" />
      </button>
    </div>
    
    <div class="toolbar-separator" />
    
    <!-- List Group -->
    <div class="toolbar-group">
      <button
        @click="props.editor?.chain().focus().toggleOrderedList().run()"
        :disabled="!props.editor"
        :class="{ 'bg-gray-200': props.editor?.isActive('orderedList') }"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Ordered List"
      >
        <IconListNumbers :size="20" />
      </button>
      <button
        @click="props.editor?.chain().focus().toggleBulletList().run()"
        :disabled="!props.editor"
        :class="{ 'bg-gray-200': props.editor?.isActive('bulletList') }"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Bullet List"
      >
        <IconList :size="20" />
      </button>
      <button
        @click="props.editor?.chain().focus().toggleTaskList().run()"
        :disabled="!props.editor"
        :class="{ 'bg-gray-200': props.editor?.isActive('taskList') }"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Task List"
      >
        <IconListCheck :size="20" />
      </button>
    </div>
    
    <div class="toolbar-separator" />
    
    <!-- Insert Group -->
    <div class="toolbar-group">
      <button
        @click="insertTable(props.editor)"
        :disabled="!props.editor"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Insert Table"
      >
        <IconTable :size="20" />
      </button>
      <button
        @click="insertImage(props.editor)"
        :disabled="!props.editor"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Insert Image"
      >
        <IconPhoto :size="20" />
      </button>
      <button
        @click="insertAudio(props.editor)"
        :disabled="!props.editor"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Insert Audio"
      >
        <IconVolume :size="20" />
      </button>
      <button
        @click="insertVideo(props.editor)"
        :disabled="!props.editor"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Insert Video"
      >
        <IconVideo :size="20" />
      </button>
      <button
        @click="insertLink(props.editor)"
        :disabled="!props.editor"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Insert Link"
      >
        <IconLink :size="20" />
      </button>
    </div>
    
    <div class="toolbar-separator" />
    
    <!-- Block Group -->
    <div class="toolbar-group">
      <button
        @click="props.editor?.chain().focus().toggleBlockquote().run()"
        :disabled="!props.editor"
        :class="{ 'bg-gray-200': props.editor?.isActive('blockquote') }"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Quote Block"
      >
        <IconBlockquote :size="20" />
      </button>
      <button
        @click="insertMathBlock(props.editor)"
        :disabled="!props.editor"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Math Block"
      >
        <IconMath :size="20" />
      </button>
      <button
        @click="props.editor?.chain().focus().toggleCodeBlock().run()"
        :disabled="!props.editor"
        :class="{ 'bg-gray-200': props.editor?.isActive('codeBlock') }"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Code Block"
      >
        <IconCode :size="20" />
      </button>
    </div>
    
    <!-- Spacer -->
    <div class="flex-1" />
    
    <!-- Fullscreen Button -->
    <div class="toolbar-group">
      <button
        @click="toggleFullscreen"
        :disabled="!props.editor"
        class="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Toggle Fullscreen"
      >
        <IconMaximize :size="20" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { Editor } from '@tiptap/vue-3'
import { getHeading, setHeading, insertTable, insertImage, insertAudio, insertVideo, insertLink, insertMathBlock } from '@/utils/MarkDownEditorHelper'
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconBold,
  IconItalic,
  IconUnderline,
  IconStrikethrough,
  IconListNumbers,
  IconList,
  IconListCheck,
  IconTable,
  IconPhoto,
  IconVolume,
  IconVideo,
  IconLink,
  IconBlockquote,
  IconMath,
  IconCode,
  IconMaximize
} from '@tabler/icons-vue'

interface Props {
  editor: Editor | undefined
}

const props = defineProps<Props>()

const currentHeading = ref('paragraph')

const isFullscreen = ref(false)

function updateCurrentHeading() {
  if (!props.editor) return
  
  currentHeading.value = getHeading(props.editor)
}


function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  
  // Emit event to parent component to handle fullscreen
  const event = new CustomEvent('toggle-fullscreen', {
    detail: { isFullscreen: isFullscreen.value }
  })
  document.dispatchEvent(event)
}

// Watch for editor state changes and update heading dropdown
watch(() => props.editor, (newEditor) => {
  if (newEditor) {
    const updateState = () => {
      updateCurrentHeading()
    }
    
    // Listen to editor state changes
    newEditor.on('selectionUpdate', updateState)
    newEditor.on('transaction', updateState)
    
    // Initial update
    updateState()
  }
}, { immediate: true })
</script>

<style scoped>
.editor-toolbar {
  @apply flex items-center gap-1 p-2 bg-white w-full;
}

.toolbar-group {
  @apply flex items-center gap-1;
}

.toolbar-separator {
  @apply w-px h-6 bg-gray-300 mx-2;
}
</style>