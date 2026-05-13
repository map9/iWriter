import * as fs from 'fs'
import * as path from 'path'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { getRuntimeString } from './runtimeHelpers'

interface CharacterPsychology {
  core_desire?: string
  core_fear?: string
  false_belief?: string
  current_state?: string
}

interface MissingFields {
  name: string
  presentFields: string[]
  missingFields: string[]
}

function getWorkspacePath(runtime: unknown, fallbackWorkspacePath?: string | null): string | null {
  return getRuntimeString(runtime, 'workspace_path')?.trim() || fallbackWorkspacePath || null
}

function normalizeHeading(value: string): string {
  return value.trim().toLowerCase()
}

function stripDecorations(value: string): string {
  return value.replace(/[（(].*?[）)]/g, '').trim()
}

function findSection(content: string, level: number, names: string[]): string {
  const marker = '#'.repeat(level)
  const headingPattern = new RegExp(`^${marker}\\s+(.+?)\\s*$`, 'gmi')
  const matches = [...content.matchAll(headingPattern)]
  const normalizedNames = new Set(names.map(normalizeHeading))

  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]
    const title = normalizeHeading(match[1] ?? '')
    if (!normalizedNames.has(title)) continue
    const start = (match.index ?? 0) + match[0].length
    const end = matches[i + 1]?.index ?? content.length
    return content.slice(start, end)
  }

  return ''
}

function splitCharacterSections(charactersSection: string): Array<{ heading: string; body: string }> {
  const matches = [...charactersSection.matchAll(/^###\s+(.+?)\s*$/gmi)]
  if (!matches.length) return []
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? charactersSection.length
    return {
      heading: match[1]?.trim() ?? '',
      body: charactersSection.slice(start, end).trim(),
    }
  })
}

function pickCharacterSection(
  sections: Array<{ heading: string; body: string }>,
  name: string,
): { heading: string; body: string } | undefined {
  const target = normalizeHeading(name)
  const exact = sections.find(section => normalizeHeading(stripDecorations(section.heading)) === target)
    ?? sections.find(section => normalizeHeading(section.heading) === target)
  if (exact) return exact

  return sections.find(section => {
    const heading = normalizeHeading(stripDecorations(section.heading))
    return heading.includes(target) || target.includes(heading)
  })
}

function extractField(body: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const colonPattern = new RegExp(`${escaped}\\s*[:：]\\s*([^\\n]+)`, 'i')
    const colonMatch = colonPattern.exec(body)
    if (colonMatch?.[1]?.trim()) return colonMatch[1].trim()

    const bulletPattern = new RegExp(`^[\\s*>-]*${escaped}\\s*[:：]\\s*([^\\n]+)`, 'gmi')
    const bulletMatch = bulletPattern.exec(body)
    if (bulletMatch?.[1]?.trim()) return bulletMatch[1].trim()
  }
  return undefined
}

function extractPsychology(body: string): CharacterPsychology {
  return {
    core_desire: extractField(body, ['核心欲望', 'core desire', 'core_desire']),
    core_fear: extractField(body, ['核心恐惧', 'core fear', 'core_fear']),
    false_belief: extractField(body, ['虚假信念', 'false belief', 'false_belief']),
    current_state: extractField(body, ['当前状态', 'current state', 'current_state']),
  }
}

function missingPsychologyFields(name: string, psychology: CharacterPsychology): MissingFields | null {
  const presentFields: string[] = []
  const missingFields: string[] = []
  const fields = [
    ['core_desire', psychology.core_desire],
    ['core_fear', psychology.core_fear],
    ['false_belief', psychology.false_belief],
  ] as const

  for (const [field, value] of fields) {
    if (value?.trim()) presentFields.push(field)
    else missingFields.push(field)
  }

  return missingFields.length ? { name, presentFields, missingFields } : null
}

export function buildCreativeLogicTools(options: {
  workspacePath?: string | null
}) {
  const resolveWorkspace = (runtime: unknown): string | null => {
    const workspacePath = getWorkspacePath(runtime, options.workspacePath)
    return workspacePath ? path.resolve(workspacePath) : null
  }

  const getCharacterPsychology = tool(
    async ({ names }: { names: string[] }, runtime) => {
      const workspacePath = resolveWorkspace(runtime)
      if (!workspacePath) return 'Error: Creative mode requires an open workspace folder.'
      const storyBiblePath = path.join(workspacePath, 'storybible.md')
      const content = fs.existsSync(storyBiblePath) ? fs.readFileSync(storyBiblePath, 'utf-8') : ''
      const charactersSection = findSection(content, 2, ['Characters', '角色'])
      const sections = splitCharacterSections(charactersSection)
      const characters: Record<string, CharacterPsychology> = {}
      const missing: string[] = []
      const missingFields: MissingFields[] = []

      for (const rawName of names) {
        const name = rawName.trim()
        if (!name) continue
        const section = pickCharacterSection(sections, name)
        if (!section) {
          missing.push(name)
          continue
        }
        const psychology = extractPsychology(section.body)
        characters[name] = psychology
        const fieldGap = missingPsychologyFields(name, psychology)
        if (fieldGap) missingFields.push(fieldGap)
      }

      return JSON.stringify({
        characters,
        missing,
        missing_fields: missingFields,
      }, null, 2)
    },
    {
      name: 'get_character_psychology',
      description: 'Read StoryBible character psychology triangles for named characters. Returns found psychology, missing character entries, and incomplete psychology fields.',
      schema: z.object({
        names: z.array(z.string()).describe('Character names to look up in StoryBible.'),
      }),
    }
  )

  return [getCharacterPsychology] as const
}
