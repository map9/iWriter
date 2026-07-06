import * as fs from 'fs'
import * as path from 'path'
import { createMiddleware } from 'langchain'
import { SystemMessage } from '@langchain/core/messages'
import { resolveBackend, adaptBackendProtocol } from 'deepagents'

/**
 * 用户级（作者级）协作记忆源装配（脚手架层，各 domain 共用）。
 *
 * 设计依据《04.1 脚手架 详细设计》§4：
 * - 记忆只有用户级一层，按 domain 隔离，位于 `~/.iwriter/ai/memory/{domainDir}/memory.md`；
 * - **本期只读**：不提供任何 agent 写入记忆的路径，且必须覆盖 deepagents 默认
 *   "鼓励自动更新记忆" 的提示为 "记忆只读"，避免 agent 反复尝试写入浪费轮次
 *   （写入本身也会被审批策略层 "工作区外自动拒绝" 兜底封死）。
 */

/** 装配某 domain 的记忆源路径（不存在的文件跳过）。 */
export function buildMemorySources(aiRootPath: string, domainDir: string): string[] {
  return [path.join(aiRootPath, 'memory', domainDir, 'memory.md')].filter(fs.existsSync)
}

/**
 * 只读记忆提示：明确记忆是跨项目的协作规则、非剧情事实源，且 agent 不得写入/更新它。
 * 覆盖 deepagents 内置 MEMORY_SYSTEM_PROMPT（后者鼓励用 edit_file 自动沉淀记忆）。
 */
const READONLY_MEMORY_PROMPT = `<agent_memory>
{memory_contents}
</agent_memory>

<memory_guidelines>
  The above <agent_memory> was loaded from the author's user-level collaboration
  memory. Treat it as follows:

  - It records **collaboration rules / preferences** that apply across all projects.
    It is NOT a source of story facts — the workspace objects (project.md,
    worldbuilding, characters, outline, manuscript, ...) are the authoritative
    source for anything about the work itself.
  - **This memory is READ-ONLY for you.** Do NOT write, update, append to, or
    otherwise modify any memory file, and do NOT plan any step that does so.
    Memory is maintained by the author by hand.
  - The user's explicit instructions in the current conversation take precedence
    over memory; authoritative workspace objects take precedence over memory.
  - Simply read and follow the collaboration rules above where they apply.
</memory_guidelines>`

function formatMemoryContents(contents: Record<string, string>, sources: string[]): string {
  const sections: string[] = []
  for (const p of sources) if (contents[p]) sections.push(`${p}\n${contents[p]}`)
  return sections.length === 0 ? '(No memory loaded)' : sections.join('\n\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBackend = any

async function loadMemoryFromBackend(backend: AnyBackend, filePath: string): Promise<string | null> {
  const adapted = adaptBackendProtocol(backend)
  if (!adapted.downloadFiles) {
    const res = await adapted.read(filePath)
    if (res.error) return null
    if (typeof res.content !== 'string') return null
    return res.content
  }
  const results = await adapted.downloadFiles([filePath])
  const response = results[0]
  if (results.length !== 1 || !response) return null
  if (response.error != null) return null
  if (response.content != null) return new TextDecoder().decode(response.content)
  return null
}

/**
 * 只读记忆中间件：加载配置的记忆源并注入 READONLY_MEMORY_PROMPT。
 * 语义与 deepagents `createMemoryMiddleware` 一致（同一 backend 读取、追加到 system message），
 * 唯一区别是提示词改为只读、不鼓励写入。内容按会话内首次调用懒加载并缓存。
 */
export function createReadonlyMemoryMiddleware(opts: {
  backend: AnyBackend
  sources: string[]
  addCacheControl?: boolean
}) {
  const { backend, sources, addCacheControl = false } = opts
  let cache: Record<string, string> | null = null
  let loading: Promise<Record<string, string>> | null = null

  const load = async (state: unknown): Promise<Record<string, string>> => {
    if (cache) return cache
    if (loading) return loading
    loading = (async () => {
      const contents: Record<string, string> = {}
      const resolved = await resolveBackend(backend, { state })
      for (const p of sources) {
        try {
          const content = await loadMemoryFromBackend(resolved, p)
          if (content) contents[p] = content
        } catch {
          // 记忆缺失/读取失败不阻断会话
        }
      }
      cache = contents
      return contents
    })()
    return loading
  }

  return createMiddleware({
    name: 'ReadonlyMemoryMiddleware',
    wrapModelCall: async (request, handler) => {
      const contents = await load(request.state)
      const formatted = formatMemoryContents(contents, sources)
      const memorySection = READONLY_MEMORY_PROMPT.replace('{memory_contents}', formatted)
      const existing = request.systemMessage.content
      const existingParts = typeof existing === 'string'
        ? [{ type: 'text', text: existing }]
        : Array.isArray(existing) ? existing : []
      const newSystemMessage = new SystemMessage({
        content: [
          ...existingParts,
          {
            type: 'text',
            text: memorySection,
            ...(addCacheControl && { cache_control: { type: 'ephemeral' } }),
          },
        ],
      })
      return handler({ ...request, systemMessage: newSystemMessage })
    },
  })
}
