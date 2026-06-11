<template>
  <div class="flex h-full min-h-0 overflow-hidden">
    <aside class="flex min-h-0 w-52 shrink-0 flex-col border-r border-base-300 bg-base-200/50">
      <div class="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <ul class="space-y-2">
          <li>
            <details class="group/ai-section" open>
              <summary class="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-field px-2 text-xs font-semibold uppercase text-base-content/70 hover:bg-base-300/50 [&::-webkit-details-marker]:hidden">
                <span class="min-w-0 truncate">{{ t('preferences.ai.providers') }}</span>
                <IconChevronRight class="icon-2xs shrink-0 transition-transform group-open/ai-section:rotate-90" />
              </summary>
              <ul class="mt-1 space-y-1">
                <li v-for="cfg in sortedLlmConfigs" :key="cfg.id">
                  <div
                    role="button"
                    tabindex="0"
                    class="iw-btn btn-sm h-8 w-full justify-start border-none text-left font-normal group/ai-row"
                    :class="activeNode?.kind === 'llm-config' && activeNode.id === cfg.id ? 'btn-active' : 'btn-ghost'"
                    @click="startEdit(cfg)"
                    @keydown.enter.prevent="startEdit(cfg)"
                    @keydown.space.prevent="startEdit(cfg)"
                  >
                    <span class="min-w-0 flex-1 truncate">{{ getProviderDisplayLabel(cfg) }}</span>
                    <button
                      v-if="!cfg.presetId"
                      class="iw-toolbar-btn btn-xs text-error opacity-0 transition-opacity focus:opacity-100 hover:bg-error hover:text-error-content group-hover/ai-row:opacity-100"
                      :title="t('preferences.ai.removeProvider')"
                      @click.stop="removeLlmConfig(cfg)"
                      @keydown.stop
                    >
                      <IconTrash class="icon-2xs" />
                    </button>
                  </div>
                </li>
                <li>
                  <button
                    class="iw-btn btn-ghost btn-sm h-8 w-full justify-start border-none text-left font-normal group/ai-row"
                    @click="addCustomProvider"
                  >
                    <IconPlus class="icon-2xs shrink-0" />
                    <span>{{ t('preferences.ai.addCustomProvider') }}</span>
                  </button>
                </li>
              </ul>
            </details>
          </li>

          <li class="border-t border-base-300 pt-2">
            <details class="group/ai-section" open>
              <summary class="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 rounded-field px-2 text-xs font-semibold uppercase text-base-content/70 hover:bg-base-300/50 [&::-webkit-details-marker]:hidden">
                <span class="min-w-0 truncate">{{ t('preferences.ai.webSearch.title') }}</span>
                <IconChevronRight class="icon-2xs shrink-0 transition-transform group-open/ai-section:rotate-90" />
              </summary>
              <ul class="mt-1 space-y-1">
                <li v-for="cfg in sortedWebSearchConfigs" :key="cfg.id">
                  <div
                    role="button"
                    tabindex="0"
                    class="iw-btn btn-sm h-8 w-full justify-start border-none text-left font-normal group/ai-row"
                    :class="activeNode?.kind === 'web-config' && activeNode.id === cfg.id ? 'btn-active' : 'btn-ghost'"
                    @click="startWebEdit(cfg)"
                    @keydown.enter.prevent="startWebEdit(cfg)"
                    @keydown.space.prevent="startWebEdit(cfg)"
                  >
                    <span class="min-w-0 flex-1 truncate">{{ cfg.label }}</span>
                  </div>
                </li>
              </ul>
            </details>
          </li>
        </ul>
      </div>
    </aside>

    <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
      <template v-for="pane in llmPaneViews" :key="pane.key">
        <div v-show="activePaneKey === pane.key" class="flex h-full min-h-0 flex-col">
          <div class="flex-1 overflow-y-auto">
            <div class="p-6">
              <section class="flex flex-col gap-3">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.ai.identity') }}</h3>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.name') }}</label>
                  <input
                    v-model="pane.form.label"
                    type="text"
                    :readonly="isLlmPanePreset(pane)"
                    :placeholder="pane.preset?.label ?? t('preferences.ai.customProviderName')"
                    class="iw-input"
                    :class="isLlmPanePreset(pane) ? 'cursor-default bg-base-200 text-base-content' : ''"
                  />
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.interfaceType') }}</label>
                  <select
                    v-model="pane.form.type"
                    :disabled="isLlmPanePreset(pane)"
                    class="iw-select w-full px-3"
                    :class="isLlmPanePreset(pane) ? 'cursor-default bg-base-100 text-base-content' : ''"
                  >
                    <option value="openai-compat">{{ t('preferences.ai.interfaceOpenAICompat') }}</option>
                    <option value="deepseek">{{ t('preferences.ai.interfaceDeepSeek') }}</option>
                    <option value="anthropic">{{ t('preferences.ai.interfaceAnthropic') }}</option>
                    <option value="gemini">{{ t('preferences.ai.interfaceGemini') }}</option>
                  </select>
                </div>
              </section>

              <section v-if="pane.preset?.requiresApiKey !== false" class="mt-5 flex flex-col gap-3">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.ai.authentication') }}</h3>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.apiKey') }}</label>
                  <label class="iw-input">
                    <input
                      v-model="pane.form.apiKey"
                      :type="isLlmKeyVisible(pane) ? 'text' : 'password'"
                      :placeholder="t('preferences.ai.apiKeyPlaceholder')"
                    />
                    <button type="button" class="iw-toolbar-btn btn-xs" @click="toggleLlmKeyVisibility(pane)">
                      <IconEye v-if="!isLlmKeyVisible(pane)" class="icon-xs" />
                      <IconEyeOff v-else class="icon-xs" />
                    </button>
                  </label>
                  <p class="text-xs text-base-content/50">
                    {{ t('preferences.ai.apiKeyHint') }}
                  </p>
                </div>
              </section>

              <section class="mt-5 flex flex-col gap-3">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.ai.connection') }}</h3>

                <div v-if="pane.form.type === 'openai-compat' || pane.form.type === 'deepseek'" class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.baseUrl') }}</label>
                  <input
                    v-model="pane.form.baseUrl"
                    type="text"
                    :placeholder="pane.preset?.baseUrl ?? 'https://api.openai.com/v1'"
                    class="iw-input"
                  />
                </div>

                <div v-if="pane.preset?.id !== 'ollama'" class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.models') }}</label>
                  <input
                    v-model="pane.form.modelsStr"
                    type="text"
                    :placeholder="(pane.preset?.models ?? []).join(', ')"
                    class="iw-input"
                  />
                  <p class="text-xs text-base-content/50">{{ t('preferences.ai.modelsHint') }}</p>
                </div>

                <div v-if="pane.preset?.id !== 'ollama'" class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.fallbackModel') }}</label>
                  <input
                    v-model="pane.form.fallbackModelId"
                    type="text"
                    :list="`iw-fallback-models-${pane.key}`"
                    :placeholder="t('preferences.ai.fallbackModelPlaceholder')"
                    class="iw-input"
                  />
                  <datalist :id="`iw-fallback-models-${pane.key}`">
                    <option v-for="m in getLlmPaneAvailableModels(pane)" :key="m" :value="m" />
                  </datalist>
                  <p class="text-xs text-base-content/50">{{ t('preferences.ai.fallbackModelHint') }}</p>
                </div>

                <div v-else class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.models') }}</label>
                  <p class="rounded-box border border-base-300 bg-base-100 px-4 py-3 text-xs text-base-content/50">
                    {{ t('preferences.ai.ollamaModelsHint') }}
                  </p>
                </div>
              </section>

              <section class="mt-5 flex flex-col gap-3">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.ai.advanced') }}</h3>

                <div class="flex flex-col gap-3">
                  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div v-if="getLlmPaneParameterSupport(pane).temperature" class="flex flex-col gap-1.5">
                      <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.temperature') }}</label>
                      <input v-model.number="pane.form.temperature" type="number" min="0" :max="getLlmPaneTemperatureMax(pane)" step="0.01" class="iw-input" />
                      <span class="text-xs text-base-content/50">{{ t('preferences.ai.temperatureHint') }}</span>
                    </div>

                    <div v-if="getLlmPaneParameterSupport(pane).topP" class="flex flex-col gap-1.5">
                      <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.topP') }}</label>
                      <input v-model.number="pane.form.topP" type="number" min="0" max="1" step="0.01" class="iw-input" />
                      <span class="text-xs text-base-content/50">{{ t('preferences.ai.topPHint') }}</span>
                    </div>

                    <div v-if="getLlmPaneParameterSupport(pane).frequencyPenalty" class="flex flex-col gap-1.5">
                      <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.frequencyPenalty') }}</label>
                      <input v-model.number="pane.form.frequencyPenalty" type="number" min="-2" max="2" step="0.01" class="iw-input" />
                      <span class="text-xs text-base-content/50">{{ t('preferences.ai.frequencyPenaltyHint') }}</span>
                    </div>

                    <div v-if="getLlmPaneParameterSupport(pane).presencePenalty" class="flex flex-col gap-1.5">
                      <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.presencePenalty') }}</label>
                      <input v-model.number="pane.form.presencePenalty" type="number" min="-2" max="2" step="0.01" class="iw-input" />
                      <span class="text-xs text-base-content/50">{{ t('preferences.ai.presencePenaltyHint') }}</span>
                    </div>
                  </div>
                </div>

                <div v-if="!isLlmPanePreset(pane)" class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.modelProfiles') }}</label>
                  <textarea
                    v-model="pane.form.modelProfilesStr"
                    rows="8"
                    placeholder='{
  "deepseek-chat": {
    "maxInputTokens": 128000,
    "maxOutputTokens": 8000,
    "reasoningOutput": false,
    "toolCalling": true,
    "toolChoice": true,
    "structuredOutput": true
  }
}'
                    class="min-h-40 w-full resize-none rounded-field border border-base-300 bg-base-100 px-3 py-2 font-mono text-xs text-base-content focus:border-primary focus:outline-none"
                  />
                  <p class="text-xs" :class="getLlmPaneModelProfilesError(pane) ? 'text-error' : 'text-base-content/50'">
                    {{ getLlmPaneModelProfilesError(pane) || t('preferences.ai.modelProfilesHint') }}
                  </p>
                </div>
              </section>
            </div>
          </div>

        </div>
      </template>

      <template v-for="pane in webSearchPaneViews" :key="pane.key">
        <div v-show="activePaneKey === pane.key" class="flex h-full min-h-0 flex-col">
          <div class="flex-1 overflow-y-auto">
            <div class="p-6">
              <section class="flex flex-col gap-3">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.ai.identity') }}</h3>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.name') }}</label>
                  <input
                    v-model="pane.form.label"
                    type="text"
                    readonly
                    class="iw-input cursor-default bg-base-200 text-base-content"
                  />
                </div>
              </section>

              <section class="mt-5 flex flex-col gap-3">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.ai.connection') }}</h3>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.webSearch.baseUrl') }}</label>
                  <input
                    v-model="pane.form.baseUrl"
                    type="text"
                    class="iw-input"
                    :placeholder="getWebSearchUrlPlaceholder(pane)"
                  />
                  <p class="text-xs text-base-content/50">{{ t('preferences.ai.webSearch.baseUrlHint') }}</p>
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.webSearch.apiKey') }}</label>
                  <label class="iw-input">
                    <input
                      v-model="pane.form.apiKey"
                      :type="isWebSearchKeyVisible(pane) ? 'text' : 'password'"
                      :placeholder="t('preferences.ai.webSearch.apiKeyPlaceholder')"
                    />
                    <button type="button" class="iw-toolbar-btn btn-xs" @click="toggleWebSearchKeyVisibility(pane)">
                      <IconEye v-if="!isWebSearchKeyVisible(pane)" class="icon-xs" />
                      <IconEyeOff v-else class="icon-xs" />
                    </button>
                  </label>
                  <p class="text-xs text-base-content/50">{{ t('preferences.ai.webSearch.apiKeyHint') }}</p>
                </div>
              </section>
            </div>
          </div>

        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconTrash, IconPlus, IconEye, IconEyeOff, IconChevronRight } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import type {
  AiModelProfile,
  AiProviderConfig,
  AiProviderType,
  WebSearchProviderConfig,
} from '@/ai/types'
import {
  DEFAULT_AI_PROVIDER_PARAMETERS,
  getActiveWebSearchProviderConfig,
  getProviderParameterSupport,
  normalizeProviderParameters,
} from '@/ai/types'
import {
  getProviderPresetById,
  type ProviderPreset,
} from '@/ai/providers/provider-presets'

type View = 'main' | 'configure'

const emit = defineEmits<{
  'view-change': [info: { view: View; title: string }]
}>()
const { t } = useI18n()

const aiStore = useAiStore()

type ActiveNode =
  | { kind: 'llm-config'; id: string }
  | { kind: 'web-config'; id: string }

const activeNode = ref<ActiveNode | null>(null)

function getLlmConfigPaneKey(id: string): string {
  return `llm-config:${id}`
}

function getWebSearchConfigPaneKey(id: string): string {
  return `web-config:${id}`
}

function getActiveNodeKey(node: ActiveNode | null): string {
  if (!node) return ''
  if (node.kind === 'llm-config') return getLlmConfigPaneKey(node.id)
  if (node.kind === 'web-config') return getWebSearchConfigPaneKey(node.id)
  return ''
}

const activePaneKey = computed(() => getActiveNodeKey(activeNode.value))

function getProviderDisplayLabel(cfg: AiProviderConfig): string {
  if (!cfg.presetId) return cfg.label
  return getProviderPresetById(cfg.presetId)?.label ?? cfg.label
}

const sortedLlmConfigs = computed(() => {
  const cfgs = aiStore.settings.providerConfigs
  const presets = cfgs
    .filter(c => !!c.presetId)
    .sort((a, b) => getProviderDisplayLabel(a).localeCompare(getProviderDisplayLabel(b)))
  const custom = cfgs.filter(c => !c.presetId).sort((a, b) => a.label.localeCompare(b.label))
  return [...presets, ...custom]
})

const webSearchPresetOrder: Record<string, number> = {
  bocha: 0,
  exa: 1,
  serper: 2,
  tavily: 3,
}

const sortedWebSearchConfigs = computed(() => {
  const cfgs = aiStore.settings.webSearchProviderConfigs
  return [...cfgs].sort((a, b) => (webSearchPresetOrder[a.presetId ?? ''] ?? 99) - (webSearchPresetOrder[b.presetId ?? ''] ?? 99))
})

const defaultWebSearchConfig = computed(() =>
  getActiveWebSearchProviderConfig(sortedWebSearchConfigs.value, aiStore.settings.activeWebSearchProviderConfigId)
)

interface LlmPane {
  key: string
  kind: 'config'
  config: AiProviderConfig
  preset: ProviderPreset | null
}

interface LlmPaneView extends LlmPane {
  form: FormState
}

interface WebSearchPane {
  key: string
  kind: 'config'
  config: WebSearchProviderConfig
}

interface WebSearchPaneView extends WebSearchPane {
  form: WebSearchFormState
}

const llmPanes = computed<LlmPane[]>(() => [
  ...sortedLlmConfigs.value.map(config => ({
    key: getLlmConfigPaneKey(config.id),
    kind: 'config' as const,
    config,
    preset: config.presetId ? (getProviderPresetById(config.presetId) ?? null) : null,
  })),
])

const webSearchPanes = computed<WebSearchPane[]>(() => [
  ...sortedWebSearchConfigs.value.map(config => ({
    key: getWebSearchConfigPaneKey(config.id),
    kind: 'config' as const,
    config,
  })),
])

interface FormState {
  type: AiProviderType
  label: string
  apiKey: string
  baseUrl: string
  modelsStr: string
  fallbackModelId: string
  modelProfilesStr: string
  temperature: number
  topP: number
  frequencyPenalty: number
  presencePenalty: number
}

const llmForms = reactive<Record<string, FormState>>({})
const llmShowKeys = reactive<Record<string, boolean>>({})

const llmPaneViews = computed<LlmPaneView[]>(() =>
  llmPanes.value.map(pane => ({ ...pane, form: getLlmForm(pane) }))
)

function defaultLlmForm(): FormState {
  return {
    type: 'openai-compat',
    label: '',
    apiKey: '',
    baseUrl: '',
    modelsStr: '',
    fallbackModelId: '',
    modelProfilesStr: '',
    temperature: DEFAULT_AI_PROVIDER_PARAMETERS.temperature,
    topP: DEFAULT_AI_PROVIDER_PARAMETERS.topP,
    frequencyPenalty: DEFAULT_AI_PROVIDER_PARAMETERS.frequencyPenalty,
    presencePenalty: DEFAULT_AI_PROVIDER_PARAMETERS.presencePenalty,
  }
}

function llmFormFromConfig(cfg: AiProviderConfig): FormState {
  const parameters = normalizeProviderParameters(cfg.parameters)
  return {
    type: cfg.type,
    label: getProviderDisplayLabel(cfg),
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl ?? '',
    modelsStr: (cfg.models ?? []).join(', '),
    fallbackModelId: cfg.fallbackModelId ?? '',
    modelProfilesStr: cfg.modelProfiles ? JSON.stringify(cfg.modelProfiles, null, 2) : '',
    temperature: parameters.temperature,
    topP: parameters.topP,
    frequencyPenalty: parameters.frequencyPenalty,
    presencePenalty: parameters.presencePenalty,
  }
}

function ensureLlmPaneState(pane: LlmPane) {
  llmForms[pane.key] ??= pane.config ? llmFormFromConfig(pane.config) : defaultLlmForm()
  llmShowKeys[pane.key] ??= false
}

function getLlmForm(pane: LlmPane): FormState {
  ensureLlmPaneState(pane)
  return llmForms[pane.key]!
}

function resetLlmPaneState(pane: LlmPane) {
  llmForms[pane.key] = pane.config ? llmFormFromConfig(pane.config) : defaultLlmForm()
  llmShowKeys[pane.key] = false
}

function pruneLlmPaneState(panes: readonly LlmPane[]) {
  const keys = new Set(panes.map(pane => pane.key))
  for (const key of Object.keys(llmForms)) {
    if (!keys.has(key)) {
      delete llmForms[key]
      delete llmShowKeys[key]
    }
  }
}

function getLlmPaneAvailableModels(pane: LlmPane): string[] {
  return getLlmForm(pane).modelsStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

function getLlmPaneParameterSupport(pane: LlmPane) {
  const form = getLlmForm(pane)
  return getProviderParameterSupport(form.type, form.baseUrl)
}

function isLlmPanePreset(pane: LlmPane): boolean {
  return !!pane.preset
}

function getLlmPaneTemperatureMax(pane: LlmPane): number {
  const form = getLlmForm(pane)
  return pane.preset?.id === 'glm' || /open\.bigmodel\.cn/i.test(form.baseUrl) ? 1 : 2
}

function getLlmPaneModelProfilesError(pane: LlmPane): string {
  const form = getLlmForm(pane)
  if (isLlmPanePreset(pane) || !form.modelProfilesStr.trim()) return ''
  try {
    const parsed = JSON.parse(form.modelProfilesStr) as Record<string, AiModelProfile>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return t('preferences.ai.providerProfilesObjectError')
    }
    return ''
  } catch {
    return t('preferences.ai.providerProfilesJsonError')
  }
}

function isLlmKeyVisible(pane: LlmPane): boolean {
  return llmShowKeys[pane.key] ?? false
}

function toggleLlmKeyVisibility(pane: LlmPane) {
  llmShowKeys[pane.key] = !isLlmKeyVisible(pane)
}

function numberOrDefault(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getNextLlmConfigAfter(id: string): AiProviderConfig | null {
  const configs = sortedLlmConfigs.value
  const index = configs.findIndex(config => config.id === id)
  return configs[index + 1] ?? configs[index - 1] ?? null
}

function selectDefaultLlmNode() {
  const config = sortedLlmConfigs.value.find(item => item.id === aiStore.settings.activeProviderConfigId)
    ?? sortedLlmConfigs.value[0]
  if (config) {
    startEdit(config)
    return
  }
  addCustomProvider()
}

function selectDefaultWebSearchNode() {
  const config = defaultWebSearchConfig.value ?? sortedWebSearchConfigs.value[0]
  if (config) {
    startWebEdit(config)
  }
}

function getUniqueLabel(labels: readonly string[], baseLabel: string): string {
  const existing = new Set(labels)
  if (!existing.has(baseLabel)) return baseLabel
  let index = 2
  while (existing.has(`${baseLabel} ${index}`)) {
    index += 1
  }
  return `${baseLabel} ${index}`
}

function addCustomProvider() {
  const id = `provider-${Date.now()}`
  aiStore.addProviderConfig({
    id,
    type: 'openai-compat',
    label: getUniqueLabel(aiStore.settings.providerConfigs.map(config => config.label), t('preferences.ai.defaultCustomProviderName')),
    apiKey: '',
    defaultModelId: '',
    enabled: true,
    parameters: { ...DEFAULT_AI_PROVIDER_PARAMETERS },
  })
  activeNode.value = { kind: 'llm-config', id }
}

function startEdit(cfg: AiProviderConfig) {
  activeNode.value = { kind: 'llm-config', id: cfg.id }
}

function removeLlmConfig(cfg: AiProviderConfig) {
  if (cfg.presetId) return
  const nextConfig = getNextLlmConfigAfter(cfg.id)
  const node = activeNode.value
  const shouldMoveSelection = node?.kind === 'llm-config' && node.id === cfg.id
  aiStore.removeProviderConfig(cfg.id)
  if (shouldMoveSelection) {
    if (nextConfig) startEdit(nextConfig)
    else selectDefaultLlmNode()
  }
}

function syncLlmPaneForm(pane: LlmPane) {
  if (!pane.config) return
  const form = getLlmForm(pane)
  const isPreset = isLlmPanePreset(pane)
  const modelsArr = form.modelsStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const modelProfilesError = getLlmPaneModelProfilesError(pane)
  const modelProfiles = !isPreset && !modelProfilesError && form.modelProfilesStr.trim()
    ? JSON.parse(form.modelProfilesStr) as Record<string, AiModelProfile>
    : undefined

  const patch: Partial<AiProviderConfig> = {
    apiKey: form.apiKey,
    baseUrl: form.baseUrl || undefined,
    defaultModelId: modelsArr[0] ?? pane.preset?.defaultModelId ?? '',
    models: modelsArr.length ? modelsArr : pane.preset?.models,
    fallbackModelId: form.fallbackModelId.trim() || undefined,
    parameters: {
      temperature: clampNumber(
        numberOrDefault(form.temperature, DEFAULT_AI_PROVIDER_PARAMETERS.temperature),
        0,
        getLlmPaneTemperatureMax(pane),
      ),
      topP: numberOrDefault(form.topP, DEFAULT_AI_PROVIDER_PARAMETERS.topP),
      frequencyPenalty: numberOrDefault(form.frequencyPenalty, DEFAULT_AI_PROVIDER_PARAMETERS.frequencyPenalty),
      presencePenalty: numberOrDefault(form.presencePenalty, DEFAULT_AI_PROVIDER_PARAMETERS.presencePenalty),
    },
  }

  if (isPreset) {
    patch.modelProfiles = pane.preset?.modelProfiles
  } else {
    patch.type = form.type
    if (form.label.trim()) {
      patch.label = form.label.trim()
    }
    if (!modelProfilesError) {
      patch.modelProfiles = modelProfiles
    }
  }

  aiStore.updateProviderConfig(pane.config.id, patch)
}

function syncLlmPaneForms() {
  for (const pane of llmPanes.value) {
    syncLlmPaneForm(pane)
  }
}

interface WebSearchFormState {
  label: string
  baseUrl: string
  apiKey: string
}

const webForms = reactive<Record<string, WebSearchFormState>>({})
const webShowKeys = reactive<Record<string, boolean>>({})

const webSearchPaneViews = computed<WebSearchPaneView[]>(() =>
  webSearchPanes.value.map(pane => ({ ...pane, form: getWebSearchForm(pane) }))
)

function webSearchFormFromConfig(cfg: WebSearchProviderConfig): WebSearchFormState {
  return {
    label: cfg.label,
    baseUrl: cfg.baseUrl ?? '',
    apiKey: cfg.apiKey ?? '',
  }
}

function ensureWebSearchPaneState(pane: WebSearchPane) {
  webForms[pane.key] ??= webSearchFormFromConfig(pane.config)
  webShowKeys[pane.key] ??= false
}

function getWebSearchForm(pane: WebSearchPane): WebSearchFormState {
  ensureWebSearchPaneState(pane)
  return webForms[pane.key]!
}

function resetWebSearchPaneState(pane: WebSearchPane) {
  webForms[pane.key] = webSearchFormFromConfig(pane.config)
  webShowKeys[pane.key] = false
}

function pruneWebSearchPaneState(panes: readonly WebSearchPane[]) {
  const keys = new Set(panes.map(pane => pane.key))
  for (const key of Object.keys(webForms)) {
    if (!keys.has(key)) {
      delete webForms[key]
      delete webShowKeys[key]
    }
  }
}

function getWebSearchUrlPlaceholder(pane: WebSearchPane): string {
  switch (pane.config.type) {
    case 'tavily': return 'https://api.tavily.com/search (optional)'
    case 'bocha': return 'https://api.bochaai.com/v1/web-search (optional)'
    case 'serper': return 'https://google.serper.dev/search (optional)'
    case 'exa': return 'https://api.exa.ai/search (optional)'
    default: return ''
  }
}

function isWebSearchKeyVisible(pane: WebSearchPane): boolean {
  return webShowKeys[pane.key] ?? false
}

function toggleWebSearchKeyVisibility(pane: WebSearchPane) {
  webShowKeys[pane.key] = !isWebSearchKeyVisible(pane)
}

function startWebEdit(cfg: WebSearchProviderConfig) {
  activeNode.value = { kind: 'web-config', id: cfg.id }
}

function syncWebSearchPaneForm(pane: WebSearchPane) {
  const form = getWebSearchForm(pane)
  const patch: Partial<WebSearchProviderConfig> = {
    baseUrl: form.baseUrl.trim() || undefined,
    apiKey: form.apiKey.trim() || undefined,
  }

  aiStore.updateWebSearchProviderConfig(pane.config.id, patch)
}

function syncWebSearchPaneForms() {
  for (const pane of webSearchPanes.value) {
    syncWebSearchPaneForm(pane)
  }
}

function cancelForm() {
  const node = activeNode.value
  if (!node) {
    selectDefaultLlmNode()
    return
  }
  if (node.kind === 'web-config') {
    const config = aiStore.settings.webSearchProviderConfigs.find(item => item.id === node.id)
    if (config) {
      resetWebSearchPaneState({ key: getWebSearchConfigPaneKey(config.id), kind: 'config', config })
      startWebEdit(config)
    }
    else selectDefaultWebSearchNode()
    return
  }
  if (node.kind === 'llm-config') {
    const config = aiStore.settings.providerConfigs.find(item => item.id === node.id)
    if (config) {
      resetLlmPaneState({
        key: getLlmConfigPaneKey(config.id),
        kind: 'config',
        config,
        preset: config.presetId ? (getProviderPresetById(config.presetId) ?? null) : null,
      })
      startEdit(config)
    }
    else selectDefaultLlmNode()
    return
  }
  selectDefaultLlmNode()
}

const headerTitle = computed(() => {
  const node = activeNode.value
  if (!node) return ''
  if (node.kind === 'llm-config') {
    const cfg = aiStore.settings.providerConfigs.find(item => item.id === node.id)
    return cfg ? `${getProviderDisplayLabel(cfg)} ${t('preferences.ai.configurationSuffix')}` : ''
  }
  const cfg = aiStore.settings.webSearchProviderConfigs.find(item => item.id === node.id)
  return cfg ? `${cfg.label} ${t('preferences.ai.configurationSuffix')}` : ''
})

watch(
  () => t('locale.label'),
  () => {
    for (const pane of llmPanes.value) {
      if (!pane.config?.presetId) continue
      const form = llmForms[pane.key]
      if (form) form.label = getProviderDisplayLabel(pane.config)
    }
  }
)

watch(
  llmPanes,
  (panes) => {
    panes.forEach(ensureLlmPaneState)
    pruneLlmPaneState(panes)
  },
  { immediate: true },
)

watch(llmForms, syncLlmPaneForms, { deep: true })

watch(
  webSearchPanes,
  (panes) => {
    panes.forEach(ensureWebSearchPaneState)
    pruneWebSearchPaneState(panes)
  },
  { immediate: true },
)

watch(webForms, syncWebSearchPaneForms, { deep: true })

selectDefaultLlmNode()

watch(
  headerTitle,
  () => emit('view-change', { view: 'main', title: headerTitle.value }),
  { immediate: true }
)

defineExpose({ cancelForm })
</script>
