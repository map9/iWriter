<template>
  <PrintSharedSettingsForm
    :settings="resolvedSettings"
    :paper-sizes="paperSizes"
    container-class="p-6"
  />
</template>

<script setup lang="ts">
import { reactive, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import PrintSharedSettingsForm from '@/components/print/PrintSharedSettingsForm.vue'
import {
  PRINT_PREFERENCES_PAPER_SIZES,
  cloneHeaderFooterSetup,
  clonePageSetup,
  clonePaginationSetup,
  cloneRunningTitleSetup,
  createResolvedMarkdownPrintSettings,
  deriveMarkdownPrintOverrides,
  rebaseResolvedSettingsOnThemeChange,
  resolveMarkdownPrintSettings,
} from '@/components/print/markdownThemes'
import type { ResolvedMarkdownPrintSettings } from '@/types'

const appStore = useAppStore()
const paperSizes = PRINT_PREFERENCES_PAPER_SIZES

const resolvedSettings = reactive<ResolvedMarkdownPrintSettings>(
  resolveMarkdownPrintSettings(appStore.globalMarkdownPrintSetting),
)

let isRebasing = false

watch(
  () => [
    resolvedSettings.themeAssignment.screenThemeId,
    resolvedSettings.themeAssignment.printThemeId,
    resolvedSettings.themeAssignment.printUsesScreenTheme,
  ] as const,
  ([nextScreen, nextPrint, nextUses], [prevScreen, prevPrint, prevUses]) => {
    if (isRebasing) return
    if (prevScreen === undefined || prevPrint === undefined || prevUses === undefined) return
    const rebased = rebaseResolvedSettingsOnThemeChange(
      resolvedSettings,
      { screenThemeId: prevScreen, printThemeId: prevPrint, printUsesScreenTheme: prevUses },
      { screenThemeId: nextScreen, printThemeId: nextPrint, printUsesScreenTheme: nextUses },
    )
    isRebasing = true
    // Mirror PrintDialog: only replace the content settings, leave themeAssignment
    // alone. Reassigning themeAssignment via Object.assign creates a new object
    // ref that re-triggers this watch + the storeback watch in a loop.
    resolvedSettings.pageSetup = clonePageSetup(rebased.pageSetup)
    resolvedSettings.pagination = clonePaginationSetup(rebased.pagination)
    resolvedSettings.headerFooter = cloneHeaderFooterSetup(rebased.headerFooter)
    resolvedSettings.runningTitle = cloneRunningTitleSetup(rebased.runningTitle)
    isRebasing = false
  },
)

watch(
  resolvedSettings,
  () => {
    appStore.globalMarkdownPrintSetting.themeAssignment = { ...resolvedSettings.themeAssignment }
    const base = createResolvedMarkdownPrintSettings(resolvedSettings.themeAssignment)
    appStore.globalMarkdownPrintSetting.printOverrides = deriveMarkdownPrintOverrides(base, resolvedSettings)
  },
  { deep: true },
)
</script>
