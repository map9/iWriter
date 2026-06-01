<template>
  <div
    v-if="isVisible"
    class="fixed inset-0 z-1000 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    @click="handleOverlayClick"
    @keydown.esc="handleOverlayClick"
  >
    <div
      class="flex h-140 w-200 flex-col overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl"
      @click.stop
    >
      <!-- Header -->
      <header class="flex items-start gap-4 border-b border-base-300 bg-base-200 px-3 py-4">
        <div class="flex size-11 shrink-0 items-center justify-center rounded-box bg-primary/10 text-primary">
          <IconDownload class="icon-sm" />
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="truncate text-lg font-semibold text-base-content">{{ t('updateDialog.title') }}</h2>
          <p class="mt-0.5 text-sm text-base-content/70">
            {{ t('updateDialog.newVersion') }} <span class="font-medium text-base-content">{{ updateInfo.version }}</span>
            <span class="mx-1 text-base-content/30">·</span>
            <span class="text-base-content/50">{{ t('updateDialog.currentVersion') }} {{ updateInfo.currentVersion }}</span>
          </p>
        </div>
        <button
          class="iw-btn btn-ghost self-start px-2 -translate-y-1"
          :title="isDownloading ? t('updateDialog.closeWhileDownloading') : t('common.close')"
          :aria-label="t('common.close')"
          @click="closeDialog"
        >
          <IconX class="icon-xs" />
        </button>
      </header>

      <!-- Content -->
      <section class="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <!-- Release Info -->
        <div class="mb-5 flex flex-col divide-y divide-base-300 rounded-box border border-base-300 bg-base-200/40">
          <div class="flex items-center justify-between px-4 py-2.5 text-sm">
            <span class="text-base-content/70">{{ t('updateDialog.releaseDate') }}</span>
            <span class="text-base-content">{{ formatDate(updateInfo.releaseDate) }}</span>
          </div>
          <div v-if="downloadSize" class="flex items-center justify-between px-4 py-2.5 text-sm">
            <span class="text-base-content/70">{{ t('updateDialog.downloadSize') }}</span>
            <span class="text-base-content">{{ downloadSize }}</span>
          </div>
        </div>

        <!-- Release Notes -->
        <div>
          <h3 class="mb-3 text-xs font-semibold uppercase tracking-wide text-base-content/70">{{ t('updateDialog.whatsNew') }}</h3>
          <div
            class="update-notes text-sm leading-relaxed text-base-content/90"
            @click="handleReleaseNotesClick"
            v-html="formattedReleaseNotes"
          ></div>
        </div>
      </section>

      <!-- Download Progress (sticky above actions, always visible during download) -->
      <div
        v-if="showProgress"
        class="flex shrink-0 flex-col gap-2 border-t border-base-300 bg-base-200/60 px-3 py-3"
      >
        <div class="flex items-center justify-between text-sm">
          <span class="flex items-center gap-2 text-base-content">
            <IconDownload v-if="isDownloading" class="icon-xs animate-pulse text-primary" />
            <IconCircleCheck v-else class="icon-xs text-success" />
            {{ progressLabel }}
          </span>
          <span class="font-mono tabular-nums text-base-content/90">{{ downloadProgress }}%</span>
        </div>
        <progress
          class="progress progress-primary h-2 w-full"
          :value="downloadProgress"
          max="100"
        ></progress>
      </div>

      <!-- Actions -->
      <footer class="flex items-center justify-between gap-2 border-t border-base-300 bg-base-200 px-3 py-4">
        <button class="iw-btn btn-ghost" @click="handleViewDetails">
          {{ t('updateDialog.viewDetails') }}
        </button>
        <div class="flex items-center gap-2">
          <button v-if="!isDownloading" class="iw-btn btn-ghost" @click="handleSkipVersion">
            {{ t('updateDialog.skipThisVersion') }}
          </button>
          <button v-if="!isDownloading" class="iw-btn btn-ghost" @click="handleLater">
            {{ t('updateDialog.remindMeLater') }}
          </button>
          <button
            v-if="isDownloading"
            class="iw-btn btn-primary"
            :title="t('updateDialog.closeWhileDownloading')"
            @click="closeDialog"
          >
            <span class="loading loading-spinner loading-xs"></span>
            {{ t('updateDialog.downloadInBackground') }}
          </button>
          <button v-else class="iw-btn btn-primary" @click="handleUpdate">
            {{ updateButtonText }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconDownload, IconX, IconCircleCheck } from '@tabler/icons-vue'
import type { UpdateInfo } from '@/updater/types'
import updaterService from '@/updater/UpdaterService'

interface Props {
  updateInfo: UpdateInfo
  visible: boolean
}

const props = defineProps<Props>()
const { t, locale } = useI18n()

const emit = defineEmits<{
  update: []
  later: []
  skip: []
  close: []
  'view-details': []
}>()

const isVisible = ref(props.visible)

watch(() => props.visible, (newValue) => {
  isVisible.value = newValue
})

// Read ref.value.type directly instead of via class getter to keep Vue reactivity tracking stable
const isDownloading = computed(() => updaterService.status.value.type === 'downloading')
const isDownloaded = computed(() => updaterService.status.value.type === 'downloaded')
const showProgress = computed(() => isDownloading.value || isDownloaded.value)
const downloadProgress = computed(() => updaterService.downloadProgress.value)

const downloadSize = computed(() => {
  if (props.updateInfo.files && props.updateInfo.files.length > 0) {
    const totalSize = props.updateInfo.files.reduce((sum, file) => sum + (file.size || 0), 0)
    return updaterService.formatFileSize(totalSize)
  }
  return null
})

const formattedReleaseNotes = computed(() => {
  if (!props.updateInfo.releaseNotes) {
    return `<p>${t('updateDialog.releaseNotesFallback')}</p>`
  }
  return updaterService.formatReleaseNotes(props.updateInfo.releaseNotes)
})

const updateButtonText = computed(() => {
  if (isDownloaded.value) return t('updateDialog.installNow')
  if (isDownloading.value) return t('updateDialog.downloading')
  return t('updateDialog.updateNow')
})

const progressLabel = computed(() => {
  if (isDownloaded.value) return t('updateDialog.downloadComplete')
  return t('updateDialog.downloadingProgress')
})

const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString(locale.value || undefined, {
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

const handleReleaseNotesClick = (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof Element)) return

  const link = target.closest('a')
  const href = link?.getAttribute('href')
  if (!href || !/^https?:\/\//i.test(href)) return

  event.preventDefault()
  void window.electronAPI?.openWithShell?.(href)
}

const closeDialog = () => {
  isVisible.value = false
  emit('close')
}

const handleOverlayClick = () => {
  closeDialog()
}
</script>

<style scoped>
.update-notes :deep(h1),
.update-notes :deep(h2),
.update-notes :deep(h3) {
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: var(--color-base-content);
}
.update-notes :deep(h1) { font-size: 1rem; }
.update-notes :deep(h2) { font-size: 0.875rem; }
.update-notes :deep(h3) { font-size: 0.875rem; }
.update-notes :deep(p) { margin: 0.5rem 0; }
.update-notes :deep(ul),
.update-notes :deep(ol) { margin: 0.5rem 0; padding-left: 1.25rem; }
.update-notes :deep(ul) { list-style-type: disc; }
.update-notes :deep(ol) { list-style-type: decimal; }
.update-notes :deep(li) { margin: 0.25rem 0; }
.update-notes :deep(strong) { font-weight: 600; color: var(--color-base-content); }
.update-notes :deep(em) { font-style: italic; }
.update-notes :deep(code) {
  border-radius: 0.25rem;
  background: var(--color-base-200);
  padding: 0.125rem 0.375rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--color-base-content);
}
.update-notes :deep(a) { color: var(--color-primary); }
.update-notes :deep(a:hover) { text-decoration: underline; }
</style>
