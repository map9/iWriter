// AI module entry point — registers all built-in providers
import { providerRegistry } from './model/providers/ProviderRegistry'
import { OpenAICompatProvider } from './model/providers/OpenAICompatProvider'
import { AnthropicProvider } from './model/providers/AnthropicProvider'
import { GeminiProvider } from './model/providers/GeminiProvider'

// Register built-in providers (OpenAI-compat first as it's the most widely used)
providerRegistry.register(new OpenAICompatProvider())
providerRegistry.register(new AnthropicProvider())
providerRegistry.register(new GeminiProvider())

// ACP sessions are handled by AcpAgentSession via ProviderRegistry.createSession()

export { providerRegistry } from './model/providers/ProviderRegistry'
export type { AgentSession, AgentChunk, LMMessage, LMTool } from './model/providers/types'
export { buildEditorStateBlock } from './thread/ContextBuilder'
export {
  createThread,
  createMessage,
  appendMessage,
  resolveToolCalls,
} from './thread/Thread'
