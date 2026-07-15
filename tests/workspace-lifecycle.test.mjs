import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const appStoreSource = readFileSync('src/stores/app.ts', 'utf8')
const gitStoreSource = readFileSync('src/stores/git.ts', 'utf8')
const mainViewSource = readFileSync('src/views/MainView.vue', 'utf8')
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

  it('keeps the Change Viewer composer fixed while its change list scrolls', () => {
    const changes = sourceBetween(sourceControlSource, '<template #changes>', '<!-- Graph -->')
    assert.match(changes, /<div class="flex h-full min-h-0 flex-col overflow-hidden">/)
    assert.match(changes, /<div class="shrink-0 border-b border-base-300 p-2">/)
    assert.match(changes, /<div class="min-h-0 flex-1 overflow-y-auto">/)
  })
})
