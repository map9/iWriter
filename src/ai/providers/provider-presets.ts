/**
 * Built-in provider presets.
 *
 * These define the defaults for well-known LLM APIs and ACP agents.
 * Users select a preset and only need to fill in required fields
 * (API key, etc.); all other values come from here.
 *
 * ACP agent launch convention:
 *  - acpCommand: the binary to invoke (e.g. 'claude', 'npx', 'gh')
 *  - acpArgs: arguments forwarded to that binary
 *  - Many agents expose an --acp flag to enter protocol mode;
 *    npm-distributed agents are invoked via npx.
 */

import type { AiProviderType } from '@/types/ai'

export type AiProviderKind = 'llm' | 'agent'

export interface ProviderPreset {
  id: string
  label: string
  kind: AiProviderKind
  type: AiProviderType
  description: string
  /** For openai-compat providers */
  baseUrl?: string
  defaultModelId: string
  /** Selectable model IDs shown in the model picker */
  models?: string[]
  /** For agent providers: available modes (e.g. Plan / Agent / AutoPilot) */
  agentModes?: string[]
  requiresApiKey: boolean
  /** If true, user can/should customise baseUrl (e.g. Ollama) */
  editableBaseUrl?: boolean
  /** ACP command to spawn (binary name or 'npx') */
  acpCommand?: string
  /** Arguments passed to acpCommand */
  acpArgs?: string[]
  acpEnv?: Record<string, string>
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
  // ── LLM Providers ─────────────────────────────────────────────────────────

  {
    id: 'ollama',
    label: 'Ollama',
    kind: 'llm',
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
    kind: 'llm',
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
    kind: 'llm',
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
    kind: 'llm',
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
    kind: 'llm',
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
    kind: 'llm',
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

  // ── ACP Agent Providers ────────────────────────────────────────────────────
  //
  // Agents are invoked as child processes over JSON-RPC 2.0 stdin/stdout (ACP).
  // acpCommand + acpArgs must produce a process that speaks the ACP protocol.
  //
  // 在 agent 中，models 通过 session/new 获取 jsonrpc 中的 models 字段，动态填充
  //             agentModes 通过 session/new 获取 jsonrpc 中的 modes 字段，动态填充
  // Common patterns:
  //   • npm package via npx:       acpCommand='npx', acpArgs=['@pkg/name@latest', '--acp']

  {
    id: 'claude-code',
    label: 'Claude Code',
    kind: 'agent',
    type: 'acp',
    description: 'Anthropic Claude Code CLI',
    acpCommand: 'npx',
    acpArgs: ['@zed-industries/claude-code-acp@latest'],
    defaultModelId: '',
    models: [],
    agentModes: [],
    acpEnv: {
      "ANTHROPIC_API_KEY": "sk-ant-..."
    },
    requiresApiKey: false,
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI',
    kind: 'agent',
    type: 'acp',
    description: 'Google Gemini CLI',
    acpCommand: 'npx',
    acpArgs: ["@google/gemini-cli@latest", "--experimental-acp"],
    defaultModelId: '',
    models: [],
    agentModes: [],
    requiresApiKey: false,
  },
  {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    kind: 'agent',
    type: 'acp',
    description: 'GitHub Copilot ACP agent (via npx)',
    acpCommand: 'npx',
    acpArgs: ["@github/copilot-language-server@latest", "--acp"],
    defaultModelId: '',
    models: [],
    agentModes: [],
    requiresApiKey: false,
  },
  {
    id: 'qwen-code',
    label: 'Qwen Code',
    kind: 'agent',
    type: 'acp',
    description: '阿里云 Qwen Code CLI',
    acpCommand: 'npx',
    acpArgs: ["@qwen-code/qwen-code@latest", "--acp", "--experimental-skills"],
    defaultModelId: '',
    models: [],
    agentModes: [],
    requiresApiKey: false,
  },
  {
    id: 'auggie-cli',
    label: 'Auggie CLI',
    kind: 'agent',
    type: 'acp',
    description: 'Augment Code CLI',
    acpCommand: 'npx',
    acpArgs: ["@augmentcode/auggie@latest", "--acp"],
    defaultModelId: 'augment',
    models: [],
    agentModes: [],
    acpEnv: { "AUGMENT_DISABLE_AUTO_UPDATE": "1" },
    requiresApiKey: false,
  },
  {
    id: 'qoder-cli',
    label: 'Qoder CLI',
    kind: 'agent',
    type: 'acp',
    description: 'Qoder AI CLI',
    acpCommand: 'npx',
    acpArgs: ["@qoder-ai/qodercli@latest", "--acp"],
    defaultModelId: '',
    agentModes: [],
    requiresApiKey: false,
  },
  {
    id: 'codex-cli',
    label: 'Codex CLI',
    kind: 'agent',
    type: 'acp',
    description: 'OpenAI Codex CLI',
    acpCommand: 'npx',
    acpArgs: ["@zed-industries/codex-acp@latest"],
    defaultModelId: '',
    models: [],
    agentModes: [],
    requiresApiKey: true,
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    kind: 'agent',
    type: 'acp',
    description: 'OpenCode CLI',
    acpCommand: 'npx',
    acpArgs: ["opencode-ai@latest", "acp"],
    defaultModelId: '',
    models: [],
    agentModes: [],
    requiresApiKey: false,
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    kind: 'agent',
    type: 'acp',
    description: 'OpenClaw CLI',
    acpCommand: 'npx',
    acpArgs: ["openclaw", "acp"],
    defaultModelId: '',
    models: [],
    agentModes: [],
    requiresApiKey: false,
  },
]

export const LLM_PRESETS = PROVIDER_PRESETS.filter(p => p.kind === 'llm')
export const AGENT_PRESETS = PROVIDER_PRESETS.filter(p => p.kind === 'agent')
