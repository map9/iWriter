<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-1000 flex items-center justify-center bg-black/45 backdrop-blur-sm"
    @click="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div
      class="flex h-140 w-200 overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-2xl"
      @click.stop
    >
      <aside class="drag-region flex w-52 shrink-0 flex-col border-r border-base-300 bg-base-200 px-3 py-4">
        <div class="pb-4 text-xs font-semibold uppercase text-base-content/60">
          {{ t('preferences.title') }}
        </div>
        <nav class="no-drag">
          <ul class="space-y-1 w-full">
            <li v-for="tab in tabs" :key="tab.id">
              <button
                class="iw-btn btn-sm h-10 w-full justify-start border-none text-left font-medium whitespace-nowrap"
                :class="activeTab === tab.id ? 'btn-primary' : 'btn-ghost'"
                @click="activeTab = tab.id"
              >
                <component :is="tab.icon" class="icon-sm" />
                <span>{{ tab.label }}</span>
              </button>
            </li>
          </ul>
        </nav>
      </aside>

      <div class="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div v-show="activeTab === 'themes'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.themes.title') }}</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.themes.languageTitle') }}</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('locale.label') }}</div>
                <div class="text-xs text-base-content/65">{{ t('preferences.themes.languageDescription') }}</div>
              </div>
              <select
                class="iw-select w-52"
                :value="appStore.locale"
                @change="appStore.setLocale(($event.target as HTMLSelectElement).value)"
              >
                <option value="en-US">{{ t('locale.enUS') }}</option>
                <option value="zh-CN">{{ t('locale.zhCN') }}</option>
              </select>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.themes.markdownThemeTitle') }}</h3>
            <div class="grid grid-cols-3 gap-3">
              <button
                v-for="theme in markdownThemes"
                :key="theme.id"
                class="card gap-3 rounded-box border bg-base-100 p-3 text-left transition-colors"
                :class="appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId === theme.id
                  ? 'border-primary bg-primary/8'
                  : 'border-base-300 hover:border-primary/40 hover:bg-base-200/60'"
                @click="appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId = theme.id"
              >
                <div class="text-sm font-medium text-base-content">{{ theme.name }}</div>
                <div class="text-xs text-base-content/65">{{ theme.description }}</div>
                <span v-if="appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId === theme.id" class="badge badge-primary badge-sm w-fit">
                  {{ t('common.active') }}
                </span>
              </button>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <div class="flex items-center justify-between">
              <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.themes.customMarkdownThemesTitle') }}</h3>
              <div class="flex items-center gap-2">
                <button class="iw-btn btn-ghost btn-xs gap-1.5" @click="handleCreateExampleTheme">
                  <IconPlus class="icon-xs" />
                  {{ t('preferences.themes.createExample') }}
                </button>
                <button class="iw-btn btn-ghost btn-xs gap-1.5" @click="openThemesFolder">
                  <IconFolderOpen class="icon-xs" />
                  {{ t('preferences.themes.openFolder') }}
                </button>
              </div>
            </div>
            <div v-if="rawCustomThemes.length === 0" class="rounded-box border border-dashed border-base-300 px-4 py-5 text-center text-sm text-base-content/50">
              {{ t('preferences.themes.noCustomThemes') }}
            </div>
            <div v-else class="flex flex-col gap-2">
              <div
                v-for="theme in rawCustomThemes"
                :key="theme.id"
                class="flex items-start gap-3 rounded-box border border-base-300 bg-base-100 px-4 py-3"
                :class="theme.errors.length > 0 ? 'border-warning/40 bg-warning/5' : ''"
              >
                <component
                  :is="theme.errors.length > 0 ? IconAlertTriangle : IconCheck"
                  class="icon-xs mt-0.5 shrink-0"
                  :class="theme.errors.length > 0 ? 'text-warning' : 'text-success'"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-base-content">{{ theme.manifest.name }}</div>
                  <div class="text-xs text-base-content/50">{{ theme.id }}</div>
                  <ul v-if="theme.errors.length > 0" class="mt-1 space-y-0.5">
                    <li v-for="(err, i) in theme.errors" :key="i" class="text-xs text-warning">{{ err }}</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.themes.appThemeTitle') }}</h3>
            <div class="grid grid-cols-3 gap-3">
              <button
                v-for="theme in availableThemes"
                :key="theme.id"
                class="card gap-3 rounded-box border bg-base-100 p-3 text-left transition-colors"
                :class="appStore.currentThemeId === theme.id
                  ? 'border-primary bg-primary/8'
                  : 'border-base-300 hover:border-primary/40 hover:bg-base-200/60'"
                @click="appStore.setTheme(theme.id)"
              >
                <ThemePreviewSample :theme-id="themePreviewThemeId(theme.id)" />
                <div class="flex items-center justify-between gap-2">
                  <span class="min-w-0 whitespace-nowrap text-sm font-medium text-base-content">{{ theme.name }}</span>
                  <span v-if="appStore.currentThemeId === theme.id" class="badge badge-primary badge-sm shrink-0">
                    {{ t('common.active') }}
                  </span>
                </div>
              </button>
            </div>
          </section>
          </div>
        </div>

        <div v-show="activeTab === 'workspace'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.workspace.title') }}</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.workspace.rulesTitle') }}</h3>
              <div class="flex flex-col gap-2 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-base-content">{{ t('preferences.workspace.workspaceIgnoreRulesTitle') }}</div>
                  <div class="text-xs text-base-content/65">{{ t('preferences.workspace.workspaceIgnoreRulesDesc') }}</div>
                </div>
                <textarea
                  class="min-h-32 w-full rounded-field resize-none border border-base-300 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary"
                  :placeholder="t('preferences.workspace.workspaceIgnoreRulesPlaceholder')"
                  :value="appStore.globalEditSetting.workspaceIgnoreRules"
                  @input="appStore.globalEditSetting.workspaceIgnoreRules = ($event.target as HTMLTextAreaElement).value"
                />
              </div>
            </section>
          </div>
        </div>

        <div v-show="activeTab === 'export'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.export.title') }}</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 overflow-hidden">
            <ExportPreferencesPanel />
          </div>
        </div>

        <div v-show="activeTab === 'print'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.print.title') }}</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 overflow-hidden">
            <PrintPreferencesPanel />
          </div>
        </div>

        <div v-show="activeTab === 'editor'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.editor.title') }}</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.editor.saving') }}</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.editor.autoSaveTitle') }}</div>
                <div class="text-xs text-base-content/65">{{ t('preferences.editor.autoSaveDesc') }}</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.autoSaveEnabled"
                  @change="appStore.autoSaveEnabled = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>

            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.editor.autoSaveIntervalTitle') + formatAutoSaveInterval(appStore.autoSaveIntervalSeconds) }}</div>
                <div class="text-xs text-base-content/65">{{ t('preferences.editor.autoSaveIntervalDesc') }}</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="number"
                  class="iw-input w-16 text-center"
                  min="30"
                  max="600"
                  step="30"
                  :disabled="!appStore.autoSaveEnabled"
                  :value="appStore.autoSaveIntervalSeconds"
                  @input="appStore.setAutoSaveIntervalSeconds(Number(($event.target as HTMLInputElement).value))"
                />
              </label>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.editor.lineEnding') }}</h3>
            <div class="flex flex-col gap-2">
              <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  value="LF"
                  :checked="appStore.globalEditSetting.lineEnding === 'LF'"
                  @change="appStore.globalEditSetting.lineEnding = 'LF'"
                />
                <span class="min-w-0 text-sm font-medium text-base-content">{{ t('preferences.editor.unixLF') }}</span>
                <span class="min-w-0 text-xs leading-5 text-base-content/65 text-right">{{ t('preferences.editor.unixLFDesc') }}</span>
              </label>
              <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  value="CRLF"
                  :checked="appStore.globalEditSetting.lineEnding === 'CRLF'"
                  @change="appStore.globalEditSetting.lineEnding = 'CRLF'"
                />
                <span class="min-w-0 text-sm font-medium text-base-content">{{ t('preferences.editor.windowsCRLF') }}</span>
                <span class="min-w-0 text-xs leading-5 text-base-content/65 text-right">{{ t('preferences.editor.windowsCRLFDesc') }}</span>
              </label>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.editor.display') }}</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.editor.firstLineIndentTitle') }}</div>
                <div class="text-xs text-base-content/65">{{ t('preferences.editor.firstLineIndentDesc') }}</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.globalEditSetting.firstLineIndent"
                  @change="appStore.globalEditSetting.firstLineIndent = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.editor.invisibleCharsTitle') }}</div>
                <div class="text-xs text-base-content/65">{{ t('preferences.editor.invisibleCharsDesc') }}</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.globalEditSetting.invisibleCharacters"
                  @change="appStore.globalEditSetting.invisibleCharacters = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.editor.textReplacement') }}</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.editor.smartPunctuationTitle') }}</div>
                <div class="text-xs text-base-content/65">{{ t('preferences.editor.smartPunctuationDesc') }}</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.globalEditSetting.smartPunctuation"
                  @change="appStore.globalEditSetting.smartPunctuation = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
          </section>

          </div>
        </div>

        <div v-show="activeTab === 'spelling'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.spelling.title') }}</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.spelling.checking') }}</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.spelling.checkWhileTypingTitle') }}</div>
                <div class="text-xs text-base-content/65">{{ t('preferences.spelling.checkWhileTypingDesc') }}</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.globalEditSetting.proofread"
                  @change="appStore.globalEditSetting.proofread = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.spelling.showErrorsTitle') }}</div>
                <div class="text-xs text-base-content/65">{{ t('preferences.spelling.showErrorsDesc') }}</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="appStore.globalEditSetting.showProofreadErrors"
                  @change="appStore.globalEditSetting.showProofreadErrors = ($event.target as HTMLInputElement).checked"
                />
              </label>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.spelling.engine') }}</h3>
            <div class="alert border-info/25 bg-info/10 text-info-content/80">
              <IconInfoCircle class="icon-xs shrink-0" />
              <span>{{ t('preferences.spelling.engineHint') }}</span>
            </div>
            <div class="flex flex-col gap-2">
              <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  value="languagetool"
                  :checked="appStore.globalEditSetting.proofreadEngineType === 'languagetool'"
                  @change="appStore.globalEditSetting.proofreadEngineType = 'languagetool'"
                />
                <span class="min-w-0 text-sm font-medium text-base-content">{{ t('preferences.spelling.languageTool') }}</span>
                <span class="min-w-0 text-xs leading-5 text-base-content/65 text-right">{{ t('preferences.spelling.languageToolDesc') }}</span>
              </label>
              <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  value="typo"
                  :checked="appStore.globalEditSetting.proofreadEngineType === 'typo'"
                  @change="appStore.globalEditSetting.proofreadEngineType = 'typo'"
                />
                <span class="min-w-0 text-sm font-medium text-base-content">{{ t('preferences.spelling.typo') }}</span>
                <span class="min-w-0 text-xs leading-5 text-base-content/65 text-right">{{ t('preferences.spelling.typoDesc') }}</span>
              </label>
            </div>
          </section>

          <section
            v-if="appStore.globalEditSetting.proofreadEngineType !== 'typo'"
            class="flex flex-col gap-3"
          >
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.spelling.ltOptions') }}</h3>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">{{ t('preferences.spelling.languageLabel') }}</label>
              <input
                type="text"
                class="iw-input"
                :placeholder="t('preferences.spelling.languagePlaceholder')"
                :value="appStore.globalEditSetting.proofreadLanguage"
                @input="appStore.globalEditSetting.proofreadLanguage = ($event.target as HTMLInputElement).value"
              />
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">{{ t('preferences.spelling.apiUrlLabel') }}</label>
              <input
                type="text"
                class="iw-input"
                placeholder="https://api.languagetool.org/v2/check"
                :value="appStore.globalEditSetting.proofreadApiUrl"
                @input="appStore.globalEditSetting.proofreadApiUrl = ($event.target as HTMLInputElement).value"
              />
              <span class="text-xs text-base-content/65">{{ t('preferences.spelling.apiUrlHint') }}</span>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">{{ t('preferences.spelling.apiKeyLabel') }} <span class="font-normal text-base-content/65">{{ t('preferences.spelling.optional') }}</span></label>
              <input
                type="password"
                class="iw-input"
                :placeholder="t('preferences.spelling.apiKeyPlaceholder')"
                :value="appStore.globalEditSetting.proofreadApiKey"
                @input="appStore.globalEditSetting.proofreadApiKey = ($event.target as HTMLInputElement).value"
              />
              <span class="text-xs text-base-content/65">{{ t('preferences.spelling.apiKeyHint') }}</span>
            </div>
          </section>
          </div>
        </div>

        <div v-show="activeTab === 'ai'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 border-b border-base-300 bg-base-200 px-7">
            <div class="flex h-full min-w-0 items-center pr-36">
              <div class="flex min-w-0 items-end gap-3">
                <h2 class="shrink-0 text-xl font-semibold text-base-content">{{ t('preferences.ai.title') }}</h2>
                <div class="truncate pb-0.5 text-sm text-base-content/65">{{ aiViewTitle }}</div>
              </div>
            </div>
            <button
              v-if="aiView === 'configure'"
              class="iw-btn btn-ghost absolute right-14 top-1/2 -translate-y-1/2 px-2"
              @click="providerSettingsRef?.cancelForm()"
            >
              <IconChevronLeft class="icon-xs" />
              <span>{{ t('common.back') }}</span>
            </button>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <ProviderSettings ref="providerSettingsRef" @view-change="onAiViewChange" />
          </div>
        </div>

        <div v-show="activeTab === 'updates'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.updates.title') }}</h2>
            <button
              class="iw-btn btn-ghost absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
          <div v-if="!updaterConfig" class="rounded-box border border-base-300 bg-base-100 px-4 py-3 text-sm text-base-content/70">
            {{ t('preferences.updates.loading') }}
          </div>

          <template v-else>
            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.updates.automaticUpdates') }}</h3>
              <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-base-content">{{ t('preferences.updates.enableAutoTitle') }}</div>
                  <div class="text-xs text-base-content/65">{{ t('preferences.updates.enableAutoDesc') }}</div>
                </div>
                <label class="label cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    class="toggle toggle-primary toggle-xs"
                    :checked="updaterConfig.enabled"
                    @change="patchUpdaterConfig({ enabled: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
              </div>
              <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-base-content">{{ t('preferences.updates.checkStartupTitle') }}</div>
                  <div class="text-xs text-base-content/65">{{ t('preferences.updates.checkStartupDesc') }}</div>
                </div>
                <label class="label cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    class="toggle toggle-primary toggle-xs"
                    :checked="updaterConfig.checkOnStartup"
                    @change="patchUpdaterConfig({ checkOnStartup: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
              </div>
              <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-base-content">{{ t('preferences.updates.autoDownloadTitle') }}</div>
                  <div class="text-xs text-base-content/65">{{ t('preferences.updates.autoDownloadDesc') }}</div>
                </div>
                <label class="label cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    class="toggle toggle-primary toggle-xs"
                    :checked="updaterConfig.autoDownload"
                    :disabled="!updaterConfig.enabled"
                    @change="patchUpdaterConfig({ autoDownload: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
              </div>
              <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-base-content">{{ t('preferences.updates.autoInstallTitle') }}</div>
                  <div class="text-xs text-base-content/65">{{ t('preferences.updates.autoInstallDesc') }}</div>
                </div>
                <label class="label cursor-pointer gap-3">
                  <input
                    type="checkbox"
                    class="toggle toggle-primary toggle-xs"
                    :checked="updaterConfig.autoInstall"
                    :disabled="!updaterConfig.enabled"
                    @change="patchUpdaterConfig({ autoInstall: ($event.target as HTMLInputElement).checked })"
                  />
                </label>
              </div>
            </section>

            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.updates.channelTitle') }}</h3>
              <div class="flex flex-col gap-2">
                <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                  <input
                    type="radio"
                    class="radio radio-primary radio-xs"
                    value="stable"
                    :checked="updaterConfig.channel === 'stable'"
                    @change="patchUpdaterConfig({ channel: 'stable' })"
                  />
                  <span class="min-w-0 text-sm font-medium text-base-content">{{ t('preferences.updates.stable') }}</span>
                  <span class="min-w-0 text-xs leading-5 text-base-content/65">{{ t('preferences.updates.stableDesc') }}</span>
                </label>
                <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,9rem)_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                  <input
                    type="radio"
                    class="radio radio-primary radio-xs"
                    value="beta"
                    :checked="updaterConfig.channel === 'beta'"
                    @change="patchUpdaterConfig({ channel: 'beta' })"
                  />
                  <span class="min-w-0 text-sm font-medium text-base-content">{{ t('preferences.updates.beta') }}</span>
                  <span class="min-w-0 text-xs leading-5 text-base-content/65">{{ t('preferences.updates.betaDesc') }}</span>
                </label>
              </div>
            </section>

            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.updates.checkIntervalTitle') }}</h3>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-base-content">{{ t('preferences.updates.checkEveryHours') }}</label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  class="input input-sm w-28"
                  :value="updaterConfig.checkInterval"
                  :disabled="!updaterConfig.enabled"
                  @change="patchUpdaterConfig({ checkInterval: Number(($event.target as HTMLInputElement).value) })"
                />
              </div>
            </section>

            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.updates.actionsTitle') }}</h3>
              <div class="flex items-center gap-3">
                <button class="iw-btn btn-outline btn-primary" @click="checkForUpdates">
                  {{ t('preferences.updates.checkNow') }}
                </button>
              </div>
            </section>
          </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IconPalette,
  IconEdit,
  IconFolders,
  IconFileExport,
  IconPrinter,
  IconTextSpellcheck,
  IconRobot,
  IconDownload,
  IconInfoCircle,
  IconChevronLeft,
  IconX,
  IconFolderOpen,
  IconPlus,
  IconCheck,
  IconAlertTriangle,
} from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import ThemePreviewSample from '@/components/preferences/ThemePreviewSample.vue'
import { availableThemes, getThemePreviewThemeId } from '@/utils/themes'
import { getAllMarkdownThemes, getRawCustomThemes } from '@/components/print/markdownThemes'
import type { RawCustomTheme } from '@/types'
import updaterService from '@/updater/UpdaterService'
import type { UpdaterConfig } from '@/updater/types'
import { notify } from '@/utils/notifications'
import ProviderSettings from '@/components/ai/ProviderSettings.vue'
import ExportPreferencesPanel from '@/components/preferences/ExportPreferencesPanel.vue'
import PrintPreferencesPanel from '@/components/preferences/PrintPreferencesPanel.vue'

type TabId = 'workspace' | 'editor' | 'spelling' | 'themes' | 'print' | 'export' | 'ai' | 'updates'
type AiView = 'main' | 'configure'

interface Props {
  visible: boolean
  initialTab?: TabId
}

const props = withDefaults(defineProps<Props>(), {
  initialTab: 'editor',
})

const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()

const appStore = useAppStore()
const markdownThemes = computed(() => getAllMarkdownThemes())
const rawCustomThemes = computed<readonly RawCustomTheme[]>(() => getRawCustomThemes())

async function openThemesFolder(): Promise<void> {
  await window.electronAPI?.customThemes?.openFolder()
}

async function handleCreateExampleTheme(): Promise<void> {
  await window.electronAPI?.customThemes?.createExample()
}

const tabs = computed(() => [
  { id: 'workspace' as TabId, label: t('preferences.tabs.workspace'), icon: IconFolders },
  { id: 'editor' as TabId, label: t('preferences.tabs.editor'), icon: IconEdit },
  { id: 'spelling' as TabId, label: t('preferences.tabs.spelling'), icon: IconTextSpellcheck },
  { id: 'themes' as TabId, label: t('preferences.tabs.themes'), icon: IconPalette },
  { id: 'print' as TabId, label: t('preferences.tabs.print'), icon: IconPrinter },
  { id: 'export' as TabId, label: t('preferences.tabs.export'), icon: IconFileExport },
  { id: 'ai' as TabId, label: t('preferences.tabs.ai'), icon: IconRobot },
  { id: 'updates' as TabId, label: t('preferences.tabs.updates'), icon: IconDownload },
])

const activeTab = ref<TabId>(props.initialTab)
const providerSettingsRef = ref<InstanceType<typeof ProviderSettings> | null>(null)
const aiView = ref<AiView>('main')
const aiViewTitle = ref('')

watch(() => props.initialTab, (tab) => {
  activeTab.value = tab
})

watch(() => props.visible, (visible) => {
  if (visible) {
    activeTab.value = props.initialTab
    loadUpdaterConfig()
  }
})

const updaterConfig = computed(() => updaterService.config.value)

function themePreviewThemeId(themeId: string) {
  return getThemePreviewThemeId(themeId, appStore.systemPrefersDark)
}

function formatAutoSaveInterval(seconds: number): string {
  if (seconds < 60) {
    return t('preferences.editor.autoSaveIntervalSeconds', { count: seconds })
  }

  if (seconds % 60 === 0) {
    return t('preferences.editor.autoSaveIntervalMinutes', { count: seconds / 60 })
  }

  return t('preferences.editor.autoSaveIntervalMixed', {
    minutes: Math.floor(seconds / 60),
    seconds: seconds % 60,
  })
}

function patchUpdaterConfig(patch: Partial<UpdaterConfig>) {
  updaterService.updateConfig(patch).catch((err) => {
    console.error('Failed to update config:', err)
    notify.error(t('notify.update.saveSettingsFailed'))
  })
}

async function loadUpdaterConfig() {
  if (!updaterService.config.value) {
    try {
      await updaterService['loadConfig']?.()
    } catch {
      // ignore
    }
  }
}

async function checkForUpdates() {
  try {
    await updaterService.checkForUpdates()
  } catch (err) {
    notify.error(err instanceof Error ? err.message : String(err), t('notify.update.checkFailed'))
  }
}

function onAiViewChange(info: { view: string; title: string }) {
  aiView.value = info.view as AiView
  aiViewTitle.value = info.title
}

onMounted(() => {
  loadUpdaterConfig()
})
</script>
