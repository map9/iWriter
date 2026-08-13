import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { build } from 'esbuild'

const gitServiceSource = readFileSync('electron/GitService.ts', 'utf8')
const mainAppSource = readFileSync('electron/App.ts', 'utf8')
const appSource = readFileSync('src/stores/app.ts', 'utf8')
const panelSource = readFileSync('src/components/sidebar/SourceControlPanel.vue', 'utf8')
const groupSource = readFileSync('src/components/sidebar/scm/GitChangeGroup.vue', 'utf8')
const diffPageSource = readFileSync('src/components/pages/DiffViewerPage.vue', 'utf8')
const filteringSource = readFileSync('shared/workspace/filtering.ts', 'utf8')
const gitStoreSource = readFileSync('src/stores/git.ts', 'utf8')
const gitTypesSource = readFileSync('shared/git/types.ts', 'utf8')
const leftSidebarSource = readFileSync('src/components/LeftSidebar.vue', 'utf8')
const explorerSource = readFileSync('src/components/sidebar/ExplorerPanel.vue', 'utf8')
const gitToolsSource = readFileSync('electron/ai/tools/common/GitTools.ts', 'utf8')
const creativeCapabilitiesSource = readFileSync('electron/ai/domain/creative/buildCreativeCapabilities.ts', 'utf8')
const agentEngineSource = readFileSync('electron/ai/AgentEngine.ts', 'utf8')
const creativeReviewAdapterSource = readFileSync('electron/ai/ipc/CreativeReviewAdapter.ts', 'utf8')
const rendererEventBridgeSource = readFileSync('electron/ai/ipc/RendererEventBridge.ts', 'utf8')
const preloadSource = readFileSync('electron/preload.ts', 'utf8')
const preferencesSource = readFileSync('src/components/preferences/PreferencesDialog.vue', 'utf8')
const sourceControlPreferencesSource = readFileSync('src/components/preferences/SourceControlPreferencesPanel.vue', 'utf8')
const exportPreferencesSource = readFileSync('src/components/preferences/ExportPreferencesPanel.vue', 'utf8')
const diffViewSource = readFileSync('src/components/common/diff/DiffView.vue', 'utf8')
const gitConfigStoreSource = readFileSync('electron/GitConfigStore.ts', 'utf8')
const editSettingSource = readFileSync('src/types/edit-setting.ts', 'utf8')
const stateStorageSource = readFileSync('src/utils/StateStorage.ts', 'utf8')
const aiReviewContractSource = readFileSync('shared/ai/contracts/review.ts', 'utf8')
const aiToolContractSource = readFileSync('shared/ai/contracts/tool.ts', 'utf8')
const displayNormalizerSource = readFileSync('src/ai/message/display-normalizer.ts', 'utf8')
const creativeReviewSurfaceSource = readFileSync('src/ai/components/agent-panel/domains/creative/CreativeReviewSurface.vue', 'utf8')
const zhMessagesSource = readFileSync('src/i18n/messages/zh-CN.ts', 'utf8')
const enMessagesSource = readFileSync('src/i18n/messages/en-US.ts', 'utf8')
const docsFeaturesSource = readFileSync('docs/features.md', 'utf8')
const creativeModeDocsSource = readFileSync('docs/docs/ai-creative-mode.md', 'utf8')

test('SCM regressions', async (t) => {
  await t.test('Commit All stages untracked files before committing', () => {
    assert.match(gitServiceSource, /if \(opts\.all\) await g\.add\(\['-A'\]\)/)
    assert.doesNotMatch(gitServiceSource, /if \(opts\.all\) args\.push\('-a'\)/)
  })

  await t.test('remote checkout preserves tracking semantics', () => {
    assert.match(panelSource, /co-remote:/)
    assert.match(panelSource, /gitStore\.checkout\(ref, \{ track: true \}\)/)
    assert.match(gitServiceSource, /if \(opts\?\.track\) args\.push\('--track'\)/)
    assert.match(gitStoreSource, /promptDirtyCheckout\(ref_, opts, preflight\.value\.hasConflicts\)/)
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

  await t.test('Windows workspace watching does not load the Parcel native addon', () => {
    assert.doesNotMatch(mainAppSource, /^import .*@parcel\/watcher/m)
    assert.match(mainAppSource, /const \{ default: parcelWatcher \} = await import\('@parcel\/watcher'\)/)
    assert.match(mainAppSource, /if \(process\.platform === 'win32'\)[\s\S]*startWindowsRecursiveWatcher/)
    assert.match(mainAppSource, /fs\.watch\(root, \{ persistent: true, recursive: true \}/)
  })

  await t.test('Git recheck bypasses an unavailable detection cache', () => {
    assert.match(gitServiceSource, /async detect\(force = false, candidatePath\?: string \| null\)/)
    assert.match(gitServiceSource, /if \(detectsConfiguredPath && !force && this\.availability\)/)
    assert.match(gitServiceSource, /this\.availability = result/)
    assert.match(panelSource, /git\.detect\(true\)/)
  })

  await t.test('Git recheck finds a newly installed executable without restarting', () => {
    assert.match(gitServiceSource, /private detectedBinaryPath: string \| null = null/)
    assert.match(gitServiceSource, /this\.detectedBinaryPath \?\? 'git'/)
    assert.match(gitServiceSource, /getAutoDetectionCandidates\(binary\)/)
    assert.match(gitServiceSource, /path\.join\(base, 'Git', 'cmd', 'git\.exe'\)/)
    assert.match(gitServiceSource, /'\/opt\/homebrew\/bin\/git'/)
    assert.match(gitServiceSource, /this\.detectedBinaryPath = nextDetectedPath/)
  })

  await t.test('Git install guide renders only one recheck action at a time', () => {
    assert.match(panelSource, /v-if="!showInstallSteps"[^>]*@click="recheck"/)
    assert.match(panelSource, /:disabled="rechecking"/)
    assert.match(panelSource, /loading loading-spinner loading-xs/)
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
    assert.doesNotMatch(mergeFlow, /Automatic merge failed|fix conflicts/)
    assert.doesNotMatch(stashPopFlow, /\/conflict\|CONFLICT/)
  })

  await t.test('repository initialization uses the SCM store error path', () => {
    assert.match(gitStoreSource, /async function initRepo\(\)/)
    assert.match(gitStoreSource, /operation: 'init'/)
    assert.match(panelSource, /await gitStore\.initRepo\(\)/)
    assert.doesNotMatch(panelSource, /window\.electronAPI\.git\.init\(appStore\.currentFolder\)/)
  })

  await t.test('empty repository history ignores localized Git error text', async () => {
    const { GitService, GitServiceError } = await loadGitServiceModule()
    const gitService = new GitService()

    gitService.raw = async (_root, args) => {
      if (args[0] === 'log') {
        throw new GitServiceError('command-failed', "致命错误：您的当前分支 'master' 尚无任何提交")
      }
      if (args[0] === 'status') {
        return '# branch.oid (initial)\n# branch.head master'
      }
      throw new Error(`Unexpected Git command: ${args.join(' ')}`)
    }

    assert.deepEqual(
      await gitService.log('/workspace', { filePath: 'chapter.md', limit: 50 }),
      [],
    )
  })

  await t.test('SCM preflights fail closed and inspect repository state before writes', async () => {
    const { GitService } = await loadGitServiceModule()
    const workspacePath = mkdtempSync(join(tmpdir(), 'iwriter-git-preflight-'))
    try {
      execFileSync('git', ['init', '-q'], { cwd: workspacePath })
      execFileSync('git', ['config', 'user.name', 'iWriter Test'], { cwd: workspacePath })
      execFileSync('git', ['config', 'user.email', 'test@iwriter.local'], { cwd: workspacePath })
      writeFileSync(join(workspacePath, 'chapter.md'), 'base\n')
      execFileSync('git', ['add', 'chapter.md'], { cwd: workspacePath })
      execFileSync('git', ['commit', '-qm', 'base'], { cwd: workspacePath })
      execFileSync('git', ['branch', 'draft'], { cwd: workspacePath })

      const gitService = new GitService()
      const merge = await gitService.preflightMerge(workspacePath, 'draft')
      assert.equal(merge.ok, true)
      assert.equal(merge.value.upToDate, true)

      writeFileSync(join(workspacePath, 'chapter.md'), 'working change\n')

      const checkout = await gitService.preflightCheckout(workspacePath, 'draft')
      assert.equal(checkout.ok, true)
      assert.equal(checkout.value.dirty, true)

      const deletion = await gitService.preflightDeleteBranch(workspacePath, 'draft')
      assert.equal(deletion.ok, true)
      assert.equal(deletion.value.hasUpstream, false)
      assert.equal(deletion.value.forceRequired, false)

      const missingDelete = await gitService.preflightDeleteBranch(workspacePath, 'missing')
      assert.equal(missingDelete.ok, false)

      const missingMerge = await gitService.preflightMerge(workspacePath, 'missing')
      assert.equal(missingMerge.ok, false)
    } finally {
      rmSync(workspacePath, { recursive: true, force: true })
    }
  })

  await t.test('merge conflicts are reported from status instead of localized stderr', async () => {
    const { GitService } = await loadGitServiceModule()
    const workspacePath = mkdtempSync(join(tmpdir(), 'iwriter-git-merge-conflict-'))
    try {
      execFileSync('git', ['init', '-q'], { cwd: workspacePath })
      execFileSync('git', ['config', 'user.name', 'iWriter Test'], { cwd: workspacePath })
      execFileSync('git', ['config', 'user.email', 'test@iwriter.local'], { cwd: workspacePath })
      writeFileSync(join(workspacePath, 'chapter.md'), 'base\n')
      execFileSync('git', ['add', 'chapter.md'], { cwd: workspacePath })
      execFileSync('git', ['commit', '-qm', 'base'], { cwd: workspacePath })
      execFileSync('git', ['checkout', '-qb', 'draft'], { cwd: workspacePath })
      writeFileSync(join(workspacePath, 'chapter.md'), 'draft\n')
      execFileSync('git', ['commit', '-qam', 'draft'], { cwd: workspacePath })
      execFileSync('git', ['checkout', '-q', 'master'], { cwd: workspacePath })
      writeFileSync(join(workspacePath, 'chapter.md'), 'main\n')
      execFileSync('git', ['commit', '-qam', 'main'], { cwd: workspacePath })

      const gitService = new GitService()
      assert.deepEqual(await gitService.merge(workspacePath, 'draft'), { conflicted: true })
      assert.equal((await gitService.status(workspacePath)).conflicts.length, 1)
    } finally {
      rmSync(workspacePath, { recursive: true, force: true })
    }
  })

  await t.test('a clean merge commit failure is not mislabeled as a conflict', async () => {
    const { GitService } = await loadGitServiceModule()
    const workspacePath = mkdtempSync(join(tmpdir(), 'iwriter-git-merge-failure-'))
    try {
      execFileSync('git', ['init', '-q'], { cwd: workspacePath })
      execFileSync('git', ['config', 'user.name', 'iWriter Test'], { cwd: workspacePath })
      execFileSync('git', ['config', 'user.email', 'test@iwriter.local'], { cwd: workspacePath })
      writeFileSync(join(workspacePath, 'base.md'), 'base\n')
      execFileSync('git', ['add', '.'], { cwd: workspacePath })
      execFileSync('git', ['commit', '-qm', 'base'], { cwd: workspacePath })
      execFileSync('git', ['checkout', '-qb', 'draft'], { cwd: workspacePath })
      writeFileSync(join(workspacePath, 'draft.md'), 'draft\n')
      execFileSync('git', ['add', '.'], { cwd: workspacePath })
      execFileSync('git', ['commit', '-qm', 'draft'], { cwd: workspacePath })
      execFileSync('git', ['checkout', '-q', 'master'], { cwd: workspacePath })
      writeFileSync(join(workspacePath, 'main.md'), 'main\n')
      execFileSync('git', ['add', '.'], { cwd: workspacePath })
      execFileSync('git', ['commit', '-qm', 'main'], { cwd: workspacePath })
      writeFileSync(
        join(workspacePath, '.git', 'hooks', 'pre-merge-commit'),
        '#!/bin/sh\nexit 1\n',
        { mode: 0o755 },
      )

      await assert.rejects(new GitService().merge(workspacePath, 'draft'))
    } finally {
      rmSync(workspacePath, { recursive: true, force: true })
    }
  })

  await t.test('SCM status indicators use the Explorer muted Git colors', () => {
    const mutedColorMix = /color-mix\(in oklab, var\(--color-\$\{tone\}\) 50%, transparent\)/

    assert.match(explorerSource, mutedColorMix)
    assert.match(groupSource, mutedColorMix)
    assert.match(groupSource, /:style="dirDotStyle\(row\.files \?\? \[\]\)"/)
    assert.match(groupSource, /:style="statusStyle\(row\.file!\.status\)"/)
  })

  await t.test('Agent exposes one raw Git tool through the application GitService', () => {
    assert.doesNotMatch(gitToolsSource, /child_process|execFile\(|spawn\(/)
    assert.match(gitToolsSource, /gitService: GitService/)
    assert.match(gitToolsSource, /name: 'git'/)
    assert.doesNotMatch(gitToolsSource, /name: 'git_(read|write)'/)
    assert.match(gitToolsSource, /gitService\.runCommand/)
    assert.match(agentEngineSource, /private readonly gitService: GitService/)
    assert.match(mainAppSource, /new AgentEngineClass\([\s\S]*this\.gitService/)
    assert.match(creativeCapabilitiesSource, /git: \{[\s\S]*when:/)
  })

  await t.test('Agent Git policy dynamically approves writes and blocks unsafe read helpers', async () => {
    const { classifyGitCommand, shouldInterruptGit } = await loadGitToolsModule()

    assert.equal(classifyGitCommand(['status', '--short']).kind, 'read')
    assert.equal(shouldInterruptGit(['status', '--short']), false)
    assert.equal(classifyGitCommand(['add', '.']).kind, 'write')
    assert.equal(shouldInterruptGit(['add', '.']), true)
    assert.equal(classifyGitCommand(['diff', '--output=changes.patch']).kind, 'write')
    assert.equal(shouldInterruptGit(['diff', '--output=changes.patch']), true)
    assert.equal(classifyGitCommand(['diff', '--output=/tmp/changes.patch']).kind, 'invalid')
    assert.equal(classifyGitCommand(['diff', '--ext-diff']).kind, 'invalid')
    assert.equal(classifyGitCommand(['grep', '-Oless', 'secret']).kind, 'invalid')
    assert.equal(shouldInterruptGit(['grep', '-Oless', 'secret']), false)
    assert.equal(classifyGitCommand(['grep', '--no-index', '.', './../secret']).kind, 'invalid')
    assert.equal(classifyGitCommand(['blame', '--contents=./../secret', 'chapter.md']).kind, 'invalid')
    assert.equal(classifyGitCommand(['grep', '-f', 'patterns.txt', 'chapter.md']).kind, 'write')
    assert.equal(classifyGitCommand(['ls-files', '--exclude-from=patterns.txt']).kind, 'write')
  })

  await t.test('Agent Git approval contract contains only the unified git tool and review kind', () => {
    const contractSource = [
      creativeCapabilitiesSource,
      agentEngineSource,
      creativeReviewAdapterSource,
      aiReviewContractSource,
      creativeReviewSurfaceSource,
    ].join('\n')

    for (const retiredName of ['git_write', 'git_init', 'git_commit', 'git_tag', 'git_restore']) {
      assert.doesNotMatch(contractSource, new RegExp(`\\b${retiredName}\\b`))
    }
    for (const retiredKind of [
      'creative_git_command',
      'creative_git_init',
      'creative_git_commit',
      'creative_git_tag',
      'creative_git_restore',
    ]) {
      assert.doesNotMatch(contractSource, new RegExp(`\\b${retiredKind}\\b`))
    }
    assert.match(aiReviewContractSource, /kind: 'creative_git'/)
    assert.match(aiReviewContractSource, /toolName: 'git'/)
    assert.match(creativeCapabilitiesSource, /CREATIVE_INTERRUPT_ON_NAMES = new Set\(Object\.keys\(CREATIVE_INTERRUPT_ON_CONFIG\)\)/)
    assert.doesNotMatch(creativeModeDocsSource, /\bgit_(?:write|init|commit|tag|restore)\b/)
    assert.match(creativeModeDocsSource, /`git\(args\)`/)
  })

  await t.test('retired creative tools are absent from renderer metadata', () => {
    const metadataSource = [aiToolContractSource, displayNormalizerSource, zhMessagesSource, enMessagesSource].join('\n')
    const retiredNames = [
      'read_storybible', 'read_fragments', 'list_chapters', 'get_session_diff',
      'get_storybible_rebuild_signal', 'read_chapter', 'write_to_chapter',
      'advise_directions', 'analyze_story_architecture', 'search_draft',
      'get_character_psychology', 'add_fragment', 'patch_storybible',
      'resolve_open_question', 'compress_storybible_history', 'list_explorations',
      'start_exploration', 'read_exploration', 'write_exploration_draft',
      'finish_exploration', 'promote_exploration', 'delete_exploration',
      'create_chapter', 'delete_chapter', 'rename_chapter', 'reorder_chapters',
      'replace_storybible_section', 'rebuild_storybible',
      'list_writing_styles', 'get_writing_style', 'save_writing_style_skill',
      'create_writing_style', 'update_writing_style', 'delete_writing_style',
      'WritingStyleExtractor', 'WritingStyleSkillCreator',
    ]

    for (const retiredName of retiredNames) {
      assert.doesNotMatch(metadataSource, new RegExp(`\\b${retiredName}\\b`))
    }
    assert.equal(existsSync('src/ai/review/domains/creative/creative.ts'), false)
    assert.doesNotMatch(enMessagesSource, /explorer: 'Explorer'/)
    assert.doesNotMatch(zhMessagesSource, /explorer: '探索器'/)
    assert.match(enMessagesSource, /writer: 'Writer'[\s\S]*reviewer: 'Reviewer'/)
    assert.match(zhMessagesSource, /writer: '写作者'[\s\S]*reviewer: '审校者'/)
  })

  await t.test('Agent Git mutations explicitly refresh the affected SCM views', () => {
    assert.match(gitTypesSource, /export type GitMutationKind = 'repository' \| 'working-tree' \| 'history' \| 'tags'/)
    assert.match(gitToolsSource, /onMutation: \(event: GitMutationEvent\) => void/)
    assert.match(gitToolsSource, /options\.onMutation\(\{ root: workspacePath, kind: mutationKind\(args\[0\]!\) \}\)/)
    assert.match(agentEngineSource, /sendGitMutation\(event\)/)
    assert.match(rendererEventBridgeSource, /send\('git:mutation', event\)/)
    assert.match(preloadSource, /ipcRenderer\.on\('git:mutation', listener\)/)
    assert.match(gitStoreSource, /async function handleMutation\(event: GitMutationEvent\)/)
    assert.match(gitStoreSource, /event\.kind === 'repository' \|\| !isRepo\.value/)
    assert.match(gitStoreSource, /await loadGraph\(\)/)
    assert.match(gitStoreSource, /if \(event\.kind === 'tags'\) await loadTags\(\)/)
  })

  await t.test('raw Agent Git commands return exit status and both output streams', async () => {
    const { GitService } = await loadGitServiceModule()
    const workspacePath = mkdtempSync(join(tmpdir(), 'iwriter-agent-git-'))
    try {
      const gitService = new GitService()
      const init = await gitService.runCommand(workspacePath, ['init', '-q'])
      assert.equal(init.ok, true)
      assert.equal(init.exitCode, 0)

      const failure = await gitService.runCommand(workspacePath, ['rev-parse', '--verify', 'missing-ref'])
      assert.equal(failure.ok, false)
      assert.notEqual(failure.exitCode, 0)
      assert.equal(typeof failure.stdout, 'string')
      assert.equal(typeof failure.stderr, 'string')
      assert.ok(failure.stderr.length > 0)
    } finally {
      rmSync(workspacePath, { recursive: true, force: true })
    }
  })

  await t.test('auto-approved Git reads do not execute repository-configured diff helpers', async () => {
    const { GitService } = await loadGitServiceModule()
    const workspacePath = mkdtempSync(join(tmpdir(), 'iwriter-git-read-hardening-'))
    try {
      execFileSync('git', ['init', '-q'], { cwd: workspacePath })
      execFileSync('git', ['config', 'user.name', 'iWriter Test'], { cwd: workspacePath })
      execFileSync('git', ['config', 'user.email', 'test@iwriter.local'], { cwd: workspacePath })
      writeFileSync(join(workspacePath, 'chapter.md'), 'old\n')
      execFileSync('git', ['add', '.'], { cwd: workspacePath })
      execFileSync('git', ['commit', '-qm', 'base'], { cwd: workspacePath })
      writeFileSync(join(workspacePath, 'chapter.md'), 'new\n')

      const markerPath = join(workspacePath, 'external-diff-ran')
      const helperPath = join(workspacePath, 'external-diff.sh')
      writeFileSync(helperPath, `#!/bin/sh\nprintf invoked > "${markerPath}"\n`, { mode: 0o755 })
      execFileSync('git', ['config', 'diff.external', helperPath], { cwd: workspacePath })

      const result = await new GitService().runCommand(workspacePath, ['diff'], { readOnly: true })

      assert.equal(result.ok, true)
      assert.equal(existsSync(markerPath), false)
    } finally {
      rmSync(workspacePath, { recursive: true, force: true })
    }
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

  await t.test('source-control identity preferences make global inheritance explicit', () => {
    assert.match(sourceControlPreferencesSource, /localIdentityUseGlobal/)
    assert.match(sourceControlPreferencesSource, /identityClearLocal/)
    assert.match(sourceControlPreferencesSource, /@change="saveGlobalIdentity"/)
    assert.match(sourceControlPreferencesSource, /@change="saveLocalIdentity"/)
    assert.doesNotMatch(sourceControlPreferencesSource, /sourceControl\.identity\.save/)
    assert.doesNotMatch(sourceControlPreferencesSource, /identityAutoSaveDesc/)
  })

  await t.test('workspace preferences use independent setting rows', () => {
    const workspacePreferences = preferencesSource.slice(
      preferencesSource.indexOf("activeTab === 'workspace'"),
      preferencesSource.indexOf("activeTab === 'sourceControl'"),
    )
    assert.match(
      workspacePreferences,
      /useGitignoreTitle[\s\S]*useGitignoreExplorerTitle[\s\S]*useGitignoreSearchTitle[\s\S]*useGitignoreWatcherTitle[\s\S]*workspaceIgnoreRulesTitle/,
    )
    assert.equal(
      workspacePreferences.match(/rounded-box border border-base-300 bg-base-100 px-4 py-3/g)?.length,
      3,
    )
  })

  await t.test('diff and document-version preferences use grouped vertical rows', () => {
    const diffPreferences = sourceControlPreferencesSource.slice(
      sourceControlPreferencesSource.indexOf("preferences.sourceControl.diffTitle"),
      sourceControlPreferencesSource.indexOf("preferences.sourceControl.viewsTitle"),
    )
    const viewPreferences = sourceControlPreferencesSource.slice(
      sourceControlPreferencesSource.indexOf("preferences.sourceControl.viewsTitle"),
      sourceControlPreferencesSource.indexOf('</template>'),
    )
    assert.match(diffPreferences, /flex flex-col gap-3/)
    assert.match(
      viewPreferences,
      /changesViewTitle[\s\S]*showRepositoriesTitle[\s\S]*changesLayoutTitle[\s\S]*graphViewTitle[\s\S]*showGraphTitle[\s\S]*graphFilesLayoutTitle/,
    )
  })

  await t.test('tool path preferences apply only successfully detected candidates', () => {
    assert.match(sourceControlPreferencesSource, /git\.detect\(true, candidatePath \|\| null\)/)
    assert.match(sourceControlPreferencesSource, /if \(!availability\.available\)/)
    assert.match(sourceControlPreferencesSource, /loading loading-spinner loading-xs/)
    assert.match(exportPreferencesSource, /pandocCheck/)
    assert.match(exportPreferencesSource, /officeCheck/)
    assert.match(exportPreferencesSource, /pandocDetecting/)
    assert.match(exportPreferencesSource, /libreOfficeDetecting/)
    assert.match(exportPreferencesSource, /loading loading-spinner loading-xs/)
    assert.doesNotMatch(exportPreferencesSource, /handlePandocPathInput|handleLibreOfficePathInput/)
  })

  await t.test('tool path help icons open official websites', () => {
    assert.match(sourceControlPreferencesSource, /IconHelpCircle/)
    assert.match(sourceControlPreferencesSource, /https:\/\/git-scm\.com\/downloads/)
    assert.match(exportPreferencesSource, /IconHelpCircle/)
    assert.match(exportPreferencesSource, /https:\/\/pandoc\.org\/installing\.html/)
    assert.match(exportPreferencesSource, /https:\/\/www\.libreoffice\.org\/download\//)
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

let creativeGitReviewModulePromise

let gitToolsModulePromise

async function loadGitToolsModule() {
  if (!gitToolsModulePromise) {
    gitToolsModulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/tools/common/GitTools.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return gitToolsModulePromise
}

async function loadCreativeGitReviewModule() {
  if (!creativeGitReviewModulePromise) {
    creativeGitReviewModulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/ai/ipc/CreativeReviewAdapter.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return creativeGitReviewModulePromise
}

let gitServiceModulePromise

async function loadGitServiceModule() {
  if (!gitServiceModulePromise) {
    gitServiceModulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/GitService.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        banner: {
          js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(process.cwd() + '/tests/scm-regressions.test.mjs');",
        },
        plugins: [{
          name: 'git-config-store-stub',
          setup(buildApi) {
            buildApi.onResolve({ filter: /GitConfigStore$/ }, () => ({
              path: 'git-config-store',
              namespace: 'test-stub',
            }))
            buildApi.onLoad({ filter: /^git-config-store$/, namespace: 'test-stub' }, () => ({
              contents: `
                export class GitConfigStore {
                  getSettings() { return { gitPathMode: 'auto', gitPath: '' } }
                  updateSettings(patch) { return { ...this.getSettings(), ...patch } }
                }
              `,
              loader: 'js',
            }))
          },
        }],
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return gitServiceModulePromise
}

test('Git approval cards receive factual operation details', async (t) => {
  await t.test('raw Git approval preserves the exact argv including whitespace', async () => {
    const { buildCreativeReviewItemFromAction } = await loadCreativeGitReviewModule()
    const review = buildCreativeReviewItemFromAction({
      name: 'git',
      args: { args: ['commit', '--allow-empty-message', '-m', ' '] },
    })

    assert.equal(review.kind, 'creative_git')
    assert.equal(review.toolName, 'git')
    assert.deepEqual(review.args, ['commit', '--allow-empty-message', '-m', ' '])
  })

  await t.test('retired Git tool names are rejected by the approval adapter', async () => {
    const { buildCreativeReviewItemFromAction } = await loadCreativeGitReviewModule()
    assert.throws(
      () => buildCreativeReviewItemFromAction({
        name: 'git_write',
        args: { args: ['commit', '-m', 'legacy'] },
      }),
      /unexpected creative tool name/,
    )
  })
})
