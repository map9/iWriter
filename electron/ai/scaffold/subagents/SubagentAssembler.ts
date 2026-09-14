import * as fs from 'fs'
import * as path from 'path'
import type { SubAgent } from 'deepagents'
import type { FilesystemPermission } from 'deepagents'
import type { InterruptOnConfig } from 'langchain'
import type { ToolRegistry } from '../../tools/ToolRegistry'

/**
 * SubagentAssembler (04.1 §2 / 03 §2.10, plan A1) — the declarative装配 mechanism that
 * replaces hardcoded `subAgents/*.ts`. It scans `~/.iwriter/ai/subagents/{common,<domain>}/`
 * for `<name>/agent.md` definition files and assembles them into `SubAgent[]`.
 *
 * A definition file is YAML-ish frontmatter + Markdown body:
 *   - name          task-delegation identifier (no ID prefix)
 *   - description   routing signal shown to the delegating agent
 *   - model         optional model id override (see note below)
 *   - model-params  optional param overrides (parsed; applied via resolveModel if provided)
 *   - capability    optional host-enforced capability profile. `research-readonly` restricts
 *                   both registered tools and filesystem writes at assembly time.
 *   - tools         JSON array of tool names → resolved via ToolRegistry (fail-fast on unknown).
 *                   It replaces the registered-tool list deepagents would hand the subagent.
 *                   Built-in filesystem tools still come from middleware, so capability profiles
 *                   must pair this whitelist with `permissions` to form a complete fence.
 *   - skills        JSON array of skill source keys (e.g. "creative/prose") → absolute paths;
 *                   the project-level `{workspace}/.iwriter/skills` dir is always appended末位
 *   - permissions   optional JSON array of FilesystemPermission (full replacement, e.g. read-only)
 *   - interruptOn   optional JSON map of tool→InterruptOnConfig (omitted → inherits framework default)
 * The Markdown body becomes the systemPrompt (identity / IO contract / red lines only).
 *
 * Assembly rule: a definition under the domain directory with the same `name` as one under
 * `common/` REPLACES it entirely (domain覆盖 common).
 *
 * Model note: per-subagent model instantiation needs provider config not available here. In
 * M0 no definition sets `model`, so it is inert; a `resolveModel` hook is accepted for future
 * wiring. If `model` is set without a resolver, the field is dropped with a warning and the
 * subagent inherits the main model.
 */

export interface SubagentFrontmatter {
  name: string
  description: string
  capability?: string
  model?: string
  modelParams?: Record<string, unknown>
  tools?: string[]
  skills?: string[]
  permissions?: FilesystemPermission[]
  interruptOn?: Record<string, boolean | InterruptOnConfig>
}

export interface AssembleOptions {
  subagentsRoot: string
  skillsRoot: string
  workspacePath: string | null
  domain: string
  registry: ToolRegistry
  /** Optional per-subagent model resolver (deferred; not wired in M0). */
  resolveModel?: (modelId: string, modelParams?: Record<string, unknown>) => SubAgent['model'] | undefined
}

/** Parse the frontmatter block of an agent.md file. Values are plain scalars or inline JSON. */
export function parseSubagentDefinition(raw: string): { frontmatter: SubagentFrontmatter; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized)
  if (!match) {
    throw new Error('[SubagentAssembler] agent.md is missing a frontmatter block')
  }
  const frontmatterBlock = match[1] ?? ''
  const body = match[2] ?? ''
  const fm: Record<string, unknown> = {}
  for (const line of frontmatterBlock.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const sep = line.indexOf(':')
    if (sep < 0) continue
    const key = line.slice(0, sep).trim()
    const rawValue = line.slice(sep + 1).trim()
    fm[key] = parseFrontmatterValue(rawValue)
  }

  const name = typeof fm.name === 'string' ? fm.name.trim() : ''
  const description = typeof fm.description === 'string' ? fm.description.trim() : ''
  if (!name) throw new Error('[SubagentAssembler] agent.md frontmatter missing `name`')
  if (!description) throw new Error(`[SubagentAssembler] agent.md frontmatter for "${name}" missing \`description\``)

  const frontmatter: SubagentFrontmatter = {
    name,
    description,
    ...(typeof fm.capability === 'string' && fm.capability.trim()
      ? { capability: fm.capability.trim() }
      : {}),
    ...(typeof fm.model === 'string' && fm.model.trim() ? { model: fm.model.trim() } : {}),
    ...(isRecord(fm['model-params']) ? { modelParams: fm['model-params'] as Record<string, unknown> } : {}),
    ...(isStringArray(fm.tools) ? { tools: fm.tools } : {}),
    ...(isStringArray(fm.skills) ? { skills: fm.skills } : {}),
    ...(Array.isArray(fm.permissions) ? { permissions: fm.permissions as FilesystemPermission[] } : {}),
    ...(isRecord(fm.interruptOn) ? { interruptOn: fm.interruptOn as Record<string, boolean | InterruptOnConfig> } : {}),
  }
  return { frontmatter, body: body.trim() }
}

function parseFrontmatterValue(raw: string): unknown {
  if (!raw) return ''
  const first = raw[0]
  if (first === '[' || first === '{' || first === '"') {
    try {
      return JSON.parse(raw)
    } catch {
      // fall through to scalar handling
    }
  }
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  // strip surrounding single quotes if present
  if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    return raw.slice(1, -1)
  }
  return raw
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

const RESEARCH_READONLY_CAPABILITY = 'research-readonly'

// Fail closed: adding a new registered tool does not silently grant it to research workers.
const RESEARCH_READONLY_TOOL_NAMES = new Set([
  'get_editor_state',
  'get_document_outline',
  'get_section',
  'get_sections',
  'get_blocks',
  'get_block_context',
  'search_blocks_in_document',
  'search_sections_in_document',
  'search_in_directory',
  'get_pdf_outline',
  'get_pdf_pages',
  'fetch_url',
  'web_search',
  'find_references',
])

function validateResearchReadonlyProfile(frontmatter: SubagentFrontmatter, file: string): void {
  if (frontmatter.name === 'general-purpose' && frontmatter.capability !== RESEARCH_READONLY_CAPABILITY) {
    throw new Error(
      `[SubagentAssembler] general-purpose must declare capability: ${RESEARCH_READONLY_CAPABILITY} ` +
      `(in ${file})`,
    )
  }
  if (frontmatter.capability !== RESEARCH_READONLY_CAPABILITY) return

  if (!frontmatter.tools?.length) {
    throw new Error(
      `[SubagentAssembler] ${RESEARCH_READONLY_CAPABILITY} requires an explicit tool whitelist ` +
      `(in ${file})`,
    )
  }
  const disallowedTool = frontmatter.tools.find(name => !RESEARCH_READONLY_TOOL_NAMES.has(name))
  if (disallowedTool) {
    throw new Error(
      `[SubagentAssembler] ${RESEARCH_READONLY_CAPABILITY} disallows tool "${disallowedTool}" ` +
      `(in ${file})`,
    )
  }

  // DeepAgents permissions are first-match-wins with a permissive default. Requiring this exact
  // write rule pair guarantees that middleware filesystem writes can only target result storage.
  const writeRules = (frontmatter.permissions ?? [])
    .filter(rule => rule.operations.includes('write'))
  const hasCanonicalWriteFence = writeRules.length === 2
    && writeRules[0]?.mode === 'allow'
    && writeRules[0].paths.length === 1
    && writeRules[0].paths[0] === '/large_tool_results/**'
    && writeRules[1]?.mode === 'deny'
    && writeRules[1].paths.length === 1
    && writeRules[1].paths[0] === '/**'
  if (!hasCanonicalWriteFence) {
    throw new Error(
      `[SubagentAssembler] ${RESEARCH_READONLY_CAPABILITY} filesystem write permissions must ` +
      `allow only /large_tool_results/** and then deny /** (in ${file})`,
    )
  }
}

/** Resolve skill source keys (e.g. "creative/prose") to absolute dirs, appending项目末位. */
function resolveSkillSources(keys: string[] | undefined, skillsRoot: string, workspacePath: string | null): string[] {
  const sources = (keys ?? []).map(key => path.join(skillsRoot, ...key.split('/')))
  if (workspacePath) {
    const projectSkills = path.join(workspacePath, '.iwriter', 'skills')
    // last-wins末位: only include when present so the skills middleware never sees a missing dir.
    if (fs.existsSync(projectSkills)) sources.push(projectSkills)
  }
  return sources
}

function readDefinitionsFromDir(dir: string): Array<{ file: string; raw: string }> {
  if (!fs.existsSync(dir)) return []
  const results: Array<{ file: string; raw: string }> = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const agentFile = path.join(dir, entry.name, 'agent.md')
    if (!fs.existsSync(agentFile)) continue
    results.push({ file: agentFile, raw: fs.readFileSync(agentFile, 'utf-8') })
  }
  return results
}

export function assembleSubagents(options: AssembleOptions): SubAgent[] {
  const commonDir = path.join(options.subagentsRoot, 'common')
  const domainDir = path.join(options.subagentsRoot, options.domain)

  // domain覆盖 common by name (complete replacement).
  const byName = new Map<string, SubAgent>()
  const build = (entry: { file: string; raw: string }) => {
    let parsed
    try {
      parsed = parseSubagentDefinition(entry.raw)
    } catch (err) {
      throw new Error(`${(err as Error).message} (in ${entry.file})`)
    }
    const { frontmatter, body } = parsed
    validateResearchReadonlyProfile(frontmatter, entry.file)
    if (frontmatter.model && !options.resolveModel) {
      console.warn(
        `[SubagentAssembler] subagent "${frontmatter.name}" declares model "${frontmatter.model}" ` +
        `but no model resolver is wired; inheriting the main model.`,
      )
    }
    const resolvedModel = frontmatter.model && options.resolveModel
      ? options.resolveModel(frontmatter.model, frontmatter.modelParams)
      : undefined

    const subAgent: SubAgent = {
      name: frontmatter.name,
      description: frontmatter.description,
      systemPrompt: body,
      // Subagent trace identity comes for free from deepagents' `createAgent({ name })`: the subagent
      // subtree root run is named after `name` and every run carries `metadata.lc_agent_name`, so the
      // whole invocation is filterable/exportable in LangSmith without custom middleware.
      ...(frontmatter.tools
        ? { tools: options.registry.select(frontmatter.tools, `subagent "${frontmatter.name}"`) }
        : {}),
      ...(resolvedModel ? { model: resolvedModel } : {}),
      ...(frontmatter.skills
        ? { skills: resolveSkillSources(frontmatter.skills, options.skillsRoot, options.workspacePath) }
        : {}),
      ...(frontmatter.permissions ? { permissions: frontmatter.permissions } : {}),
      ...(frontmatter.interruptOn ? { interruptOn: frontmatter.interruptOn } : {}),
    }
    byName.set(frontmatter.name, subAgent)
  }

  for (const entry of readDefinitionsFromDir(commonDir)) build(entry)
  for (const entry of readDefinitionsFromDir(domainDir)) build(entry)

  return [...byName.values()]
}
