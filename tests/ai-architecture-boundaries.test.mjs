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
const LEGACY_BOUNDARY_ALLOWLIST = new Set([
  'electron/ai/AgentEngine.ts -> ../../src/ai/message/detectInputLanguage',
  'electron/ai/AgentEngine.ts -> ../../src/ai/model/model-budget',
  'electron/ai/AgentEngine.ts -> ../../src/ai/model/token-estimation',
  'electron/ai/AgentEngine.ts -> ../../src/ai/thread/title',
  'electron/ai/AgentEngine.ts -> ../../src/types/ai',
  'electron/ai/config/AiConfigStore.ts -> ../../../src/types/ai',
  'electron/ai/document/DocumentSearch.ts -> ../../../src/services/workspace/filtering',
  'electron/ai/domain/DomainStrategy.ts -> ../../../src/ai/message/detectInputLanguage',
  'electron/ai/domain/DomainStrategy.ts -> ../../../src/types/ai',
  'electron/ai/domain/creative/CreativeDomainStrategy.ts -> ../../../../src/ai/message/detectInputLanguage',
  'electron/ai/domain/creative/CreativeDomainStrategy.ts -> ../../../../src/ai/thread/system-prompts/creative',
  'electron/ai/domain/creative/CreativeDomainStrategy.ts -> ../../../../src/types/ai',
  'electron/ai/domain/creative/CreativeDomainStrategy.ts -> ../../../../src/types/git',
  'electron/ai/domain/creative/buildCreativeCapabilities.ts -> ../../../../src/ai/message/detectInputLanguage',
  'electron/ai/domain/creative/buildCreativeCapabilities.ts -> ../../../../src/types/git',
  'electron/ai/domain/edit/EditDomainStrategy.ts -> ../../../../src/ai/message/detectInputLanguage',
  'electron/ai/domain/edit/EditDomainStrategy.ts -> ../../../../src/ai/thread/system-prompts/edit',
  'electron/ai/domain/edit/EditDomainStrategy.ts -> ../../../../src/types/ai',
  'electron/ai/ipc/CreativeReviewAdapter.ts -> ../../../src/types/ai',
  'electron/ai/ipc/FilesystemReviewAdapter.ts -> ../../../src/ai/types',
  'electron/ai/ipc/MessageAdapter.ts -> ../../../src/ai/hitl',
  'electron/ai/ipc/MessageAdapter.ts -> ../../../src/types/ai',
  'electron/ai/ipc/RendererEventBridge.ts -> ../../../src/types/git',
  'electron/ai/ipc/StreamEventAdapter.ts -> ../../../src/ai/hitl',
  'electron/ai/ipc/StreamEventAdapter.ts -> ../../../src/types/ai',
  'electron/ai/ipc/protocol.ts -> ../../../src/types/ai',
  'electron/ai/providers/ChatDeepSeek.ts -> ../../../src/ai/model/model-profiles',
  'electron/ai/providers/ChatDeepSeek.ts -> ../../../src/types/ai',
  'electron/ai/providers/ModelFactory.ts -> ../../../src/types/ai',
  'electron/ai/runtime/ThreadRuntimeResolver.ts -> ../../../src/types/ai',
  'electron/ai/runtime/ThreadRuntimeStore.ts -> ../../../src/ai/message/detectInputLanguage',
  'electron/ai/scaffold/subagents/SubagentAssembler.ts -> ../../../../src/ai/message/detectInputLanguage',
  'electron/ai/thread/ThreadListQuery.ts -> ../../../src/types/ai',
  'electron/ai/tools/common/GitTools.ts -> ../../../../src/types/git',
  'electron/ai/tools/common/HtmlFetcher.ts -> ../../../../src/ai/model/token-estimation',
  'electron/ai/tools/common/WebTools.ts -> ../../../../src/types/ai',
  'src/ai/ipc.ts -> ../../electron/ai/ipc/protocol',
])

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
