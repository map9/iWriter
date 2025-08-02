<template>
  <node-view-wrapper 
    class="toolbar-warpper"
    :style="{ 'text-align': textAlign }"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- 图片工具栏：在图片内部 -->
    <div 
      class="toolbar-controls"
      v-show="shouldShowControls"
      :class="{ 'visible': shouldShowControls }"
    >
      <div class="control-group flex-1 min-w-0">
        <!-- 打开文件夹按钮 -->
        <button 
          @click.stop="openFolder"
          class="control-button"
          title="Select image file"
          contenteditable="false"
        >
          <IconFolder class="control-button-icon" />
        </button>
        
        <!-- 文件路径或URL编辑输入框 -->
        <div class="control-input-group" v-if="srcStatus !== SrcStatus.EMPTY">
          <input 
            type="text"
            class="control-input-field"
            v-model="editableImagePath"
            @keydown.enter="updateImageFromInput"
            :placeholder="displayPath"
            :title="imagePath"
            contenteditable="false"
          />
          <button 
            v-if="hasInputChanged"
            @click.stop="updateImageFromInput"
            class="control-button confirm-button"
            title="Update image"
            contenteditable="false"
          >
            <IconCheck class="control-button-icon" />
          </button>
        </div>
      </div>
      
      <!-- 对齐按钮组 -->
      <div class="control-button-group">
        <!-- 左对齐按钮 -->
        <button 
          @click.stop="alignImage('left')"
          class="control-button"
          :class="{ 'active': currentAlign === 'left' }"
          title="Align Left"
          contenteditable="false"
        >
          <IconAlignLeft class="control-button-icon" />
        </button>
        
        <!-- 居中对齐按钮 -->
        <button 
          @click.stop="alignImage('center')"
          class="control-button"
          :class="{ 'active': currentAlign === 'center' }"
          title="Align Center"
          contenteditable="false"
        >
          <IconAlignCenter class="control-button-icon" />
        </button>
        
        <!-- 右对齐按钮 -->
        <button 
          @click.stop="alignImage('right')"
          class="control-button"
          :class="{ 'active': currentAlign === 'right' }"
          title="Align Right"
          contenteditable="false"
        >
          <IconAlignRight class="control-button-icon" />
        </button>

        <!-- 两端对齐按钮 -->
        <button 
          @click.stop="alignImage('justify')"
          class="control-button"
          :class="{ 'active': currentAlign === 'justify' }"
          title="Align Justified"
          contenteditable="false"
        >
          <IconAlignJustified class="control-button-icon" />
        </button>

      </div>
      
      <!-- 用系统默认程序打开按钮 -->
      <!-- 按钮组 -->
      <div class="control-group">
        <button 
          @click.stop="openWithShell"
          class="control-button"
          :class="{ disabled: isBase64Image }"
          :disabled="isBase64Image"
          :title="isBase64Image ? 'Cannot open embedded image with external application' : 'Open with default application'"
          contenteditable="false"
        >
          <IconExternalLink class="control-button-icon" />
        </button>
        
        <!-- 复制按钮 -->
        <button 
          @click.stop="copyImage"
          class="control-button"
          :disabled="srcStatus !== SrcStatus.LOADED"
          :title="srcStatus !== SrcStatus.LOADED ? 'No image to copy' : 'Copy image'"
          contenteditable="false"
        >
          <IconCopy class="control-button-icon" />
        </button>
      </div>
      
      <!-- 删除按钮 -->
      <button 
        @click.stop="deleteImage"
        class="control-button delete-button"
        title="Delete image"
        contenteditable="false"
      >
        <IconTrash class="control-button-icon" />
      </button>
    </div>
    
    <!-- 图片内容区域 -->
    <div 
      v-if="srcStatus === SrcStatus.EMPTY"
      class="control-content-empty"
      @dragover.prevent="handleDragOver"
      @drop.prevent="handleDrop"
      @dragleave="handleDragLeave"
      @click="openFolder"
      :class="{ 'drag-over': isDragOver }"
    >
      <div class="empty-image-content">
        <!-- 图片图标 -->
        <div class="empty-image-icon-container">
          <svg class="empty-image-icon" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
            <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
            <path d="M21 15l-5-5L5 21" stroke="currentColor" stroke-width="2"/>
          </svg>
        </div>
        
        <!-- 主要文本 -->
        <div class="empty-image-main-text">Drag an image here or 
          <span class="empty-image-link">upload a file</span>
        </div>
        
        <!-- 分隔线 -->
        <div class="empty-image-divider">
          <span class="empty-image-divider-text">OR</span>
        </div>
        
        <!-- 输入框区域 -->
        <div class="empty-image-input-area">
          <input 
            type="text" 
            placeholder="Paste image link"
            class="empty-image-input"
            @keydown.enter="handleUrlInput"
            @click.stop
            v-model="urlInput"
          />
          <button 
            class="empty-image-search-btn"
            @click.stop="handleUrlInput"
            :disabled="!urlInput.trim()"
          >
            Search
          </button>
        </div>
      </div>
    </div>

    <div 
      v-else-if="srcStatus === SrcStatus.ERROR"
      class="control-content-empty"
      @dragover.prevent="handleDragOver"
      @drop.prevent="handleDrop"
      @dragleave="handleDragLeave"
      @click="openFolder"
      :class="{ 'drag-over': isDragOver }"
    >
      <div class="empty-image-content">
        <!-- 错误图标 -->
        <div class="empty-image-icon-container">
          <svg class="empty-image-icon error-icon" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <path d="m15 9-6 6" stroke="currentColor" stroke-width="2"/>
            <path d="m9 9 6 6" stroke="currentColor" stroke-width="2"/>
          </svg>
        </div>
        
        <!-- 主要文本 -->
        <div class="empty-image-main-text error-text">
          Failed to load image
        </div>
        
        <!-- 重试按钮 -->
        <button class="retry-button" @click.stop="retryLoadImage">
          Try again
        </button>
      </div>
    </div>

    <!-- 图片容器：包含img和loading overlay -->
    <div 
      v-else 
      class="image-container"
      @dragover.prevent="handleDragOver"
      @drop.prevent="handleDrop"
      @dragleave="handleDragLeave"
    >
      <!-- 加载覆盖层 -->
      <div 
        v-if="srcStatus === SrcStatus.LOADING"
        class="loading-overlay"
      >
        <div class="loading-content">
          <!-- 加载动画 -->
          <div class="loading-spinner">
            <svg class="spinner-icon" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
              </circle>
            </svg>
          </div>
          <div class="loading-text">Loading image...</div>
        </div>
      </div>
      
      <!-- 图片本体 -->
      <img 
        :src="imageSrc" 
        :alt="imageAlt"
        :title="imageTitle"
        class="control-content"
        :class="{ 'loading': srcStatus === SrcStatus.LOADING }"
        @error="handleImageError"
        @load="handleImageLoad"
      />
    </div>
  </node-view-wrapper>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { nodeViewProps, NodeViewWrapper } from '@tiptap/vue-3'
import { IconFolder, IconExternalLink, IconCopy, IconTrash, IconAlignLeft, IconAlignCenter, IconAlignRight, IconAlignJustified, IconCheck } from '@tabler/icons-vue'
import { IMAGE_EXTENSIONS } from '@/types'
import { notify } from '@/utils/notifications'
import path from '@/utils/pathUtils'
import { isImageUrl } from '../utils/isImageUrl'

import './component.scss'

enum SrcStatus {
  EMPTY = 'empty',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error'
}

interface ImageAttributes {
  src: string
  alt?: string
  title?: string
}

const props = defineProps(nodeViewProps)

// Reactive data
const isHovered = ref(false)
const imageLoaded = ref(false)
const imageError = ref(false)
const isDragOver = ref(false)
const urlInput = ref('')
const editableImagePath = ref('')

// Computed properties
const imageAttrs = computed(() => props.node.attrs as ImageAttributes)

const imageSrc = computed(() => imageAttrs.value.src || '')
const imageAlt = computed(() => imageAttrs.value.alt || '')
const imageTitle = computed(() => imageAttrs.value.title || '')

// Base64 图片检测
const isBase64Image = computed((): boolean => {
  const src = imageSrc.value
  return src.startsWith('data:image/')
})

// 图片状态检测
const srcStatus = computed((): SrcStatus => {
  if (!imageSrc.value || imageSrc.value.trim() === '') {
    return SrcStatus.EMPTY
  }
  if (imageLoaded.value === true) return SrcStatus.LOADED
  if (imageError.value === true) return SrcStatus.ERROR
  return SrcStatus.LOADING  // 正在加载中
})

const shouldShowControls = computed((): boolean => {
  // 空状态不显示工具栏
  if (srcStatus.value === SrcStatus.EMPTY) return false
  
  return (props.selected || isHovered.value)
})

// 获取图片路径
const imagePath = computed((): string => {
  let src = imageSrc.value
  if (src.startsWith('file://')) {
    src = src.replace('file://', '')
  }
  return src
})

// 显示路径（截断长路径）
const displayPath = computed((): string => {
  // 如果是 base64 图片，显示特殊文本
  if (isBase64Image.value) {
    return 'Embedded Image Object'
  }
  
  const fullPath = imagePath.value
  if (fullPath.length <= 50) {
    return fullPath
  }
  
  // 如果是URL，显示域名和文件名
  if (fullPath.startsWith('http://') || fullPath.startsWith('https://')) {
    try {
      const url = new URL(fullPath)
      const filename = path.basename(url.pathname)
      return `${url.hostname}/...//${filename}`
    } catch {
      return '...' + fullPath.slice(-47)
    }
  }
  
  // 如果是本地文件路径，显示文件夹和文件名
  const dirname = path.dirname(fullPath)
  const basename = path.basename(fullPath)
  const parentDir = path.basename(dirname)
  
  if (parentDir && basename) {
    return `.../${parentDir}/${basename}`
  }
  
  return '...' + fullPath.slice(-47)
})

// 获取当前对齐方式
const textAlign = computed((): string => {
  return props.node.attrs.textAlign || 'left'
})

// 用于按钮高亮状态
const currentAlign = computed((): string => {
  return textAlign.value
})

// 监听image src变化，自动更新input
watch(() => imagePath.value, (newSrc) => {
  editableImagePath.value = newSrc
}, { immediate: true })

// 监听图片源变化，重置加载状态
watch(() => imageSrc.value, (newSrc, oldSrc) => {
  if (newSrc !== oldSrc && newSrc && newSrc.trim()) {
    imageLoaded.value = false
    imageError.value = false
  }
})

// 检查输入是否有变化
const hasInputChanged = computed((): boolean => {
  return editableImagePath.value !== imagePath.value
})

// Methods
const handleMouseEnter = (): void => {
  isHovered.value = true
  // 确保input显示当前image src
  editableImagePath.value = imagePath.value
}

const handleMouseLeave = (): void => {
  isHovered.value = false
}

const handleImageLoad = (): void => {
  imageLoaded.value = true
  imageError.value = false
}

const handleImageError = (): void => {
  imageError.value = true
  imageLoaded.value = false
}

const openFolder = async (): Promise<void> => {
  try {
    // 打开文件选择对话框
    if (window.electronAPI?.showOpenDialog) {
      const result = await window.electronAPI.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Image Files', extensions: [...IMAGE_EXTENSIONS] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      
      if (!result.canceled && result.filePaths.length > 0) {
        const selectedPath = result.filePaths[0]
        
        // 更新图片的src属性（替换而不是添加）
        props.updateAttributes({
          src: `file://${selectedPath}`,
          alt: path.basename(selectedPath),
          title: selectedPath
        })

      }
    } else {
      throw new Error('This feature is only available in desktop app')
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, 'File Selection Error')
  }
}

const openWithShell = async (): Promise<void> => {
  // 禁用 base64 图片的 openWithShell 功能
  if (isBase64Image.value) {
    notify.warning('Cannot open embedded images with external applications')
    return
  }
  
  try {
    let src = imageSrc.value
    
    if (window.electronAPI?.openWithShell) {
      /*if (src.startsWith('file://')) {
        src = src.replace('file://', '')
      }*/

      await window.electronAPI.openWithShell(src)
    } else {
      // 在浏览器中，尝试在新标签页打开
      if (src.startsWith('http://') || src.startsWith('https://')) {
        window.open(src, '_blank')
      } else {
        throw new Error('This feature is only available in desktop app')
      }
    }
  } catch (error) {
    notify.error(`Failed to open image: ${error instanceof Error ? error.message : String(error)}`, 'Open Error')
  }
}

const copyImage = async (): Promise<void> => {
  if (srcStatus.value !== SrcStatus.LOADED) {
    return
  }
  
  try {
    const src = imageSrc.value
    
    if (!src.trim()) {
      return
    }
    
    // 如果是base64图片，直接复制为图片对象
    if (isBase64Image.value) {
      // 创建图片元素并转换为blob
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Cannot get canvas context')
          
          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)
          
          canvas.toBlob(async (blob) => {
            if (!blob) throw new Error('Failed to create blob')
            
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ])
          }, 'image/png')
        } catch (error) {
          notify.error(`${error instanceof Error ? error.message : String(error)}`, 'Copy Image Error')
        }
      }
      
      img.onerror = () => {
        notify.error('Failed to load image for copying', 'Copy Image Error')
      }
      
      img.src = src
      return
    }
    
    // 对于文件路径或URL，尝试加载并复制图片对象
    if (src.startsWith('file://') || src.startsWith('http://') || src.startsWith('https://')) {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas')
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('Cannot get canvas context')
          
          canvas.width = img.width
          canvas.height = img.height
          ctx.drawImage(img, 0, 0)
          
          canvas.toBlob(async (blob) => {
            if (!blob) throw new Error('Failed to create blob')
            
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ])
            notify.success('Image copied to clipboard')
          }, 'image/png')
        } catch (error) {
          // 如果无法复制为图片，回退到复制路径
          await navigator.clipboard.writeText(imagePath.value)
        }
      }
      
      img.onerror = async () => {
        // 如果图片加载失败，回退到复制路径
        await navigator.clipboard.writeText(imagePath.value)
      }
      
      img.src = src
      return
    }
    
    // 其他情况，复制路径
    await navigator.clipboard.writeText(imagePath.value)
    
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, 'Copy Image Error')
  }
}

// 对齐方法
const alignImage = (align: string): void => {
  props.updateAttributes({ textAlign: align })
}

const deleteImage = (): void => {
  // 删除当前图片节点
  if (props.deleteNode) {
    props.deleteNode()
  }
}

// 拖拽事件处理
const handleDragOver = (event: DragEvent): void => {
  event.preventDefault()
  isDragOver.value = true
}

const handleDragLeave = (): void => {
  isDragOver.value = false
}

const handleDrop = async (event: DragEvent): Promise<void> => {
  event.preventDefault()
  isDragOver.value = false
  
  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return
  
  const file = files[0]
  if (!file.type.startsWith('image/')) {
    notify.warning('Please drop an image file')
    return
  }
  
  try {
    // 读取文件为 base64
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = reader.result as string
      // 替换图片而不是添加
      props.updateAttributes({ 
        src: base64,
        alt: file.name,
        title: file.name
      })
    }
    reader.readAsDataURL(file)
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, 'Drop Error')
  }
}

// 处理URL输入
const handleUrlInput = async (): Promise<void> => {
  const url = urlInput.value.trim()
  if (!url) {
    notify.warning('Please enter an image URL')
    return
  }
  
  try {
    const result = await isImageUrl(url)
    if (result === false) {
      notify.error('Please enter a valid URL', 'Invalid URL')
    } else {
      props.updateAttributes({ 
        src: url,
        alt: 'Image from URL',
        title: url
      })
      urlInput.value = ''
    }
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, 'URL Error')
  }
}


// 重试加载图片
const retryLoadImage = (): void => {
  const currentSrc = imageSrc.value
  if (currentSrc && currentSrc.trim()) {
    // 重置状态并重新触发加载
    imageLoaded.value = false
    imageError.value = false
    
    // 通过短暂清空再重置 src 来重新触发加载
    const originalSrc = currentSrc
    props.updateAttributes({ src: '' })
    setTimeout(() => {
      props.updateAttributes({ src: originalSrc })
    }, 10)
  }
}

// 从输入框更新图片
const updateImageFromInput = async (): Promise<void> => {
  const newPath = editableImagePath.value.trim()
  
  if (!newPath) {
    // 空值 → 空白图片
    props.updateAttributes({ src: '' })
    return
  }
  
  if (newPath === imagePath.value) {
    // 没有变化，无需处理
    return
  }
  
  // 检查是否是URL
  if (newPath.startsWith('http://') || newPath.startsWith('https://')) {
    try {
      const result = await isImageUrl(newPath)
      if (result === false) {
        notify.error('Please enter a valid URL', 'URL Error')
      } else {
        props.updateAttributes({ 
          src: newPath,
          alt: 'Image from URL',
          title: newPath
        })
      }
    } catch (error) {
      notify.error(`${error instanceof Error ? error.message : String(error)}`, 'URL Error')
    }
    return
  }
  
  // 检查是否是本地文件路径
  let filePath = newPath
  if (!filePath.startsWith('file://')) {
    filePath = `file://${filePath}`
  }
  
  try {
    if (window.electronAPI?.pathExists) {
      const actualPath = filePath.replace('file://', '')
      const exists = await window.electronAPI.pathExists(actualPath)
      
      if (!exists) {
        notify.error('File not found at the specified path', 'Invalid Path')
        return
      }
      
      props.updateAttributes({ 
        src: filePath,
        alt: path.basename(actualPath),
        title: actualPath
      })
    } else {
      throw new Error('This feature is only available in desktop app')
    }
  }
  catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, 'Path Error')
  }
}
</script>

<style lang="scss" scoped>
.tiptap {
  .toolbar-warpper {
    .toolbar-controls {
      left: 0px;
      border-radius: 8px 8px 0 0;
    }

    .control-content {
      display: inline-block;
    }
      
    .control-content-empty { 
      display: inline-block;
      background: #ffffff;
      border: 2px dashed #e5e7eb;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 280px;
      min-width: 500px;
      color: #6b7280;
      cursor: pointer;
      transition: all 0.2s ease;
      padding: 40px;
      
      &:hover {
        border-color: #d1d5db;
        background: #f9fafb;
      }
      
      &.drag-over {
        background: #eff6ff;
        border-color: #3b82f6;
        color: #3b82f6;
      }
      
      .empty-image-content {
        text-align: center;
        width: 100%;
        
        .empty-image-icon-container {
          margin-bottom: 16px;
          
          .empty-image-icon {
            width: 48px;
            height: 48px;
            color: #9ca3af;
            margin: 0 auto;
          }
        }
        
        .empty-image-main-text {
          font-size: 16px;
          font-weight: 400;
          color: #6b7280;
          margin-bottom: 24px;
          line-height: 1.5;
          
          .empty-image-link {
            color: #3b82f6;
            font-weight: 500;
            text-decoration: underline;
            cursor: pointer;
            
            &:hover {
              color: #2563eb;
            }
          }
        }
        
        .empty-image-divider {
          position: relative;
          margin: 24px 0;
          
          &::before {
            content: '';
            position: absolute;
            top: 50%;
            left: 0;
            right: 0;
            height: 1px;
            background: #e5e7eb;
            z-index: 1;
          }
          
          .empty-image-divider-text {
            position: relative;
            background: #ffffff;
            padding: 0 16px;
            color: #9ca3af;
            font-size: 14px;
            font-weight: 500;
            z-index: 2;
          }
        }
        
        .empty-image-input-area {
          display: flex;
          gap: 8px;
          max-width: 400px;
          margin: 0 auto;
          
          .empty-image-input {
            flex: 1;
            padding: 12px 16px;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            font-size: 14px;
            color: #374151;
            background: #ffffff;
            outline: none;
            transition: border-color 0.2s ease;
            
            &::placeholder {
              color: #9ca3af;
            }
            
            &:focus {
              border-color: #3b82f6;
              box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
            }
          }
          
          .empty-image-search-btn {
            padding: 12px 24px;
            background: #3b82f6;
            color: #ffffff;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: background-color 0.2s ease;
            white-space: nowrap;
            
            &:hover:not(:disabled) {
              background: #2563eb;
            }
            
            &:disabled {
              background: #d1d5db;
              cursor: not-allowed;
              color: #9ca3af;
            }
          }
        }
      }

      &.ProseMirror-selectednode {
        outline: 3px solid #6a00f5;
      }
    }
    
    .image-container {
      position: relative;
      display: inline-block;
      
      .control-content {
        display: block;
        
        &.loading {
          opacity: 0.3;
        }
      }
      
      .loading-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(255, 255, 255, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        z-index: 10;
        
        .loading-content {
          text-align: center;
          
          .loading-spinner {
            margin-bottom: 12px;
            
            .spinner-icon {
              width: 28px;
              height: 28px;
              color: #3b82f6;
              margin: 0 auto;
            }
          }
          
          .loading-text {
            font-size: 13px;
            font-weight: 500;
            color: #374151;
          }
        }
      }
      
      &.ProseMirror-selectednode {
        outline: 3px solid #6a00f5;
      }
    }
    
    .control-content-empty {
      .empty-image-content {
        .error-icon {
          color: #ef4444;
        }
        
        .error-text {
          color: #ef4444;
          margin-bottom: 16px;
        }
        
        .retry-button {
          padding: 8px 16px;
          background: #3b82f6;
          color: #ffffff;
          border: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s ease;
          
          &:hover {
            background: #2563eb;
          }
        }
      }
    }
  }
}
</style>