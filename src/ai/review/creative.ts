import type { CreativeReviewItem } from '@/ai/types'

export function isCreativeReviewItem(value: unknown): value is CreativeReviewItem {
  if (!value || typeof value !== 'object') return false
  const item = value as { kind?: unknown; id?: unknown; status?: unknown }
  return typeof item.id === 'string' &&
    item.status === 'pending' &&
    (
      item.kind === 'creative_plan' ||
      item.kind === 'creative_write' ||
      item.kind === 'creative_storybible'
    )
}

export function isCreativeReviewItemArray(value: unknown): value is CreativeReviewItem[] {
  return Array.isArray(value) && value.every(isCreativeReviewItem)
}
