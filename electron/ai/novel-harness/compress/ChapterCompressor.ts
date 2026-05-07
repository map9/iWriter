import * as fs from 'fs'
import * as path from 'path'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { AiProviderConfig } from '../../../../src/types/ai'
import type { SerializedBlockEntry } from '../../ipc/protocol'
import { createChatModel } from '../../providers/ModelFactory'
import type { ChapterBoundary } from '../ingest/ChapterSegmenter'
import type { CharacterCard, SceneCard, TimelineChapter } from '../schema/types'
import {
  validateCharacterCard,
  validateSceneCard,
  validateTimelineChapter,
} from '../schema/validator'

const DEFAULT_MAX_RETRIES = 2
const COMPRESS_SKILL_RELATIVE_PATH = path.join('electron', 'ai', 'builtin-skills', 'compress-chapter', 'SKILL.md')
const COMPRESS_SKILL_FROM_SOURCE_DIR = path.resolve(__dirname, '..', '..', 'builtin-skills', 'compress-chapter', 'SKILL.md')

export interface CompressionDraft {
  chapter: {
    id: string
    title: string
    startBlockId: number
    endBlockId: number
  }
  characters: CharacterCard[]
  scenes: SceneCard[]
  timeline?: TimelineChapter
  rawModelText: string
  attempts: number
  validationErrors: string[]
}

export interface ExtractChapterInput {
  chapter: ChapterBoundary
  chapterText: string
  blocks: SerializedBlockEntry[]
  sourceFile: string
  providerConfig: AiProviderConfig
  modelId?: string
  thinkMode?: string
  now?: string
  maxRetries?: number
}

export interface CompressModelRuntime {
  providerConfig: AiProviderConfig
  modelId?: string
  thinkMode?: string
}

export type CompressModelInvoker = (
  messages: Array<SystemMessage | HumanMessage>,
  runtime: CompressModelRuntime,
) => Promise<string>

export interface ChapterCompressorOptions {
  skillPath?: string
  skillPrompt?: string
  modelInvoker?: CompressModelInvoker
}

interface RawCompressionDraft {
  characters?: unknown[]
  scenes?: unknown[]
  timeline?: unknown
}

export class ChapterCompressor {
  private readonly skillPrompt: string
  private readonly modelInvoker: CompressModelInvoker

  constructor(options: ChapterCompressorOptions = {}) {
    this.skillPrompt = options.skillPrompt ?? loadSkillPrompt(options.skillPath)
    this.modelInvoker = options.modelInvoker ?? defaultModelInvoker
  }

  async extractChapter(input: ExtractChapterInput): Promise<CompressionDraft> {
    const maxRetries = input.maxRetries ?? DEFAULT_MAX_RETRIES
    const validationErrors: string[] = []
    let lastRawText = ''

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const messages = this.buildMessages(input, validationErrors)
      lastRawText = await this.modelInvoker(messages, {
        providerConfig: input.providerConfig,
        modelId: input.modelId,
        thinkMode: input.thinkMode,
      })

      try {
        const parsed = parseCompressionJson(lastRawText)
        const draft = validateCompressionDraft(parsed, input)
        return {
          ...draft,
          rawModelText: lastRawText,
          attempts: attempt,
          validationErrors,
        }
      } catch (error) {
        validationErrors.push(error instanceof Error ? error.message : String(error))
      }
    }

    throw new Error(`Chapter compression failed after ${maxRetries + 1} attempt(s):\n${validationErrors.join('\n')}`)
  }

  private buildMessages(input: ExtractChapterInput, validationErrors: string[]) {
    const blockIds = input.blocks.map(block => block.displayId)
    const humanPrompt = [
      'Extract structured story state from the following chapter.',
      '',
      `source_file: ${input.sourceFile}`,
      `chapter_id: ${input.chapter.id}`,
      `chapter_title: ${input.chapter.title}`,
      `updated_at: ${input.now ?? new Date().toISOString()}`,
      `allowed_block_ids: ${JSON.stringify(blockIds)}`,
      '',
      'block_map:',
      JSON.stringify(
        input.blocks.map(block => ({
          block_id: block.displayId,
          type: block.nodeType,
          content: block.content,
        })),
        null,
        2,
      ),
      '',
      'chapter_text:',
      input.chapterText,
      validationErrors.length
        ? [
            '',
            'Previous output failed validation. Fix these errors and return a full corrected JSON object:',
            validationErrors.join('\n'),
          ].join('\n')
        : '',
    ].filter(Boolean).join('\n')

    return [
      new SystemMessage(this.skillPrompt),
      new HumanMessage(humanPrompt),
    ]
  }
}

function loadSkillPrompt(skillPath?: string): string {
  const appPath = getElectronAppPath()
  const candidates = [
    skillPath,
    appPath
      ? path.join(appPath, COMPRESS_SKILL_RELATIVE_PATH)
      : undefined,
    COMPRESS_SKILL_FROM_SOURCE_DIR,
    path.resolve(process.cwd(), COMPRESS_SKILL_RELATIVE_PATH),
  ].filter((candidate): candidate is string => !!candidate)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return fs.readFileSync(candidate, 'utf-8')
    }
  }

  throw new Error(`compress-chapter/SKILL.md not found. Tried:\n${candidates.join('\n')}`)
}

function getElectronAppPath(): string | null {
  try {
    // Use runtime require so Node-only verifier scripts can import this module.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron') as { app?: { getAppPath?: () => string } }
    return electron.app?.getAppPath?.() ?? null
  } catch {
    return null
  }
}

async function defaultModelInvoker(
  messages: Array<SystemMessage | HumanMessage>,
  runtime: CompressModelRuntime,
): Promise<string> {
  const model = createChatModel(runtime.providerConfig, {
    modelId: runtime.modelId,
    thinkMode: runtime.thinkMode,
  })
  const response = await model.invoke(messages)
  return extractMessageText(response.content)
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '')
        }
        return ''
      })
      .join('')
      .trim()
  }
  return ''
}

export function parseCompressionJson(rawText: string): RawCompressionDraft {
  const trimmed = rawText.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const jsonText = fenced?.[1]?.trim() ?? trimmed
  const parsed = JSON.parse(jsonText) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Compression output must be a JSON object.')
  }
  return parsed as RawCompressionDraft
}

function validateCompressionDraft(
  raw: RawCompressionDraft,
  input: ExtractChapterInput,
): Omit<CompressionDraft, 'rawModelText' | 'attempts' | 'validationErrors'> {
  const errors: string[] = []
  const validBlockIds = new Set(input.blocks.map(block => block.displayId))
  const characters = validateItems(raw.characters, 'characters', validateCharacterCard, errors)
  const scenes = validateItems(raw.scenes, 'scenes', validateSceneCard, errors)
  const timeline = raw.timeline === undefined
    ? undefined
    : validateSingle(raw.timeline, 'timeline', validateTimelineChapter, errors)

  if (!characters.length) errors.push('characters: at least one CharacterCard is required.')
  if (!scenes.length) errors.push('scenes: at least one SceneCard is required.')

  for (const character of characters) {
    validateAssetSourceRefs(character.source_refs, validBlockIds, `characters.${character.id}`, errors)
  }
  for (const scene of scenes) {
    if (scene.chapter_id !== input.chapter.id) {
      errors.push(`scenes.${scene.id}.chapter_id must equal ${input.chapter.id}.`)
    }
    validateAssetSourceRefs(scene.source_refs, validBlockIds, `scenes.${scene.id}`, errors)
  }
  if (timeline) {
    if (timeline.chapter_id !== input.chapter.id) {
      errors.push(`timeline.chapter_id must equal ${input.chapter.id}.`)
    }
    for (const event of timeline.events) {
      validateAssetSourceRefs(event.source_refs, validBlockIds, `timeline.${event.id}`, errors)
    }
  }

  if (errors.length) {
    throw new Error(errors.join('\n'))
  }

  return {
    chapter: {
      id: input.chapter.id,
      title: input.chapter.title,
      startBlockId: input.chapter.startBlockId,
      endBlockId: input.chapter.endBlockId,
    },
    characters,
    scenes,
    timeline,
  }
}

function validateItems<T>(
  items: unknown[] | undefined,
  label: string,
  validator: (input: unknown) => { ok: true; data: T } | { ok: false; errors: string[] },
  errors: string[],
): T[] {
  if (!Array.isArray(items)) {
    errors.push(`${label}: expected array.`)
    return []
  }

  return items.flatMap((item, index) => {
    const result = validator(item)
    if (result.ok) return [result.data]
    const itemErrors = 'errors' in result ? result.errors : ['Unknown validation error']
    errors.push(...itemErrors.map(error => `${label}.${index}.${error}`))
    return []
  })
}

function validateSingle<T>(
  item: unknown,
  label: string,
  validator: (input: unknown) => { ok: true; data: T } | { ok: false; errors: string[] },
  errors: string[],
): T | undefined {
  const result = validator(item)
  if (result.ok) return result.data
  const itemErrors = 'errors' in result ? result.errors : ['Unknown validation error']
  errors.push(...itemErrors.map(error => `${label}.${error}`))
  return undefined
}

function validateAssetSourceRefs(
  refs: Array<{ block_id: number }>,
  validBlockIds: Set<number>,
  label: string,
  errors: string[],
) {
  for (const ref of refs) {
    if (ref.block_id <= 0) {
      errors.push(`${label}.source_refs.block_id must be a positive integer.`)
    }
    if (!validBlockIds.has(ref.block_id)) {
      errors.push(`${label}.source_refs.block_id ${ref.block_id} is not in allowed block ids.`)
    }
  }
}
