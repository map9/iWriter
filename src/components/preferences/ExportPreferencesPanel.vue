<template>
  <div class="flex min-h-0 flex-1">
    <aside class="flex min-h-0 w-52 shrink-0 flex-col border-r border-base-300 bg-base-200/50">
      <div class="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <ul class="space-y-1">
          <li>
            <button
              class="iw-btn btn-sm h-8 w-full justify-start border-none text-left"
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
              class="iw-btn btn-sm h-8 w-full justify-start border-none text-left"
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
            class="iw-select w-full"
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
              class="iw-input flex-1"
              :value="appStore.globalExportSetting.common.customFolderPath"
              @input="appStore.globalExportSetting.common.customFolderPath = ($event.target as HTMLInputElement).value"
            />
            <button
              class="iw-toolbar-btn btn-xs"
              :aria-label="t('preferences.export.browseFolder')"
              @click="browseCustomExportFolder"
            >
              <IconFolderOpen class="icon-xs" />
            </button>
          </div>
        </div>

        <div class="flex flex-col gap-1.5">
          <div class="flex items-center gap-3">
            <label class="text-sm font-medium text-base-content">{{ t('preferences.export.pandocPathTitle') }}</label>
            <button class="text-sm text-primary hover:underline" type="button" @click="openPandocDocs">
              {{ t('preferences.export.learnMore') }}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <input
              type="text"
              class="iw-input flex-1"
              :placeholder="t('preferences.export.pandocPathAutoPlaceholder')"
              :value="appStore.globalExportSetting.common.pandocPathMode === 'auto' ? '' : appStore.globalExportSetting.common.pandocPath"
              @input="handlePandocPathInput(($event.target as HTMLInputElement).value)"
            />
            <button
              class="iw-toolbar-btn btn-xs"
              :aria-label="t('preferences.export.browseFolder')"
              @click="browsePandocFolder"
            >
              <IconFolderOpen class="icon-xs" />
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
        <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.export.configTitle') }}</h3>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.argsTitle') }}</label>
          <input type="text" class="iw-input w-full" :value="buildArgsPreview(activeFormat)" readonly />
        </div>

        <div class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.customArgsTitle') }}</label>
          <input
            type="text"
            class="iw-input w-full"
            :value="formatSetting.customArgs"
            @input="formatSetting.customArgs = ($event.target as HTMLInputElement).value"
          />
        </div>

        <div v-if="activeFormat === 'docx'" class="flex flex-col gap-1.5">
          <label class="text-sm font-medium text-base-content">{{ t('preferences.export.referenceDocTitle') }}</label>
          <div class="flex items-center gap-2">
            <input
              type="text"
              class="iw-input flex-1"
              :value="formatSetting.referenceDocPath || ''"
              @input="formatSetting.referenceDocPath = ($event.target as HTMLInputElement).value"
            />
            <button
              class="iw-toolbar-btn btn-xs"
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
              class="iw-input flex-1"
              :value="formatSetting.templatePath || ''"
              @input="formatSetting.templatePath = ($event.target as HTMLInputElement).value"
            />
            <button
              class="iw-toolbar-btn btn-xs"
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
              class="iw-input flex-1"
              :value="formatSetting.cssPath || ''"
              @input="formatSetting.cssPath = ($event.target as HTMLInputElement).value"
            />
            <button
              class="iw-toolbar-btn btn-xs"
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
            class="iw-input w-28"
            :value="formatSetting.tocDepth ?? 3"
            @input="formatSetting.tocDepth = Number(($event.target as HTMLInputElement).value) || 3"
          />
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconFolderOpen } from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import type { ExportFormatId, ExportFormatSettings } from '@/types'

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
    appStore.globalExportSetting.common.pandocPathMode = 'custom'
    appStore.globalExportSetting.common.pandocPath = result.filePaths[0]
  }
}

function handleDefaultFolderModeChange(value: string) {
  appStore.globalExportSetting.common.defaultFolderMode = value as 'prompt' | 'same-directory' | 'custom'
}

function handlePandocPathInput(value: string) {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    appStore.globalExportSetting.common.pandocPathMode = 'auto'
    appStore.globalExportSetting.common.pandocPath = ''
    return
  }

  appStore.globalExportSetting.common.pandocPathMode = 'custom'
  appStore.globalExportSetting.common.pandocPath = value
}

function openPandocDocs() {
  void window.electronAPI.openWithShell('https://pandoc.org/installing.html')
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
