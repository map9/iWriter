<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ══════════════════════════════════════════════════════════════════════
         MAIN VIEW
    ═══════════════════════════════════════════════════════════════════════ -->
    <div v-if="view === 'main'" class="flex-1 overflow-y-auto">

      <!-- Select Model section -->
      <div class="p-3">
        <p class="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2">Select Model</p>

        <!-- Configured LLMs: preset-based (A-Z) then custom (A-Z) -->
        <div v-if="sortedLlmConfigs.length" class="space-y-1 mb-2">
          <div
            v-for="cfg in sortedLlmConfigs"
            :key="cfg.id"
            @click="startEdit(cfg)"
            class="flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer"
            :class="[
              cfg.id === aiStore.settings.activeProviderConfigId
                ? 'border-accent-primary bg-accent-primary/10'
                : 'border-border-separator bg-background-content hover:border-text-tertiary',
              !isLlmUsable(cfg) ? 'opacity-50' : ''
            ]"
          >
            <span
              class="w-1.5 h-1.5 rounded-full flex-shrink-0"
              :class="cfg.id === aiStore.settings.activeProviderConfigId ? 'bg-accent-primary' : 'bg-transparent'"
            />
            <span class="flex-1 text-sm font-medium truncate"
              :class="isLlmUsable(cfg) ? 'text-text-primary' : 'text-text-tertiary'"
            >{{ cfg.label }}</span>
            <span class="text-xs text-text-tertiary truncate max-w-[80px] hidden sm:block">
              {{ isLlmUsable(cfg) ? cfg.defaultModelId : '需要配置' }}
            </span>
            <button @click.stop="startEdit(cfg)" class="p-0.5 rounded hover:bg-interactive-hover flex-shrink-0">
              <IconPencil class="w-3.5 h-3.5 text-text-secondary" />
            </button>
            <!-- Delete only for custom (no presetId) -->
            <button
              v-if="!cfg.presetId"
              @click.stop="aiStore.removeProviderConfig(cfg.id)"
              class="p-0.5 rounded hover:bg-status-error/10 flex-shrink-0"
            >
              <IconTrash class="w-3.5 h-3.5 text-status-error" />
            </button>
          </div>
        </div>

        <!-- Add custom LLM -->
        <button
          @click="selectCustom()"
          class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-dashed border-border-separator hover:border-accent-primary hover:bg-accent-primary/10 transition-colors text-left"
        >
          <IconPlus class="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
          <span class="text-xs font-medium text-text-secondary">添加自定义 Model</span>
          <span class="text-xs text-text-tertiary">OpenAI / Anthropic / Gemini</span>
        </button>
      </div>

    </div><!-- /main -->

    <!-- ══════════════════════════════════════════════════════════════════════
         CONFIGURE FORM
    ═══════════════════════════════════════════════════════════════════════ -->
    <template v-else>
      <div class="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

          <!-- Name -->
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">Name</label>
            <input
              v-model="form.label"
              type="text"
              :readonly="isPreset"
              :placeholder="selectedPreset?.label ?? '自定义名称'"
              class="w-full h-9 text-sm px-3 border border-border-separator rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary bg-background-content text-text-primary"
              :class="isPreset ? 'bg-background-window text-text-secondary cursor-default' : ''"
            />
          </div>

          <!-- API Key -->
          <div v-if="selectedPreset?.requiresApiKey !== false">
            <label class="block text-sm font-medium text-text-primary mb-1">API Key</label>
            <div class="relative">
              <input
                v-model="form.apiKey"
                :type="showKey ? 'text' : 'password'"
                placeholder="sk-... 或 $ENV_VAR_NAME"
                class="w-full h-9 text-sm px-3 pr-10 border border-border-separator rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono bg-background-content text-text-primary"
              />
              <button type="button" @click="showKey = !showKey" class="absolute right-2.5 top-2">
                <IconEye v-if="!showKey" class="w-4 h-4 text-text-tertiary" />
                <IconEyeOff v-else class="w-4 h-4 text-text-tertiary" />
              </button>
            </div>
            <p class="text-xs text-text-tertiary mt-1">支持 <code class="bg-background-window px-1 rounded">$ENV_VAR_NAME</code> 格式引用系统环境变量</p>
          </div>

          <!-- Interface type -->
          <div>
            <label class="block text-sm font-medium text-text-primary mb-1">Interface Type</label>
            <select
              v-model="form.type"
              :disabled="isPreset"
              class="w-full h-9 text-sm px-3 border border-border-separator rounded-lg bg-background-content text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-primary"
              :class="isPreset ? 'bg-background-window text-text-secondary cursor-default' : ''"
            >
              <option value="openai-compat">OpenAI 兼容</option>
              <option value="deepseek">DeepSeek</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

          <!-- Base URL -->
          <div v-if="form.type === 'openai-compat' || form.type === 'deepseek'">
            <label class="block text-sm font-medium text-text-primary mb-1">Base URL</label>
            <input
              v-model="form.baseUrl"
              type="text"
              :placeholder="selectedPreset?.baseUrl ?? 'https://api.openai.com/v1'"
              class="w-full h-9 text-sm px-3 border border-border-separator rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono bg-background-content text-text-primary"
            />
          </div>

          <!-- Models -->
          <div v-if="selectedPreset?.id !== 'ollama'">
            <label class="block text-sm font-medium text-text-primary mb-1">Models</label>
            <input
              v-model="form.modelsStr"
              type="text"
              :placeholder="(selectedPreset?.models ?? []).join(', ') || 'gpt-4o, gpt-4o-mini'"
              class="w-full h-9 text-sm px-3 border border-border-separator rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono bg-background-content text-text-primary"
            />
            <p class="text-xs text-text-tertiary mt-1">逗号分隔，第一个为默认模型</p>
          </div>
          <div v-else>
            <label class="block text-sm font-medium text-text-primary mb-1">Models</label>
            <p class="text-xs text-text-tertiary bg-background-window border border-border-separator rounded-lg px-3 py-2">
              Ollama 模型列表通过本地 Ollama 服务自动读取，无需手动配置
            </p>
          </div>

          <div v-if="!isPreset">
            <label class="block text-sm font-medium text-text-primary mb-1">Model Profiles (JSON)</label>
            <textarea
              v-model="form.modelProfilesStr"
              rows="8"
              placeholder='{
  "deepseek-chat": { "maxInputTokens": 128000, "toolCalling": true }
}'
              class="w-full text-sm px-3 py-2 border border-border-separator rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-primary font-mono resize-y bg-background-content text-text-primary"
            />
            <p class="text-xs mt-1" :class="modelProfilesError ? 'text-status-error' : 'text-text-tertiary'">
              {{ modelProfilesError || '仅自定义 Provider 可编辑。按 modelId 配置 profile 覆盖，用于兼容模型和自定义模型。' }}
            </p>
          </div>

      </div>

      <!-- ── Save / Cancel ─────────────────────────────────────────────── -->
      <div class="flex gap-2 px-4 py-3 border-t border-border-separator flex-shrink-0">
        <button
          @click="submitForm"
          :disabled="!canSave"
          :title="!canSave ? '请填写 Name' : ''"
          class="flex-1 py-2 text-sm font-medium rounded-lg transition-colors"
          :class="canSave
            ? 'bg-accent-primary text-white hover:bg-accent-primary/90'
            : 'bg-interactive-hover text-text-tertiary cursor-not-allowed border border-border-separator'"
        >
          {{ editingId ? '保存修改' : '确认添加' }}
        </button>
        <button
          @click="cancelForm"
          class="px-4 py-2 text-sm rounded-lg border border-border-separator text-text-secondary hover:bg-interactive-hover transition-colors"
        >
          取消
        </button>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { IconPencil, IconTrash, IconPlus, IconEye, IconEyeOff } from '@tabler/icons-vue'
import { useAiStore } from '@/ai/store/ai'
import type { AiModelProfile, AiProviderConfig, AiProviderType } from '@/ai/types'
import {
  PROVIDER_PRESETS,
  type ProviderPreset,
} from '@/ai/providers/provider-presets'

const emit = defineEmits<{
  'view-change': [info: { view: View; title: string }]
}>()

const aiStore = useAiStore()

// ── LLM usability check ───────────────────────────────────────────────────
function isLlmUsable(cfg: AiProviderConfig): boolean {
  const models = cfg.models ?? []
  if (models.length) return true
  const preset = PROVIDER_PRESETS.find(p => p.id === cfg.presetId)
  return (preset?.models ?? []).length > 0
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
      return 'Model Profiles 必须是 JSON 对象'
    }
    return ''
  } catch {
    return 'Model Profiles 不是合法 JSON'
  }
})

const canSave = computed(() => !!form.value.label.trim() && !modelProfilesError.value)

const headerTitle = computed(() => {
  if (view.value === 'main') return 'AI 配置'
  if (editingId.value) return `编辑 ${form.value.label || '…'}`
  return '新增自定义 Model'
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
