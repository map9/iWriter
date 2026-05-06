import { z } from 'zod'

export const StoryAssetTypeSchema = z.enum([
  'character_card',
  'scene_card',
  'timeline_chapter',
  'foreshadowing_entry',
  'outline_chapter',
  'style_profile',
  'worldbook_entry',
])

export const SeveritySchema = z.enum(['warning', 'error'])

export const SourceRefSchema = z.object({
  file: z.string().min(1),
  chapter_id: z.string().min(1),
  block_id: z.number().int().nonnegative(),
  start_offset: z.number().int().nonnegative().optional(),
  end_offset: z.number().int().nonnegative().optional(),
})

const BaseAssetSchema = z.object({
  id: z.string().min(1),
  confidence: z.number().min(0).max(1),
  updated_at: z.string().min(1),
})

export const RelationshipSchema = z.object({
  target_id: z.string().min(1),
  relation: z.string().min(1),
  tension: z.string().optional(),
})

export const CharacterStateSchema = z.object({
  chapter_id: z.string().min(1),
  status: z.string().min(1),
})

export const CharacterCardSchema = BaseAssetSchema.extend({
  type: z.literal('character_card'),
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  role: z.string().optional(),
  appearance: z.string().optional(),
  personality: z.string().optional(),
  desire: z.string().optional(),
  fear: z.string().optional(),
  wound: z.string().optional(),
  arc: z.string().optional(),
  relationships: z.array(RelationshipSchema).default([]),
  state_by_chapter: z.array(CharacterStateSchema).default([]),
  visual_prompt: z.string().optional(),
  source_refs: z.array(SourceRefSchema).min(1),
})

export const SceneCardSchema = BaseAssetSchema.extend({
  type: z.literal('scene_card'),
  chapter_id: z.string().min(1),
  sequence: z.number().int().positive(),
  time: z.string().optional(),
  location: z.string().optional(),
  characters: z.array(z.string().min(1)).default([]),
  summary: z.string().min(1),
  beats: z.array(z.string().min(1)).default([]),
  tone: z.string().optional(),
  foreshadowing_ids: z.array(z.string().min(1)).default([]),
  visual_prompt: z.string().optional(),
  source_refs: z.array(SourceRefSchema).min(1),
})

export const WorldbookEntrySchema = BaseAssetSchema.extend({
  type: z.literal('worldbook_entry'),
  category: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  rules: z.array(z.string().min(1)).default([]),
  related_characters: z.array(z.string().min(1)).default([]),
})

export const OutlineChapterSchema = BaseAssetSchema.extend({
  type: z.literal('outline_chapter'),
  number: z.number().int().positive(),
  title: z.string().min(1),
  summary: z.string().min(1),
  scene_ids: z.array(z.string().min(1)).default([]),
  major_turns: z.array(z.string().min(1)).default([]),
  end_state: z.string().optional(),
})

export const TimelineEventSchema = z.object({
  id: z.string().min(1),
  time: z.string().min(1),
  event: z.string().min(1),
  characters: z.array(z.string().min(1)).default([]),
  chapter_id: z.string().min(1),
  scene_id: z.string().optional(),
  is_turning_point: z.boolean().default(false),
  source_refs: z.array(SourceRefSchema).min(1),
  confidence: z.number().min(0).max(1),
})

export const TimelineChapterSchema = BaseAssetSchema.extend({
  type: z.literal('timeline_chapter'),
  chapter_id: z.string().min(1),
  events: z.array(TimelineEventSchema),
})

export const ForeshadowingEntrySchema = BaseAssetSchema.extend({
  type: z.literal('foreshadowing_entry'),
  description: z.string().min(1),
  plant_scene_id: z.string().min(1),
  resolve_scene_id: z.string().optional(),
  status: z.enum(['planted', 'resolved', 'dropped']),
  source_refs: z.array(SourceRefSchema).min(1),
})

export const StyleProfileSchema = BaseAssetSchema.extend({
  type: z.literal('style_profile'),
  sentence_length: z.enum(['short', 'medium', 'long', 'mixed']).optional(),
  tone: z.string().optional(),
  pov: z.string().optional(),
  dialect_markers: z.array(z.string().min(1)).default([]),
  sample_paragraphs: z.array(z.string().min(1)).default([]),
  avoid_patterns: z.array(z.string().min(1)).default([]),
})

export const StoryMetaSchema = z.object({
  title: z.string().min(1),
  genre: z.string().optional(),
  pov: z.string().optional(),
  total_words: z.number().int().nonnegative().optional(),
  source_file: z.string().optional(),
  created_at: z.string().min(1),
  updated_at: z.string().min(1),
})

export const StoryAssetSchema = z.discriminatedUnion('type', [
  CharacterCardSchema,
  SceneCardSchema,
  TimelineChapterSchema,
  ForeshadowingEntrySchema,
  OutlineChapterSchema,
  StyleProfileSchema,
  WorldbookEntrySchema,
])

export const StoryStateSchema = z.object({
  meta: StoryMetaSchema,
  characters: z.array(CharacterCardSchema).default([]),
  worldbook: z.array(WorldbookEntrySchema).default([]),
  outline: z.array(OutlineChapterSchema).default([]),
  scenes: z.array(SceneCardSchema).default([]),
  timeline: z.array(TimelineChapterSchema).default([]),
  foreshadowing: z.array(ForeshadowingEntrySchema).default([]),
  style_profile: StyleProfileSchema.optional(),
})

export const ValidationIssueSchema = z.object({
  dimension: z.string().min(1),
  description: z.string().min(1),
  severity: SeveritySchema,
  suggestion: z.string().optional(),
})

export type StoryAssetType = z.infer<typeof StoryAssetTypeSchema>
export type SourceRef = z.infer<typeof SourceRefSchema>
export type Relationship = z.infer<typeof RelationshipSchema>
export type CharacterState = z.infer<typeof CharacterStateSchema>
export type CharacterCard = z.infer<typeof CharacterCardSchema>
export type SceneCard = z.infer<typeof SceneCardSchema>
export type WorldbookEntry = z.infer<typeof WorldbookEntrySchema>
export type OutlineChapter = z.infer<typeof OutlineChapterSchema>
export type TimelineEvent = z.infer<typeof TimelineEventSchema>
export type TimelineChapter = z.infer<typeof TimelineChapterSchema>
export type ForeshadowingEntry = z.infer<typeof ForeshadowingEntrySchema>
export type StyleProfile = z.infer<typeof StyleProfileSchema>
export type StoryMeta = z.infer<typeof StoryMetaSchema>
export type StoryAsset = z.infer<typeof StoryAssetSchema>
export type StoryState = z.infer<typeof StoryStateSchema>
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: string[] }

function formatPath(path: PropertyKey[]): string {
  return path.length ? path.map(part => String(part)).join('.') : '<root>'
}

function formatZodErrors(error: z.ZodError): string[] {
  return error.issues.map(issue => `${formatPath(issue.path)}: ${issue.message}`)
}

function validateWith<T>(schema: z.ZodType<T>, input: unknown): ValidationResult<T> {
  const result = schema.safeParse(input)
  if (result.success) {
    return { ok: true, data: result.data }
  }
  return { ok: false, errors: formatZodErrors(result.error) }
}

export function validateCharacterCard(input: unknown) {
  return validateWith(CharacterCardSchema, input)
}

export function validateSceneCard(input: unknown) {
  return validateWith(SceneCardSchema, input)
}

export function validateTimelineEvent(input: unknown) {
  return validateWith(TimelineEventSchema, input)
}

export function validateTimelineChapter(input: unknown) {
  return validateWith(TimelineChapterSchema, input)
}

export function validateForeshadowingEntry(input: unknown) {
  return validateWith(ForeshadowingEntrySchema, input)
}

export function validateOutlineChapter(input: unknown) {
  return validateWith(OutlineChapterSchema, input)
}

export function validateStyleProfile(input: unknown) {
  return validateWith(StyleProfileSchema, input)
}

export function validateWorldbookEntry(input: unknown) {
  return validateWith(WorldbookEntrySchema, input)
}

export function validateStoryAsset(input: unknown) {
  return validateWith(StoryAssetSchema, input)
}

export function validateStoryState(input: unknown) {
  return validateWith(StoryStateSchema, input)
}
