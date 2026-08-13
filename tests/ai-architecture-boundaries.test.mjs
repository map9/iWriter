import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { parse as parseVueSfc } from '@vue/compiler-sfc'
import ts from 'typescript'

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.vue'])

const SHARED_FORBIDDEN_DEPENDENCIES = [
  { label: 'Electron code', pattern: /(^|\/)electron(?:\/|$)/ },
  { label: 'renderer code', pattern: /(^|\/)src(?:\/|$)/ },
  { label: 'renderer alias', pattern: /^@\// },
  { label: 'Electron package', pattern: /^electron(?:\/|$)/ },
  { label: 'Vue package', pattern: /^(?:vue|@vue)(?:\/|$)/ },
  { label: 'Pinia package', pattern: /^pinia(?:\/|$)/ },
]

const boundaries = [
  {
    owner: 'shared/ai',
    forbidden: SHARED_FORBIDDEN_DEPENDENCIES,
  },
  {
    owner: 'shared/git',
    forbidden: SHARED_FORBIDDEN_DEPENDENCIES,
  },
  {
    owner: 'shared/workspace',
    forbidden: SHARED_FORBIDDEN_DEPENDENCIES,
  },
  {
    owner: 'electron/ai',
    forbidden: [
      { label: 'renderer code', pattern: /(^|\/)src(?:\/|$)/ },
      { label: 'renderer alias', pattern: /^@\// },
    ],
  },
  {
    owner: 'src/ai',
    forbidden: [
      { label: 'Electron code', pattern: /(^|\/)electron(?:\/|$)/ },
      { label: 'Electron package', pattern: /^electron(?:\/|$)/ },
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

function typescriptImportSpecifiers(source, filePath) {
  const scriptKind = path.extname(filePath) === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind)
  const specifiers = []

  function addStringLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text)
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier)
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference)) {
        addStringLiteral(node.moduleReference.expression)
      }
    } else if (ts.isCallExpression(node)) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
      if (isDynamicImport || isRequire) addStringLiteral(node.arguments[0])
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addStringLiteral(node.argument.literal)
    }

    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return specifiers
}

function importSpecifiersFromSource(source, filePath) {
  if (path.extname(filePath) !== '.vue') {
    return typescriptImportSpecifiers(source, filePath)
  }

  const { descriptor, errors } = parseVueSfc(source, { filename: filePath })
  if (errors.length > 0) {
    throw new Error(`Unable to parse ${filePath}: ${errors.map(String).join('; ')}`)
  }

  return [descriptor.script, descriptor.scriptSetup]
    .filter(Boolean)
    .flatMap(block => typescriptImportSpecifiers(block.content, `${filePath}.${block.lang ?? 'js'}`))
}

function importSpecifiers(filePath) {
  return importSpecifiersFromSource(readFileSync(filePath, 'utf8'), filePath)
}

function violationsForSource(owner, filePath, source) {
  const boundary = boundaries.find(item => item.owner === owner)
  if (!boundary) return []

  return importSpecifiersFromSource(source, filePath).flatMap(specifier => boundary.forbidden
    .filter(rule => rule.pattern.test(specifier))
    .map(rule => ({ filePath, specifier, label: rule.label })))
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

test('dependency parsing includes side-effect, re-export, dynamic, require, and import-equals edges', () => {
  const source = `
    import '../../src/side-effect'
    import value from '../../src/static'
    export { value } from '../../src/re-export'
    const dynamic = import('../../src/dynamic')
    const required = require('../../src/required')
    import legacy = require('../../src/import-equals')
    type Imported = import('../../src/import-type').Imported
  `

  assert.deepEqual(
    new Set(importSpecifiersFromSource(source, 'dependency-fixture.ts')),
    new Set([
      '../../src/side-effect',
      '../../src/static',
      '../../src/re-export',
      '../../src/dynamic',
      '../../src/required',
      '../../src/import-equals',
      '../../src/import-type',
    ]),
  )

  assert.deepEqual(
    importSpecifiersFromSource(
      `<script setup lang="ts">import '../../src/vue-side-effect'</script>`,
      'dependency-fixture.vue',
    ),
    ['../../src/vue-side-effect'],
  )
})

test('every process-neutral shared root rejects renderer, Electron, Vue, and Pinia dependencies', () => {
  const forbiddenSource = `
    import '../../src/renderer-only'
    import '../../electron/main-only'
    import 'electron'
    import 'vue'
    import 'pinia'
  `

  for (const owner of ['shared/ai', 'shared/git', 'shared/workspace']) {
    const violations = violationsForSource(owner, `${owner}/fixture.ts`, forbiddenSource)
    assert.deepEqual(
      new Set(violations.map(item => item.specifier)),
      new Set(['../../src/renderer-only', '../../electron/main-only', 'electron', 'vue', 'pinia']),
    )
  }
})

test('renderer AI accesses preload AI APIs only through AgentClient', () => {
  const directAccess = sourceFiles('src/ai')
    .filter(filePath => filePath !== path.normalize('src/ai/client/AgentClient.ts'))
    .filter(filePath => /window\.electronAPI(?:\?\.)?\.(?:ai|onAi|removeAi)/.test(
      readFileSync(filePath, 'utf8'),
    ))

  assert.deepEqual(
    directAccess,
    [],
    'Move direct preload AI calls behind src/ai/client/AgentClient.ts.',
  )
})
