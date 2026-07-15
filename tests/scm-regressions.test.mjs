import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const gitServiceSource = readFileSync('electron/GitService.ts', 'utf8')
const mainAppSource = readFileSync('electron/App.ts', 'utf8')
const appSource = readFileSync('src/stores/app.ts', 'utf8')
const panelSource = readFileSync('src/components/sidebar/SourceControlPanel.vue', 'utf8')
const groupSource = readFileSync('src/components/sidebar/scm/GitChangeGroup.vue', 'utf8')
const diffPageSource = readFileSync('src/components/pages/DiffViewerPage.vue', 'utf8')
const filteringSource = readFileSync('src/services/workspace/filtering.ts', 'utf8')
const gitStoreSource = readFileSync('src/stores/git.ts', 'utf8')
const gitTypesSource = readFileSync('src/types/git.ts', 'utf8')
const leftSidebarSource = readFileSync('src/components/LeftSidebar.vue', 'utf8')

test('SCM regressions', async (t) => {
  await t.test('Commit All stages untracked files before committing', () => {
    assert.match(gitServiceSource, /if \(opts\.all\) await this\.stageAll\(root\)/)
    assert.doesNotMatch(gitServiceSource, /if \(opts\.all\) args\.push\('-a'\)/)
  })

  await t.test('remote checkout preserves tracking semantics', () => {
    assert.match(panelSource, /co-remote:/)
    assert.match(panelSource, /gitStore\.checkout\(ref, \{ track: true \}\)/)
    assert.match(gitServiceSource, /if \(opts\?\.track\) args\.push\('--track'\)/)
    assert.match(gitStoreSource, /promptDirtyCheckout\(ref_, opts\)/)
    assert.match(gitStoreSource, /stashPush\(root\.value!, undefined, true\)/)
  })

  await t.test('untracked changes expose discard alongside stage and gitignore', () => {
    assert.match(groupSource, /kind === 'changes' \|\| kind === 'untracked'/)
    assert.match(panelSource, /if \(p\.kind === 'changes' \|\| p\.kind === 'untracked'\) items\.push\(\{ id: 'discard'/)
    const untrackedGroup = panelSource.slice(
      panelSource.indexOf('kind="untracked"'),
      panelSource.indexOf('/>', panelSource.indexOf('kind="untracked"')),
    )
    assert.match(untrackedGroup, /@discard="onDiscard"/)
  })

  await t.test('workspace watcher forwards only selected Git metadata to SCM refresh', () => {
    assert.match(filteringSource, /GIT_METADATA_RELATIVE_PATHS/)
    assert.match(filteringSource, /'\.git\/packed-refs'/)
    assert.match(filteringSource, /normalizedPath\.startsWith\('\.git\/refs\/'\)/)
    assert.match(appSource, /isGitMetadataChange/)
    assert.match(appSource, /if \(isGitMetadataChange\) return/)
    assert.match(appSource, /void useGitStore\(\)\.refresh\(\)/)
  })

  await t.test('Git recheck bypasses an unavailable detection cache', () => {
    assert.match(gitServiceSource, /async detect\(force = false\)/)
    assert.match(gitServiceSource, /if \(!force && this\.availability\)/)
    assert.match(panelSource, /git\.detect\(true\)/)
  })

  await t.test('sidebar navigation keeps its unused toolbar area draggable', () => {
    assert.match(leftSidebarSource, /<!-- Sidebar Mode Navigation[\s\S]*?<div class="drag-region flex flex-1 items-center">/)
    assert.match(leftSidebarSource, /class="no-drag ml-auto flex h-full items-center gap-2"/)
  })

  await t.test('an expanded Graph reloads when a new workspace becomes a repository', () => {
    const graphLoadWatcher = panelSource.slice(panelSource.indexOf('// 图谱展开时懒加载'))
    assert.match(graphLoadWatcher, /watch\(\s*\[\s*\(\) => viewerPanes\.value\.find\(p => p\.id === 'graph'\)\?\.collapsed,\s*\(\) => gitStore\.isRepo/)
    assert.match(graphLoadWatcher, /isRepo && collapsed === false && !gitStore\.commits\.length/)
  })

  await t.test('editable diff saves with the normal expected-hash guard', () => {
    assert.match(diffPageSource, /lastSavedHash:[\s\S]*computeFileContentHash\(payload\.newContent\)/)
    assert.match(appSource, /writeWorkingFile\(abs, tab\.diffDraft, tab\.lastSavedHash\)/)
    assert.match(appSource, /saveFile\(content, absPath, \{ expectedHash \}\)/)
    assert.match(mainAppSource, /if \(!fs\.existsSync\(filePath\)\) throw new Error\(FILE_CONTENT_CHANGED_ON_DISK_ERROR\)/)
  })

  await t.test('working diff distinguishes an empty index blob from a missing index path', () => {
    assert.match(gitServiceSource, /const indexContent = await this\.showOptional\(root, `:\$\{filePath\}`\)/)
    assert.match(gitServiceSource, /oldContent = indexContent \?\? await this\.showSafe\(root, headRef\)/)
  })

  await t.test('staged rename diff reads the old content from the rename source path', () => {
    // 重命名源路径参与 HEAD 取值，避免新路径在 HEAD 缺失被误判为整文件新增
    assert.match(gitServiceSource, /const headRef = `HEAD:\$\{oldPath \?\? filePath\}`/)
    assert.match(gitServiceSource, /async diff\(root: string, filePath: string, opts: \{ staged: boolean \}, oldPath\?: string\)/)
    assert.match(gitServiceSource, /staged\.push\(this\.makeChange\(p, this\.mapStatus\(f\.index\), true, f\.from \|\| undefined\)\)/)
  })

  await t.test('renamed commit files retain their old path for history diff', () => {
    assert.match(gitServiceSource, /const oldPath = parts\.length >= 3 \? parts\[1\] : undefined/)
    assert.match(gitServiceSource, /\$\{hash\}~1:\$\{oldPath \?\? filePath\}/)
  })

  await t.test('write actions return classified Git issues instead of raw IPC errors', () => {
    assert.match(gitTypesSource, /export type GitActionResult<T>/)
    assert.match(gitTypesSource, /'branch-unmerged'/)
    assert.match(mainAppSource, /classifyGitIssue/)
    assert.match(mainAppSource, /git:delete-branch[\s\S]*GitActionResult/)
    assert.match(gitStoreSource, /function presentGitIssue\(issue: GitIssue/)
  })

  await t.test('special SCM write flows use the shared error dialog instead of raw notifications', () => {
    const commitFlow = gitStoreSource.slice(gitStoreSource.indexOf('async function commit'), gitStoreSource.indexOf('/** 保存身份'))
    const mergeFlow = gitStoreSource.slice(gitStoreSource.indexOf('async function merge'), gitStoreSource.indexOf('/** 提交：校验信息'))
    const stashPopFlow = gitStoreSource.slice(gitStoreSource.indexOf('async function stashPop'), gitStoreSource.indexOf('/** 克隆到目录'))
    assert.doesNotMatch(commitFlow, /notify\.error/)
    assert.doesNotMatch(mergeFlow, /notify\.error/)
    assert.doesNotMatch(stashPopFlow, /notify\.error/)
    assert.match(commitFlow, /presentGitIssue/)
    assert.match(mergeFlow, /presentGitIssue/)
    assert.match(stashPopFlow, /presentGitIssue/)
  })

  await t.test('repository initialization uses the SCM store error path', () => {
    assert.match(gitStoreSource, /async function initRepo\(\)/)
    assert.match(gitStoreSource, /operation: 'init'/)
    assert.match(panelSource, /await gitStore\.initRepo\(\)/)
    assert.doesNotMatch(panelSource, /window\.electronAPI\.git\.init\(appStore\.currentFolder\)/)
  })

})
