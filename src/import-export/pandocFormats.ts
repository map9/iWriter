export const PANDOC_IMPORT_FORMATS = {
  docx: 'docx',
  odt: 'odt',
  rtf: 'rtf',
  epub: 'epub',
  html: 'html',
  htm: 'html',
  tex: 'latex',
  latex: 'latex',
  mediawiki: 'mediawiki',
  wiki: 'mediawiki',
  rst: 'rst',
  rest: 'rst',
  textile: 'textile',
  opml: 'opml',
} as const

export const PANDOC_EXPORT_FORMATS = {
  docx: 'docx',
  odt: 'odt',
  rtf: 'rtf',
  epub: 'epub',
  html: 'html',
  htm: 'html',
  tex: 'latex',
  latex: 'latex',
  mediawiki: 'mediawiki',
  wiki: 'mediawiki',
  rst: 'rst',
  rest: 'rst',
  textile: 'textile',
  opml: 'opml',
} as const

export const PANDOC_IMPORT_EXTENSIONS = Object.keys(PANDOC_IMPORT_FORMATS)
export const PANDOC_EXPORT_EXTENSIONS = Object.keys(PANDOC_EXPORT_FORMATS)

export function getPandocImportFormat(extension: string): string | null {
  const normalized = extension.toLowerCase()
  return PANDOC_IMPORT_FORMATS[normalized as keyof typeof PANDOC_IMPORT_FORMATS] ?? null
}

export function getPandocExportFormat(extension: string): string | null {
  const normalized = extension.toLowerCase()
  return PANDOC_EXPORT_FORMATS[normalized as keyof typeof PANDOC_EXPORT_FORMATS] ?? null
}
