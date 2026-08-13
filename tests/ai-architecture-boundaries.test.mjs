import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const SOURCE_EXTENSIONS = new Set(['.ts', '.vue'])
const IMPORT_SPECIFIER_RE = /(?:\bfrom\s*|\bimport\s*\(|\brequire\s*\()\s*['"]([^'"]+)['"]/g

const boundaries = [
  {
    owner: 'shared/ai',
    forbidden: [
      { label: 'Electron code', pattern: /(^|\/)electron\// },
      { label: 'renderer code', pattern: /(^|\/)src\// },
      { label: 'renderer alias', pattern: /^@\// },
    ],
  },
  {
    owner: 'electron/ai',
    forbidden: [
      { label: 'renderer code', pattern: /(^|\/)src\// },
      { label: 'renderer alias', pattern: /^@\// },
    ],
  },
  {
    owner: 'src/ai',
    forbidden: [
      { label: 'Electron code', pattern: /(^|\/)electron\// },
    ],
  },
]

// Ratchet only: every entry is existing debt captured when this test was introduced.
// Removing an import requires removing its entry here; adding a new reverse dependency fails.
const LEGACY_BOUNDARY_ALLOWLIST = new Set()

function sourceFiles(root) {
  if (!existsSync(root)) return []

  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : []
  })
}

function importSpecifiers(filePath) {
  const source = readFileSync(filePath, 'utf8')
  return [...source.matchAll(IMPORT_SPECIFIER_RE)].map(match => match[1])
}

function boundaryViolations() {
  return boundaries.flatMap(boundary => sourceFiles(boundary.owner).flatMap(filePath =>
    importSpecifiers(filePath).flatMap(specifier => boundary.forbidden
      .filter(rule => rule.pattern.test(specifier))
      .map(rule => ({
        owner: boundary.owner,
        filePath,
        specifier,
        label: rule.label,
      }))),
  ))
}

test('AI modules keep shared, main-process, and renderer dependency directions separate', () => {
  const violations = [...new Set(boundaryViolations().map(item =>
    `${item.filePath} -> ${item.specifier}`,
  ))].sort()
  assert.deepEqual(
    violations,
    [...LEGACY_BOUNDARY_ALLOWLIST].sort(),
    'AI dependency debt changed. Remove resolved entries from LEGACY_BOUNDARY_ALLOWLIST; reject newly introduced entries.',
  )
})

test('electron AI has no renderer reverse-dependency allowance', () => {
  assert.equal(
    LEGACY_BOUNDARY_ALLOWLIST.size,
    0,
    'Phase 1 is complete only when electron/ai no longer imports renderer-owned src modules.',
  )
})
