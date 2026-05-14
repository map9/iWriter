import type { CreativeReviewItem } from '@/ai/types'

export function isCreativeReviewItem(value: unknown): value is CreativeReviewItem {
  if (!value || typeof value !== 'object') return false
  const item = value as { kind?: unknown; id?: unknown; status?: unknown }
  return typeof item.id === 'string' &&
    item.status === 'pending' &&
    (
      item.kind === 'creative_plan' ||
      item.kind === 'creative_write' ||
      item.kind === 'creative_storybible' ||
      item.kind === 'creative_chapter_structure' ||
      item.kind === 'creative_git_commit' ||
      item.kind === 'creative_git_tag' ||
      item.kind === 'creative_exploration_start' ||
      item.kind === 'creative_exploration_compare' ||
      item.kind === 'creative_exploration_merge' ||
      item.kind === 'creative_exploration_delete' ||
      item.kind === 'creative_compress'
    )
}

export function isCreativeReviewItemArray(value: unknown): value is CreativeReviewItem[] {
  return Array.isArray(value) && value.every(isCreativeReviewItem)
}
