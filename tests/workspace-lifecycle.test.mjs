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
  it('allows creating a folder from the workspace picker', () => {
    const openFolder = sourceBetween(appStoreSource, 'async function openFolder()', '/** 打开指定路径的文件夹为工作空间')

    assert.match(openFolder, /properties: \['openDirectory', 'createDirectory'\]/)
  })

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

  it('centers two-line loading states and preserves Initialize Repository for available non-repositories', () => {
    const explorerLoading = sourceBetween(explorerSource, 'v-else-if="appStore.isWorkspaceOpening"', '<!-- 文件树 -->')
    const scmLoading = sourceBetween(sourceControlSource, 'v-else-if="appStore.isWorkspaceOpening"', '<!-- 状态 C：未检测到 Git -->')
    assert.match(explorerLoading, /flex h-full flex-col items-center justify-center gap-2/)
    assert.match(scmLoading, /flex flex-1 flex-col items-center justify-center gap-2/)
    assert.match(sourceControlSource, /v-if="!appStore\.isWorkspaceAvailable"/)
    const nonRepoState = sourceBetween(sourceControlSource, '<!-- 状态 D：非仓库 -->', '<!-- 状态 E：仓库')
    assert.match(nonRepoState, /sourceControl\.initRepo/)
    assert.match(sourceControlSource, /onMounted\(\(\) => \{ void gitStore\.ensureDetected\(\) \}\)/)
  })

  it('keeps the Change Viewer composer fixed while its change list scrolls', () => {
    const changes = sourceBetween(sourceControlSource, '<template #changes>', '<!-- Graph -->')
    assert.match(changes, /<div class="flex h-full min-h-0 flex-col overflow-hidden">/)
    assert.match(changes, /<div class="shrink-0 border-b border-base-300 p-2">/)
    assert.match(changes, /<div class="min-h-0 flex-1 overflow-y-auto">/)
  })
})
