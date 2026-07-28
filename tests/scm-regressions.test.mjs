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
const explorerSource = readFileSync('src/components/sidebar/ExplorerPanel.vue', 'utf8')
const gitToolsSource = readFileSync('electron/ai/tools/common/GitTools.ts', 'utf8')
const agentEngineSource = readFileSync('electron/ai/AgentEngine.ts', 'utf8')
const rendererEventBridgeSource = readFileSync('electron/ai/ipc/RendererEventBridge.ts', 'utf8')
const preloadSource = readFileSync('electron/preload.ts', 'utf8')
const preferencesSource = readFileSync('src/components/preferences/PreferencesDialog.vue', 'utf8')
const sourceControlPreferencesSource = readFileSync('src/components/preferences/SourceControlPreferencesPanel.vue', 'utf8')
const diffViewSource = readFileSync('src/components/common/diff/DiffView.vue', 'utf8')
const gitConfigStoreSource = readFileSync('electron/GitConfigStore.ts', 'utf8')
const editSettingSource = readFileSync('src/types/edit-setting.ts', 'utf8')
const stateStorageSource = readFileSync('src/utils/StateStorage.ts', 'utf8')
const zhMessagesSource = readFileSync('src/i18n/messages/zh-CN.ts', 'utf8')
const enMessagesSource = readFileSync('src/i18n/messages/en-US.ts', 'utf8')
const docsFeaturesSource = readFileSync('docs/features.md', 'utf8')

test('SCM regressions', async (t) => {
  await t.test('Commit All stages untracked files before committing', () => {
    assert.match(gitServiceSource, /if \(opts\.all\) await g\.add\(\['-A'\]\)/)
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

  await t.test('workspace watcher classifies selected Git metadata for complete SCM refresh', () => {
    assert.match(filteringSource, /GIT_METADATA_RELATIVE_PATHS/)
    assert.match(filteringSource, /'\.git\/packed-refs'/)
    assert.match(filteringSource, /normalizedPath\.startsWith\('\.git\/refs\/'\)/)
    assert.match(appSource, /isGitMetadataChange/)
    assert.match(appSource, /gitStore\.handleMutation\(\{ root: currentFolder\.value, kind \}\)/)
    assert.match(appSource, /workspaceRelativePath\.startsWith\('\.git\/refs\/tags\/'\)/)
    assert.match(appSource, /void gitStore\.refresh\(\)/)
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

  await t.test('SCM status indicators use the Explorer muted Git colors', () => {
    const mutedColorMix = /color-mix\(in oklab, var\(--color-\$\{tone\}\) 50%, transparent\)/

    assert.match(explorerSource, mutedColorMix)
    assert.match(groupSource, mutedColorMix)
    assert.match(groupSource, /:style="dirDotStyle\(row\.files \?\? \[\]\)"/)
    assert.match(groupSource, /:style="statusStyle\(row\.file!\.status\)"/)
  })

  await t.test('Agent git tools share the application GitService instead of spawning git directly', () => {
    assert.doesNotMatch(gitToolsSource, /child_process|execFile\(|spawn\(/)
    assert.match(gitToolsSource, /gitService: GitService/)
    assert.match(gitToolsSource, /gitService\.commitPaths/)
    assert.match(gitToolsSource, /gitService\.restorePaths/)
    assert.match(agentEngineSource, /private readonly gitService: GitService/)
    assert.match(mainAppSource, /new AgentEngineClass\([\s\S]*this\.gitService/)
  })

  await t.test('Agent Git mutations explicitly refresh the affected SCM views', () => {
    assert.match(gitTypesSource, /export type GitMutationKind = 'repository' \| 'working-tree' \| 'history' \| 'tags'/)
    assert.match(gitToolsSource, /onMutation: \(event: GitMutationEvent\) => void/)
    assert.match(gitToolsSource, /notifyMutation\(workspacePath, 'repository'\)/)
    assert.match(gitToolsSource, /notifyMutation\(workspacePath, 'history'\)/)
    assert.match(gitToolsSource, /notifyMutation\(workspacePath, 'tags'\)/)
    assert.match(gitToolsSource, /notifyMutation\(workspacePath, 'working-tree'\)/)
    assert.match(agentEngineSource, /sendGitMutation\(event\)/)
    assert.match(rendererEventBridgeSource, /send\('git:mutation', event\)/)
    assert.match(preloadSource, /ipcRenderer\.on\('git:mutation', listener\)/)
    assert.match(gitStoreSource, /async function handleMutation\(event: GitMutationEvent\)/)
    assert.match(gitStoreSource, /event\.kind === 'repository' \|\| !isRepo\.value/)
    assert.match(gitStoreSource, /await loadGraph\(\)/)
    assert.match(gitStoreSource, /if \(event\.kind === 'tags'\) await loadTags\(\)/)
  })

  await t.test('changing the Git executable keeps in-flight repository queues serialized', () => {
    const updateSettings = gitServiceSource.slice(
      gitServiceSource.indexOf('updateSettings('),
      gitServiceSource.indexOf('setProgressHandler('),
    )
    assert.match(updateSettings, /this\.cache\.clear\(\)/)
    assert.doesNotMatch(updateSettings, /this\.dispose\(\)/)
  })

  await t.test('pull and fetch behavior is driven by shared source-control settings', () => {
    assert.match(gitServiceSource, /settings\.pullAutoStash \? '--autostash' : '--no-autostash'/)
    assert.match(gitServiceSource, /settings\.fetchPrune \? '--prune' : '--no-prune'/)
    assert.match(gitServiceSource, /'--no-rebase'/)
    assert.doesNotMatch(gitStoreSource, /const pull = \(rebase/)
    assert.doesNotMatch(gitStoreSource, /const sync = \(rebase/)
  })

  await t.test('source-control preferences own SCM behavior while gitignore filtering stays in Workspace', () => {
    assert.match(preferencesSource, /activeTab === 'sourceControl'/)
    assert.match(preferencesSource, /SourceControlPreferencesPanel/)
    assert.match(preferencesSource, /preferences\.workspace\.useGitignoreExplorerTitle/)
    assert.match(sourceControlPreferencesSource, /pullAutoStash/)
    assert.match(sourceControlPreferencesSource, /fetchPrune/)
    assert.match(sourceControlPreferencesSource, /identityGetScopes/)
    assert.doesNotMatch(sourceControlPreferencesSource, /status.?bar/i)
  })

  await t.test('source-control settings have no pre-1.0 legacy migration path', () => {
    const configurationSources = [
      gitTypesSource,
      gitStoreSource,
      gitConfigStoreSource,
      editSettingSource,
      stateStorageSource,
    ].join('\n')
    assert.doesNotMatch(configurationSources, /legacyMigrationCompleted/)
    assert.doesNotMatch(editSettingSource, /commitWhenEmpty/)
    assert.doesNotMatch(stateStorageSource, /scmRepositories|scmGraph/)
    assert.doesNotMatch(gitStoreSource, /StateStorage/)
  })

  await t.test('SCM and diff view defaults stay synchronized with source-control settings', () => {
    assert.match(panelSource, /gitStore\.settings\.commitWhenEmpty/)
    assert.match(panelSource, /gitStore\.settings\.changesLayout/)
    assert.match(panelSource, /gitStore\.settings\.showRepositories/)
    assert.match(diffPageSource, /:initial-mode="gitStore\.settings\.diffLayout"/)
    assert.match(diffPageSource, /:initial-show-line-numbers="gitStore\.settings\.diffShowLineNumbers"/)
    assert.match(diffViewSource, /initialShowLineNumbers/)
  })

  await t.test('product language is writer-facing in both locales and user documentation', () => {
    assert.match(zhMessagesSource, /sourceControl: '文档版本管理'/)
    assert.match(zhMessagesSource, /edit: '日常写作搭子'/)
    assert.match(zhMessagesSource, /creative: '小说创作搭子'/)
    assert.match(enMessagesSource, /sourceControl: 'Document Versioning'/)
    assert.match(enMessagesSource, /edit: 'AI Doc Buddy'/)
    assert.match(enMessagesSource, /creative: 'AI Story Buddy'/)
    assert.doesNotMatch(zhMessagesSource, /title: '源代码管理'/)
    assert.doesNotMatch(enMessagesSource, /title: 'Source Control'/)
    assert.match(docsFeaturesSource, /AI 全能创作搭子（AI Writing Buddy）/)
    assert.match(docsFeaturesSource, /Git 文档版本管理/)
  })

})
