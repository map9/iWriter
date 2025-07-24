<template>
  <node-view-wrapper 
    class="image-with-caption"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 顶部标题 -->
    <div 
      v-if="showCaption && captionPosition === 'top'" 
      class="caption-editor caption-top"
      :class="{ 'caption-visible': showCaption }"
    >
      <input 
        v-model="captionText"
        placeholder="Enter image caption..."
        @blur="updateCaption"
        @keydown.enter="updateCaption"
        @click.stop
        @mousedown.stop
        class="caption-input"
        contenteditable="false"
      />
    </div>
    
    <!-- 图片内容区域 -->
    <div 
      class="image-content"
      @drop="handleDrop"
      @dragover.prevent
      @dragenter.prevent
      :class="{ 
        'drag-over': isDragOver,
        'has-image': hasValidImage,
        'loading': isLoading 
      }"
    >
      <!-- 控制按钮组 -->
      <div 
        class="image-controls"
        v-show="shouldShowControls"
        :class="{ 'visible': shouldShowControls }"
      >
        <!-- 标题按钮 -->
        <button 
          @click.stop="toggleCaption"
          class="caption-button control-button"
          :class="{ 'active': showCaption }"
          title="Toggle Caption"
          contenteditable="false"
        >
          <IconHeading class="w-4 h-4" />
        </button>
        
        <!-- 复制按钮 -->
        <button 
          @click.stop="copyImage"
          class="copy-button control-button"
          :class="{ disabled: !hasValidImage || isLoading }"
          :disabled="!hasValidImage || isLoading"
          title="Copy Image"
          contenteditable="false"
        >
          <IconCopy class="w-4 h-4" />
        </button>
        
        <!-- 刷新按钮 -->
        <button 
          @click.stop="refreshImage"
          class="refresh-button control-button"
          :class="{ disabled: !hasValidImage || isLoading }"
          :disabled="!hasValidImage || isLoading"
          title="Refresh Image"
          contenteditable="false"
        >
          <IconRefresh class="w-4 h-4" :class="{ 'animate-spin': isLoading }" />
        </button>
        
        <!-- 删除按钮 -->
        <button 
          @click.stop="deleteImage"
          class="delete-button control-button"
          title="Delete Image"
          contenteditable="false"
        >
          <IconTrash class="w-4 h-4" />
        </button>
      </div>
      
      <!-- 图片显示区域 -->
      <div class="image-display">
        <!-- 加载状态 -->
        <div v-if="isLoading" class="image-loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading...</div>
        </div>
        
        <!-- 图片 -->
        <img 
          v-show="!isLoading"
          :src="displaySrc" 
          :alt="imageAlt"
          :title="imageTitle"
          @load="handleImageLoad"
          @error="handleImageError"
          @click="handleImageClick"
          class="main-image"
          :class="{ 
            'placeholder': !hasValidImage,
            'clickable': !hasValidImage 
          }"
        />
        
        <!-- 拖拽提示 -->
        <div v-if="!hasValidImage && !isLoading" class="drop-hint">
          <div class="drop-hint-content">
            <IconPhoto class="drop-icon" />
            <div class="drop-text">Drop image here or click to upload</div>
            <div class="drop-subtext">Supports: JPEG, PNG, GIF, WebP, SVG</div>
          </div>
        </div>
        
        <!-- 拖拽覆盖层 -->
        <div v-if="isDragOver" class="drag-overlay">
          <div class="drag-content">
            <IconUpload class="drag-icon" />
            <div class="drag-text">Drop to replace image</div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 底部标题 -->
    <div 
      v-if="showCaption && captionPosition === 'bottom'" 
      class="caption-editor caption-bottom"
      :class="{ 'caption-visible': showCaption }"
    >
      <input 
        v-model="captionText"
        placeholder="Enter image caption..."
        @blur="updateCaption"
        @keydown.enter="updateCaption"
        @click.stop
        @mousedown.stop
        class="caption-input"
        contenteditable="false"
      />
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { NodeViewContent, nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { 
  IconTrash, 
  IconCopy, 
  IconHeading, 
  IconRefresh, 
  IconPhoto, 
  IconUpload 
} from '@tabler/icons-vue'
import { ImageHandler, type ImageHandlerResult } from './ImageHandler'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/vue-3'

interface NodeAttributes {
  src: string
  alt: string
  title: string
  caption: string
  showCaption: boolean
  captionPosition: 'top' | 'bottom'
  width?: number
  height?: number
}

// Props
interface Props {
  node: ProseMirrorNode
  updateAttributes: (attrs: Partial<NodeAttributes>) => void
  deleteNode: () => void
  editor: Editor
  selected: boolean
  getPos: () => number
}

const props = defineProps<Props>()


// Reactive data
const isHovered = ref(false)
const isDragOver = ref(false)
const isLoading = ref(false)
const imageError = ref(false)
const placeholderSrc = ref(ImageHandler.getPlaceholderImage())

// Computed properties
const imageSrc = computed((): string => {
  return (props.node.attrs as NodeAttributes).src || ''
})

const imageAlt = computed((): string => {
  return (props.node.attrs as NodeAttributes).alt || ''
})

const imageTitle = computed((): string => {
  return (props.node.attrs as NodeAttributes).title || ''
})

const hasValidImage = computed((): boolean => {
  return !!(imageSrc.value && !imageError.value)
})

const displaySrc = computed((): string => {
  return hasValidImage.value ? imageSrc.value : placeholderSrc.value
})

const shouldShowControls = computed((): boolean => {
  return props.selected || isHovered.value
})

// Caption related computed properties
const captionText = computed({
  get(): string {
    return (props.node.attrs as NodeAttributes).caption || ''
  },
  set(value: string) {
    props.updateAttributes({ caption: value })
  }
})

const showCaption = computed((): boolean => {
  return (props.node.attrs as NodeAttributes).showCaption || false
})

const captionPosition = computed((): 'top' | 'bottom' => {
  return (props.node.attrs as NodeAttributes).captionPosition || 'bottom'
})

// Methods
const handleMouseEnter = (): void => {
  isHovered.value = true
}

const handleMouseLeave = (): void => {
  isHovered.value = false
}

// Caption related methods
const toggleCaption = (): void => {
  const newShowCaption = !showCaption.value
  const currentAttrs = props.node.attrs as NodeAttributes
  props.updateAttributes({ 
    showCaption: newShowCaption,
    caption: newShowCaption && !currentAttrs.caption ? 'Enter caption...' : currentAttrs.caption
  })
}

const updateCaption = (): void => {
  // captionText的setter会自动调用updateAttributes
}
    
// 图片操作方法
const copyImage = async (): Promise<void> => {
  if (!hasValidImage.value || isLoading.value) return
  
  try {
    const result: ImageHandlerResult = await ImageHandler.copyImage(imageSrc.value)
    
    if (result.success) {
      console.log('Image copied to clipboard')
      // TODO: 显示成功提示
    } else {
      console.error('Failed to copy image:', result.error)
      alert(`Copy failed: ${result.error}`)
    }
  } catch (error) {
    console.error('Copy image error:', error)
    alert('Failed to copy image')
  }
}
    
const refreshImage = async (): Promise<void> => {
  if (!hasValidImage.value || isLoading.value) return
  
  isLoading.value = true
  
  try {
    const result: ImageHandlerResult = await ImageHandler.refreshImage(imageSrc.value)
    
    if (result.success && result.data) {
      // 更新图片URL以刷新显示
      props.updateAttributes({ 
        src: result.data.refreshedSrc 
      })
      imageError.value = false
      console.log('Image refreshed successfully')
    } else {
      console.error('Failed to refresh image:', result.error)
      imageError.value = true
      alert(`Refresh failed: ${result.error}`)
    }
  } catch (error) {
    console.error('Refresh image error:', error)
    imageError.value = true
    alert('Failed to refresh image')
  } finally {
    isLoading.value = false
  }
}

const deleteImage = (): void => {
  if (props.deleteNode) {
    props.deleteNode()
  }
}
    
// 拖拽处理
const handleDrop = (event: DragEvent): void => {
  event.preventDefault()
  isDragOver.value = false
  
  const files: FileList | null = event.dataTransfer?.files || null
  if (!files || files.length === 0) return
  
  handleFileUpload(files)
}

const handleFileUpload = async (files: FileList): Promise<void> => {
  isLoading.value = true
  
  try {
    const result: ImageHandlerResult = await ImageHandler.handleDropFiles(files)
    
    if (result.success && result.data) {
      const imageData = result.data
      
      // 更新节点属性
      props.updateAttributes({
        src: imageData.src,
        alt: imageData.alt,
        title: imageData.title,
        width: imageData.width,
        height: imageData.height
      })
      
      imageError.value = false
      console.log('Image uploaded successfully:', imageData.fileName)
    } else {
      console.error('Failed to upload image:', result.error)
      alert(`Upload failed: ${result.error}`)
    }
  } catch (error) {
    console.error('File upload error:', error)
    alert('Failed to upload image')
  } finally {
    isLoading.value = false
  }
}
    
// 图片事件处理
const handleImageLoad = (): void => {
  isLoading.value = false
  imageError.value = false
}

const handleImageError = (): void => {
  isLoading.value = false
  imageError.value = true
  console.warn('Image failed to load:', imageSrc.value)
}

const handleImageClick = (): void => {
  // 如果是占位符，触发文件选择
  if (!hasValidImage.value) {
    triggerFileInput()
  }
}

const triggerFileInput = (): void => {
  const input: HTMLInputElement = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = (event: Event) => {
    const target = event.target as HTMLInputElement
    const files: FileList | null = target.files
    if (files && files.length > 0) {
      handleFileUpload(files)
    }
  }
  input.click()
}
    
// 拖拽状态管理
const handleDragEnter = (): void => {
  isDragOver.value = true
}

const handleDragLeave = (event: DragEvent): void => {
  // 只有当鼠标离开整个组件时才移除拖拽状态
  const currentTarget = event.currentTarget as Element
  const relatedTarget = event.relatedTarget as Element | null
  if (!currentTarget.contains(relatedTarget)) {
    isDragOver.value = false
  }
}

// Lifecycle hooks
let el: HTMLElement | null = null

onMounted(() => {
  // 添加拖拽事件监听
  el = document.querySelector('.image-with-caption') as HTMLElement
  if (el) {
    el.addEventListener('dragenter', handleDragEnter)
    el.addEventListener('dragleave', handleDragLeave)
  }
})

onBeforeUnmount(() => {
  // 清理事件监听和对象URL
  if (el) {
    el.removeEventListener('dragenter', handleDragEnter)
    el.removeEventListener('dragleave', handleDragLeave)
  }
  
  // 如果有blob URL，清理它
  if (imageSrc.value && imageSrc.value.startsWith('blob:')) {
    ImageHandler.revokeObjectURL(imageSrc.value)
  }
})
</script>

<style lang="scss">
.tiptap {
  .image-with-caption {
    position: relative;
    margin: 16px 0;
    
    .caption-editor {
      margin: 8px 0;
      
      .caption-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px dashed rgba(148, 163, 184, 0.6);
        border-radius: 6px;
        background-color: rgba(248, 250, 252, 0.8);
        color: #475569;
        font-size: 14px;
        font-style: italic;
        transition: all 0.2s ease;
        
        &:hover {
          border-color: rgba(148, 163, 184, 0.8);
          background-color: rgba(248, 250, 252, 1);
        }
        
        &:focus {
          outline: none;
          border-color: rgba(59, 130, 246, 0.6);
          border-style: solid;
          background-color: #fff;
          font-style: normal;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
        }
        
        &::placeholder {
          color: rgba(148, 163, 184, 0.8);
        }
      }
      
      &.caption-top {
        margin-bottom: 8px;
      }
      
      &.caption-bottom {
        margin-top: 8px;
      }
    }
    
    .image-content {
      position: relative;
      border-radius: 8px;
      background-color: #f8fafc;
      border: 2px dashed transparent;
      transition: all 0.2s ease;
      min-height: 200px;
      display: flex;
      align-items: center;
      justify-content: center;
      
      &.drag-over {
        border-color: rgba(59, 130, 246, 0.5);
        background-color: rgba(59, 130, 246, 0.05);
      }
      
      &.has-image {
        background-color: transparent;
        min-height: auto;
      }
      
      &.loading {
        background-color: #f1f5f9;
      }
      
      .image-controls {
        position: absolute;
        top: 8px;
        right: 8px;
        display: flex;
        gap: 4px;
        align-items: center;
        opacity: 0;
        transform: translateY(-4px);
        transition: all 0.2s ease;
        z-index: 10;
        
        &.visible {
          opacity: 1;
          transform: translateY(0);
        }
        
        .control-button {
          border: none;
          border-radius: 4px;
          padding: 6px;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          backdrop-filter: blur(8px);
          
          &:hover:not(.disabled) {
            transform: scale(1.05);
          }
          
          &:active:not(.disabled) {
            transform: scale(0.95);
          }
          
          &.disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
        }
        
        .caption-button {
          background-color: rgba(168, 85, 247, 0.8);
          
          &:hover {
            background-color: rgba(168, 85, 247, 1);
          }
          
          &.active {
            background-color: rgba(168, 85, 247, 1);
            box-shadow: 0 0 0 2px rgba(168, 85, 247, 0.3);
          }
        }
        
        .copy-button {
          background-color: rgba(34, 197, 94, 0.8);
          
          &:hover:not(.disabled) {
            background-color: rgba(34, 197, 94, 1);
          }
        }
        
        .refresh-button {
          background-color: rgba(59, 130, 246, 0.8);
          
          &:hover:not(.disabled) {
            background-color: rgba(59, 130, 246, 1);
          }
        }
        
        .delete-button {
          background-color: rgba(239, 68, 68, 0.8);
          
          &:hover {
            background-color: rgba(239, 68, 68, 1);
          }
        }
      }
      
      .image-display {
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        
        .main-image {
          max-width: 100%;
          height: auto;
          border-radius: 6px;
          transition: all 0.2s ease;
          
          &.placeholder {
            cursor: pointer;
            opacity: 0.8;
            
            &:hover {
              opacity: 1;
            }
          }
          
          &.clickable {
            cursor: pointer;
          }
        }
        
        .image-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 40px;
          
          .loading-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid #e2e8f0;
            border-top: 3px solid #3b82f6;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          
          .loading-text {
            color: #64748b;
            font-size: 14px;
          }
        }
        
        .drop-hint {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          padding: 40px;
          
          .drop-hint-content {
            text-align: center;
            color: #64748b;
            
            .drop-icon {
              width: 48px;
              height: 48px;
              margin: 0 auto 16px;
              opacity: 0.6;
            }
            
            .drop-text {
              font-size: 16px;
              font-weight: 500;
              margin-bottom: 8px;
            }
            
            .drop-subtext {
              font-size: 12px;
              opacity: 0.7;
            }
          }
        }
        
        .drag-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(59, 130, 246, 0.1);
          border: 2px dashed rgba(59, 130, 246, 0.5);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          
          .drag-content {
            text-align: center;
            color: #3b82f6;
            
            .drag-icon {
              width: 32px;
              height: 32px;
              margin: 0 auto 8px;
            }
            
            .drag-text {
              font-size: 14px;
              font-weight: 500;
            }
          }
        }
      }
    }
    
    // 选中状态样式
    &.ProseMirror-selectednode {
      .image-content {
        outline: 2px solid rgba(59, 130, 246, 0.5);
        outline-offset: 2px;
      }
    }
  }
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
</style>