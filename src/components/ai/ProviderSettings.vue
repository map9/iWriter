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
                    :class="activeNode.kind === 'llm-config' && activeNode.id === cfg.id ? 'btn-active' : 'btn-ghost'"
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
                    class="iw-btn btn-sm h-8 w-full justify-start border-none text-left font-normal group/ai-row"
                    :class="activeNode.kind === 'llm-add' ? 'btn-active' : 'btn-ghost'"
                    @click="selectCustom"
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
                    :class="activeNode.kind === 'web-config' && activeNode.id === cfg.id ? 'btn-active' : 'btn-ghost'"
                    @click="startWebEdit(cfg)"
                    @keydown.enter.prevent="startWebEdit(cfg)"
                    @keydown.space.prevent="startWebEdit(cfg)"
                  >
                    <span class="min-w-0 flex-1 truncate">{{ cfg.label }}</span>
                    <button
                      v-if="!cfg.presetId"
                      class="iw-toolbar-btn btn-xs text-error opacity-0 transition-opacity focus:opacity-100 hover:bg-error hover:text-error-content group-hover/ai-row:opacity-100"
                      :title="t('preferences.ai.webSearch.removeEngine')"
                      @click.stop="removeWebSearchConfig(cfg)"
                      @keydown.stop
                    >
                      <IconTrash class="icon-2xs" />
                    </button>
                  </div>
                </li>
                <li>
                  <button
                    class="iw-btn btn-sm h-8 w-full justify-start border-none text-left font-normal"
                    :class="activeNode.kind === 'web-add' ? 'btn-active' : 'btn-ghost'"
                    @click="selectCustomWebSearch"
                  >
                    <IconPlus class="icon-2xs shrink-0" />
                    <span>{{ t('preferences.ai.webSearch.addCustomEngine') }}</span>
                  </button>
                </li>
              </ul>
            </details>
          </li>
        </ul>
      </div>
    </aside>

    <div class="min-h-0 min-w-0 flex-1 overflow-hidden">
      <template v-if="isLlmFormActive">
        <div class="flex h-full min-h-0 flex-col">
          <div class="flex-1 overflow-y-auto">
            <div class="p-6">
              <section class="flex flex-col gap-3">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.ai.identity') }}</h3>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.name') }}</label>
                  <input
                    v-model="form.label"
                    type="text"
                    :readonly="isPreset"
                    :placeholder="selectedPreset?.label ?? t('preferences.ai.customProviderName')"
                    class="iw-input"
                    :class="isPreset ? 'cursor-default bg-base-200 text-base-content' : ''"
                  />
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.interfaceType') }}</label>
                  <select
                    v-model="form.type"
                    :disabled="isPreset"
                    class="iw-select w-full px-3"
                    :class="isPreset ? 'cursor-default bg-base-100 text-base-content' : ''"
                  >
                    <option value="openai-compat">{{ t('preferences.ai.interfaceOpenAICompat') }}</option>
                    <option value="deepseek">{{ t('preferences.ai.interfaceDeepSeek') }}</option>
                    <option value="anthropic">{{ t('preferences.ai.interfaceAnthropic') }}</option>
                    <option value="gemini">{{ t('preferences.ai.interfaceGemini') }}</option>
                  </select>
                </div>
              </section>

              <section v-if="selectedPreset?.requiresApiKey !== false" class="mt-5 flex flex-col gap-3">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.ai.authentication') }}</h3>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.apiKey') }}</label>
                  <label class="iw-input">
                    <input
                      v-model="form.apiKey"
                      :type="showKey ? 'text' : 'password'"
                      :placeholder="t('preferences.ai.apiKeyPlaceholder')"
                    />
                    <button type="button" class="iw-toolbar-btn btn-xs" @click="showKey = !showKey">
                      <IconEye v-if="!showKey" class="icon-xs" />
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

                <div v-if="form.type === 'openai-compat' || form.type === 'deepseek'" class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.baseUrl') }}</label>
                  <input
                    v-model="form.baseUrl"
                    type="text"
                    :placeholder="selectedPreset?.baseUrl ?? 'https://api.openai.com/v1'"
                    class="iw-input"
                  />
                </div>

                <div v-if="selectedPreset?.id !== 'ollama'" class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.models') }}</label>
                  <input
                    v-model="form.modelsStr"
                    type="text"
                    :placeholder="(selectedPreset?.models ?? []).join(', ')"
                    class="iw-input"
                  />
                  <p class="text-xs text-base-content/50">{{ t('preferences.ai.modelsHint') }}</p>
                </div>

                <div v-if="selectedPreset?.id !== 'ollama'" class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.fallbackModel') }}</label>
                  <input
                    v-model="form.fallbackModelId"
                    type="text"
                    list="iw-fallback-models"
                    :placeholder="t('preferences.ai.fallbackModelPlaceholder')"
                    class="iw-input"
                  />
                  <datalist id="iw-fallback-models">
                    <option v-for="m in availableModels" :key="m" :value="m" />
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
                    <div v-if="parameterSupport.temperature" class="flex flex-col gap-1.5">
                      <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.temperature') }}</label>
                      <input v-model.number="form.temperature" type="number" min="0" :max="temperatureMax" step="0.01" class="iw-input" />
                      <span class="text-xs text-base-content/50">{{ t('preferences.ai.temperatureHint') }}</span>
                    </div>

                    <div v-if="parameterSupport.topP" class="flex flex-col gap-1.5">
                      <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.topP') }}</label>
                      <input v-model.number="form.topP" type="number" min="0" max="1" step="0.01" class="iw-input" />
                      <span class="text-xs text-base-content/50">{{ t('preferences.ai.topPHint') }}</span>
                    </div>

                    <div v-if="parameterSupport.frequencyPenalty" class="flex flex-col gap-1.5">
                      <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.frequencyPenalty') }}</label>
                      <input v-model.number="form.frequencyPenalty" type="number" min="-2" max="2" step="0.01" class="iw-input" />
                      <span class="text-xs text-base-content/50">{{ t('preferences.ai.frequencyPenaltyHint') }}</span>
                    </div>

                    <div v-if="parameterSupport.presencePenalty" class="flex flex-col gap-1.5">
                      <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.presencePenalty') }}</label>
                      <input v-model.number="form.presencePenalty" type="number" min="-2" max="2" step="0.01" class="iw-input" />
                      <span class="text-xs text-base-content/50">{{ t('preferences.ai.presencePenaltyHint') }}</span>
                    </div>
                  </div>
                </div>

                <div v-if="!isPreset" class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.modelProfiles') }}</label>
                  <textarea
                    v-model="form.modelProfilesStr"
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
                  <p class="text-xs" :class="modelProfilesError ? 'text-error' : 'text-base-content/50'">
                    {{ modelProfilesError || t('preferences.ai.modelProfilesHint') }}
                  </p>
                </div>
              </section>
            </div>
          </div>

          <div class="mx-6 flex shrink-0 items-center justify-end gap-2 border-t border-base-300 bg-base-100 pb-5 pt-4">
            <button class="iw-btn btn-ghost btn-sm font-medium" @click="cancelForm">
              {{ t('preferences.ai.cancel') }}
            </button>
            <button
              class="iw-btn btn-sm font-medium disabled:cursor-not-allowed"
              :class="canSave ? 'btn-primary' : ''"
              :disabled="!canSave"
              :title="!canSave ? t('preferences.ai.nameRequired') : ''"
              @click="submitForm"
            >
              {{ editingId ? t('preferences.ai.save') : t('preferences.ai.confirmAdd') }}
            </button>
          </div>
        </div>
      </template>

      <template v-else-if="isWebSearchFormActive">
        <div class="flex h-full min-h-0 flex-col">
          <div class="flex-1 overflow-y-auto">
            <div class="p-6">
              <section class="flex flex-col gap-3">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.ai.identity') }}</h3>

                <div class="flex items-center justify-between gap-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-base-content">{{ t('preferences.ai.webSearch.enabled') }}</div>
                    <div class="text-xs text-base-content/50">{{ t('preferences.ai.webSearch.enabledHint') }}</div>
                  </div>
                  <label class="label cursor-pointer gap-3">
                    <input v-model="webForm.enabled" type="checkbox" class="toggle toggle-primary toggle-xs" />
                  </label>
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.name') }}</label>
                  <input
                    v-model="webForm.label"
                    type="text"
                    :readonly="isWebSearchPreset"
                    :placeholder="t('preferences.ai.webSearch.customEngine')"
                    class="iw-input"
                    :class="isWebSearchPreset ? 'cursor-default bg-base-200 text-base-content' : ''"
                  />
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.webSearch.engineType') }}</label>
                  <select
                    v-model="webForm.type"
                    :disabled="isWebSearchPreset"
                    class="iw-select w-full px-3"
                    :class="isWebSearchPreset ? 'cursor-default bg-base-100 text-base-content' : ''"
                  >
                    <option value="tavily">Tavily</option>
                    <option value="searxng">SearXNG</option>
                    <option value="custom">{{ t('preferences.ai.webSearch.customEngine') }}</option>
                  </select>
                </div>
              </section>

              <section class="mt-5 flex flex-col gap-3">
                <h3 class="text-xs font-semibold uppercase text-base-content/70">{{ t('preferences.ai.connection') }}</h3>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.webSearch.baseUrl') }}</label>
                  <input
                    v-model="webForm.baseUrl"
                    type="text"
                    class="iw-input"
                    :placeholder="webSearchUrlPlaceholder"
                  />
                  <p class="text-xs text-base-content/50">{{ t('preferences.ai.webSearch.baseUrlHint') }}</p>
                </div>

                <div class="flex flex-col gap-1.5">
                  <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.webSearch.apiKey') }}</label>
                  <label class="iw-input">
                    <input
                      v-model="webForm.apiKey"
                      :type="showWebSearchKey ? 'text' : 'password'"
                      :placeholder="t('preferences.ai.webSearch.apiKeyPlaceholder')"
                    />
                    <button type="button" class="iw-toolbar-btn btn-xs" @click="showWebSearchKey = !showWebSearchKey">
                      <IconEye v-if="!showWebSearchKey" class="icon-xs" />
                      <IconEyeOff v-else class="icon-xs" />
                    </button>
                  </label>
                  <p class="text-xs text-base-content/50">{{ t('preferences.ai.webSearch.apiKeyHint') }}</p>
                </div>
              </section>
            </div>
          </div>

          <div class="mx-6 flex shrink-0 items-center justify-end gap-2 border-t border-base-300 bg-base-100 pb-5 pt-4">
            <button class="iw-btn btn-ghost btn-sm font-medium" @click="cancelForm">
              {{ t('preferences.ai.cancel') }}
            </button>
            <button
              class="iw-btn btn-sm font-medium disabled:cursor-not-allowed"
              :class="canSaveWebSearch ? 'btn-primary' : ''"
              :disabled="!canSaveWebSearch"
              :title="!canSaveWebSearch ? t('preferences.ai.nameRequired') : ''"
              @click="submitWebSearchForm"
            >
              {{ webEditingId ? t('preferences.ai.save') : t('preferences.ai.confirmAdd') }}
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconTrash, IconPlus, IconEye, IconEyeOff, IconChevronRight } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import type {
  AiModelProfile,
  AiProviderConfig,
  AiProviderType,
  WebSearchProviderConfig,
  WebSearchProviderType,
} from '@/ai/types'
import {
  DEFAULT_AI_PROVIDER_PARAMETERS,
  getDefaultWebSearchProviderConfig,
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
  | { kind: 'llm-add' }
  | { kind: 'web-config'; id: string }
  | { kind: 'web-add' }

const activeNode = ref<ActiveNode>({ kind: 'llm-add' })

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
  tavily: 0,
  searxng: 1,
}

const sortedWebSearchConfigs = computed(() => {
  const cfgs = aiStore.settings.webSearchProviderConfigs
  const presets = cfgs
    .filter(c => !!c.presetId)
    .sort((a, b) => (webSearchPresetOrder[a.presetId ?? ''] ?? 99) - (webSearchPresetOrder[b.presetId ?? ''] ?? 99))
  const custom = cfgs.filter(c => !c.presetId).sort((a, b) => a.label.localeCompare(b.label))
  return [...presets, ...custom]
})

const defaultWebSearchConfig = computed(() =>
  getDefaultWebSearchProviderConfig(sortedWebSearchConfigs.value)
)

const editingId = ref<string | null>(null)
const selectedPreset = ref<ProviderPreset | null>(null)
const isPreset = computed(() => !!selectedPreset.value)
const showKey = ref(false)

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

const form = ref<FormState>({
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
})

const isLlmFormActive = computed(() => activeNode.value.kind === 'llm-config' || activeNode.value.kind === 'llm-add')

const availableModels = computed(() =>
  form.value.modelsStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)

const parameterSupport = computed(() => getProviderParameterSupport(form.value.type, form.value.baseUrl))
const isGlmProvider = computed(() => selectedPreset.value?.id === 'glm' || /open\.bigmodel\.cn/i.test(form.value.baseUrl))
const temperatureMax = computed(() => isGlmProvider.value ? 1 : 2)

const modelProfilesError = computed(() => {
  if (isPreset.value || !form.value.modelProfilesStr.trim()) return ''
  try {
    const parsed = JSON.parse(form.value.modelProfilesStr) as Record<string, AiModelProfile>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return t('preferences.ai.providerProfilesObjectError')
    }
    return ''
  } catch {
    return t('preferences.ai.providerProfilesJsonError')
  }
})

const canSave = computed(() => !!form.value.label.trim() && !modelProfilesError.value)

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

function getNextWebSearchConfigAfter(id: string): WebSearchProviderConfig | null {
  const configs = sortedWebSearchConfigs.value
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
  selectCustom()
}

function selectDefaultWebSearchNode() {
  const config = defaultWebSearchConfig.value ?? sortedWebSearchConfigs.value[0]
  if (config) {
    startWebEdit(config)
    return
  }
  selectCustomWebSearch()
}

function selectCustom() {
  selectedPreset.value = null
  editingId.value = null
  form.value = defaultLlmForm()
  showKey.value = false
  activeNode.value = { kind: 'llm-add' }
}

function startEdit(cfg: AiProviderConfig) {
  const parameters = normalizeProviderParameters(cfg.parameters)
  editingId.value = cfg.id
  selectedPreset.value = cfg.presetId
    ? (getProviderPresetById(cfg.presetId) ?? null)
    : null
  form.value = {
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
  showKey.value = false
  activeNode.value = { kind: 'llm-config', id: cfg.id }
}

function removeLlmConfig(cfg: AiProviderConfig) {
  if (cfg.presetId) return
  const nextConfig = getNextLlmConfigAfter(cfg.id)
  const shouldMoveSelection = activeNode.value.kind === 'llm-config' && activeNode.value.id === cfg.id
  aiStore.removeProviderConfig(cfg.id)
  if (shouldMoveSelection) {
    if (nextConfig) startEdit(nextConfig)
    else selectCustom()
  }
}

function submitForm() {
  if (!canSave.value) return

  const modelsArr = form.value.modelsStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  const modelProfiles = !isPreset.value && form.value.modelProfilesStr.trim()
    ? JSON.parse(form.value.modelProfilesStr) as Record<string, AiModelProfile>
    : undefined

  const patch: Omit<AiProviderConfig, 'id' | 'enabled'> = {
    type: form.value.type,
    label: form.value.label.trim(),
    apiKey: form.value.apiKey,
    baseUrl: form.value.baseUrl || undefined,
    defaultModelId: modelsArr[0] ?? selectedPreset.value?.defaultModelId ?? '',
    presetId: selectedPreset.value?.id,
    models: modelsArr.length ? modelsArr : selectedPreset.value?.models,
    modelProfiles: isPreset.value ? selectedPreset.value?.modelProfiles : modelProfiles,
    fallbackModelId: form.value.fallbackModelId.trim() || undefined,
    parameters: {
      temperature: clampNumber(
        numberOrDefault(form.value.temperature, DEFAULT_AI_PROVIDER_PARAMETERS.temperature),
        0,
        temperatureMax.value,
      ),
      topP: numberOrDefault(form.value.topP, DEFAULT_AI_PROVIDER_PARAMETERS.topP),
      frequencyPenalty: numberOrDefault(form.value.frequencyPenalty, DEFAULT_AI_PROVIDER_PARAMETERS.frequencyPenalty),
      presencePenalty: numberOrDefault(form.value.presencePenalty, DEFAULT_AI_PROVIDER_PARAMETERS.presencePenalty),
    },
  }

  if (editingId.value) {
    aiStore.updateProviderConfig(editingId.value, patch)
    activeNode.value = { kind: 'llm-config', id: editingId.value }
  } else {
    const id = `provider-${Date.now()}`
    aiStore.addProviderConfig({ id, enabled: true, ...patch })
    editingId.value = id
    activeNode.value = { kind: 'llm-config', id }
  }
}

const webEditingId = ref<string | null>(null)
const selectedWebSearchConfig = ref<WebSearchProviderConfig | null>(null)
const isWebSearchPreset = computed(() => !!selectedWebSearchConfig.value?.presetId)
const showWebSearchKey = ref(false)

interface WebSearchFormState {
  type: WebSearchProviderType
  label: string
  enabled: boolean
  baseUrl: string
  apiKey: string
}

const webForm = ref<WebSearchFormState>({
  type: 'custom',
  label: '',
  enabled: true,
  baseUrl: '',
  apiKey: '',
})

const isWebSearchFormActive = computed(() => activeNode.value.kind === 'web-config' || activeNode.value.kind === 'web-add')
const canSaveWebSearch = computed(() => !!webForm.value.label.trim())

const webSearchUrlPlaceholder = computed(() => {
  const type = webForm.value.type
  if (type === 'tavily') return 'https://api.tavily.com/search (optional)'
  if (type === 'searxng') return 'https://your-searxng-instance.example.com'
  return 'https://your-search-api.example.com'
})

function selectCustomWebSearch() {
  webEditingId.value = null
  selectedWebSearchConfig.value = null
  showWebSearchKey.value = false
  webForm.value = {
    type: 'custom',
    label: t('preferences.ai.webSearch.customEngine'),
    enabled: true,
    baseUrl: '',
    apiKey: '',
  }
  activeNode.value = { kind: 'web-add' }
}

function startWebEdit(cfg: WebSearchProviderConfig) {
  webEditingId.value = cfg.id
  selectedWebSearchConfig.value = cfg
  showWebSearchKey.value = false
  webForm.value = {
    type: cfg.type,
    label: cfg.label,
    enabled: cfg.enabled,
    baseUrl: cfg.baseUrl ?? '',
    apiKey: cfg.apiKey ?? '',
  }
  activeNode.value = { kind: 'web-config', id: cfg.id }
}

function removeWebSearchConfig(cfg: WebSearchProviderConfig) {
  if (cfg.presetId) return
  const nextConfig = getNextWebSearchConfigAfter(cfg.id)
  const shouldMoveSelection = activeNode.value.kind === 'web-config' && activeNode.value.id === cfg.id
  aiStore.removeWebSearchProviderConfig(cfg.id)
  if (shouldMoveSelection) {
    if (nextConfig) startWebEdit(nextConfig)
    else selectCustomWebSearch()
  }
}

function submitWebSearchForm() {
  if (!canSaveWebSearch.value) return

  const patch: Omit<WebSearchProviderConfig, 'id'> = {
    type: webForm.value.type,
    label: webForm.value.label.trim(),
    enabled: webForm.value.enabled,
    presetId: selectedWebSearchConfig.value?.presetId,
    baseUrl: webForm.value.baseUrl.trim() || undefined,
    apiKey: webForm.value.apiKey.trim() || undefined,
  }

  if (webEditingId.value) {
    aiStore.updateWebSearchProviderConfig(webEditingId.value, patch)
    activeNode.value = { kind: 'web-config', id: webEditingId.value }
  } else {
    const id = `web-search-${Date.now()}`
    aiStore.addWebSearchProviderConfig({ id, ...patch })
    webEditingId.value = id
    activeNode.value = { kind: 'web-config', id }
  }
}

function cancelForm() {
  const node = activeNode.value
  if (node.kind === 'web-config') {
    const config = aiStore.settings.webSearchProviderConfigs.find(item => item.id === node.id)
    if (config) startWebEdit(config)
    else selectDefaultWebSearchNode()
    return
  }
  if (node.kind === 'web-add') {
    selectDefaultWebSearchNode()
    return
  }
  if (node.kind === 'llm-config') {
    const config = aiStore.settings.providerConfigs.find(item => item.id === node.id)
    if (config) startEdit(config)
    else selectDefaultLlmNode()
    return
  }
  selectDefaultLlmNode()
}

const headerTitle = computed(() => {
  const node = activeNode.value
  if (node.kind === 'llm-add') return t('preferences.ai.addCustomProviderTitle')
  if (node.kind === 'web-add') return t('preferences.ai.webSearch.addCustomEngine')
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
    if (!selectedPreset.value?.id) return
    selectedPreset.value = getProviderPresetById(selectedPreset.value.id) ?? null
    if (editingId.value) {
      const cfg = aiStore.settings.providerConfigs.find(item => item.id === editingId.value)
      if (cfg) form.value.label = getProviderDisplayLabel(cfg)
    }
  }
)

selectDefaultLlmNode()

watch(
  headerTitle,
  () => emit('view-change', { view: 'main', title: headerTitle.value }),
  { immediate: true }
)

defineExpose({ cancelForm })
</script>
