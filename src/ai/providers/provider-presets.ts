/**
 * Built-in provider presets.
 *
 * These define the defaults for well-known LLM APIs.
 * Users select a preset and only need to fill in required fields
 * (API key, etc.); all other values come from here.
 */

import type { AiModelProfile, AiProviderType } from '@/ai/types'
import {
  DEFAULT_DEEPSEEK_MODEL_PROFILES,
  DEFAULT_OPENAI_MODEL_PROFILES,
} from '@/ai/model-profiles'
import { i18n } from '@/i18n'

export interface ProviderPreset {
  id: string
  label: string
  type: AiProviderType
  description: string
  /** For openai-compat / deepseek providers */
  baseUrl?: string
  defaultModelId: string
  /** Selectable model IDs shown in the model picker */
  models?: string[]
  modelProfiles?: Record<string, AiModelProfile>
  requiresApiKey: boolean
  /** If true, user can/should customise baseUrl (e.g. Ollama) */
  editableBaseUrl?: boolean
}

interface ProviderPresetTemplate extends Omit<ProviderPreset, 'label' | 'description'> {
  labelKey: string
  descriptionKey: string
  fallbackLabel: string
  fallbackDescription: string
}

/**
 * Note: Ollama model capabilities (text, image, think, tools) are not explicitly listed here;
 * instead, the UI infers capabilities based on model name patterns.
 * qwen3.5:0.8b                 text  image	think	tools
 * qwen3.5:2b                   text	image	think	tools
 * qwen3.5:4b                   text	image	think	tools
 * qwen3.5:9b                   text	image	think	tools
 * qwen3.5:27b		              text	image	think	tools
 * qwen3.5:35b		              text	image	think	tools
 * qwen3.5:122b		              text	image	think	tools
 * qwen3.5:397b-cloud		        text	image	think	tools
 * glm-5:cloud		              text    		think	tools
 * minimax-m2.5:cloud		        text		    think	tools
 * qwen3-coder-next:latest      code        			tools
 * qwen3-coder-next:cloud		    code        			tools
 * glm-ocr:latest		            text	image		    tools
 * kimi-k2.5:cloud		          text	image	think	tools
 * glm-4.7-flash:latest		      text    		think	tools
 * translategemma:4b		        text  image
 * translategemma:12b		        text	image
 * translategemma:27b		        text	image
 * glm-4.7:cloud		            code    		think	tools
 * gemini-3-flash-preview:cloud text	image	think	tools
 * nemotron-3-nano:latest		    text    		think	tools
 * nemotron-3-nano:30b-cloud		text		    think	tools
 * deepseek-ocr:3b		          text	image
 * gpt-oss:20b		              text	    	think	tools
 * gpt-oss:120b-cloud		        text    		think	tools
 * gemma3:1b		                text
 * gemma3:4b		                text	image
 * gemma3:12b		                text	image
 * gemma3:27b		                text	image
 * deepseek-r1:8b		            text		    think	tools
 * deepseek-r1:14b		          text		    think	tools
 * deepseek-r1:32b		          text		    think	tools
 * deepseek-r1:70b		          text	    	think	tools
 * deepseek-v3.2:cloud		      text	image	think	tools
 * mistral:7b		                text        			tools
 * llama3.2:1b		              text        			tools
 * llama3.2:3b		              text        			tools
 * llama3.1:8b		              text        			tools
 * llama3.1:70b		              text        			tools
 */
const PROVIDER_PRESET_TEMPLATES: ProviderPresetTemplate[] = [
  {
    id: 'ollama',
    labelKey: 'preferences.ai.providerPresets.ollama.label',
    fallbackLabel: 'Ollama',
    type: 'openai-compat',
    descriptionKey: 'preferences.ai.providerPresets.ollama.description',
    fallbackDescription: 'Open-source models running locally',
    baseUrl: 'http://localhost:11434/v1',
    defaultModelId: '',
    models: [
      'qwen3.5:0.8b', 'qwen3.5:2b', 'qwen3.5:4b', 'qwen3.5:9b', 'qwen3.5:27b', 'qwen3.5:35b', 'qwen3.5:122b', 'qwen3.5:397b-cloud',
      'glm-5:cloud',
      'minimax-m2.5:cloud',
      'qwen3-coder-next:latest', 'qwen3-coder-next:cloud',
      'glm-ocr:latest',
      'kimi-k2.5:cloud',
      'glm-4.7-flash:latest',
      'translategemma:4b', 'translategemma:12b', 'translategemma:27b',
      'glm-4.7:cloud',
      'gemini-3-flash-preview:cloud',
      'nemotron-3-nano:latest', 'nemotron-3-nano:30b-cloud',
      'deepseek-ocr:3b',
      'gpt-oss:20b', 'gpt-oss:120b-cloud',
      'gemma3:1b', 'gemma3:4b', 'gemma3:12b', 'gemma3:27b',
      'deepseek-r1:8b', 'deepseek-r1:14b', 'deepseek-r1:32b', 'deepseek-r1:70b',
      'deepseek-v3.2:cloud',
      'mistral:7b',
      'llama3.2:1b', 'llama3.2:3b',
      'llama3.1:8b', 'llama3.1:70b',
    ],
    requiresApiKey: false,
    editableBaseUrl: true,
  },
  {
    id: 'deepseek',
    labelKey: 'preferences.ai.providerPresets.deepseek.label',
    fallbackLabel: 'DeepSeek',
    type: 'deepseek',
    descriptionKey: 'preferences.ai.providerPresets.deepseek.description',
    fallbackDescription: 'DeepSeek API',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModelId: 'deepseek-v4-pro',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
    modelProfiles: DEFAULT_DEEPSEEK_MODEL_PROFILES,
    requiresApiKey: true,
    editableBaseUrl: true,
  },
  {
    id: 'glm',
    labelKey: 'preferences.ai.providerPresets.glm.label',
    fallbackLabel: 'GLM',
    type: 'openai-compat',
    descriptionKey: 'preferences.ai.providerPresets.glm.description',
    fallbackDescription: 'Zhipu AI GLM series',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModelId: '',
    models: [
      'glm-5',
      'glm-4.7',
      'glm-4.6', 'glm-4.6v'
    ],
    requiresApiKey: true,
    editableBaseUrl: true,
  },
  {
    id: 'openai',
    labelKey: 'preferences.ai.providerPresets.openai.label',
    fallbackLabel: 'OpenAI',
    type: 'openai-compat',
    descriptionKey: 'preferences.ai.providerPresets.openai.description',
    fallbackDescription: 'OpenAI GPT / o series',
    baseUrl: 'https://api.openai.com/v1',
    defaultModelId: '',
    models: [
      'gpt-5.4-2026-03-05', 'gpt-5.4-pro-2026-03-05',
      'gpt-5-mini-2025-08-07', 'gpt-5-nano-2025-08-07', 'gpt-5-2025-08-07',
      'gpt-4.1-2025-04-14'
    ],
    modelProfiles: DEFAULT_OPENAI_MODEL_PROFILES,
    requiresApiKey: true,
    editableBaseUrl: true,
  },
  {
    id: 'anthropic',
    labelKey: 'preferences.ai.providerPresets.anthropic.label',
    fallbackLabel: 'Anthropic',
    type: 'anthropic',
    descriptionKey: 'preferences.ai.providerPresets.anthropic.description',
    fallbackDescription: 'Anthropic Claude series',
    defaultModelId: '',
    models: [
      'claude-opus-4-6', 'claude-opus-4-5',
      'claude-sonnet-4-6', 'claude-sonnet-4-5',
      'claude-haiku-4-5'
    ],
    requiresApiKey: true,
  },
  {
    id: 'gemini',
    labelKey: 'preferences.ai.providerPresets.gemini.label',
    fallbackLabel: 'Gemini',
    type: 'gemini',
    descriptionKey: 'preferences.ai.providerPresets.gemini.description',
    fallbackDescription: 'Google Gemini series',
    defaultModelId: '',
    models: [
      'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'
    ],
    requiresApiKey: true,
  },
]

function translatePresetText(key: string, fallback: string): string {
  if (i18n.global.te(key)) return i18n.global.t(key) as string
  return fallback
}

export function getProviderPresets(): ProviderPreset[] {
  return PROVIDER_PRESET_TEMPLATES.map(preset => ({
    ...preset,
    label: translatePresetText(preset.labelKey, preset.fallbackLabel),
    description: translatePresetText(preset.descriptionKey, preset.fallbackDescription),
  }))
}

export function getProviderPresetById(id: string | null | undefined): ProviderPreset | undefined {
  if (!id) return undefined
  return getProviderPresets().find(preset => preset.id === id)
}
