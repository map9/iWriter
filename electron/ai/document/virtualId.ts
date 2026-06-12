/**
 * Virtual reference for in-memory unsaved_new documents: "untitled:<FileTab.id>".
 * Lets DocumentTools/EditProposalTools target a specific open tab that has no
 * absolute file path yet, without overloading FileTab.path.
 */
export const UNTITLED_PREFIX = 'untitled:'

/** Extract the FileTab.id from a "untitled:<id>" virtual_id, or undefined if not one. */
export function parseUntitledTabId(value: string | null | undefined): string | undefined {
  if (!value || !value.startsWith(UNTITLED_PREFIX)) return undefined
  return value.slice(UNTITLED_PREFIX.length)
}
