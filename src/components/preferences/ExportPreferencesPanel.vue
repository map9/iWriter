<template>
  <div class="flex min-h-0 flex-1">
    <aside class="flex min-h-0 w-52 shrink-0 flex-col border-r border-base-300 bg-base-200/50">
      <div class="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <ul class="space-y-1">
          <li>
            <button
              class="btn btn-sm h-8 w-full justify-start border-none text-left"
              :class="activeSection === 'common' ? 'btn-active' : 'btn-ghost'"
              @click="activeSection = 'common'"
            >
              {{ t('preferences.export.commonLabel') }}
            </button>
          </li>
        </ul>
        <div class="my-2 border-t border-base-300" />
        <ul class="space-y-1">
          <li v-for="item in formatSections" :key="item.id">
            <button
              class="btn btn-sm h-8 w-full justify-start border-none text-left"
              :class="activeSection === item.id ? 'btn-active' : 'btn-ghost'"
              @click="activeSection = item.id"
            >
              {{ item.label }}
            </button>
          </li>
        </ul>
      </div>
    </aside>

    <div class="min-w-0 flex-1 overflow-y-auto p-6">
      <section v-if="activeSection === 'common'" class="flex flex-col gap-6">
        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.defaultFolderTitle') }}</label>
          <select
            class="select select-sm w-full"
            :value="appStore.globalExportSetting.common.defaultFolderMode"
            @change="handleDefaultFolderModeChange(($event.target as HTMLSelectElement).value)"
          >
            <option value="prompt">{{ t('preferences.export.defaultFolderPrompt') }}</option>
            <option value="same-directory">{{ t('preferences.export.defaultFolderSameDirectory') }}</option>
            <option value="custom">{{ t('preferences.export.defaultFolderCustom') }}</option>
          </select>
          <div v-if="appStore.globalExportSetting.common.defaultFolderMode === 'custom'" class="mt-2 flex items-center gap-2">
            <input
              type="text"
              class="input input-sm h-7 w-full flex-1"
              :value="appStore.globalExportSetting.common.customFolderPath"
              @input="appStore.globalExportSetting.common.customFolderPath = ($event.target as HTMLInputElement).value"
            />
            <button
              class="btn btn-ghost btn-square btn-xs"
              :aria-label="t('preferences.export.browseFolder')"
              @click="browseCustomExportFolder"
            >
              <IconFolderOpen class="icon-xs" />
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-1">
            <label class="text-sm font-medium text-base-content">{{ t('preferences.export.pandocPathTitle') }}</label>
            <button
              class="btn btn-ghost btn-square btn-xs text-base-content/50"
              type="button"
              :aria-label="t('preferences.export.pandocHelp')"
              :title="t('preferences.export.pandocHelp')"
              @click="openPandocWebsite"
            >
              <IconHelpCircle class="icon-xs" />
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="pandocPathDraft"
              type="text"
              class="input input-sm h-7 w-full flex-1"
              :placeholder="pandocPathPlaceholder"
              :disabled="pandocDetecting"
              @keydown.enter.prevent="detectPandocPath"
            />
            <button
              class="btn btn-ghost btn-square btn-xs shrink-0"
              type="button"
              :aria-label="t('common.browse')"
              :title="t('common.browse')"
              :disabled="pandocDetecting"
              @click="browsePandocFolder"
            >
              <IconFolderOpen class="icon-xs" />
            </button>
            <button
              class="btn btn-ghost btn-square btn-xs shrink-0"
              type="button"
              :aria-label="pandocDetecting ? t('common.detecting') : t('common.detect')"
              :title="pandocDetecting ? t('common.detecting') : t('common.detect')"
              :disabled="pandocDetecting"
              @click="detectPandocPath"
            >
              <span v-if="pandocDetecting" class="loading loading-spinner loading-xs"></span>
              <IconRefresh v-else class="icon-xs" />
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-1">
            <label class="text-sm font-medium text-base-content">{{ t('preferences.export.libreOfficePathTitle') }}</label>
            <button
              class="btn btn-ghost btn-square btn-xs text-base-content/50"
              type="button"
              :aria-label="t('preferences.export.libreOfficeHelp')"
              :title="t('preferences.export.libreOfficeHelp')"
              @click="openLibreOfficeWebsite"
            >
              <IconHelpCircle class="icon-xs" />
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input
              v-model="libreOfficePathDraft"
              type="text"
              class="input input-sm h-7 w-full flex-1"
              :placeholder="libreOfficePathPlaceholder"
              :disabled="libreOfficeDetecting"
              @keydown.enter.prevent="detectLibreOfficePath"
            />
            <button
              class="btn btn-ghost btn-square btn-xs shrink-0"
              type="button"
              :aria-label="t('common.browse')"
              :title="t('common.browse')"
              :disabled="libreOfficeDetecting"
              @click="browseLibreOfficeFolder"
            >
              <IconFolderOpen class="icon-xs" />
            </button>
            <button
              class="btn btn-ghost btn-square btn-xs shrink-0"
              type="button"
              :aria-label="libreOfficeDetecting ? t('common.detecting') : t('common.detect')"
              :title="libreOfficeDetecting ? t('common.detecting') : t('common.detect')"
              :disabled="libreOfficeDetecting"
              @click="detectLibreOfficePath"
            >
              <span v-if="libreOfficeDetecting" class="loading loading-spinner loading-xs"></span>
              <IconRefresh v-else class="icon-xs" />
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-3">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.afterExportTitle') }}</label>
          <label class="flex items-center gap-3">
            <input
              type="checkbox"
              class="checkbox checkbox-sm checkbox-primary"
              :checked="appStore.globalExportSetting.common.afterExportActions.reveal"
              @change="appStore.globalExportSetting.common.afterExportActions.reveal = ($event.target as HTMLInputElement).checked"
            />
            <span class="text-sm">{{ t('preferences.export.afterExportReveal') }}</span>
          </label>
          <label class="flex items-center gap-3">
            <input
              type="checkbox"
              class="checkbox checkbox-sm checkbox-primary"
              :checked="appStore.globalExportSetting.common.afterExportActions.open"
              @change="appStore.globalExportSetting.common.afterExportActions.open = ($event.target as HTMLInputElement).checked"
            />
            <span class="text-sm">{{ t('preferences.export.afterExportOpen') }}</span>
          </label>
        </div>
      </section>

      <section v-else-if="activeFormat" class="flex flex-col gap-5">
        <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.export.configTitle') }}</h3>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.argsTitle') }}</label>
          <input type="text" class="input input-sm h-7 w-full text-base-content/50" :value="buildArgsPreview(activeFormat)" readonly />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.customArgsTitle') }}</label>
          <input
            type="text"
            class="input input-sm h-7 w-full"
            :value="formatSetting.customArgs"
            @input="formatSetting.customArgs = ($event.target as HTMLInputElement).value"
          />
        </div>

        <div v-if="activeFormat === 'docx'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.referenceDocTitle') }}</label>
          <div class="flex items-center gap-2">
            <input
              type="text"
              class="input input-sm h-7 w-full flex-1"
              :value="formatSetting.referenceDocPath || ''"
              @input="formatSetting.referenceDocPath = ($event.target as HTMLInputElement).value"
            />
            <button
              class="btn btn-ghost btn-square btn-xs"
              :aria-label="t('preferences.export.browseFile')"
              @click="browseFormatFile(activeFormat, 'referenceDocPath', ['docx'])"
            >
              <IconFolderOpen class="icon-xs" />
            </button>
          </div>
        </div>

        <div v-if="activeFormat === 'odt'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.templateTitle') }}</label>
          <div class="flex items-center gap-2">
            <input
              type="text"
              class="input input-sm h-7 w-full flex-1"
              :value="formatSetting.templatePath || ''"
              @input="formatSetting.templatePath = ($event.target as HTMLInputElement).value"
            />
            <button
              class="btn btn-ghost btn-square btn-xs"
              :aria-label="t('preferences.export.browseFile')"
              @click="browseFormatFile(activeFormat, 'templatePath', ['odt'])"
            >
              <IconFolderOpen class="icon-xs" />
            </button>
          </div>
        </div>

        <div v-if="activeFormat === 'html' || activeFormat === 'epub'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.cssTitle') }}</label>
          <div class="flex items-center gap-2">
            <input
              type="text"
              class="input input-sm h-7 w-full flex-1"
              :value="formatSetting.cssPath || ''"
              @input="formatSetting.cssPath = ($event.target as HTMLInputElement).value"
            />
            <button
              class="btn btn-ghost btn-square btn-xs"
              :aria-label="t('preferences.export.browseFile')"
              @click="browseFormatFile(activeFormat, 'cssPath', ['css'])"
            >
              <IconFolderOpen class="icon-xs" />
            </button>
          </div>
        </div>

        <div v-if="activeFormat === 'epub'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.tocDepthTitle') }}</label>
          <input
            type="number"
            min="1"
            max="6"
            class="input input-sm h-7 w-28"
            :value="formatSetting.tocDepth ?? 3"
            @input="formatSetting.tocDepth = Number(($event.target as HTMLInputElement).value) || 3"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconFolderOpen, IconHelpCircle, IconRefresh } from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import { notify } from '@/utils/notifications'
import type {
  ExportFormatId,
  ExportFormatSettings,
  LibreOfficeAvailabilityResult,
  PandocAvailabilityResult,
} from '@/types'

const { t } = useI18n()
const appStore = useAppStore()

const formatSections = computed(() => [
  { id: 'html', label: 'HTML' },
  { id: 'docx', label: 'Word (.docx)' },
  { id: 'odt', label: 'OpenOffice (.odt)' },
  { id: 'rtf', label: 'RTF' },
  { id: 'epub', label: 'Epub' },
  { id: 'latex', label: 'LaTeX' },
  { id: 'mediawiki', label: 'Media Wiki' },
  { id: 'rst', label: 'reStructuredText' },
  { id: 'textile', label: 'Textile' },
  { id: 'opml', label: 'OPML' },
])

const activeSection = ref<string>('common')
const pandocPathDraft = ref(
  appStore.globalExportSetting.common.pandocPathMode === 'custom'
    ? appStore.globalExportSetting.common.pandocPath
    : ''
)
const libreOfficePathDraft = ref(
  appStore.globalExportSetting.common.libreOfficePathMode === 'custom'
    ? appStore.globalExportSetting.common.libreOfficePath
    : ''
)
const pandocDetecting = ref(false)
const libreOfficeDetecting = ref(false)
const pandocAvailability = ref<PandocAvailabilityResult | null>(null)
const libreOfficeAvailability = ref<LibreOfficeAvailabilityResult | null>(null)

const pandocPathPlaceholder = computed(() => {
  const availability = pandocAvailability.value
  if (!availability?.available) return t('preferences.export.pandocPathAutoPlaceholder')
  const detail = [availability.executablePath, availability.version].filter(Boolean).join(' · ')
  return detail
    ? t('common.autoDetected', { detail })
    : t('preferences.export.pandocPathAutoPlaceholder')
})

const libreOfficePathPlaceholder = computed(() => {
  const availability = libreOfficeAvailability.value
  if (!availability?.available) return t('preferences.export.libreOfficePathAutoPlaceholder')
  const detail = [availability.executablePath, availability.version].filter(Boolean).join(' · ')
  return detail
    ? t('common.autoDetected', { detail })
    : t('preferences.export.libreOfficePathAutoPlaceholder')
})

const activeFormat = computed<ExportFormatId | null>(() => {
  const id = activeSection.value
  return id === 'common' ? null : id as ExportFormatId
})

const formatSetting = computed<ExportFormatSettings>(() => {
  const format = activeFormat.value ?? 'html'
  return appStore.globalExportSetting.formats[format]
})

function getTargetName(format: ExportFormatId): string {
  switch (format) {
    case 'latex':
      return 'latex'
    case 'mediawiki':
      return 'mediawiki'
    case 'rst':
      return 'rst'
    default:
      return format
  }
}

function buildArgsPreview(format: ExportFormatId): string {
  const setting = appStore.globalExportSetting.formats[format]
  const parts = ['-f gfm', '-s', `-o \${outputPath}`, `-t ${getTargetName(format)}`]

  if (format === 'docx' && setting.referenceDocPath) {
    parts.push(`--reference-doc="${setting.referenceDocPath}"`)
  }
  if (format === 'odt' && setting.templatePath) {
    parts.push(`--reference-doc="${setting.templatePath}"`)
  }
  if ((format === 'html' || format === 'epub') && setting.cssPath) {
    parts.push(`--css="${setting.cssPath}"`)
  }
  if (format === 'epub' && setting.tocDepth) {
    parts.push('--toc', `--toc-depth=${setting.tocDepth}`)
  }
  if (setting.customArgs) {
    parts.push(setting.customArgs)
  }

  return parts.join(' ')
}

async function browseCustomExportFolder() {
  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (!result.canceled && result.filePaths[0]) {
    appStore.globalExportSetting.common.customFolderPath = result.filePaths[0]
  }
}

async function browsePandocFolder() {
  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (!result.canceled && result.filePaths[0]) {
    pandocPathDraft.value = result.filePaths[0]
    await detectPandocPath()
  }
}

async function browseLibreOfficeFolder() {
  const result = await window.electronAPI.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (!result.canceled && result.filePaths[0]) {
    libreOfficePathDraft.value = result.filePaths[0]
    await detectLibreOfficePath()
  }
}

async function detectPandocPath() {
  if (pandocDetecting.value) return
  const candidatePath = pandocPathDraft.value.trim()
  pandocDetecting.value = true
  try {
    const availability = await window.electronAPI.pandocCheck(
      candidatePath ? { pandocPath: candidatePath } : undefined
    )
    pandocAvailability.value = availability
    if (!availability.available) {
      throw new Error(availability.error || t('preferences.export.pandocUnavailable'))
    }

    appStore.globalExportSetting.common.pandocPathMode = candidatePath ? 'custom' : 'auto'
    appStore.globalExportSetting.common.pandocPath = candidatePath
    pandocPathDraft.value = candidatePath
    notify.success(t('common.detectionSucceeded', { name: 'Pandoc' }))
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error))
  } finally {
    pandocDetecting.value = false
  }
}

async function detectLibreOfficePath() {
  if (libreOfficeDetecting.value) return
  const candidatePath = libreOfficePathDraft.value.trim()
  libreOfficeDetecting.value = true
  try {
    const availability = await window.electronAPI.officeCheck(
      candidatePath ? { sofficePath: candidatePath } : undefined
    )
    libreOfficeAvailability.value = availability
    if (!availability.available) {
      throw new Error(availability.error || t('preferences.export.libreOfficeUnavailable'))
    }

    appStore.globalExportSetting.common.libreOfficePathMode = candidatePath ? 'custom' : 'auto'
    appStore.globalExportSetting.common.libreOfficePath = candidatePath
    libreOfficePathDraft.value = candidatePath
    notify.success(t('common.detectionSucceeded', { name: 'LibreOffice' }))
  } catch (error) {
    notify.error(error instanceof Error ? error.message : String(error))
  } finally {
    libreOfficeDetecting.value = false
  }
}

onMounted(async () => {
  pandocDetecting.value = true
  libreOfficeDetecting.value = true
  try {
    const [pandocResult, libreOfficeResult] = await Promise.all([
      window.electronAPI.pandocCheck(
        pandocPathDraft.value ? { pandocPath: pandocPathDraft.value } : undefined
      ),
      window.electronAPI.officeCheck(
        libreOfficePathDraft.value ? { sofficePath: libreOfficePathDraft.value } : undefined
      ),
    ])
    pandocAvailability.value = pandocResult
    libreOfficeAvailability.value = libreOfficeResult
  } finally {
    pandocDetecting.value = false
    libreOfficeDetecting.value = false
  }
})

function handleDefaultFolderModeChange(value: string) {
  appStore.globalExportSetting.common.defaultFolderMode = value as 'prompt' | 'same-directory' | 'custom'
}

function openPandocWebsite() {
  void window.electronAPI.openExternal('https://pandoc.org/installing.html')
}

function openLibreOfficeWebsite() {
  void window.electronAPI.openExternal('https://www.libreoffice.org/download/')
}

async function browseFormatFile(
  format: ExportFormatId,
  key: keyof ExportFormatSettings,
  extensions: string[]
) {
  const result = await window.electronAPI.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Files', extensions }],
  })
  if (!result.canceled && result.filePaths[0]) {
    appStore.globalExportSetting.formats[format][key] = result.filePaths[0] as never
  }
}
</script>
