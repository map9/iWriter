import { TEXT_IWT_EXTENSION } from '@/types/file-extension'

export interface UntitledNameOptions {
  /** 'folder' → no extension; otherwise treated as file extension (default: 'iwt') */
  type?: 'folder' | string
  /** Names already in use at the same level (tab names / sibling labels) */
  existingNames?: Iterable<string>
  /** Base name prefix, defaults to 'Untitled' */
  baseName?: string
}

/**
 * Returns the first available `Untitled-NN` name (two-digit zero-padded) that
 * does not conflict with any of the provided existingNames.
 *
 * - type === 'folder' → no extension, e.g. `Untitled-01`
 * - type === <ext>   → appends extension, e.g. `Untitled-01.iwt`
 * - Empty existingNames → always returns `Untitled-01`
 */
export function generateUntitledName(options: UntitledNameOptions = {}): string {
  const { type = TEXT_IWT_EXTENSION, baseName = 'Untitled' } = options
  const taken = new Set(options.existingNames ?? [])
  const isFolder = type === 'folder'
  let counter = 1
  let name: string
  do {
    const padded = counter.toString().padStart(2, '0')
    name = isFolder
      ? `${baseName}-${padded}`
      : `${baseName}-${padded}.${type}`
    counter++
  } while (taken.has(name))
  return name
}
