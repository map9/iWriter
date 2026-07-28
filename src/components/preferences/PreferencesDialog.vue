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
        <div class="pb-4 text-xs font-semibold uppercase text-base-content/70">
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
              class="iw-toolbar-btn btn-sm absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 overflow-hidden">
            <aside class="flex min-h-0 w-52 shrink-0 flex-col border-r border-base-300 bg-base-200/50">
              <div class="min-h-0 flex-1 overflow-y-auto px-3 py-4">
                <ul class="space-y-1">
                  <li>
                    <button
                      class="iw-btn btn-sm h-8 w-full justify-start border-none text-left"
                      :class="activeThemeSection === 'general' ? 'btn-active' : 'btn-ghost'"
                      @click="activeThemeSection = 'general'"
                    >
                      {{ t('preferences.themes.sectionGeneral') }}
                    </button>
                  </li>
                </ul>
                <div class="my-2 border-t border-base-300" />
                <ul class="space-y-1">
                  <li v-for="section in appThemeSections" :key="section.id">
                    <button
                      class="iw-btn btn-sm h-8 w-full justify-start border-none text-left"
                      :class="activeThemeSection === section.id ? 'btn-active' : 'btn-ghost'"
                      @click="activeThemeSection = section.id"
                    >
                      {{ section.label }}
                    </button>
                  </li>
                </ul>
                <div class="my-2 border-t border-base-300" />
                <ul class="space-y-1">
                  <li v-for="section in markdownThemeSections" :key="section.id">
                    <button
                      class="iw-btn btn-sm h-8 w-full justify-start border-none text-left"
                      :class="activeThemeSection === section.id ? 'btn-active' : 'btn-ghost'"
                      @click="activeThemeSection = section.id"
                    >
                      {{ section.label }}
                    </button>
                  </li>
                </ul>
              </div>
            </aside>

            <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
              <section v-show="activeThemeSection === 'general'" class="flex h-full min-w-0 flex-col gap-6 overflow-y-auto p-6">
                <div class="flex flex-col gap-3">
                  <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.themes.languageTitle') }}</h3>
                  <div class="flex flex-col gap-1.5">
                    <label class="text-sm font-medium text-base-content">{{ t('locale.label') }}</label>
                    <select
                      class="iw-select w-full"
                      :value="appStore.locale"
                      @change="appStore.setLocale(($event.target as HTMLSelectElement).value)"
                    >
                      <option value="en-US">{{ t('locale.enUS') }}</option>
                      <option value="zh-CN">{{ t('locale.zhCN') }}</option>
                    </select>
                    <span class="text-xs text-base-content/50">{{ t('preferences.themes.languageDescription') }}</span>
                  </div>
                </div>

                <div class="flex flex-col gap-3">
                  <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.themes.appThemeTitle') }}</h3>
                  <div class="grid grid-cols-2 gap-3">
                    <button
                      v-for="theme in generalAppThemes"
                      :key="theme.id"
                      class="flex h-44 flex-col gap-3 overflow-hidden rounded-box border bg-base-100 p-3 text-left transition-colors"
                      :class="appStore.currentThemeId === theme.id
                        ? 'border-primary bg-primary/8'
                        : 'border-base-300 hover:border-primary/40 hover:bg-base-200/60'"
                      @click="appStore.setTheme(theme.id)"
                    >
                      <ThemePreviewSample :theme-id="themePreviewThemeId(theme.id)" />
                      <div class="mt-auto flex items-center justify-between gap-2">
                        <span class="min-w-0 truncate text-sm font-medium text-base-content">{{ theme.name }}</span>
                        <span v-if="appStore.currentThemeId === theme.id" class="badge badge-primary badge-sm shrink-0">
                          {{ t('common.active') }}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              </section>

              <section v-show="activeThemeSection === 'light'" class="flex h-full min-w-0 flex-col gap-3 overflow-y-auto p-6">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.themes.sectionLightThemes') }}</h3>
                <div class="grid grid-cols-2 gap-3">
                  <button
                    v-for="theme in lightAppThemes"
                    :key="theme.id"
                    class="flex h-44 flex-col gap-3 overflow-hidden rounded-box border bg-base-100 p-3 text-left transition-colors"
                    :class="appStore.currentThemeId === theme.id
                      ? 'border-primary bg-primary/8'
                      : 'border-base-300 hover:border-primary/40 hover:bg-base-200/60'"
                    @click="appStore.setTheme(theme.id)"
                  >
                    <ThemePreviewSample :theme-id="themePreviewThemeId(theme.id)" />
                    <div class="mt-auto flex items-center justify-between gap-2">
                      <span class="min-w-0 truncate text-sm font-medium text-base-content">{{ theme.name }}</span>
                      <span v-if="appStore.currentThemeId === theme.id" class="badge badge-primary badge-sm shrink-0">
                        {{ t('common.active') }}
                      </span>
                    </div>
                  </button>
                </div>
              </section>

              <section v-show="activeThemeSection === 'dark'" class="flex h-full min-w-0 flex-col gap-3 overflow-y-auto p-6">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.themes.sectionDarkThemes') }}</h3>
                <div class="grid grid-cols-2 gap-3">
                  <button
                    v-for="theme in darkAppThemes"
                    :key="theme.id"
                    class="flex h-44 flex-col gap-3 overflow-hidden rounded-box border bg-base-100 p-3 text-left transition-colors"
                    :class="appStore.currentThemeId === theme.id
                      ? 'border-primary bg-primary/8'
                      : 'border-base-300 hover:border-primary/40 hover:bg-base-200/60'"
                    @click="appStore.setTheme(theme.id)"
                  >
                    <ThemePreviewSample :theme-id="themePreviewThemeId(theme.id)" />
                    <div class="mt-auto flex items-center justify-between gap-2">
                      <span class="min-w-0 truncate text-sm font-medium text-base-content">{{ theme.name }}</span>
                      <span v-if="appStore.currentThemeId === theme.id" class="badge badge-primary badge-sm shrink-0">
                        {{ t('common.active') }}
                      </span>
                    </div>
                  </button>
                </div>
              </section>

              <section v-show="activeThemeSection === 'markdown'" class="flex h-full min-w-0 flex-col gap-3 overflow-y-auto p-6">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.themes.sectionMarkdownThemes') }}</h3>
                <div class="grid grid-cols-2 gap-3">
                  <button
                    v-for="theme in builtInMarkdownThemeOptions"
                    :key="theme.id"
                    class="flex h-44 flex-col gap-2 overflow-hidden rounded-box border bg-base-100 p-3 text-left transition-colors"
                    :class="appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId === theme.id
                      ? 'border-primary bg-primary/8'
                      : 'border-base-300 hover:border-primary/40 hover:bg-base-200/60'"
                    @click="appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId = theme.id"
                  >
                    <div class="text-sm font-medium text-base-content">{{ theme.name }}</div>
                    <div class="min-h-0 overflow-hidden text-xs leading-5 text-base-content/50">{{ theme.description }}</div>
                    <span
                      v-if="appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId === theme.id"
                      class="badge badge-primary badge-sm mt-auto w-fit"
                    >
                      {{ t('common.active') }}
                    </span>
                  </button>
                </div>
              </section>

              <section v-show="activeThemeSection === 'custom-markdown'" class="flex h-full min-w-0 flex-col gap-6 overflow-y-auto p-6">
                <div class="flex flex-col gap-3">
                  <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.themes.customMarkdownThemesTitle') }}</h3>
                  <div v-if="rawCustomThemes.length === 0" class="rounded-box border border-dashed border-base-300 px-4 py-5 text-center text-sm text-base-content/50">
                    {{ t('preferences.themes.noCustomThemes') }}
                  </div>
                  <div v-else class="grid grid-cols-2 gap-3">
                    <button
                      v-for="theme in rawCustomThemes"
                      :key="theme.id"
                      class="flex h-44 flex-col gap-2 overflow-hidden rounded-box border bg-base-100 p-3 text-left transition-colors disabled:cursor-not-allowed"
                      :class="theme.errors.length > 0
                        ? 'border-error/30 bg-error/10'
                        : appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId === theme.id
                          ? 'border-primary bg-primary/8'
                          : 'border-base-300 hover:border-primary/40 hover:bg-base-200/60'"
                      :disabled="theme.errors.length > 0"
                      @click="appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId = theme.id"
                    >
                      <div class="flex min-w-0 items-start justify-between gap-2">
                        <div class="min-w-0 flex-1">
                          <div class="truncate text-sm font-medium text-base-content">{{ theme.manifest.name }}</div>
                        </div>
                        <span v-if="theme.errors.length > 0" class="badge badge-error badge-sm shrink-0">
                          {{ t('preferences.themes.customThemeErrorBadge') }}
                        </span>
                      </div>
                      <div class="text-xs text-base-content/50">{{ theme.id }}</div>
                      <div v-if="theme.manifest.description" class="min-h-0 overflow-hidden text-xs leading-5 text-base-content/50">{{ theme.manifest.description }}</div>
                      <span
                        v-if="theme.errors.length === 0 && appStore.globalMarkdownPrintSetting.themeAssignment.screenThemeId === theme.id"
                        class="badge badge-primary badge-sm mt-auto w-fit"
                      >
                        {{ t('common.active') }}
                      </span>
                      <ul v-if="theme.errors.length > 0" class="mt-auto min-h-0 space-y-0.5 overflow-y-auto">
                        <li v-for="(err, i) in theme.errors" :key="i" class="text-xs leading-5 text-error">{{ err }}</li>
                      </ul>
                    </button>
                  </div>
                </div>

                <div class="flex flex-col gap-3">
                  <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.themes.customThemeActionsTitle') }}</h3>
                  <div class="grid grid-cols-2 gap-3">
                    <button class="iw-btn btn-outline btn-primaryh-9" @click="handleCreateExampleTheme">
                      <IconPlus class="icon-xs shrink-0" />
                      <span class="text-sm font-medium text-base-content">{{ t('preferences.themes.createExample') }}</span>
                    </button>
                    <button class="iw-btn btn-outline btn-primary h-9" @click="openThemesFolder">
                      <IconFolderOpen class="icon-xs shrink-0" />
                      <span class="text-sm font-medium text-base-content">{{ t('preferences.themes.openFolder') }}</span>
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'workspace'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.workspace.title') }}</h2>
            <button
              class="iw-toolbar-btn btn-sm absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.workspace.useGitignoreTitle') }}</h3>
              <p class="-mt-1 text-xs text-base-content/50">{{ t('preferences.workspace.useGitignoreDesc') }}</p>
              <label class="flex cursor-pointer items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <span class="text-sm font-medium text-base-content">{{ t('preferences.workspace.useGitignoreExplorerTitle') }}</span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="isGitignoreFilterScopeEnabled('explorer')"
                  @change="setGitignoreFilterScope('explorer', ($event.target as HTMLInputElement).checked)"
                />
              </label>
              <label class="flex cursor-pointer items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <span class="text-sm font-medium text-base-content">{{ t('preferences.workspace.useGitignoreSearchTitle') }}</span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="isGitignoreFilterScopeEnabled('search')"
                  @change="setGitignoreFilterScope('search', ($event.target as HTMLInputElement).checked)"
                />
              </label>
              <label class="flex cursor-pointer items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <span class="text-sm font-medium text-base-content">{{ t('preferences.workspace.useGitignoreWatcherTitle') }}</span>
                <input
                  type="checkbox"
                  class="toggle toggle-primary toggle-xs"
                  :checked="isGitignoreFilterScopeEnabled('watcher')"
                  @change="setGitignoreFilterScope('watcher', ($event.target as HTMLInputElement).checked)"
                />
              </label>
            </section>

            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.workspace.workspaceIgnoreRulesTitle') }}</h3>
              <p class="-mt-1 text-xs text-base-content/50">{{ t('preferences.workspace.workspaceIgnoreRulesDesc') }}</p>
              <textarea
                class="min-h-32 w-full resize-none rounded-field border border-base-300 bg-base-100 px-3 py-2 text-xs outline-none focus:border-primary"
                :placeholder="t('preferences.workspace.workspaceIgnoreRulesPlaceholder')"
                :value="appStore.globalEditSetting.workspaceIgnoreRules"
                @input="appStore.globalEditSetting.workspaceIgnoreRules = ($event.target as HTMLTextAreaElement).value"
              />
            </section>
          </div>
        </div>

        <div v-show="activeTab === 'sourceControl'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.sourceControl.title') }}</h2>
            <button
              class="iw-toolbar-btn btn-sm absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <SourceControlPreferencesPanel />
        </div>

        <div v-show="activeTab === 'export'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.export.title') }}</h2>
            <button
              class="iw-toolbar-btn btn-sm absolute right-3 top-1/2 -translate-y-1/2 px-2"
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
              class="iw-toolbar-btn btn-sm absolute right-3 top-1/2 -translate-y-1/2 px-2"
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
              class="iw-toolbar-btn btn-sm absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.editor.saving') }}</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.editor.autoSaveTitle') }}</div>
                <div class="text-xs text-base-content/50">{{ t('preferences.editor.autoSaveDesc') }}</div>
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
                <div class="text-xs text-base-content/50">{{ t('preferences.editor.autoSaveIntervalDesc') }}</div>
              </div>
              <label class="label cursor-pointer gap-3">
                <input
                  type="number"
                  class="iw-input w-16"
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
            <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.editor.lineEnding') }}</h3>
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
                <span class="min-w-0 text-xs leading-5 text-base-content/50 text-right">{{ t('preferences.editor.unixLFDesc') }}</span>
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
                <span class="min-w-0 text-xs leading-5 text-base-content/50 text-right">{{ t('preferences.editor.windowsCRLFDesc') }}</span>
              </label>
            </div>
          </section>

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.editor.display') }}</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.editor.firstLineIndentTitle') }}</div>
                <div class="text-xs text-base-content/50">{{ t('preferences.editor.firstLineIndentDesc') }}</div>
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
                <div class="text-xs text-base-content/50">{{ t('preferences.editor.invisibleCharsDesc') }}</div>
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
            <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.editor.textReplacement') }}</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.editor.smartPunctuationTitle') }}</div>
                <div class="text-xs text-base-content/50">{{ t('preferences.editor.smartPunctuationDesc') }}</div>
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

          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.editor.codeBlockLanguageScopeTitle') }}</h3>
            <div class="text-xs text-base-content/50 -mt-1">{{ t('preferences.editor.codeBlockLanguageScopeDesc') }}</div>
            <div class="flex flex-col gap-2">
              <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  :checked="(appStore.globalEditSetting.codeBlockLanguageScope ?? 'common') === 'common'"
                  @change="appStore.globalEditSetting.codeBlockLanguageScope = 'common'"
                />
                <span class="min-w-0 text-sm font-medium text-base-content">{{ t('preferences.editor.codeBlockLanguageScopeCommon') }}</span>
              </label>
              <label class="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 rounded-box border border-base-300 bg-base-100 px-4 py-3 hover:bg-base-200/70">
                <input
                  type="radio"
                  class="radio radio-primary radio-xs"
                  :checked="appStore.globalEditSetting.codeBlockLanguageScope === 'all'"
                  @change="appStore.globalEditSetting.codeBlockLanguageScope = 'all'"
                />
                <span class="min-w-0 text-sm font-medium text-base-content">{{ t('preferences.editor.codeBlockLanguageScopeAll') }}</span>
              </label>
            </div>
          </section>

          </div>
        </div>

        <div v-show="activeTab === 'spelling'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 bg-base-200 border-b border-base-300 px-7 py-4">
            <h2 class="text-xl font-semibold text-base-content">{{ t('preferences.spelling.title') }}</h2>
            <button
              class="iw-toolbar-btn btn-sm absolute right-3 top-1/2 -translate-y-1/2 px-2"
              :aria-label="t('common.close')"
              @click="emit('close')"
            >
              <IconX class="icon-xs" />
            </button>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-7">
          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.spelling.checking') }}</h3>
            <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
              <div class="min-w-0">
                <div class="text-sm font-medium text-base-content">{{ t('preferences.spelling.checkWhileTypingTitle') }}</div>
                <div class="text-xs text-base-content/50">{{ t('preferences.spelling.checkWhileTypingDesc') }}</div>
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
                <div class="text-xs text-base-content/50">{{ t('preferences.spelling.showErrorsDesc') }}</div>
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
            <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.spelling.engine') }}</h3>
            <div class="alert alert-info alert-soft">
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
                <span class="min-w-0 text-xs leading-5 text-base-content/50 text-right">{{ t('preferences.spelling.languageToolDesc') }}</span>
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
                <span class="min-w-0 text-xs leading-5 text-base-content/50 text-right">{{ t('preferences.spelling.typoDesc') }}</span>
              </label>
            </div>
          </section>

          <section
            v-if="appStore.globalEditSetting.proofreadEngineType !== 'typo'"
            class="flex flex-col gap-3"
          >
            <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.spelling.ltOptions') }}</h3>
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
              <span class="text-xs text-base-content/50">{{ t('preferences.spelling.apiUrlHint') }}</span>
            </div>
            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">{{ t('preferences.spelling.apiKeyLabel') }} <span class="font-normal text-base-content/50">{{ t('preferences.spelling.optional') }}</span></label>
              <input
                type="password"
                class="iw-input"
                :placeholder="t('preferences.spelling.apiKeyPlaceholder')"
                :value="appStore.globalEditSetting.proofreadApiKey"
                @input="appStore.globalEditSetting.proofreadApiKey = ($event.target as HTMLInputElement).value"
              />
              <span class="text-xs text-base-content/50">{{ t('preferences.spelling.apiKeyHint') }}</span>
            </div>
          </section>
          </div>
        </div>

        <div v-show="activeTab === 'ai'" class="flex min-h-0 flex-1 flex-col">
          <div class="relative h-14 shrink-0 border-b border-base-300 bg-base-200 px-7">
            <div class="flex h-full min-w-0 items-center pr-36">
              <div class="flex min-w-0 items-end gap-3">
                <h2 class="shrink-0 text-xl font-semibold text-base-content">{{ t('preferences.ai.title') }}</h2>
                <div class="truncate pb-0.5 text-sm text-base-content/40">{{ aiViewTitle }}</div>
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
              class="iw-toolbar-btn btn-sm absolute right-3 top-1/2 -translate-y-1/2 px-2"
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
              class="iw-toolbar-btn btn-sm absolute right-3 top-1/2 -translate-y-1/2 px-2"
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
              <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.updates.automaticUpdates') }}</h3>
              <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-base-content">{{ t('preferences.updates.enableAutoTitle') }}</div>
                  <div class="text-xs text-base-content/50">{{ t('preferences.updates.enableAutoDesc') }}</div>
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
                  <div class="text-xs text-base-content/50">{{ t('preferences.updates.checkStartupDesc') }}</div>
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
                  <div class="text-xs text-base-content/50">{{ t('preferences.updates.autoDownloadDesc') }}</div>
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
                  <div class="text-xs text-base-content/50">{{ t('preferences.updates.autoInstallDesc') }}</div>
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
              <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.updates.channelTitle') }}</h3>
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
                  <span class="min-w-0 text-xs leading-5 text-base-content/50">{{ t('preferences.updates.stableDesc') }}</span>
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
                  <span class="min-w-0 text-xs leading-5 text-base-content/50">{{ t('preferences.updates.betaDesc') }}</span>
                </label>
              </div>
            </section>

            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.updates.checkIntervalTitle') }}</h3>
              <div class="flex flex-col gap-1.5">
                <label class="text-sm font-medium text-base-content">{{ t('preferences.updates.checkEveryHours') }}</label>
                <input
                  type="number"
                  min="1"
                  max="168"
                  class="iw-input w-16"
                  :value="updaterConfig.checkInterval"
                  :disabled="!updaterConfig.enabled"
                  @change="patchUpdaterConfig({ checkInterval: Number(($event.target as HTMLInputElement).value) })"
                />
              </div>
            </section>

            <section class="flex flex-col gap-3">
              <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.updates.actionsTitle') }}</h3>
              <div class="flex items-center gap-3">
                <button class="iw-btn btn-outline btn-primaryh-9" @click="checkForUpdates">
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
  IconGitBranch,
} from '@tabler/icons-vue'
import { useAppStore } from '@/stores/app'
import ThemePreviewSample from '@/components/preferences/ThemePreviewSample.vue'
import { availableThemes, getThemePreviewThemeId } from '@/utils/themes'
import type { ThemeOption } from '@/utils/themes'
import { builtInMarkdownThemes, getRawCustomThemes } from '@/components/print/markdownThemes'
import type { RawCustomTheme } from '@/types'
import updaterService from '@/updater/UpdaterService'
import type { UpdaterConfig } from '@/updater/types'
import { notify } from '@/utils/notifications'
import ProviderSettings from '@/components/ai/ProviderSettings.vue'
import ExportPreferencesPanel from '@/components/preferences/ExportPreferencesPanel.vue'
import PrintPreferencesPanel from '@/components/preferences/PrintPreferencesPanel.vue'
import SourceControlPreferencesPanel from '@/components/preferences/SourceControlPreferencesPanel.vue'
import type { WorkspaceFilterScope } from '@/services/workspace/filtering'

type TabId = 'workspace' | 'sourceControl' | 'editor' | 'spelling' | 'themes' | 'print' | 'export' | 'ai' | 'updates'
type ThemeSectionId = 'general' | 'light' | 'dark' | 'markdown' | 'custom-markdown'
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
const activeThemeSection = ref<ThemeSectionId>('general')
const generalAppThemes = computed(() => availableThemes.filter((theme) => theme.id === 'system' || theme.id === 'light' || theme.id === 'dark'))
const lightAppThemes = computed(() => sortThemeOptionsByName(availableThemes.filter((theme) => theme.scheme === 'light')))
const darkAppThemes = computed(() => sortThemeOptionsByName(availableThemes.filter((theme) => theme.scheme === 'dark')))
const builtInMarkdownThemeOptions = computed(() => builtInMarkdownThemes)
const rawCustomThemes = computed<readonly RawCustomTheme[]>(() => getRawCustomThemes())
function isGitignoreFilterScopeEnabled(scope: WorkspaceFilterScope): boolean {
  switch (scope) {
    case 'explorer':
      return appStore.globalEditSetting.useGitignoreForExplorer === true
    case 'search':
      return appStore.globalEditSetting.useGitignoreForSearch === true
    case 'watcher':
      return appStore.globalEditSetting.useGitignoreForWatcher === true
  }
}

function setGitignoreFilterScope(scope: WorkspaceFilterScope, enabled: boolean): void {
  switch (scope) {
    case 'explorer':
      appStore.globalEditSetting.useGitignoreForExplorer = enabled
      return
    case 'search':
      appStore.globalEditSetting.useGitignoreForSearch = enabled
      return
    case 'watcher':
      appStore.globalEditSetting.useGitignoreForWatcher = enabled
  }
}

const appThemeSections = computed(() => [
  { id: 'light' as ThemeSectionId, label: formatThemeSectionLabel(t('preferences.themes.sectionLightThemes'), lightAppThemes.value.length) },
  { id: 'dark' as ThemeSectionId, label: formatThemeSectionLabel(t('preferences.themes.sectionDarkThemes'), darkAppThemes.value.length) },
])
const markdownThemeSections = computed(() => [
  { id: 'markdown' as ThemeSectionId, label: formatThemeSectionLabel(t('preferences.themes.sectionMarkdownThemes'), builtInMarkdownThemeOptions.value.length) },
  { id: 'custom-markdown' as ThemeSectionId, label: formatThemeSectionLabel(t('preferences.themes.sectionCustomMarkdownThemes'), rawCustomThemes.value.length) },
])

function formatThemeSectionLabel(label: string, count: number): string {
  return count > 0 ? `${label}(${count})` : label
}

function sortThemeOptionsByName(themes: ThemeOption[]): ThemeOption[] {
  return [...themes].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
}

async function openThemesFolder(): Promise<void> {
  await window.electronAPI?.customThemes?.openFolder()
}

async function handleCreateExampleTheme(): Promise<void> {
  await window.electronAPI?.customThemes?.createExample()
}

const tabs = computed(() => [
  { id: 'themes' as TabId, label: t('preferences.tabs.themes'), icon: IconPalette },
  { id: 'editor' as TabId, label: t('preferences.tabs.editor'), icon: IconEdit },
  { id: 'spelling' as TabId, label: t('preferences.tabs.spelling'), icon: IconTextSpellcheck },
  { id: 'print' as TabId, label: t('preferences.tabs.print'), icon: IconPrinter },
  { id: 'export' as TabId, label: t('preferences.tabs.export'), icon: IconFileExport },
  { id: 'workspace' as TabId, label: t('preferences.tabs.workspace'), icon: IconFolders },
  { id: 'ai' as TabId, label: t('preferences.tabs.ai'), icon: IconRobot },
  { id: 'sourceControl' as TabId, label: t('preferences.tabs.sourceControl'), icon: IconGitBranch },
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
