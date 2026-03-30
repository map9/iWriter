// AI module entry point — registers all built-in providers
import { providerRegistry } from './providers/ProviderRegistry'
import { OpenAICompatProvider } from './providers/OpenAICompatProvider'
import { AnthropicProvider } from './providers/AnthropicProvider'
import { GeminiProvider } from './providers/GeminiProvider'

// Register built-in providers (OpenAI-compat first as it's the most widely used)
providerRegistry.register(new OpenAICompatProvider())
providerRegistry.register(new AnthropicProvider())
providerRegistry.register(new GeminiProvider())

// ACP sessions are handled by AcpAgentSession via ProviderRegistry.createSession()

export { providerRegistry } from './providers/ProviderRegistry'
export type { AgentSession, AgentChunk, LMMessage, LMTool } from './providers/types'
export { buildEditorStateBlock } from './thread/ContextBuilder'
export {
  createThread,
  createMessage,
  appendMessage,
  resolveToolCalls,
} from './thread/Thread'
