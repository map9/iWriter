<template>
  <div class="flex h-full min-h-0 flex-col overflow-hidden">
    <div v-if="view === 'main'" class="flex-1 overflow-y-auto">
      <div class="px-7 py-6">
        <section class="flex flex-col gap-3">
          <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.ai.providers') }}</h3>
        <div v-if="sortedLlmConfigs.length" class="flex flex-col gap-2">
          <div
            v-for="cfg in sortedLlmConfigs"
            :key="cfg.id"
            @click="startEdit(cfg)"
            class="group flex cursor-pointer items-center gap-3 rounded-box border px-4 py-3 transition-colors"
            :class="[
              cfg.id === aiStore.settings.activeProviderConfigId
                ? 'border-primary bg-primary/8 ring-1 ring-primary/20'
                : 'border-base-300 bg-base-100 hover:bg-base-200/70',
              !isProviderUsable(cfg) ? 'opacity-50' : ''
              ]"
            >
              <span
                class="icon-dot shrink-0 self-center"
                :class="cfg.id === aiStore.settings.activeProviderConfigId ? 'bg-primary' : 'bg-base-300'"
              />
              <span class="min-w-0 flex-1 truncate text-sm font-medium text-base-content">{{ cfg.label }}</span>
              <span class="max-w-25 shrink-0 truncate text-left text-xs text-base-content/65 hidden sm:block">
                {{ isProviderUsable(cfg) ? cfg.defaultModelId : t('preferences.ai.needConfiguration') }}
              </span>
              <button
                v-if="!cfg.presetId"
                @click.stop="aiStore.removeProviderConfig(cfg.id)"
                class="iw-toolbar-btn btn-xs opacity-0 transition-opacity group-hover:opacity-100 text-error hover:bg-error hover:text-error-content"
                :title="t('preferences.ai.removeProvider')"
              >
                <IconTrash class="icon-2xs" />
              </button>
            </div>
          </div>

          <div v-else class="rounded-box border border-dashed border-base-300 bg-base-100 px-4 py-5 text-sm text-base-content/65">
            {{ t('preferences.ai.noProviders') }}
          </div>
        </section>

        <section class="mt-5 flex flex-col gap-3">
          <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.ai.actions') }}</h3>
          <button
            @click="selectCustom()"
            class="flex w-full items-center gap-3 rounded-box border border-dashed border-base-300 bg-base-100 px-4 py-3 text-left transition-colors hover:border-primary hover:bg-primary/8"
          >
            <IconPlus class="icon-xs shrink-0 text-base-content" />
            <span class="min-w-0 flex-1 truncate text-sm font-medium text-base-content">{{ t('preferences.ai.addCustomProvider') }}</span>
            <span class="max-w-25 shrink-0 truncate text-left text-xs text-base-content/65 hidden sm:block">{{ t('preferences.ai.addCustomProviderHint') }}</span>
          </button>
        </section>
      </div>
    </div>

    <template v-else>
      <div class="flex-1 overflow-y-auto">
        <div class="px-7 py-5">
          <section class="flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.ai.identity') }}</h3>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.name') }}</label>
              <input
                v-model="form.label"
                type="text"
                :readonly="isPreset"
                :placeholder="selectedPreset?.label ?? t('preferences.ai.customProviderName')"
                class="iw-input"
                :class="isPreset ? 'bg-base-200 text-base-content cursor-default' : ''"
              />
            </div>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.interfaceType') }}</label>
              <select
                v-model="form.type"
                :disabled="isPreset"
                class="iw-select w-full px-3"
                :class="isPreset ? 'bg-base-100 text-base-content cursor-default' : ''"
              >
                <option value="openai-compat">{{ t('preferences.ai.interfaceOpenAICompat') }}</option>
                <option value="deepseek">{{ t('preferences.ai.interfaceDeepSeek') }}</option>
                <option value="anthropic">{{ t('preferences.ai.interfaceAnthropic') }}</option>
                <option value="gemini">{{ t('preferences.ai.interfaceGemini') }}</option>
              </select>
            </div>
          </section>

          <section v-if="selectedPreset?.requiresApiKey !== false" class="mt-5 flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.ai.authentication') }}</h3>

            <div class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.apiKey') }}</label>
              <label class="iw-input">
                <input
                  v-model="form.apiKey"
                  :type="showKey ? 'text' : 'password'"
                  :placeholder="t('preferences.ai.apiKeyPlaceholder')"
                />
                <button type="button" @click="showKey = !showKey" class="iw-toolbar-btn btn-xs">
                  <IconEye v-if="!showKey" class="icon-xs" />
                  <IconEyeOff v-else class="icon-xs" />
                </button>
              </label>
              <p class="text-xs text-base-content/65">
                {{ t('preferences.ai.apiKeyHint') }}
              </p>
            </div>
          </section>

          <section class="mt-5 flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.ai.connection') }}</h3>

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
              <p class="text-xs text-base-content/65">{{ t('preferences.ai.modelsHint') }}</p>
            </div>

            <div v-else class="flex flex-col gap-1.5">
              <label class="text-sm font-medium text-base-content">{{ t('preferences.ai.models') }}</label>
              <p class="rounded-box border border-base-300 bg-base-100 px-4 py-3 text-xs text-base-content/65">
                {{ t('preferences.ai.ollamaModelsHint') }}
              </p>
            </div>
          </section>

          <section v-if="!isPreset" class="mt-5 flex flex-col gap-3">
            <h3 class="text-xs font-semibold uppercase text-base-content/60">{{ t('preferences.ai.advanced') }}</h3>

            <div class="flex flex-col gap-1.5">
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
                class="min-h-40 w-full resize-y rounded-field border border-base-300 bg-base-100 px-3 py-2 font-mono text-sm text-base-content focus:border-primary focus:outline-none"
              />
              <p class="text-xs" :class="modelProfilesError ? 'text-error' : 'text-base-content/65'">
                {{ modelProfilesError || t('preferences.ai.modelProfilesHint') }}
              </p>
            </div>
          </section>
        </div>
      </div>

      <div class="mx-7 flex shrink-0 items-center justify-end gap-2 border-t border-base-300 bg-base-100 pb-5 pt-4">
        <button
          @click="cancelForm"
          class="iw-btn btn-ghost"
        >
          {{ t('preferences.ai.cancel') }}
        </button>
        <button
          @click="submitForm"
          :disabled="!canSave"
          :title="!canSave ? t('preferences.ai.nameRequired') : ''"
          class="iw-btn"
          :class="canSave ? 'btn-primary' : 'cursor-not-allowed'"
        >
          {{ editingId ? t('preferences.ai.save') : t('preferences.ai.confirmAdd') }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconTrash, IconPlus, IconEye, IconEyeOff } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import type { AiModelProfile, AiProviderConfig, AiProviderType } from '@/ai/types'
import {
  PROVIDER_PRESETS,
  type ProviderPreset,
} from '@/ai/providers/provider-presets'

const emit = defineEmits<{
  'view-change': [info: { view: View; title: string }]
}>()
const { t } = useI18n()

const aiStore = useAiStore()

// ── LLM usability check ───────────────────────────────────────────────────
function isProviderUsable(cfg: AiProviderConfig): boolean {
  const preset = PROVIDER_PRESETS.find(p => p.id === cfg.presetId)
  const models = cfg.models ? cfg.models : preset?.models ?? []
  if (
    models.length &&
    (cfg?.id === 'ollama' || cfg.apiKey.length)
  ) return true
  return false
}

// ── Sorted configured provider lists ────────────────────────────────────
const sortedLlmConfigs = computed(() => {
  const cfgs = aiStore.settings.providerConfigs
  const presets = cfgs.filter(c => !!c.presetId).sort((a, b) => a.label.localeCompare(b.label))
  const custom = cfgs.filter(c => !c.presetId).sort((a, b) => a.label.localeCompare(b.label))
  return [...presets, ...custom]
})

// ── View state ────────────────────────────────────────────────────────────
type View = 'main' | 'configure'
const view = ref<View>('main')
const editingId = ref<string | null>(null)
const selectedPreset = ref<ProviderPreset | null>(null)
const isPreset = computed(() => !!selectedPreset.value)
const showKey = ref(false)

// ── Form ──────────────────────────────────────────────────────────────────
interface FormState {
  type: AiProviderType
  label: string
  apiKey: string
  baseUrl: string
  modelsStr: string       // comma-separated model IDs
  modelProfilesStr: string
}

const form = ref<FormState>({
  type: 'openai-compat',
  label: '',
  apiKey: '',
  baseUrl: '',
  modelsStr: '',
  modelProfilesStr: '',
})

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

const headerTitle = computed(() => {
  if (view.value === 'main') return ''
  if (editingId.value) return `${form.value.label || ''} ${t('preferences.ai.configurationSuffix')}`
  return t('preferences.ai.addCustomProviderTitle')
})

// ── Actions ───────────────────────────────────────────────────────────────
function selectCustom() {
  selectedPreset.value = null
  editingId.value = null
  form.value = {
    type: 'openai-compat',
    label: '',
    apiKey: '',
    baseUrl: '',
    modelsStr: '',
    modelProfilesStr: '',
  }
  showKey.value = false
  view.value = 'configure'
}

function startEdit(cfg: AiProviderConfig) {
  editingId.value = cfg.id
  selectedPreset.value = cfg.presetId
    ? (PROVIDER_PRESETS.find(p => p.id === cfg.presetId) ?? null)
    : null
  form.value = {
    type: cfg.type,
    label: cfg.label,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl ?? '',
    modelsStr: (cfg.models ?? []).join(', '),
    modelProfilesStr: cfg.modelProfiles ? JSON.stringify(cfg.modelProfiles, null, 2) : '',
  }
  showKey.value = false
  view.value = 'configure'
}

function cancelForm() {
  view.value = 'main'
  editingId.value = null
  selectedPreset.value = null
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
    models: modelsArr.length ? modelsArr : (selectedPreset.value?.models),
    modelProfiles: isPreset.value ? selectedPreset.value?.modelProfiles : modelProfiles,
  }

  if (editingId.value) {
    aiStore.updateProviderConfig(editingId.value, patch)
  } else {
    aiStore.addProviderConfig({ id: `provider-${Date.now()}`, enabled: true, ...patch })
  }

  cancelForm()
}

// Notify parent of view/title changes
watch(
  [view, headerTitle],
  () => emit('view-change', { view: view.value, title: headerTitle.value }),
  { immediate: true }
)

defineExpose({ cancelForm })
</script>
