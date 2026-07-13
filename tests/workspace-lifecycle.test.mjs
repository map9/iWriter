import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const appStoreSource = readFileSync('src/stores/app.ts', 'utf8')
const gitStoreSource = readFileSync('src/stores/git.ts', 'utf8')
const mainViewSource = readFileSync('src/views/MainView.vue', 'utf8')
const explorerSource = readFileSync('src/components/sidebar/ExplorerPanel.vue', 'utf8')
const sourceControlSource = readFileSync('src/components/sidebar/SourceControlPanel.vue', 'utf8')

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker, start)
  assert.notEqual(start, -1, `missing ${startMarker}`)
  assert.notEqual(end, -1, `missing ${endMarker}`)
  return source.slice(start, end)
}

describe('workspace lifecycle', () => {
  it('exposes opening and refreshing states independently from workspace availability', () => {
    assert.match(appStoreSource, /type WorkspaceLoadState = 'idle' \| 'opening' \| 'refreshing'/)
    assert.match(appStoreSource, /const workspaceLoadState = ref<WorkspaceLoadState>\('idle'\)/)
    assert.match(appStoreSource, /const isWorkspaceOpening = computed\(\(\) => workspaceLoadState\.value === 'opening'\)/)
    assert.match(appStoreSource, /const isWorkspaceAvailable = computed\(\(\) => hasOpenFolder\.value && !isWorkspaceDeleted\.value\)/)
  })

  it('marks initial and restored tree loads as opening workspaces', () => {
    const restore = sourceBetween(appStoreSource, 'async function restoreWorkspace()', '// ===== 状态保存 =====')
    const restored = sourceBetween(appStoreSource, 'async function checkWorkspaceDirectoryRestored', 'function buildSavedHash')
    const open = sourceBetween(appStoreSource, 'async function openFolderByPath', 'async function closeFolder')

    assert.match(restore, /await loadFileTree\('opening'\)/)
    assert.match(restored, /await loadFileTree\('opening'\)/)
    assert.match(open, /await loadFileTree\('opening'\)/)
  })

  it('clears SCM when workspace availability changes and ignores stale Git detection', () => {
    assert.match(mainViewSource, /\[\(\) => appStore\.currentFolder, \(\) => appStore\.isWorkspaceAvailable\]/)
    assert.match(mainViewSource, /available \? folder : null/)
    assert.match(gitStoreSource, /let folderChangeGeneration = 0/)
    assert.match(gitStoreSource, /const generation = \+\+folderChangeGeneration/)
    assert.match(gitStoreSource, /if \(generation !== folderChangeGeneration\) return/)
  })

  it('shows loading separately and preserves Initialize Repository for available non-repositories', () => {
    assert.match(explorerSource, /v-else-if="appStore\.isWorkspaceOpening"/)
    assert.match(sourceControlSource, /v-if="!appStore\.isWorkspaceAvailable"/)
    assert.match(sourceControlSource, /v-else-if="appStore\.isWorkspaceOpening"/)
    const nonRepoState = sourceBetween(sourceControlSource, '<!-- 状态 D：非仓库 -->', '<!-- 状态 E：仓库')
    assert.match(nonRepoState, /sourceControl\.initRepo/)
    assert.match(sourceControlSource, /onMounted\(\(\) => \{ void gitStore\.ensureDetected\(\) \}\)/)
  })
})
