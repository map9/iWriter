<template>
  <div class="flex flex-1 overflow-hidden">
    <!-- Ready: show embedded PDF viewer -->
    <PDFViewerPage
      v-if="state === 'ready' && clonedTab"
      ref="pdfRef"
      :tab="clonedTab"
    />

    <!-- Checking / Converting: spinner -->
    <div v-else-if="state === 'checking' || state === 'converting'" class="flex flex-1 items-center justify-center">
      <div class="flex flex-col items-center gap-4 text-base-content/50">
        <span class="loading loading-spinner loading-lg"></span>
        <span class="text-sm">{{ state === 'checking' ? t('officePage.checking') : t('officePage.converting') }}</span>
      </div>
    </div>

    <!-- Guide: LibreOffice not installed -->
    <div v-else-if="state === 'guide'" class="flex flex-1 items-center justify-center">
      <div class="flex flex-1 items-center justify-center">
        <div class="max-w-xl text-center p-3">
          <div class="mb-8">
            <IconAlertTriangle class="size-20 mx-auto mb-4 text-warning" />
            <h1 class="text-xl font-semibold tracking-tight text-base-content mb-2">{{ t('officePage.guideTitle') }}</h1>
            <p class="text-md text-base-content/50">{{ t('officePage.guideDesc', { ext: fileExtension.toUpperCase() }) }}</p>
          </div>

          <!-- Primary actions -->
          <div class="flex flex-wrap justify-center gap-3 mb-4">
            <button
              class="iw-btn btn-primary w-48 h-9"
              @click="toggleInstallSteps"
            >
              <IconDownload class="icon-sm" />
              <span>{{ t('officePage.installBtn') }}</span>
            </button>

            <button
              class="iw-btn btn-ghost w-44 h-9"
              @click="openWithShell"
            >
              <IconFolderOpen class="icon-sm" />
              <span>{{ t('officePage.openAnywayBtn') }}</span>
            </button>
          </div>

          <!-- Import to Markdown (docx only) -->
          <div v-if="canImportToMarkdown" class="flex justify-center">
            <button
              class="text-sm text-primary hover:underline"
              @click="handleImportMarkdown"
            >
              {{ t('officePage.importMarkdownBtn') }}
            </button>
          </div>

          <!-- Inline installation steps (expands on button click) -->
          <Transition name="install-steps">
            <div v-if="showInstallSteps" class="mt-6 text-left rounded-xl border border-base-300 bg-base-200 p-4">
              <h2 class="text-sm font-semibold text-base-content mb-3">{{ t('officePage.installStepsTitle') }}</h2>

              <!-- Install command -->
              <div v-if="installCommand" class="flex items-center gap-2 mb-3">
                <code class="flex-1 text-xs bg-base-300 rounded px-2 py-1.5 font-mono text-base-content/80 break-all">{{ installCommand }}</code>
                <button
                  class="iw-toolbar-btn btn-xs shrink-0"
                  @click="copyInstallCommand"
                >
                  <IconCheck v-if="copied" class="icon-xs text-success" />
                  <IconCopy v-else class="icon-xs" />
                </button>
              </div>

              <!-- Download link -->
              <div class="mb-4">
                <button
                  class="text-sm text-primary hover:underline flex items-center gap-1"
                  @click="openDownloadPage"
                >
                  <IconExternalLink class="icon-xs" />
                  {{ t('officePage.installDownload') }}
                </button>
              </div>

              <p class="text-xs text-base-content/50 mb-3">{{ t('officePage.installNote') }}</p>

              <!-- Retry detection -->
              <button
                class="iw-btn btn-sm btn-primary w-full"
                :disabled="retrying"
                @click="retry"
              >
                <span v-if="retrying" class="loading loading-spinner loading-xs"></span>
                {{ t('officePage.retryBtn') }}
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Error: installed but conversion failed -->
    <div v-else-if="state === 'error'" class="flex flex-1 items-center justify-center">
      <div class="flex flex-1 items-center justify-center">
        <div class="max-w-xl text-center p-3">
          <div class="mb-8">
            <IconAlertTriangle class="size-20 mx-auto mb-4 text-error" />
            <h1 class="text-xl font-semibold tracking-tight text-base-content mb-2">{{ t('officePage.convertError') }}</h1>
            <p class="text-sm text-base-content/50 break-all">{{ errorMessage }}</p>
          </div>

          <div class="flex flex-wrap justify-center gap-3">
            <button class="iw-btn btn-primary w-44 h-9" @click="ensurePreview">
              <IconRefresh class="icon-sm" />
              <span>{{ t('officePage.retryBtn') }}</span>
            </button>

            <button class="iw-btn btn-ghost w-44 h-9" @click="openWithShell">
              <IconFolderOpen class="icon-sm" />
              <span>{{ t('officePage.openAnywayBtn') }}</span>
            </button>
          </div>

          <div v-if="canImportToMarkdown" class="flex justify-center mt-4">
            <button class="text-sm text-primary hover:underline" @click="handleImportMarkdown">
              {{ t('officePage.importMarkdownBtn') }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, defineAsyncComponent, toRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { DocumentType } from '@/types'
import type { FileTab } from '@/types'
import { notify } from '@/utils/notifications'

import {
  IconAlertTriangle,
  IconFolderOpen,
  IconDownload,
  IconCopy,
  IconCheck,
  IconExternalLink,
  IconRefresh,
} from '@tabler/icons-vue'

// PDFViewerPage 懒加载——与 MainView 共享同一 chunk
import type PDFViewerPageType from '@/components/pages/PDFViewerPage.vue'
const PDFViewerPage = defineAsyncComponent(() => import('@/components/pages/PDFViewerPage.vue'))

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  tab: FileTab
}
const props = defineProps<Props>()

const { t } = useI18n()
const appStore = useAppStore()

// ── State machine ─────────────────────────────────────────────────────────────
type ViewState = 'checking' | 'guide' | 'converting' | 'ready' | 'error'
const state = ref<ViewState>('checking')
const pdfPath = ref<string | null>(null)
const errorMessage = ref<string>('')
const installCommand = ref<string>('')
const retrying = ref(false)
const copied = ref(false)
const showInstallSteps = ref(false)

// ── Computed ──────────────────────────────────────────────────────────────────
const fileExtension = computed(() => {
  const name = props.tab.path ?? props.tab.name ?? ''
  return name.split('.').pop()?.toLowerCase() ?? ''
})

const canImportToMarkdown = computed(() => {
  const ext = fileExtension.value
  // Pandoc supports docx (and technically doc via --from docx, but pandoc cannot read .doc natively)
  return ext === 'docx'
})

/** clonedTab: 保留原始 tab.id 和 name，只把 path 换成临时 PDF 路径 */
const clonedTab = computed<FileTab | null>(() => {
  if (!pdfPath.value) return null
  return {
    ...props.tab,
    path: pdfPath.value,
    documentType: DocumentType.PDF_VIEWER,
  }
})

// ── Ref to embedded PDFViewerPage ─────────────────────────────────────────────
const pdfRef = ref<InstanceType<typeof PDFViewerPageType> | null>(null)

// ── Core logic ────────────────────────────────────────────────────────────────
async function ensurePreview() {
  if (!props.tab.path || !window.electronAPI) return

  state.value = 'checking'

  // 1. Check LibreOffice availability
  const availability = await window.electronAPI.officeCheck?.({
    sofficePath: appStore.getConfiguredSofficePath?.(),
  })

  if (!availability?.available) {
    installCommand.value = availability?.installCommand ?? ''
    state.value = 'guide'
    return
  }

  // 2. Convert to PDF
  state.value = 'converting'
  const result = await window.electronAPI.officeConvertToPdf?.({
    inputPath: props.tab.path,
    sofficePath: appStore.getConfiguredSofficePath?.(),
  })

  if (result?.success && result.pdfPath) {
    pdfPath.value = result.pdfPath
    state.value = 'ready'
  } else {
    errorMessage.value = result?.error ?? t('officePage.convertError')
    state.value = 'error'
  }
}

async function retry() {
  retrying.value = true
  try {
    await ensurePreview()
    if (state.value === 'ready') {
      showInstallSteps.value = false
    }
  } finally {
    retrying.value = false
  }
}

function toggleInstallSteps() {
  showInstallSteps.value = !showInstallSteps.value
}

async function copyInstallCommand() {
  if (!installCommand.value || !window.electronAPI?.writeClipboardText) return
  await window.electronAPI.writeClipboardText(installCommand.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

async function openDownloadPage() {
  await window.electronAPI?.openExternal?.('https://www.libreoffice.org/download/')
}

async function openWithShell() {
  if (!props.tab.path || !window.electronAPI?.openWithShell) return
  try {
    await window.electronAPI.openWithShell(props.tab.path)
  } catch (error) {
    notify.error(`${error instanceof Error ? error.message : String(error)}`, t('notify.file.operation'))
  }
}

async function handleImportMarkdown() {
  if (!props.tab.path) return
  await appStore.importOfficeToMarkdown(props.tab.path)
}

// ── Window focus: auto-retry when in guide state ──────────────────────────────
function onWindowFocus() {
  if (state.value === 'guide') {
    void ensurePreview()
  }
}

onMounted(() => {
  void ensurePreview()
  window.addEventListener('focus', onWindowFocus)
})

onUnmounted(() => {
  window.removeEventListener('focus', onWindowFocus)
})

// ── Expose (mirrors PDFViewerPage contract for MainView.getActivePageRef) ─────
function focusViewer() {
  pdfRef.value?.focusViewer?.()
}

function handleMenuAction(action: string): boolean {
  if (state.value !== 'ready' || !pdfRef.value) return false
  return pdfRef.value.handleMenuAction(action)
}

defineExpose({
  tab: toRef(props, 'tab'),
  handleMenuAction,
  focusViewer,
})
</script>

<style scoped>
.install-steps-enter-active,
.install-steps-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.install-steps-enter-from,
.install-steps-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
