import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

let modulePromise
const tempDirs = []

after(async () => {
  await Promise.all(tempDirs.map(dir => rm(dir, { recursive: true, force: true })))
})

async function loadModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: `export * from './electron/ai/scaffold/subagents/SubagentAssembler.ts'`,
          resolveDir: process.cwd(),
          sourcefile: 'subagent-capabilities-test-entry.ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return modulePromise
}

function registryFor(names) {
  const tools = new Map(names.map(name => [name, { name }]))
  return {
    select(requested, context) {
      return requested.map(name => {
        const tool = tools.get(name)
        if (!tool) throw new Error(`Unknown tool ${name} in ${context}`)
        return tool
      })
    },
  }
}

async function createDefinition(raw) {
  const root = await mkdtemp(join(tmpdir(), 'iwriter-subagent-capability-'))
  tempDirs.push(root)
  const dir = join(root, 'common', 'general-purpose')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'agent.md'), raw, 'utf8')
  return root
}

const READONLY_RESEARCH_TOOLS = [
  'get_editor_state',
  'get_document_outline',
  'get_section',
  'get_sections',
  'get_blocks',
  'get_block_context',
  'search_blocks_in_document',
  'search_sections_in_document',
  'search_in_directory',
  'get_pdf_outline',
  'get_pdf_pages',
  'fetch_url',
  'web_search',
  'find_references',
]

const MUTATION_TOOLS = [
  'edit_block',
  'insert_block',
  'delete_block',
  'replace_range',
  'create_document',
  'rename_file',
  'move_file',
  'git',
  'confirm_writing_plan',
  'finalize_chapter',
  'import_manuscript',
]

describe('subagent capability profiles', () => {
  it('assembles the built-in general-purpose agent with enforced read-only research capabilities', async () => {
    const { assembleSubagents } = await loadModule()
    const agents = assembleSubagents({
      subagentsRoot: resolve('electron/ai/builtin-subagents'),
      skillsRoot: resolve('electron/ai/builtin-skills'),
      workspacePath: null,
      domain: 'creative',
      registry: registryFor([...READONLY_RESEARCH_TOOLS, ...MUTATION_TOOLS]),
    })

    const researchAgent = agents.find(agent => agent.name === 'general-purpose')
    assert.ok(researchAgent, 'the custom general-purpose override must be assembled')
    assert.deepEqual(
      researchAgent.tools.map(tool => tool.name),
      READONLY_RESEARCH_TOOLS,
    )
    assert.equal(
      researchAgent.tools.some(tool => MUTATION_TOOLS.includes(tool.name)),
      false,
    )
    assert.deepEqual(researchAgent.permissions, [
      { operations: ['write'], paths: ['/large_tool_results/**'], mode: 'allow' },
      { operations: ['write'], paths: ['/**'], mode: 'deny' },
    ])
  })

  it('requires the general-purpose override to declare the research-readonly profile', async () => {
    const { assembleSubagents } = await loadModule()
    const subagentsRoot = await createDefinition(`---
name: general-purpose
description: unrestricted worker
tools: ["web_search"]
---
Research only.
`)

    assert.throws(
      () => assembleSubagents({
        subagentsRoot,
        skillsRoot: resolve('electron/ai/builtin-skills'),
        workspacePath: null,
        domain: 'creative',
        registry: registryFor(['web_search']),
      }),
      /general-purpose.*research-readonly/i,
    )
  })

  it('rejects a research-readonly profile that declares a mutation tool', async () => {
    const { assembleSubagents } = await loadModule()
    const subagentsRoot = await createDefinition(`---
name: general-purpose
description: research worker
capability: research-readonly
tools: ["web_search", "edit_block"]
permissions: [{"operations":["write"],"paths":["/large_tool_results/**"],"mode":"allow"},{"operations":["write"],"paths":["/**"],"mode":"deny"}]
---
Research only.
`)

    assert.throws(
      () => assembleSubagents({
        subagentsRoot,
        skillsRoot: resolve('electron/ai/builtin-skills'),
        workspacePath: null,
        domain: 'creative',
        registry: registryFor(['web_search', 'edit_block']),
      }),
      /research-readonly.*edit_block/i,
    )
  })

  it('rejects a research-readonly profile that allows workspace filesystem writes', async () => {
    const { assembleSubagents } = await loadModule()
    const subagentsRoot = await createDefinition(`---
name: general-purpose
description: research worker
capability: research-readonly
tools: ["web_search"]
permissions: [{"operations":["write"],"paths":["/**"],"mode":"allow"}]
---
Research only.
`)

    assert.throws(
      () => assembleSubagents({
        subagentsRoot,
        skillsRoot: resolve('electron/ai/builtin-skills'),
        workspacePath: null,
        domain: 'creative',
        registry: registryFor(['web_search']),
      }),
      /research-readonly.*filesystem.*write/i,
    )
  })
})
