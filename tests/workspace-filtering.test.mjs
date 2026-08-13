import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let filteringModulePromise

async function loadFilteringModule() {
  if (!filteringModulePromise) {
    filteringModulePromise = (async () => {
      const result = await build({
        entryPoints: ['shared/workspace/filtering.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return filteringModulePromise
}

describe('workspace filtering', () => {
  it('ignores built-in workspace metadata by default', async () => {
    const {
      DEFAULT_WORKSPACE_IGNORE_RULES,
      parseWorkspaceIgnoreRules,
      shouldIncludeWorkspaceEntry,
    } = await loadFilteringModule()

    const matcher = parseWorkspaceIgnoreRules(DEFAULT_WORKSPACE_IGNORE_RULES)

    assert.equal(shouldIncludeWorkspaceEntry({ relativePath: '.git', isDirectory: true }, matcher), false)
    assert.equal(shouldIncludeWorkspaceEntry({ relativePath: '.iwriter', isDirectory: true }, matcher), false)
    assert.equal(shouldIncludeWorkspaceEntry({ relativePath: '.DS_Store', isDirectory: false }, matcher), false)
    assert.equal(shouldIncludeWorkspaceEntry({ relativePath: 'node_modules', isDirectory: true }, matcher), true)
    assert.equal(shouldIncludeWorkspaceEntry({ relativePath: 'dist-electron', isDirectory: true }, matcher), true)
  })

  it('merges .gitignore rules only when the scope asks for them', async () => {
    const { buildWorkspaceIgnoreRules, parseWorkspaceIgnoreRules, shouldIncludeWorkspaceEntry } = await loadFilteringModule()

    assert.equal(typeof buildWorkspaceIgnoreRules, 'function')

    const disabledMatcher = parseWorkspaceIgnoreRules(buildWorkspaceIgnoreRules({
      preferenceRules: '',
      gitignoreRules: 'draft-cache/',
      workspaceRules: '',
      useGitignore: false,
    }))
    assert.equal(shouldIncludeWorkspaceEntry({ relativePath: 'draft-cache', isDirectory: true }, disabledMatcher), true)

    const enabledMatcher = parseWorkspaceIgnoreRules(buildWorkspaceIgnoreRules({
      preferenceRules: '',
      gitignoreRules: 'draft-cache/',
      workspaceRules: '',
      useGitignore: true,
    }))
    assert.equal(shouldIncludeWorkspaceEntry({ relativePath: 'draft-cache', isDirectory: true }, enabledMatcher), false)
  })

  it('prunes ignored directories before recursive traversal unless negated rules require descent', async () => {
    const { parseWorkspaceIgnoreRules, shouldTraverseWorkspaceDirectory } = await loadFilteringModule()

    assert.equal(typeof shouldTraverseWorkspaceDirectory, 'function')

    const plainMatcher = parseWorkspaceIgnoreRules('node_modules/')
    assert.equal(
      shouldTraverseWorkspaceDirectory({ relativePath: 'node_modules', isDirectory: true }, plainMatcher),
      false
    )

    const negatedMatcher = parseWorkspaceIgnoreRules('draft/\n!draft/keep.md')
    assert.equal(
      shouldTraverseWorkspaceDirectory({ relativePath: 'draft', isDirectory: true }, negatedMatcher),
      true
    )

    const unrelatedNegationMatcher = parseWorkspaceIgnoreRules('node_modules/\n!electron/ai/builtin-skills/**/SKILL.md')
    assert.equal(
      shouldTraverseWorkspaceDirectory({ relativePath: 'node_modules', isDirectory: true }, unrelatedNegationMatcher),
      false
    )
  })
})
