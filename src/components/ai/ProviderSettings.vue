<template>
  <div class="flex flex-col h-full overflow-hidden">

    <!-- ── Header ─────────────────────────────────────────────────────────── -->
    <div class="flex items-center gap-2 px-3 py-2.5 border-b border-gray-200 bg-gray-50 flex-shrink-0">
      <button
        v-if="view !== 'main'"
        @click="cancelForm"
        class="p-1 rounded hover:bg-gray-200 transition-colors"
      >
        <IconArrowLeft class="w-4 h-4 text-gray-600" />
      </button>
      <span class="text-sm font-medium text-gray-900 flex-1 truncate">{{ headerTitle }}</span>
      <button
        v-if="view === 'main'"
        @click="$emit('close')"
        class="p-1 rounded hover:bg-gray-200 transition-colors"
      >
        <IconX class="w-4 h-4 text-gray-600" />
      </button>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════
         MAIN VIEW
    ═══════════════════════════════════════════════════════════════════════ -->
    <div v-if="view === 'main'" class="flex-1 overflow-y-auto">

      <!-- Select Model section -->
      <div class="p-3">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Select Model</p>

        <!-- Configured LLMs: preset-based (A-Z) then custom (A-Z) -->
        <div v-if="sortedLlmConfigs.length" class="space-y-1 mb-2">
          <div
            v-for="cfg in sortedLlmConfigs"
            :key="cfg.id"
            @click="startEdit(cfg)"
            class="flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer"
            :class="[
              cfg.id === aiStore.settings.activeProviderConfigId
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300',
              !isLlmUsable(cfg) ? 'opacity-50' : ''
            ]"
          >
            <span
              class="w-1.5 h-1.5 rounded-full flex-shrink-0"
              :class="cfg.id === aiStore.settings.activeProviderConfigId ? 'bg-blue-500' : 'bg-transparent'"
            />
            <span class="flex-1 text-sm font-medium truncate"
              :class="isLlmUsable(cfg) ? 'text-gray-800' : 'text-gray-400'"
            >{{ cfg.label }}</span>
            <span class="text-xs text-gray-400 truncate max-w-[80px] hidden sm:block">
              {{ isLlmUsable(cfg) ? cfg.defaultModelId : '需要配置' }}
            </span>
            <button @click.stop="startEdit(cfg)" class="p-0.5 rounded hover:bg-gray-100 flex-shrink-0">
              <IconPencil class="w-3.5 h-3.5 text-gray-500" />
            </button>
            <!-- Delete only for custom (no presetId) -->
            <button
              v-if="!cfg.presetId"
              @click.stop="aiStore.removeProviderConfig(cfg.id)"
              class="p-0.5 rounded hover:bg-red-50 flex-shrink-0"
            >
              <IconTrash class="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        </div>

        <!-- Add custom LLM -->
        <button
          @click="selectCustom('llm')"
          class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left"
        >
          <IconPlus class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span class="text-xs font-medium text-gray-500">添加自定义 Model</span>
          <span class="text-xs text-gray-400">OpenAI / Anthropic / Gemini</span>
        </button>
      </div>

      <!-- Select Agent section -->
      <div class="p-3 pt-0">
        <p class="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Select Agent</p>

        <!-- Configured Agents: preset-based (A-Z) then custom (A-Z) -->
        <div v-if="sortedAgentConfigs.length" class="space-y-1 mb-2">
          <div
            v-for="cfg in sortedAgentConfigs"
            :key="cfg.id"
            @click="startEdit(cfg)"
            class="flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-pointer"
            :class="cfg.id === aiStore.settings.activeProviderConfigId
              ? 'border-purple-400 bg-purple-50'
              : 'border-gray-200 bg-white hover:border-gray-300'"
          >
            <span
              class="w-1.5 h-1.5 rounded-full flex-shrink-0"
              :class="cfg.id === aiStore.settings.activeProviderConfigId ? 'bg-purple-500' : 'bg-transparent'"
            />
            <span class="flex-1 text-sm font-medium text-gray-800 truncate">{{ cfg.label }}</span>
            <span class="text-xs text-gray-400 flex-shrink-0 hidden sm:block">{{ cfg.acpCommand ?? 'acp' }}</span>
            <button @click.stop="startEdit(cfg)" class="p-0.5 rounded hover:bg-gray-100 flex-shrink-0">
              <IconPencil class="w-3.5 h-3.5 text-gray-500" />
            </button>
            <button
              v-if="!cfg.presetId"
              @click.stop="aiStore.removeProviderConfig(cfg.id)"
              class="p-0.5 rounded hover:bg-red-50 flex-shrink-0"
            >
              <IconTrash class="w-3.5 h-3.5 text-red-400" />
            </button>
          </div>
        </div>

        <!-- Add custom Agent -->
        <button
          @click="selectCustom('agent')"
          class="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg border border-dashed border-gray-300 hover:border-purple-400 hover:bg-purple-50 transition-colors text-left"
        >
          <IconPlus class="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
          <span class="text-xs font-medium text-gray-500">添加自定义 Agent</span>
          <span class="text-xs text-gray-400">ACP 外部 Agent</span>
        </button>
      </div>

    </div><!-- /main -->

    <!-- ══════════════════════════════════════════════════════════════════════
         CONFIGURE FORM
    ═══════════════════════════════════════════════════════════════════════ -->
    <template v-else>
      <div class="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">

        <!-- ── LLM Form ──────────────────────────────────────────────────── -->
        <template v-if="form.kind === 'llm'">

          <!-- Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              v-model="form.label"
              type="text"
              :readonly="isPreset"
              :placeholder="selectedPreset?.label ?? '自定义名称'"
              class="w-full h-9 text-sm px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              :class="isPreset ? 'bg-gray-50 text-gray-500 cursor-default' : ''"
            />
          </div>

          <!-- API Key -->
          <div v-if="selectedPreset?.requiresApiKey !== false">
            <label class="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <div class="relative">
              <input
                v-model="form.apiKey"
                :type="showKey ? 'text' : 'password'"
                placeholder="sk-... 或 $ENV_VAR_NAME"
                class="w-full h-9 text-sm px-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <button type="button" @click="showKey = !showKey" class="absolute right-2.5 top-2">
                <IconEye v-if="!showKey" class="w-4 h-4 text-gray-400" />
                <IconEyeOff v-else class="w-4 h-4 text-gray-400" />
              </button>
            </div>
            <p class="text-xs text-gray-400 mt-1">支持 <code class="bg-gray-100 px-1 rounded">$ENV_VAR_NAME</code> 格式引用系统环境变量</p>
          </div>

          <!-- Base URL -->
          <div v-if="form.type === 'openai-compat'">
            <label class="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
            <input
              v-model="form.baseUrl"
              type="text"
              :placeholder="selectedPreset?.baseUrl ?? 'https://api.openai.com/v1'"
              class="w-full h-9 text-sm px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          <!-- Models -->
          <div v-if="selectedPreset?.id !== 'ollama'">
            <label class="block text-sm font-medium text-gray-700 mb-1">Models</label>
            <input
              v-model="form.modelsStr"
              type="text"
              :placeholder="(selectedPreset?.models ?? []).join(', ') || 'gpt-4o, gpt-4o-mini'"
              class="w-full h-9 text-sm px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p class="text-xs text-gray-400 mt-1">逗号分隔，第一个为默认模型</p>
          </div>
          <div v-else>
            <label class="block text-sm font-medium text-gray-700 mb-1">Models</label>
            <p class="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Ollama 模型列表通过本地 Ollama 服务自动读取，无需手动配置
            </p>
          </div>

          <!-- Interface type (custom only) -->
          <div v-if="!isPreset">
            <label class="block text-sm font-medium text-gray-700 mb-1">接口类型</label>
            <select
              v-model="form.type"
              class="w-full h-9 text-sm px-3 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="openai-compat">OpenAI 兼容</option>
              <option value="anthropic">Anthropic</option>
              <option value="gemini">Google Gemini</option>
            </select>
          </div>

        </template>

        <!-- ── Agent Form ────────────────────────────────────────────────── -->
        <template v-else>

          <!-- Name -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              v-model="form.label"
              type="text"
              :readonly="isPreset"
              :placeholder="selectedPreset?.label ?? '自定义 Agent'"
              class="w-full h-9 text-sm px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              :class="isPreset ? 'bg-gray-50 text-gray-500 cursor-default' : ''"
            />
          </div>

          <!-- Command -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Command</label>
            <input
              v-model="form.acpCommand"
              type="text"
              :readonly="isPreset"
              :placeholder="selectedPreset?.acpCommand ?? 'claude'"
              class="w-full h-9 text-sm px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              :class="isPreset ? 'bg-gray-50 text-gray-500 cursor-default' : ''"
            />
          </div>

          <!-- Arguments -->
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Arguments</label>
            <input
              v-model="form.acpArgsStr"
              type="text"
              :placeholder="(selectedPreset?.acpCommand === 'npx' ? '@google/gemini-cli@latest --experimental-acp' : '--flag value')"
              class="w-full h-9 text-sm px-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p class="text-xs text-gray-400 mt-1">空格分隔。如有空格用引号包裹</p>
          </div>

          <!-- Environment Variables -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="block text-sm font-medium text-gray-700">Environment Variables</label>
              <button
                @click="addEnvEntry"
                class="flex items-center gap-1 px-2 py-0.5 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <IconPlus class="w-3 h-3" />Add
              </button>
            </div>
            <div
              v-for="(entry, i) in form.acpEnvEntries"
              :key="i"
              class="flex items-center gap-2 mb-1.5"
            >
              <input
                v-model="entry.key"
                type="text"
                placeholder="KEY"
                class="flex-1 h-8 text-xs px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
              <span class="text-gray-400 flex-shrink-0 text-sm">=</span>
              <input
                v-model="entry.value"
                type="text"
                placeholder="value"
                class="flex-1 h-8 text-xs px-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              />
              <button @click="removeEnvEntry(i)" class="flex-shrink-0 p-0.5 rounded hover:text-red-500 text-gray-400">
                <IconX class="w-4 h-4" />
              </button>
            </div>
            <p v-if="!form.acpEnvEntries.length" class="text-xs text-gray-400 italic">
              暂无环境变量
            </p>
          </div>

        </template>

      </div>

      <!-- ── Save / Cancel ─────────────────────────────────────────────── -->
      <div class="flex gap-2 px-4 py-3 border-t border-gray-200 flex-shrink-0">
        <button
          @click="submitForm"
          :disabled="!canSave"
          :title="!canSave ? (form.kind === 'agent' ? '请填写 Name 和 Command' : '请填写 Name') : ''"
          class="flex-1 py-2 text-sm font-medium rounded-lg transition-colors"
          :class="canSave
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'"
        >
          {{ editingId ? '保存修改' : '确认添加' }}
        </button>
        <button
          @click="cancelForm"
          class="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
      </div>
    </template>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { IconX, IconArrowLeft, IconPencil, IconTrash, IconPlus, IconEye, IconEyeOff } from '@tabler/icons-vue'
import { useAiStore } from '@/stores/ai'
import type { AiProviderConfig, AiProviderType } from '@/types/ai'
import type { AiProviderKind } from '@/types/ai'
import {
  PROVIDER_PRESETS,
  type ProviderPreset,
} from '@/ai/providers/provider-presets'

defineEmits<{ close: [] }>()

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
  const cfgs = aiStore.settings.providerConfigs.filter(c => (c.kind ?? 'llm') === 'llm')
  const presets = cfgs.filter(c => !!c.presetId).sort((a, b) => a.label.localeCompare(b.label))
  const custom = cfgs.filter(c => !c.presetId).sort((a, b) => a.label.localeCompare(b.label))
  return [...presets, ...custom]
})

const sortedAgentConfigs = computed(() => {
  const cfgs = aiStore.settings.providerConfigs.filter(c => c.kind === 'agent')
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
interface EnvEntry { key: string; value: string }

interface FormState {
  kind: AiProviderKind
  type: AiProviderType
  label: string
  apiKey: string
  baseUrl: string
  modelsStr: string       // comma-separated model IDs
  acpCommand: string
  acpArgsStr: string      // space-separated args
  acpEnvEntries: EnvEntry[]
}

const form = ref<FormState>({
  kind: 'llm',
  type: 'openai-compat',
  label: '',
  apiKey: '',
  baseUrl: '',
  modelsStr: '',
  acpCommand: '',
  acpArgsStr: '',
  acpEnvEntries: [],
})

const canSave = computed(() => {
  if (!form.value.label.trim()) return false
  if (form.value.kind === 'agent' && !form.value.acpCommand.trim()) return false
  return true
})

const headerTitle = computed(() => {
  if (view.value === 'main') return 'AI Provider 配置'
  if (editingId.value) return `编辑 ${form.value.label || '…'}`
  return form.value.kind === 'agent' ? '新增自定义 Agent' : '新增自定义 Model'
})

// ── Actions ───────────────────────────────────────────────────────────────
function selectCustom(kind: AiProviderKind) {
  selectedPreset.value = null
  editingId.value = null
  form.value = {
    kind,
    type: kind === 'agent' ? 'acp' : 'openai-compat',
    label: '',
    apiKey: '',
    baseUrl: '',
    modelsStr: '',
    acpCommand: '',
    acpArgsStr: '',
    acpEnvEntries: [],
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
    kind: cfg.kind ?? 'llm',
    type: cfg.type,
    label: cfg.label,
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl ?? '',
    modelsStr: (cfg.models ?? []).join(', '),
    acpCommand: cfg.acpCommand ?? '',
    acpArgsStr: (cfg.acpArgs ?? []).join(' '),
    acpEnvEntries: Object.entries(cfg.acpEnv ?? {}).map(([key, value]) => ({ key, value })),
  }
  showKey.value = false
  view.value = 'configure'
}

function cancelForm() {
  view.value = 'main'
  editingId.value = null
  selectedPreset.value = null
}

function addEnvEntry() {
  form.value.acpEnvEntries.push({ key: '', value: '' })
}

function removeEnvEntry(i: number) {
  form.value.acpEnvEntries.splice(i, 1)
}

function submitForm() {
  if (!canSave.value) return

  const modelsArr = form.value.modelsStr
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const acpArgsArr = form.value.acpArgsStr
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  const acpEnvObj: Record<string, string> = {}
  for (const e of form.value.acpEnvEntries) {
    if (e.key.trim()) acpEnvObj[e.key.trim()] = e.value
  }

  const patch: Omit<AiProviderConfig, 'id' | 'enabled'> = {
    kind: form.value.kind,
    type: form.value.type,
    label: form.value.label.trim(),
    apiKey: form.value.apiKey,
    baseUrl: form.value.baseUrl || undefined,
    defaultModelId: modelsArr[0] ?? selectedPreset.value?.defaultModelId ?? '',
    presetId: selectedPreset.value?.id,
    models: modelsArr.length ? modelsArr : (selectedPreset.value?.models),
    agentModes: selectedPreset.value?.agentModes,
    acpCommand: form.value.acpCommand.trim() || selectedPreset.value?.acpCommand || undefined,
    acpArgs: acpArgsArr.length ? acpArgsArr : undefined,
    acpEnv: Object.keys(acpEnvObj).length ? acpEnvObj : undefined,
  }

  if (editingId.value) {
    aiStore.updateProviderConfig(editingId.value, patch)
  } else {
    aiStore.addProviderConfig({ id: `provider-${Date.now()}`, enabled: true, ...patch })
  }

  cancelForm()
}
</script>
