import * as fs from 'fs'
import * as path from 'path'
import type { SubAgent } from 'deepagents'
import type { FilesystemPermission } from 'deepagents'
import type { InterruptOnConfig } from 'langchain'
import type { ToolRegistry } from '../../tools/ToolRegistry'
import type { DetectedInputLanguage } from '../../../../src/ai/message/detectInputLanguage'
import { buildOutputLanguagePrompt } from '../../../../src/ai/message/detectInputLanguage'

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
 *   - tools         JSON array of tool names → resolved via ToolRegistry (fail-fast on unknown)
 *   - skills        JSON array of skill source keys (e.g. "creative/prose") → absolute paths;
 *                   the project-level `{workspace}/.iwriter/skills` dir is always appended末位
 *   - permissions   optional JSON array of FilesystemPermission (full replacement, e.g. read-only)
 *   - interruptOn   optional JSON map of tool→InterruptOnConfig (omitted → inherits framework default)
 * The Markdown body becomes the systemPrompt (identity / IO contract / red lines only).
 *
 * Assembly rule: a definition under the domain directory with the same `name` as one under
 * `common/` REPLACES it entirely (domain覆盖 common). SA04 Researcher lives in `common/` and
 * is shared by every domain unchanged.
 *
 * Model note: per-subagent model instantiation needs provider config not available here. In
 * M0 no definition sets `model`, so it is inert; a `resolveModel` hook is accepted for future
 * wiring. If `model` is set without a resolver, the field is dropped with a warning and the
 * subagent inherits the main model.
 */

export interface SubagentFrontmatter {
  name: string
  description: string
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
  language: DetectedInputLanguage
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
      systemPrompt: `${buildOutputLanguagePrompt(options.language)}\n\n${body}`,
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
