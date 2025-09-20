<template>
  <div v-if="isVisible" class="update-dialog-overlay" @click="handleOverlayClick">
    <div class="update-dialog" @click.stop>
      <!-- Header -->
      <div class="update-dialog-header">
        <div class="update-icon">
          <IconDownload class="w-8 h-8 text-blue-600" />
        </div>
        <div class="update-info">
          <h2 class="update-title">iWriter 更新可用</h2>
          <p class="version-info">
            版本 {{ updateInfo.version }} 已发布
            <span class="current-version">(当前版本: {{ updateInfo.currentVersion }})</span>
          </p>
        </div>
        <button @click="closeDialog" class="close-button">
          <IconX class="w-5 h-5" />
        </button>
      </div>

      <!-- Content -->
      <div class="update-dialog-content">
        <!-- Release Info -->
        <div class="release-info">
          <div class="info-row">
            <span class="info-label">发布时间:</span>
            <span class="info-value">{{ formatDate(updateInfo.releaseDate) }}</span>
          </div>
          <div class="info-row" v-if="downloadSize">
            <span class="info-label">下载大小:</span>
            <span class="info-value">{{ downloadSize }}</span>
          </div>
        </div>

        <!-- Release Notes -->
        <div class="release-notes">
          <h3 class="section-title">更新内容</h3>
          <div class="notes-content" v-html="formattedReleaseNotes"></div>
        </div>

        <!-- Download Progress -->
        <div v-if="isDownloading" class="download-progress">
          <div class="progress-info">
            <span>正在下载更新包...</span>
            <span>{{ downloadProgress }}%</span>
          </div>
          <div class="progress-bar">
            <div 
              class="progress-fill" 
              :style="{ width: `${downloadProgress}%` }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="update-dialog-actions">
        <div class="action-group">
          <button 
            @click="handleViewDetails" 
            class="btn btn-secondary"
          >
            查看详情
          </button>
        </div>
        
        <div class="action-group">
          <button 
            @click="handleSkipVersion" 
            class="btn btn-text"
            :disabled="isDownloading"
          >
            跳过此版本
          </button>
          <button 
            @click="handleLater" 
            class="btn btn-secondary"
            :disabled="isDownloading"
          >
            稍后提醒
          </button>
          <button 
            @click="handleUpdate" 
            class="btn btn-primary"
            :disabled="isDownloading"
          >
            {{ updateButtonText }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { IconDownload, IconX } from '@tabler/icons-vue'
import type { UpdateInfo } from '@/updater/types'
import updaterService from '@/updater/UpdaterService'

interface Props {
  updateInfo: UpdateInfo
  visible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  update: []
  later: []
  skip: []
  close: []
  'view-details': []
}>()

const isVisible = ref(props.visible)
const downloadProgress = ref(0)

// 监听 visible 属性变化
watch(() => props.visible, (newValue) => {
  isVisible.value = newValue
})

// 计算属性
const isDownloading = computed(() => updaterService.isDownloading)
const downloadSize = computed(() => {
  if (props.updateInfo.files && props.updateInfo.files.length > 0) {
    const totalSize = props.updateInfo.files.reduce((sum, file) => sum + (file.size || 0), 0)
    return updaterService.formatFileSize(totalSize)
  }
  return null
})

const formattedReleaseNotes = computed(() => {
  if (!props.updateInfo.releaseNotes) {
    return '<p>本次更新包含了性能改进和错误修复。</p>'
  }
  return updaterService.formatReleaseNotes(props.updateInfo.releaseNotes)
})

const updateButtonText = computed(() => {
  if (isDownloading.value) {
    return '下载中...'
  }
  return '立即更新'
})

// 监听下载进度 - 使用响应式状态
watch(() => updaterService.downloadProgress.value, (newProgress) => {
  downloadProgress.value = newProgress
})

// 方法
const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

const handleUpdate = () => {
  emit('update')
}

const handleLater = () => {
  emit('later')
  closeDialog()
}

const handleSkipVersion = () => {
  emit('skip')
  closeDialog()
}

const handleViewDetails = () => {
  emit('view-details')
}

const closeDialog = () => {
  isVisible.value = false
  emit('close')
}

const handleOverlayClick = () => {
  if (!isDownloading.value) {
    closeDialog()
  }
}
</script>

<style lang="scss" scoped>
.update-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.update-dialog {
  background: white;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-width: 540px;
  width: 90vw;
  max-height: 80vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.update-dialog-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 24px 24px 0;
}

.update-icon {
  flex-shrink: 0;
  width: 48px;
  height: 48px;
  background: #eff6ff;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.update-info {
  flex: 1;
  min-width: 0;
}

.update-title {
  font-size: 20px;
  font-weight: 600;
  color: #111827;
  margin: 0 0 4px;
}

.version-info {
  font-size: 14px;
  color: #6b7280;
  margin: 0;
  
  .current-version {
    color: #9ca3af;
  }
}

.close-button {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  
  &:hover {
    background: #f3f4f6;
    color: #374151;
  }
}

.update-dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
}

.release-info {
  margin-bottom: 20px;
  
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #f3f4f6;
    
    &:last-child {
      border-bottom: none;
    }
  }
  
  .info-label {
    font-size: 14px;
    color: #6b7280;
    font-weight: 500;
  }
  
  .info-value {
    font-size: 14px;
    color: #111827;
  }
}

.release-notes {
  .section-title {
    font-size: 16px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 12px;
  }
  
  .notes-content {
    font-size: 14px;
    line-height: 1.5;
    color: #374151;
    
    :deep(h1), :deep(h2), :deep(h3) {
      font-weight: 600;
      margin: 16px 0 8px;
      color: #111827;
    }
    
    :deep(h1) { font-size: 18px; }
    :deep(h2) { font-size: 16px; }
    :deep(h3) { font-size: 14px; }
    
    :deep(p) {
      margin: 8px 0;
    }
    
    :deep(ul), :deep(ol) {
      margin: 8px 0;
      padding-left: 20px;
    }
    
    :deep(li) {
      margin: 4px 0;
    }
    
    :deep(strong) {
      font-weight: 600;
      color: #111827;
    }
    
    :deep(em) {
      font-style: italic;
    }
    
    :deep(code) {
      background: #f3f4f6;
      padding: 2px 4px;
      border-radius: 3px;
      font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
      font-size: 13px;
    }
  }
}

.download-progress {
  margin-top: 20px;
  padding: 16px;
  background: #f9fafb;
  border-radius: 8px;
  
  .progress-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 14px;
    color: #374151;
  }
  
  .progress-bar {
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #1d4ed8);
      border-radius: 4px;
      transition: width 0.3s ease;
    }
  }
}

.update-dialog-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px 24px;
  border-top: 1px solid #f3f4f6;
  
  .action-group {
    display: flex;
    gap: 12px;
    align-items: center;
  }
}

.btn {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  
  &.btn-primary {
    background: #3b82f6;
    color: white;
    
    &:hover:not(:disabled) {
      background: #2563eb;
    }
  }
  
  &.btn-secondary {
    background: #f3f4f6;
    color: #374151;
    
    &:hover:not(:disabled) {
      background: #e5e7eb;
    }
  }
  
  &.btn-text {
    background: transparent;
    color: #6b7280;
    
    &:hover:not(:disabled) {
      color: #374151;
      background: #f9fafb;
    }
  }
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  .update-dialog {
    background: #1f2937;
    color: #f9fafb;
  }
  
  .update-title {
    color: #f9fafb;
  }
  
  .version-info {
    color: #9ca3af;
  }
  
  .close-button {
    color: #9ca3af;
    
    &:hover {
      background: #374151;
      color: #d1d5db;
    }
  }
  
  .info-row {
    border-bottom-color: #374151;
  }
  
  .info-label {
    color: #9ca3af;
  }
  
  .info-value {
    color: #f9fafb;
  }
  
  .section-title {
    color: #f9fafb;
  }
  
  .notes-content {
    color: #d1d5db;
    
    :deep(h1), :deep(h2), :deep(h3) {
      color: #f9fafb;
    }
    
    :deep(strong) {
      color: #f9fafb;
    }
    
    :deep(code) {
      background: #374151;
      color: #f9fafb;
    }
  }
  
  .download-progress {
    background: #374151;
    
    .progress-info {
      color: #d1d5db;
    }
    
    .progress-bar {
      background: #4b5563;
    }
  }
  
  .update-dialog-actions {
    border-top-color: #374151;
  }
  
  .btn {
    &.btn-secondary {
      background: #374151;
      color: #d1d5db;
      
      &:hover:not(:disabled) {
        background: #4b5563;
      }
    }
    
    &.btn-text {
      color: #9ca3af;
      
      &:hover:not(:disabled) {
        color: #d1d5db;
        background: #374151;
      }
    }
  }
}
</style>