/**
 * Built-in provider presets.
 *
 * These define the defaults for well-known LLM APIs.
 * Users select a preset and only need to fill in required fields
 * (API key, etc.); all other values come from here.
 */

import type { AiProviderType } from '@/types/ai'

export interface ProviderPreset {
  id: string
  label: string
  type: AiProviderType
  description: string
  /** For openai-compat providers */
  baseUrl?: string
  defaultModelId: string
  /** Selectable model IDs shown in the model picker */
  models?: string[]
  requiresApiKey: boolean
  /** If true, user can/should customise baseUrl (e.g. Ollama) */
  editableBaseUrl?: boolean
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
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    type: 'openai-compat',
    description: '本地运行的开源模型',
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
    requiresApiKey: true,
    editableBaseUrl: true,
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    type: 'openai-compat',
    description: '深度求索 API',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModelId: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresApiKey: true,
    editableBaseUrl: true,
  },
  {
    id: 'glm',
    label: 'GLM (智谱)',
    type: 'openai-compat',
    description: '智谱 AI GLM 系列',
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
    label: 'OpenAI',
    type: 'openai-compat',
    description: 'OpenAI GPT / o 系列',
    baseUrl: 'https://api.openai.com/v1',
    defaultModelId: '',
    models: [
      'gpt-5.4-2026-03-05', 'gpt-5.4-pro-2026-03-05',
      'gpt-5-mini-2025-08-07', 'gpt-5-nano-2025-08-07', 'gpt-5-2025-08-07',
      'gpt-4.1-2025-04-14'
    ],
    requiresApiKey: true,
    editableBaseUrl: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    type: 'anthropic',
    description: 'Anthropic Claude 系列',
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
    label: 'Gemini API',
    type: 'gemini',
    description: 'Google Gemini API',
    defaultModelId: '',
    models: [
      'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite-preview',
      'gemini-3-flash-preview',
      'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'
    ],
    requiresApiKey: true,
  },
]
