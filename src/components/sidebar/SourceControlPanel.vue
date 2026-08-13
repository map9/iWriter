<template>
  <div class="h-full flex flex-col">
    <!-- 容器标题栏 -->
    <div class="flex h-10 shrink-0 items-center justify-between bg-base-200 px-2 select-none">
      <span class="text-sm font-semibold text-base-content uppercase whitespace-nowrap block w-full truncate">{{ t('sourceControl.title') }}</span>
      <div class="flex shrink-0 items-center gap-1">
        <button
          v-if="gitStore.isRepo && gitStore.branch?.upstream"
          class="btn btn-ghost btn-square btn-xs"
          :title="t('sourceControl.remote.sync')"
          :disabled="!!gitStore.busy"
          @click="gitStore.sync()"
        >
          <IconRefresh class="icon-xs" :class="{ 'animate-spin': gitStore.busy === 'sync' }" />
        </button>
        <button
          v-if="gitStore.isRepo"
          class="btn btn-ghost btn-square btn-xs"
          :title="t('explorer.collapseAll')"
          @click="gitStore.refresh()"
        >
          <IconReload class="icon-xs" :class="{ 'animate-spin': gitStore.loading }" />
        </button>
        <button
          class="btn btn-ghost btn-square btn-xs"
          :title="t('sourceControl.moreActions')"
          @click="showScmViewMenu"
        >
          <IconDots class="icon-xs" />
        </button>
      </div>
    </div>

    <!-- 长耗时操作（clone/pull/push）进度条 -->
    <div v-if="gitStore.busy && gitStore.progress" class="shrink-0 border-b border-base-300 px-2 py-1">
      <div class="mb-0.5 flex items-center justify-between text-2xs text-base-content/60">
        <span class="truncate">{{ busyLabel }} · {{ gitStore.progress.stage }}</span>
        <span class="shrink-0 tabular-nums">{{ Math.round(gitStore.progress.progress) }}%</span>
      </div>
      <progress class="progress progress-primary h-1 w-full" :value="gitStore.progress.progress" max="100"></progress>
    </div>

    <!-- 状态 A：无可用工作区（未打开或已被外部删除）— ui/panel.html .guide -->
    <div v-if="!appStore.isWorkspaceAvailable" class="flex flex-1 flex-col items-center px-4 pt-7 text-center">
      <IconFolder class="mb-3 size-11 text-base-content/40" />
      <p class="mb-4 max-w-60 text-xs text-base-content/60">{{ t('sourceControl.noWorkspace') }}</p>
      <div class="flex w-full flex-col gap-2">
        <button class="btn btn-primary h-9 w-full" @click="appStore.openFolder()">
          <IconFolder class="icon-sm" /><span>{{ t('explorer.openFolder') }}</span>
        </button>
        <button v-if="gitStore.availability.available" class="btn btn-ghost h-9 w-full" @click="gitStore.cloneDialogOpen = true">
          <IconGitBranch class="icon-sm" /><span>{{ t('sourceControl.cloneRepo') }}</span>
        </button>
      </div>
    </div>

    <!-- 状态 B：正在打开工作区 -->
    <div v-else-if="appStore.isWorkspaceOpening" class="p-3 text-left text-xs text-base-content/50 flex flex-1 flex-col items-center justify-center gap-2">
      <span class="loading loading-spinner loading-sm"></span>
      <span>{{ t('sourceControl.workspaceLoading') }}</span>
    </div>

    <!-- 状态 C：未检测到 Git（安装引导）— ui/panel.html .guide + .steps -->
    <div v-else-if="!gitStore.availability.available" class="flex flex-1 flex-col items-center px-4 pt-7 text-center">
      <IconAlertTriangle class="mb-3 size-11 text-warning" />
      <h3 class="mb-1 text-sm font-semibold">{{ t('sourceControl.gitNotFound') }}</h3>
      <p class="mb-4 max-w-60 text-xs text-base-content/60">{{ t('sourceControl.gitNotFoundDesc') }}</p>
      <div class="flex w-full flex-col gap-2">
        <button class="btn btn-primary h-9 w-full" @click="showInstallSteps = !showInstallSteps">
          <IconDownload class="icon-sm" /><span>{{ t('sourceControl.installGit') }}</span>
        </button>
        <button v-if="!showInstallSteps" class="btn btn-ghost h-9 w-full" :disabled="rechecking" @click="recheck">
          <span v-if="rechecking" class="loading loading-spinner loading-sm"></span>
          <IconRefresh v-else class="icon-sm" /><span>{{ t('sourceControl.recheck') }}</span>
        </button>
      </div>
      <div v-if="showInstallSteps" class="mt-4 w-full rounded-box border border-base-300 bg-base-200 p-3 text-left">
        <h4 class="mb-2 text-xs font-semibold">{{ t('sourceControl.installStepsTitle') }}</h4>
        <div v-if="gitStore.availability.installCommand" class="mb-2 flex items-center gap-1.5">
          <code class="flex-1 break-all rounded-box bg-base-300 px-2 py-1 font-mono text-2xs">{{ gitStore.availability.installCommand }}</code>
          <button class="btn btn-ghost btn-square btn-xs shrink-0" @click="copyInstallCommand">
            <IconCheck v-if="installCopied" class="icon-2xs text-success" /><IconCopy v-else class="icon-2xs" />
          </button>
        </div>
        <button class="mb-2 flex items-center gap-1 text-xs text-primary hover:underline" @click="openGitDownload">
          <IconExternalLink class="icon-2xs" /><span>{{ t('sourceControl.installDownload') }}</span>
        </button>
        <p class="mb-2.5 text-2xs text-base-content/50">{{ t('sourceControl.installNote') }}</p>
        <button class="btn btn-primary btn-sm h-8 w-full" :disabled="rechecking" @click="recheck">
          <span v-if="rechecking" class="loading loading-spinner loading-xs"></span>
          <IconRefresh v-else class="icon-2xs" /><span>{{ t('sourceControl.recheck') }}</span>
        </button>
      </div>
    </div>

    <!-- 状态 D：非仓库 — ui/panel.html .guide -->
    <div v-else-if="!gitStore.isRepo" class="flex flex-1 flex-col items-center px-4 pt-7 text-center">
      <IconGitBranch class="mb-3 size-11 text-base-content/40" />
      <p class="mb-4 max-w-60 text-xs text-base-content/60">{{ t('sourceControl.notRepo') }}</p>
      <div class="flex w-full flex-col gap-2">
        <button class="btn btn-primary h-9 w-full" @click="initRepo">
          <IconGitBranch class="icon-sm" /><span>{{ t('sourceControl.initRepo') }}</span>
        </button>
        <button class="btn btn-ghost h-9 w-full" @click="gitStore.cloneDialogOpen = true">
          <IconGitBranch class="icon-sm" /><span>{{ t('sourceControl.cloneRepo') }}</span>
        </button>
      </div>
    </div>

    <!-- 状态 E：仓库 → 三 viewer -->
    <SplitView v-else :panes="viewerPanes" :close-title="t('common.close')" class="min-h-0 flex-1">
      <!-- Repositories -->
      <template #repositories-actions>
        <button class="btn btn-ghost btn-square btn-xs" :title="t('sourceControl.moreActions')" @click.stop="showBranchMenu">
          <IconDots class="icon-2xs" />
        </button>
      </template>
      <template #repositories>
        <div class="flex w-full items-center gap-2 px-3 py-2 text-xs" @contextmenu.prevent="showBranchMenu($event, true)">
          <IconGitBranch class="icon-xs text-base-content/60 shrink-0" />
          <span class="font-medium truncate">{{ folderName }}</span>
          <span class="text-base-content/60 truncate">{{ gitStore.branch?.current }}</span>
          <span class="ml-auto shrink-0 tabular-nums text-base-content/50">
            ↑{{ gitStore.branch?.ahead ?? 0 }} ↓{{ gitStore.branch?.behind ?? 0 }}
          </span>
        </div>
      </template>

      <!-- Changes -->
      <template #changes-actions>
        <button class="btn btn-ghost btn-square btn-xs" :title="t('sourceControl.action.stageAll')" @click.stop="gitStore.stageAll()">
          <IconPlus class="icon-2xs" />
        </button>
        <button
          class="btn btn-ghost btn-square btn-xs"
          :title="changesTreeView ? t('sourceControl.graph.listView') : t('sourceControl.graph.treeView')"
          @click.stop="changesTreeView = !changesTreeView"
        >
          <component :is="changesTreeView ? IconList : IconFolders" class="icon-2xs" />
        </button>
        <span v-if="gitStore.changeCount" class="badge badge-xs badge-primary">{{ gitStore.changeCount }}</span>
      </template>
      <template #changes>
        <div class="flex h-full min-h-0 flex-col overflow-hidden">
          <div class="shrink-0 border-b border-base-300 p-2">
            <textarea
              v-model="gitStore.commitMessage"
              rows="1"
              class="w-full min-h-7 resize-none overflow-hidden outline-none border border-base-300 bg-base-100 py-1.5 px-2 text-xs focus:border-primary rounded-field"
              :placeholder="t('sourceControl.commitPlaceholder')"
              @keydown="onCommitKey"
              @input="autoGrow"
            />
            <div class="mt-2 flex">
              <button
                class="btn btn-primary btn-xs flex-1 rounded-r-none gap-1"
                :disabled="!canCommit"
                @click="doPrimaryCommit"
              >
                <span v-if="gitStore.committing" class="loading loading-spinner loading-xs"></span>
                <IconCheck v-else class="icon-2xs" /> {{ t('sourceControl.commit') }}
              </button>
              <button class="btn btn-primary btn-xs rounded-l-none border-l border-primary-content/20 px-1" :title="t('sourceControl.commit')" @click="showCommitMenu">
                <IconChevronDown class="icon-2xs" />
              </button>
            </div>
          </div>

          <div class="min-h-0 flex-1 overflow-y-auto">
            <div v-if="!gitStore.hasChanges" class="p-3 text-left text-xs text-base-content/50">
              {{ t('sourceControl.noChanges') }}
            </div>
            <div v-else class="py-1 text-xs">
              <GitChangeGroup v-if="gitStore.status?.conflicts.length" kind="conflicts" :title="mergeLabel" :files="gitStore.status.conflicts" :tree-view="changesTreeView"
                @open="onFileOpen" @stage="onStage" @context="onContext" />
              <GitChangeGroup v-if="gitStore.status?.staged.length" kind="staged" :title="stagedLabel" :files="gitStore.status.staged" :tree-view="changesTreeView"
                @open="onFileOpen" @unstage="onUnstage" @unstage-all="gitStore.unstageAll()" @context="onContext" />
              <GitChangeGroup v-if="gitStore.status?.changes.length" kind="changes" :title="changesLabel" :files="gitStore.status.changes" :tree-view="changesTreeView"
                @open="onFileOpen" @stage="onStage" @discard="onDiscard" @stage-all="gitStore.stageAll()" @discard-all="onDiscardAll" @context="onContext" />
              <GitChangeGroup v-if="gitStore.status?.untracked.length" kind="untracked" :title="untrackedLabel" :files="gitStore.status.untracked" :tree-view="changesTreeView"
                @open="onFileOpen" @stage="onStage" @discard="onDiscard" @gitignore="onGitignore" @stage-all="onStageAllUntracked" @context="onContext" />
            </div>
          </div>
        </div>
      </template>

      <!-- Graph -->
      <template #graph-actions>
        <button
          class="btn btn-ghost btn-square btn-xs flex items-center gap-0.5 px-1"
          :title="graphBranchLabel || t('sourceControl.graph.selectBranch')"
          @click.stop="showGraphBranchMenu"
        >
          <IconGitBranch class="icon-2xs shrink-0" />
          <span class="max-w-40 truncate text-2xs">{{ graphBranchLabel }}</span>
          <IconChevronDown class="icon-2xs shrink-0" />
        </button>
        <button
          class="btn btn-ghost btn-square btn-xs"
          :title="graphTreeView ? t('sourceControl.graph.listView') : t('sourceControl.graph.treeView')"
          @click.stop="graphTreeView = !graphTreeView"
        >
          <component :is="graphTreeView ? IconList : IconFolders" class="icon-2xs" />
        </button>
      </template>
      <template #graph>
        <div v-if="gitStore.graphLoading && !gitStore.commits.length" class="p-3 text-left text-xs text-base-content/50">
          <span class="loading loading-spinner loading-sm"></span>
        </div>
        <div v-else-if="!gitStore.commits.length" class="px-4 pt-7 text-center text-xs text-base-content/40">
          <IconGitBranch class="mx-auto mb-2 size-7 opacity-50" />{{ t('sourceControl.noCommits') }}<br>{{ t('sourceControl.noCommitsHint') }}
        </div>
        <template v-else>
        <ul class="py-1 text-xs">
          <li v-for="(c, ci) in gitStore.commits" :key="c.hash">
            <div
              class="flex items-stretch hover:bg-base-200"
              @contextmenu.prevent="onGraphCommitContext(c, $event)"
              @mouseenter="hoveredGraphHash = c.hash"
              @mouseleave="hoveredGraphHash = undefined"
            >
              <GitGraphGutter
                v-if="graphLayout.rows[ci]"
                :row="graphLayout.rows[ci]"
                :lane-width="GRAPH_LANE_W"
                :row-height="GRAPH_ROW_H"
                class="shrink-0 ml-2 mr-2"
                :hovered="hoveredGraphHash === c.hash"
                :unpublished="hasUnpublishedLocalRef(c.refs)"
              />
              <button
                class="flex min-w-0 flex-1 items-center pr-3 text-left"
                :style="{ minHeight: GRAPH_ROW_H + 'px' }"
                @click="gitStore.toggleCommit(c.hash)"
              >
                <GitGraphCommitContent
                  :refs="graphRefs(c.refs)"
                  :subject="c.subject"
                  :author="c.author"
                  :color="graphLayout.rows[ci]?.color ?? ''"
                />
              </button>
            </div>
            <div v-if="gitStore.expandedHash === c.hash" class="relative">
              <!-- 泳道续接：在展开的文件区绘制竖线，延续本提交下方的 lane，不打断图 -->
              <div class="pointer-events-none absolute inset-y-0 left-0">
                <div
                  v-for="(lane, lli) in continuationLanes(ci)"
                  :key="lli"
                  class="absolute inset-y-0 w-0.5"
                  :style="{ left: laneBarLeft(lane.col) + 'px', background: lane.color }"
                ></div>
              </div>
            <ul class="pb-1">
              <!-- 列表视图 -->
              <template v-if="!graphTreeView">
                <li v-for="f in gitStore.expandedFiles" :key="f.path">
                  <button
                    class="flex h-7 w-full items-center gap-2 pr-3 pl-9 text-left text-base-content/80 hover:bg-base-200"
                    :title="f.path"
                    @click="gitStore.openCommitDiff(c.hash, f.path, f.oldPath)"
                    @contextmenu.prevent="onCommitFileContext(c.hash, f, $event)"
                  >
                    <span class="truncate">{{ f.name }}</span>
                    <span class="truncate text-base-content/40">{{ f.dir }}</span>
                    <span class="ml-auto font-bold" :class="statusColor(f.status)">{{ f.status }}</span>
                  </button>
                </li>
              </template>
              <!-- 树状视图 -->
              <template v-else>
                <li v-for="(row, i) in expandedTreeRows" :key="i">
                  <div
                    v-if="row.kind === 'dir'"
                    class="flex h-7 items-center gap-1 pr-3 text-base-content/45"
                    :style="{ paddingLeft: (row.depth * 12 + 24) + 'px' }"
                  >
                    <IconFolder class="icon-2xs shrink-0" />
                    <span class="truncate">{{ row.label }}</span>
                  </div>
                  <button
                    v-else
                    class="flex h-7 w-full items-center gap-2 pr-3 text-left text-base-content/80 hover:bg-base-200"
                    :style="{ paddingLeft: (row.depth * 12 + 24) + 'px' }"
                    :title="row.file!.path"
                    @click="gitStore.openCommitDiff(c.hash, row.file!.path, row.file!.oldPath)"
                    @contextmenu.prevent="onCommitFileContext(c.hash, row.file!, $event)"
                  >
                    <span class="truncate">{{ row.label }}</span>
                    <span class="ml-auto font-bold" :class="statusColor(row.file!.status)">{{ row.file!.status }}</span>
                  </button>
                </li>
              </template>
            </ul>
            </div>
          </li>
        </ul>
        <button
          v-if="gitStore.graphHasMore"
          class="flex w-full items-center justify-center gap-1 px-3 py-1.5 text-xs text-base-content/60 hover:bg-base-200 hover:text-base-content"
          :disabled="gitStore.graphLoading"
          @click="gitStore.loadMoreGraph()"
        >
          <span v-if="gitStore.graphLoading" class="loading loading-spinner loading-xs"></span>
          {{ t('sourceControl.graph.loadMore') }}
        </button>
        </template>
      </template>
    </SplitView>

    <!-- 新建分支输入弹窗 -->
    <IwDialog :visible="branchDialogOpen" :title="t('sourceControl.branch.create')" @close="branchDialogOpen = false">
      <input
        ref="branchInput"
        v-model="branchName"
        type="text"
        class="input input-sm h-7 w-full"
        :placeholder="t('sourceControl.branch.createTitle')"
        @keyup.enter="confirmCreateBranch"
      />
      <p v-if="branchNameError" class="mt-1.5 text-2xs text-error">{{ branchNameError }}</p>
      <template #footer>
        <button class="btn btn-ghost btn-sm" @click="branchDialogOpen = false">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary btn-sm" :disabled="!branchName.trim() || !!branchNameError" @click="confirmCreateBranch">{{ t('common.create') }}</button>
      </template>
    </IwDialog>

    <!-- 重命名当前分支弹窗 -->
    <IwDialog :visible="renameDialogOpen" :title="t('sourceControl.branch.rename')" @close="renameDialogOpen = false">
      <input
        ref="renameInput"
        v-model="renameName"
        type="text"
        class="input input-sm h-7 w-full"
        :placeholder="t('sourceControl.branch.createTitle')"
        @keyup.enter="confirmRenameBranch"
      />
      <p v-if="renameNameError" class="mt-1.5 text-2xs text-error">{{ renameNameError }}</p>
      <template #footer>
        <button class="btn btn-ghost btn-sm" @click="renameDialogOpen = false">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary btn-sm" :disabled="!renameName.trim() || !!renameNameError" @click="confirmRenameBranch">{{ t('common.confirm') }}</button>
      </template>
    </IwDialog>

    <!-- 添加远程输入弹窗 -->
    <IwDialog :visible="remoteDialogOpen" :title="t('sourceControl.remote.add')" @close="remoteDialogOpen = false">
      <div class="flex flex-col gap-2">
        <input ref="remoteNameInput" v-model="remoteName" type="text" class="input input-sm h-7 w-full" :placeholder="t('sourceControl.remote.namePlaceholder')" />
        <input v-model="remoteUrl" type="text" class="input input-sm h-7 w-full" :placeholder="t('sourceControl.remote.urlPlaceholder')" @keyup.enter="confirmAddRemote" />
      </div>
      <template #footer>
        <button class="btn btn-ghost btn-sm" @click="remoteDialogOpen = false">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary btn-sm" :disabled="!remoteName.trim() || !remoteUrl.trim()" @click="confirmAddRemote">{{ t('common.create') }}</button>
      </template>
    </IwDialog>

    <!-- 贮藏信息输入弹窗（信息可选） -->
    <IwDialog :visible="stashDialogOpen" :title="t('sourceControl.stash.push')" @close="stashDialogOpen = false">
      <div class="flex flex-col gap-2">
        <input ref="stashInput" v-model="stashMessage" type="text" class="input input-sm h-7 w-full" :placeholder="t('sourceControl.stash.messagePlaceholder')" @keyup.enter="confirmStashPush" />
        <label class="flex cursor-pointer items-center gap-2 text-xs text-base-content/80">
          <input v-model="stashIncludeUntracked" type="checkbox" class="checkbox checkbox-xs" />
          {{ t('sourceControl.stash.includeUntracked') }}
        </label>
      </div>
      <template #footer>
        <button class="btn btn-ghost btn-sm" @click="stashDialogOpen = false">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary btn-sm" @click="confirmStashPush">{{ t('sourceControl.stash.push') }}</button>
      </template>
    </IwDialog>

    <!-- 创建标签输入弹窗（名称必填 + 说明可选=附注标签） -->
    <IwDialog :visible="tagDialogOpen" :title="t('sourceControl.tag.create')" @close="tagDialogOpen = false">
      <div class="flex flex-col gap-2">
        <input ref="tagInput" v-model="tagName" type="text" class="input input-sm h-7 w-full" :placeholder="t('sourceControl.tag.namePlaceholder')" />
        <input v-model="tagMessage" type="text" class="input input-sm h-7 w-full" :placeholder="t('sourceControl.tag.messagePlaceholder')" @keyup.enter="confirmCreateTag" />
        <p v-if="tagNameError" class="text-2xs text-error">{{ tagNameError }}</p>
      </div>
      <template #footer>
        <button class="btn btn-ghost btn-sm" @click="tagDialogOpen = false">{{ t('common.cancel') }}</button>
        <button class="btn btn-primary btn-sm" :disabled="!tagName.trim() || !!tagNameError" @click="confirmCreateTag">{{ t('common.create') }}</button>
      </template>
    </IwDialog>

    <!-- 贮藏列表（列表管理对话框，替代嵌套菜单）— ui/dialogs.html §5 -->
    <IwDialog :visible="stashListOpen" :title="t('sourceControl.stash.manage')" width-class="w-96" @close="stashListOpen = false">
      <div v-if="!gitStore.stashes.length" class="py-2 text-center text-xs text-base-content/40">{{ t('sourceControl.stash.none') }}</div>
      <div v-else class="overflow-hidden rounded-field border border-base-300">
        <div v-for="s in gitStore.stashes" :key="s.index" class="flex items-center gap-2.5 border-b border-base-200 px-2.5 py-2 last:border-b-0 hover:bg-base-200">
          <div class="min-w-0 flex-1">
            <div class="truncate text-xs">{{ s.message }}</div>
            <div class="font-mono text-2xs text-base-content/40">{{ stashRef(s.index) }}</div>
          </div>
          <div class="flex shrink-0 gap-1">
            <button class="btn btn-ghost btn-xs" @click="gitStore.stashApply(s.index)">{{ t('sourceControl.stash.apply') }}</button>
            <button class="btn btn-ghost btn-xs" @click="onStashPop(s.index)">{{ t('sourceControl.stash.pop') }}</button>
            <button class="btn btn-ghost btn-xs" @click="onStashDrop(s.index)">{{ t('sourceControl.stash.drop') }}</button>
          </div>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-ghost btn-sm" @click="stashListOpen = false">{{ t('common.close') }}</button>
      </template>
    </IwDialog>

    <!-- 标签列表 -->
    <IwDialog :visible="tagListOpen" :title="t('sourceControl.tag.manage')" @close="tagListOpen = false">
      <div v-if="!gitStore.tags.length" class="py-2 text-center text-xs text-base-content/40">{{ t('sourceControl.tag.none') }}</div>
      <div v-else class="overflow-hidden rounded-field border border-base-300">
        <div v-for="name in gitStore.tags" :key="name" class="flex items-center gap-2.5 border-b border-base-200 px-2.5 py-2 last:border-b-0 hover:bg-base-200">
          <div class="min-w-0 flex-1 truncate text-xs">{{ name }}</div>
          <button class="btn btn-ghost btn-xs" @click="onTagDelete(name)">{{ t('sourceControl.tag.deleteConfirm') }}</button>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-primary btn-sm mr-auto" @click="openCreateTagFromList">{{ t('sourceControl.tag.create') }}</button>
        <button class="btn btn-ghost btn-sm" @click="tagListOpen = false">{{ t('common.close') }}</button>
      </template>
    </IwDialog>

    <!-- 管理远程 -->
    <IwDialog :visible="remoteListOpen" :title="t('sourceControl.remote.manage')" width-class="w-96" @close="remoteListOpen = false">
      <div v-if="!gitStore.remotes.length" class="py-2 text-center text-xs text-base-content/40">{{ t('sourceControl.remote.none') }}</div>
      <div v-else class="overflow-hidden rounded-field border border-base-300">
        <div v-for="r in gitStore.remotes" :key="r.name" class="flex items-center gap-2.5 border-b border-base-200 px-2.5 py-2 last:border-b-0 hover:bg-base-200">
          <div class="min-w-0 flex-1">
            <div class="text-xs">{{ r.name }}</div>
            <div class="truncate font-mono text-2xs text-base-content/40">{{ r.url }}</div>
          </div>
          <button class="btn btn-ghost btn-xs" @click="onRemoteRemove(r.name)">{{ t('sourceControl.remote.remove') }}</button>
        </div>
      </div>
      <template #footer>
        <button class="btn btn-primary btn-sm mr-auto" @click="openAddRemoteFromList">{{ t('sourceControl.remote.add') }}</button>
        <button class="btn btn-ghost btn-sm" @click="remoteListOpen = false">{{ t('common.close') }}</button>
      </template>
    </IwDialog>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, watchEffect, nextTick, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { IconDots, IconGitBranch, IconRefresh, IconReload, IconPlus, IconCheck, IconChevronDown, IconList, IconFolders, IconFolder, IconAlertTriangle, IconDownload, IconCopy, IconExternalLink } from '@tabler/icons-vue'
import { SplitView, type SplitPane } from '../common/split-view'
import GitChangeGroup, { type ScmContextPayload } from './scm/GitChangeGroup.vue'
import IwDialog from './scm/IwDialog.vue'
import GitGraphGutter from './scm/GitGraphGutter.vue'
import GitGraphCommitContent from './scm/GitGraphCommitContent.vue'
import { computeGraphLayout, hasUnpublishedLocalRef } from './scm/gitGraphLayout'
import { buildScmTreeRows } from './scm/fileTree'
import { useGitStore } from '@/stores/git'
import { useAppStore } from '@/stores/app'
import type { ContextMenuItem, GitCommit, GitFileChange, GitFileStatus } from '@/types'
import pathUtils from '@/utils/pathUtils'
import { notify } from '@/utils/notifications'

const { t } = useI18n()
const gitStore = useGitStore()
const appStore = useAppStore()

onMounted(async () => {
  await gitStore.ensureSettings()
  await gitStore.ensureDetected()
})

const folderName = computed(() =>
  appStore.currentFolder ? pathUtils.basename(appStore.currentFolder) : ''
)

const stagedLabel = computed(() => t('sourceControl.staged'))
const changesLabel = computed(() => t('sourceControl.changes'))
const untrackedLabel = computed(() => t('sourceControl.untracked'))
const mergeLabel = computed(() => t('sourceControl.mergeChanges'))

// ---- 更改：list/tree 切换 ----
const changesTreeView = ref(gitStore.settings.changesLayout === 'tree')

// ---- 图谱：分支选择 + list/tree 切换 ----
const graphTreeView = ref(gitStore.settings.graphFilesLayout === 'tree')
const graphBranchLabel = computed(() =>
  gitStore.graphAll
    ? t('sourceControl.graph.allBranches')
    : (gitStore.graphBranch ?? gitStore.branch?.current ?? '')
)
const expandedTreeRows = computed(() => buildScmTreeRows(gitStore.expandedFiles))

// ---- 图谱：DAG 泳道 gutter ----
const GRAPH_ROW_H = 28
const GRAPH_LANE_W = 10
const GRAPH_GUTTER_LEFT = 8
const graphLayout = computed(() => computeGraphLayout(gitStore.commits))
const hoveredGraphHash = ref<string>()

// 展开某提交的文件区时，延续其下方（bottom/full 段的出列）lane 的竖线，避免文件行打断泳道图。
function continuationLanes(ci: number): { col: number; color: string }[] {
  const row = graphLayout.value.rows[ci]
  if (!row) return []
  const seen = new Set<number>()
  const lanes: { col: number; color: string }[] = []
  for (const s of row.segments) {
    if ((s.half === 'full' || s.half === 'bottom') && !seen.has(s.toCol)) {
      seen.add(s.toCol)
      lanes.push({ col: s.toCol, color: s.color })
    }
  }
  return lanes
}
// 续接竖线的水平位置（8 = gutter 左外边距；-1 = 线宽 2 的一半，使其居中对齐列）
function laneBarLeft(col: number): number {
  return GRAPH_GUTTER_LEFT + col * GRAPH_LANE_W + GRAPH_LANE_W / 2 - 1
}

function graphRefs(refs: GitCommit['refs']): NonNullable<GitCommit['refs']> {
  const order = { tag: 0, head: 1, branch: 2, remote: 3 }
  return [...(refs ?? [])].sort((a, b) => order[a.kind] - order[b.kind])
}

async function showGraphBranchMenu(event: MouseEvent) {
  const b = gitStore.branch
  if (!b) return
  const current = gitStore.graphBranch ?? b.current
  const items: ContextMenuItem[] = [
    { id: 'g:__all', label: t('sourceControl.graph.allBranches'), type: 'checkbox', checked: gitStore.graphAll },
    { type: 'separator' },
    ...b.local.map((name): ContextMenuItem => ({ id: `g:${name}`, label: name, type: 'checkbox', checked: !gitStore.graphAll && name === current })),
    ...b.remote.filter(r => !r.endsWith('/HEAD')).map((name): ContextMenuItem => ({
      id: `g:${name}`, label: `${name}  (${t('sourceControl.branch.remote')})`, type: 'checkbox', checked: !gitStore.graphAll && name === current,
    })),
  ]
  const action = await window.electronAPI.showContextMenu(items, { x: event.clientX, y: event.clientY })
  if (action === 'g:__all') {
    gitStore.setGraphBranch(null, true)
  } else if (action?.startsWith('g:')) {
    const name = action.slice(2)
    gitStore.setGraphBranch(name === b.current ? null : name)
  }
}

const viewerPanes = ref<SplitPane[]>([
  { id: 'repositories', title: t('sourceControl.view.repositories'), collapsed: true, size: 1, visible: gitStore.settings.showRepositories },
  { id: 'changes', title: t('sourceControl.view.changes'), collapsible: false, size: 3 },
  { id: 'graph', title: t('sourceControl.view.graph'), collapsed: true, size: 2, visible: gitStore.settings.showGraph },
])

function persistViewSettings(patch: Parameters<typeof gitStore.updateSettings>[0]): void {
  void gitStore.updateSettings(patch).catch(error => {
    notify.error(error instanceof Error ? error.message : String(error))
  })
}

// 偏好设置与 SCM 面板内的视图切换保持双向一致。
watch(
  () => gitStore.settings,
  (settings) => {
    changesTreeView.value = settings.changesLayout === 'tree'
    graphTreeView.value = settings.graphFilesLayout === 'tree'
    const repositories = viewerPanes.value.find(p => p.id === 'repositories')
    const graph = viewerPanes.value.find(p => p.id === 'graph')
    if (repositories) repositories.visible = settings.showRepositories
    if (graph) graph.visible = settings.showGraph
  },
  { deep: true, immediate: true },
)
watch(
  [changesTreeView, graphTreeView],
  ([changesTree, graphTree]) => {
    const changesLayout = changesTree ? 'tree' : 'list'
    const graphFilesLayout = graphTree ? 'tree' : 'list'
    if (
      changesLayout !== gitStore.settings.changesLayout
      || graphFilesLayout !== gitStore.settings.graphFilesLayout
    ) {
      persistViewSettings({ changesLayout, graphFilesLayout })
    }
  },
)
watch(
  () => viewerPanes.value.map(p => p.visible !== false),
  () => {
    const showRepositories = viewerPanes.value.find(p => p.id === 'repositories')?.visible !== false
    const showGraph = viewerPanes.value.find(p => p.id === 'graph')?.visible !== false
    if (
      showRepositories !== gitStore.settings.showRepositories
      || showGraph !== gitStore.settings.showGraph
    ) {
      persistViewSettings({ showRepositories, showGraph })
    }
  },
)

// viewer 标题随语言切换更新：t() 存进 ref 只算一次，需在 effect 中重算才能响应 locale
watchEffect(() => {
  const titles: Record<string, string> = {
    repositories: t('sourceControl.view.repositories'),
    changes: t('sourceControl.view.changes'),
    graph: t('sourceControl.view.graph'),
  }
  viewerPanes.value.forEach(p => { if (titles[p.id]) p.title = titles[p.id] as string })
})

function onFileOpen(file: GitFileChange) {
  // 冲突文件 → 合并 tab（2-pane 对照 + 可编辑结果）；其余 → 普通 diff tab
  if (file.status === 'C') gitStore.openMergeTab(file.path)
  else gitStore.openDiff(file.path, { staged: file.staged, oldPath: file.oldPath })
}

// ---- 提交 ----
const canCommit = computed(() => !!gitStore.commitMessage.trim() && !gitStore.committing && gitStore.isRepo)

function autoGrow(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
function onCommitKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doPrimaryCommit() }
}
async function doPrimaryCommit() {
  if (!canCommit.value) return
  const hasStaged = (gitStore.status?.staged.length ?? 0) > 0
  if (hasStaged) { gitStore.commit({}); return }
  // 无暂存内容时的行为按偏好设置（Q5）：all=提交所有 / off=禁用 / prompt=每次询问
  const mode = gitStore.settings.commitWhenEmpty
  if (mode === 'off') { notify.info(t('sourceControl.noStagedChanges')); return }
  if (mode === 'prompt') {
    const ok = await confirmBox(
      t('sourceControl.commitAllConfirm.title'),
      t('sourceControl.commitAllConfirm.message'),
      t('sourceControl.commitAll'),
    )
    if (!ok) return
  }
  gitStore.commit({ all: true })
}
async function showCommitMenu(event: MouseEvent) {
  const items: ContextMenuItem[] = [
    { id: 'commit', label: t('sourceControl.commit') },
    { id: 'commit-all', label: t('sourceControl.commitAll') },
    { type: 'separator' },
    { id: 'commit-amend', label: t('sourceControl.amend') },
    { id: 'undo-last-commit', label: t('sourceControl.undoLastCommit') },
  ]
  const action = await window.electronAPI.showContextMenu(items, { x: event.clientX, y: event.clientY })
  if (action === 'commit') gitStore.commit({})
  else if (action === 'commit-all') gitStore.commit({ all: true })
  else if (action === 'commit-amend') gitStore.commit({ amend: true })
  else if (action === 'undo-last-commit') {
    const ok = await confirmBox(
      t('sourceControl.undoConfirm.title'),
      t('sourceControl.undoConfirm.message'),
      t('sourceControl.undoConfirm.confirm'),
    )
    if (ok) gitStore.undoLastCommit()
  }
}

// ---- 暂存 / 放弃（文件行、目录行、右键菜单统一走文件集合）----
function onStage(files: GitFileChange[]) { if (files.length) gitStore.stage(files.map(f => f.path)) }
function onUnstage(files: GitFileChange[]) { if (files.length) gitStore.unstage(files.map(f => f.path)) }
function onStageAllUntracked() {
  const files = gitStore.status?.untracked.map(f => f.path) ?? []
  if (files.length) gitStore.stage(files)
}
async function onDiscard(files: GitFileChange[]) {
  const first = files[0]
  if (!first) return
  const ok = files.length === 1
    ? await confirmBox(
        t('sourceControl.discardConfirm.title'),
        t('sourceControl.discardConfirm.message', { name: first.name }),
        t('sourceControl.discardConfirm.confirm'),
      )
    : await confirmBox(
        t('sourceControl.discardConfirm.allTitle'),
        t('sourceControl.discardConfirm.allMessage', { count: files.length }),
        t('sourceControl.discardConfirm.confirm'),
      )
  if (ok) gitStore.discard(files.map(f => f.path))
}
async function onDiscardAll() {
  const files = gitStore.status?.changes.map(f => f.path) ?? []
  if (!files.length) return
  const ok = await confirmBox(
    t('sourceControl.discardConfirm.allTitle'),
    t('sourceControl.discardConfirm.allMessage', { count: files.length }),
    t('sourceControl.discardConfirm.confirm'),
  )
  if (ok) gitStore.discard(files)
}
function onGitignore(files: GitFileChange[]) {
  for (const f of files) gitStore.addToGitignore(f.path)
}

/** 变更行/目录行右键菜单（stage/unstage/discard/gitignore/open，按所属分组裁剪项） */
async function onContext(p: ScmContextPayload) {
  if (!p.files.length) return
  // 单个未删除文件才提供「打开文件/在文件管理器显示」（删除的文件工作区已不存在）
  const single = !p.isDir && p.files.length === 1 ? p.files[0]! : null
  const onDisk = single && single.status !== 'D'
  const items: ContextMenuItem[] = []
  if (single) {
    items.push({ id: 'open', label: t('sourceControl.action.openDiff') })
    if (onDisk) items.push({ id: 'open-file', label: t('sourceControl.action.openFile') })
    items.push({ type: 'separator' })
  }
  if (p.kind === 'staged') items.push({ id: 'unstage', label: t('sourceControl.action.unstage') })
  else items.push({ id: 'stage', label: t('sourceControl.action.stage') })
  if (p.kind === 'changes' || p.kind === 'untracked') items.push({ id: 'discard', label: t('sourceControl.action.discard') })
  if (p.kind === 'untracked') items.push({ id: 'gitignore', label: t('sourceControl.action.gitignore') })
  if (onDisk) {
    items.push({ type: 'separator' })
    items.push({ id: 'reveal', label: t('sourceControl.action.reveal') })
  }
  const action = await window.electronAPI.showContextMenu(items, { x: p.ev.clientX, y: p.ev.clientY })
  if (action === 'open' && p.files[0]) onFileOpen(p.files[0])
  else if (action === 'open-file' && single) gitStore.openWorkingFile(single.path)
  else if (action === 'reveal' && single) gitStore.revealFile(single.path)
  else if (action === 'stage') onStage(p.files)
  else if (action === 'unstage') onUnstage(p.files)
  else if (action === 'discard') onDiscard(p.files)
  else if (action === 'gitignore') onGitignore(p.files)
}

async function confirmBox(title: string, message: string, confirmLabel: string): Promise<boolean> {
  const res = await window.electronAPI.showMessageBox({
    type: 'warning',
    title,
    message: title,
    detail: message,
    buttons: [t('common.cancel'), confirmLabel],
    defaultId: 0,
  })
  return res?.response === 1
}

// ---- 分支（存储库 ⋯）：合并/删除 = 子菜单列分支（同一次弹出）；删除排除 main/master/当前 ----
const PROTECTED_BRANCHES = new Set(['main', 'master'])
async function showBranchMenu(event: MouseEvent, includeRepoActions = false) {
  const b = gitStore.branch
  if (!b) return
  const remoteBranches = b.remote.filter(r => !r.endsWith('/HEAD'))
  // 合并候选：非当前的本地 + 远程
  const mergeable: ContextMenuItem[] = [
    ...b.local.filter(n => n !== b.current).map((name): ContextMenuItem => ({ id: `mg:${name}`, label: name })),
    ...remoteBranches.map((name): ContextMenuItem => ({ id: `mg:${name}`, label: `${name}  (${t('sourceControl.branch.remote')})` })),
  ]
  // 删除候选：本地，排除 main/master/当前
  const deletable: ContextMenuItem[] = b.local
    .filter(n => n !== b.current && !PROTECTED_BRANCHES.has(n))
    .map((name): ContextMenuItem => ({ id: `del:${name}`, label: name }))
  // 原生菜单不接受空 submenu：候选为空时降级为禁用的普通项
  const mergeItem: ContextMenuItem = mergeable.length > 0
    ? { label: t('sourceControl.branch.merge'), type: 'submenu', submenu: mergeable }
    : { label: t('sourceControl.branch.merge'), enabled: false }
  const deleteItem: ContextMenuItem = deletable.length > 0
    ? { label: t('sourceControl.branch.delete'), type: 'submenu', submenu: deletable }
    : { label: t('sourceControl.branch.delete'), enabled: false }
  const items: ContextMenuItem[] = [
    { id: '__create', label: t('sourceControl.branch.create') },
    { id: '__rename', label: t('sourceControl.branch.rename'), enabled: !!b.current && !b.detached },
    mergeItem,
    deleteItem,
    { id: '__publish', label: t('sourceControl.remote.publish'), enabled: !b.upstream && !b.detached },
    { type: 'separator' },
    ...b.local.map((name): ContextMenuItem => ({
      id: `co-local:${name}`, label: name, type: 'checkbox', checked: name === b.current,
    })),
    ...remoteBranches.map((name): ContextMenuItem => ({
      id: `co-remote:${name}`, label: `${name}  (${t('sourceControl.branch.remote')})`,
    })),
  ]
  // 存储库行右键：追加 打开所在文件夹 / 复制仓库路径（存储库 ⋯ 按钮不含）
  if (includeRepoActions) {
    items.push(
      { type: 'separator' },
      { id: '__repo-reveal', label: t('sourceControl.action.reveal') },
      { id: '__repo-copy-path', label: t('sourceControl.action.copyRepoPath') },
    )
  }
  const action = await window.electronAPI.showContextMenu(items, { x: event.clientX, y: event.clientY })
  if (!action) return
  if (action === '__repo-reveal') { if (gitStore.root) window.electronAPI.revealInFolder(gitStore.root); return }
  if (action === '__repo-copy-path') { if (gitStore.root) await navigator.clipboard.writeText(gitStore.root); return }
  if (action === '__create') openCreateBranch()
  else if (action === '__rename') openRenameBranch()
  else if (action === '__publish') gitStore.publish()
  else if (action.startsWith('mg:')) await onMergeBranch(action.slice(3))
  else if (action.startsWith('del:')) await onDeleteBranch(action.slice(4))
  else if (action.startsWith('co-local:')) {
    const ref = action.slice('co-local:'.length)
    if (ref !== b.current) gitStore.checkout(ref)
  } else if (action.startsWith('co-remote:')) {
    const ref = action.slice('co-remote:'.length)
    const localName = ref.replace(/^[^/]+\//, '')
    if (b.local.includes(localName)) gitStore.checkout(localName)
    else gitStore.checkout(ref, { track: true })
  }
}

/** 合并分支：先预检能否快进 → 确认后合并（现在是选完直接合、无确认，§5.6 预检总纲） */
async function onMergeBranch(branch: string) {
  const pf = await gitStore.preflightMerge(branch)
  if (!pf) return
  const res = await window.electronAPI.showMessageBox({
    type: 'question',
    title: t('sourceControl.branch.mergeTitle', { branch }),
    message: t('sourceControl.branch.mergeTitle', { branch }),
    detail: pf.upToDate
      ? t('sourceControl.branch.mergeUpToDate')
      : pf.fastForward
        ? t('sourceControl.branch.mergeFastForward')
        : t('sourceControl.branch.mergeCommitHint'),
    buttons: pf.upToDate
      ? [t('common.ok')]
      : [t('common.cancel'), t('sourceControl.branch.mergeAction')],
    defaultId: pf.upToDate ? 0 : 1,
    cancelId: 0,
  })
  if (!pf.upToDate && res?.response === 1) gitStore.merge(branch)
}

/** 删除分支：先预检（未推送/未并入 main/派生分支）→ 有问题列信息 + 强制删除，无问题防误点确认（§5.6 预检总纲） */
async function onDeleteBranch(name: string) {
  if (!gitStore.root) return
  const pf = await gitStore.preflightDeleteBranch(name)
  if (!pf) return
  const problems: string[] = []
  if (pf.unpushedCommits > 0) problems.push(t('sourceControl.branch.preflightUnpushed', { n: pf.unpushedCommits }))
  if (pf.mainRef && !pf.mergedIntoMain) problems.push(t('sourceControl.branch.preflightNotMerged', { main: pf.mainRef }))
  if (pf.descendantBranches.length) problems.push(t('sourceControl.branch.preflightDescendants', { branches: pf.descendantBranches.join('、') }))
  if (problems.length) {
    const res = await window.electronAPI.showMessageBox({
      type: 'warning',
      title: t('sourceControl.branch.deleteTitle', { name }),
      message: t('sourceControl.branch.deleteTitle', { name }),
      detail: `${problems.join('\n')}\n\n${t('sourceControl.branch.deleteForceHint')}`,
      buttons: [t('common.cancel'), t(pf.forceRequired ? 'sourceControl.branch.forceDelete' : 'sourceControl.branch.deleteAction')],
      defaultId: 0,
      cancelId: 0,
    })
    if (res?.response === 1) await gitStore.deleteBranch(name, pf.forceRequired)
  } else {
    const res = await window.electronAPI.showMessageBox({
      type: 'question',
      title: t('sourceControl.branch.deleteTitle', { name }),
      message: t('sourceControl.branch.deleteTitle', { name }),
      detail: t('sourceControl.branch.deleteConfirmClean'),
      buttons: [t('common.cancel'), t('sourceControl.branch.deleteAction')],
      defaultId: 1,
      cancelId: 0,
    })
    if (res?.response === 1) await gitStore.deleteBranch(name, false)
  }
}

// 新建分支弹窗
const branchDialogOpen = ref(false)
const branchName = ref('')
const branchInput = ref<HTMLInputElement | null>(null)
// git 分支名校验：禁空格及 ~^:?*[\ 、.. 、开头 -/、结尾 /. 、.lock、// 、@{
const branchNameError = computed(() => {
  const n = branchName.value.trim()
  if (!n) return ''
  const invalid =
    /[\s~^:?*[\\]/.test(n) ||
    n.includes('..') || n.includes('//') || n.includes('@{') ||
    /^[-/]/.test(n) || /[/.]$/.test(n) || n.endsWith('.lock')
  return invalid ? t('sourceControl.branch.invalidName') : ''
})
// 重命名当前分支弹窗
const renameDialogOpen = ref(false)
const renameName = ref('')
const renameInput = ref<HTMLInputElement | null>(null)
const renameNameError = computed(() => {
  const n = renameName.value.trim()
  if (!n) return ''
  const invalid =
    /[\s~^:?*[\\]/.test(n) ||
    n.includes('..') || n.includes('//') || n.includes('@{') ||
    /^[-/]/.test(n) || /[/.]$/.test(n) || n.endsWith('.lock')
  return invalid ? t('sourceControl.branch.invalidName') : ''
})
function openRenameBranch() {
  renameName.value = gitStore.branch?.current ?? ''
  renameDialogOpen.value = true
  nextTick(() => renameInput.value?.select())
}
function confirmRenameBranch() {
  const newName = renameName.value.trim()
  const cur = gitStore.branch?.current
  if (!newName || renameNameError.value || !cur || newName === cur) { renameDialogOpen.value = false; return }
  renameDialogOpen.value = false
  gitStore.renameBranch(cur, newName)
}

/** 新建分支的基点（提交 hash / 分支名）；空=当前 HEAD。用于 Graph「从此提交创建分支」 */
const branchBase = ref<string | undefined>(undefined)
function openCreateBranch(base?: string) {
  branchName.value = ''
  branchBase.value = base
  branchDialogOpen.value = true
  nextTick(() => branchInput.value?.focus())
}
function confirmCreateBranch() {
  const name = branchName.value.trim()
  if (!name || branchNameError.value) return
  branchDialogOpen.value = false
  gitStore.createBranch(name, branchBase.value, true)
}

// —— 标签 Tags ——
const tagDialogOpen = ref(false)
const tagName = ref('')
const tagMessage = ref('')
/** 标签基点提交 hash（Graph「在此提交打标签」）；空=HEAD */
const tagBaseHash = ref('')
const tagInput = ref<HTMLInputElement | null>(null)
// tag 名校验（同 refname 规则，同分支名）
const tagNameError = computed(() => {
  const n = tagName.value.trim()
  if (!n) return ''
  const invalid =
    /[\s~^:?*[\\]/.test(n) ||
    n.includes('..') || n.includes('//') || n.includes('@{') ||
    /^[-/]/.test(n) || /[/.]$/.test(n) || n.endsWith('.lock')
  return invalid ? t('sourceControl.tag.invalidName') : ''
})
function openCreateTag(hash?: string) {
  tagName.value = ''
  tagMessage.value = ''
  tagBaseHash.value = hash ?? ''
  tagDialogOpen.value = true
  nextTick(() => tagInput.value?.focus())
}
function confirmCreateTag() {
  const name = tagName.value.trim()
  if (!name || tagNameError.value) return
  tagDialogOpen.value = false
  gitStore.createTag(name, {
    message: tagMessage.value.trim() || undefined,
    hash: tagBaseHash.value || undefined,
  })
}
// —— 标签列表（列表管理对话框，替代嵌套菜单）——
const tagListOpen = ref(false)
async function openTagList() { await gitStore.loadTags(); tagListOpen.value = true }
function openCreateTagFromList() { tagListOpen.value = false; openCreateTag() }
async function onTagDelete(name: string) {
  const ok = await confirmBox(t('sourceControl.tag.deleteTitle'), t('sourceControl.tag.deleteMessage', { name }), t('sourceControl.tag.deleteConfirm'))
  if (ok) await gitStore.deleteTag(name)
}

/** Graph 提交行右键：复制 hash/信息、在此提交打标签/创建分支 */
async function onGraphCommitContext(c: GitCommit, event: MouseEvent) {
  const items: ContextMenuItem[] = [
    { id: 'copy-hash', label: t('sourceControl.graph.copyHash') },
    { id: 'copy-msg', label: t('sourceControl.graph.copyMessage') },
    { type: 'separator' },
    { id: 'tag-here', label: t('sourceControl.graph.createTagHere') },
    { id: 'branch-here', label: t('sourceControl.graph.createBranchHere') },
  ]
  const action = await window.electronAPI.showContextMenu(items, { x: event.clientX, y: event.clientY })
  if (action === 'copy-hash') await navigator.clipboard.writeText(c.hash)
  else if (action === 'copy-msg') await navigator.clipboard.writeText(c.subject)
  else if (action === 'tag-here') openCreateTag(c.hash)
  else if (action === 'branch-here') openCreateBranch(c.hash)
}

/** Graph 展开的提交文件行右键：打开文件变更 / 打开所在文件夹 / 还原到此版本 */
async function onCommitFileContext(hash: string, file: GitFileChange, event: MouseEvent) {
  const items: ContextMenuItem[] = [
    { id: 'open', label: t('sourceControl.action.openDiff') },
    { id: 'reveal', label: t('sourceControl.action.reveal') },
    { type: 'separator' },
    { id: 'restore', label: t('explorer.timeline.restore') },
  ]
  const action = await window.electronAPI.showContextMenu(items, { x: event.clientX, y: event.clientY })
  if (action === 'open') gitStore.openCommitDiff(hash, file.path, file.oldPath)
  else if (action === 'reveal') gitStore.revealFile(file.path)
  else if (action === 'restore') {
    const ok = await confirmBox(
      t('explorer.timeline.restoreTitle'),
      t('explorer.timeline.restoreMessage', { name: file.name, hash: hash.slice(0, 7) }),
      t('explorer.timeline.restoreConfirm'),
    )
    if (ok) await gitStore.restoreFile(hash, file.path)
  }
}

// 进度条操作标签：clone 用克隆文案，其余用 remote.* 文案
const busyLabel = computed(() => {
  const b = gitStore.busy
  if (!b) return ''
  return b === 'clone' ? t('sourceControl.cloneRepo') : t(`sourceControl.remote.${b}`)
})

// —— 远程管理（add/remove/list remote）——
const remoteDialogOpen = ref(false)
const remoteName = ref('')
const remoteUrl = ref('')
const remoteNameInput = ref<HTMLInputElement | null>(null)
function openAddRemote() {
  remoteName.value = ''
  remoteUrl.value = ''
  remoteDialogOpen.value = true
  nextTick(() => remoteNameInput.value?.focus())
}
async function confirmAddRemote() {
  const name = remoteName.value.trim()
  const url = remoteUrl.value.trim()
  if (!name || !url) return
  remoteDialogOpen.value = false
  await gitStore.addRemote(name, url)
}
// —— 管理远程（列表管理对话框）——
const remoteListOpen = ref(false)
async function openRemoteList() { await gitStore.loadRemotes(); remoteListOpen.value = true }
function openAddRemoteFromList() { remoteListOpen.value = false; openAddRemote() }
async function onRemoteRemove(name: string) {
  const ok = await confirmBox(t('sourceControl.remote.removeConfirmTitle'), t('sourceControl.remote.removeConfirmMessage', { name }), t('sourceControl.remote.remove'))
  if (ok) await gitStore.removeRemote(name)
}

// —— 贮藏 Stash（F10）——
const stashDialogOpen = ref(false)
const stashMessage = ref('')
const stashIncludeUntracked = ref(false)
const stashInput = ref<HTMLInputElement | null>(null)
function openStashPush() {
  stashMessage.value = ''
  stashIncludeUntracked.value = false
  stashDialogOpen.value = true
  nextTick(() => stashInput.value?.focus())
}
async function confirmStashPush() {
  stashDialogOpen.value = false
  await gitStore.stashPush(stashMessage.value.trim() || undefined, stashIncludeUntracked.value)
}
// —— 贮藏列表（列表管理对话框）——
const stashListOpen = ref(false)
function stashRef(index: number) { return `stash@{${index}}` }
async function openStashList() { await gitStore.loadStashes(); stashListOpen.value = true }
async function onStashPop(index: number) { await gitStore.stashPop(index) }
async function onStashDrop(index: number) {
  const ok = await confirmBox(t('sourceControl.stash.dropConfirmTitle'), t('sourceControl.stash.dropConfirmMessage', { index }), t('sourceControl.stash.drop'))
  if (ok) await gitStore.stashDrop(index)
}

function statusColor(s: GitFileStatus): string {
  switch (s) {
    case 'A': case 'U': return 'text-success'
    case 'D': return 'text-error'
    case 'C': return 'text-error'
    default: return 'text-warning'
  }
}

// —— 未检测到 Git 的安装引导（对齐 ui/panel.html .steps）——
const showInstallSteps = ref(false)
const installCopied = ref(false)
const rechecking = ref(false)
async function copyInstallCommand() {
  const cmd = gitStore.availability.installCommand
  if (!cmd) return
  await navigator.clipboard.writeText(cmd)
  installCopied.value = true
  setTimeout(() => { installCopied.value = false }, 1500)
}
function openGitDownload() {
  void window.electronAPI.openExternal(gitStore.availability.downloadUrl ?? 'https://git-scm.com/downloads')
}

async function recheck() {
  if (rechecking.value) return
  rechecking.value = true
  try {
    gitStore.availability = await window.electronAPI.git.detect(true)
    await gitStore.onFolderChanged(appStore.currentFolder)
  } finally {
    rechecking.value = false
  }
}

async function initRepo() {
  await gitStore.initRepo()
}

const showScmViewMenu = async (event: MouseEvent) => {
  const repos = viewerPanes.value.find(p => p.id === 'repositories')
  const graph = viewerPanes.value.find(p => p.id === 'graph')
  const repo = gitStore.isRepo
  const hasUpstream = !!gitStore.branch?.upstream
  if (repo) await gitStore.loadStashes()
  const hasStash = gitStore.stashes.length > 0
  // 扁平菜单（仅分隔线分组，无分组标题——原生菜单无 header）
  const items: ContextMenuItem[] = []
  if (repo) {
    // 远程（发布分支移至存储库 ⋯）
    if (hasUpstream) {
      items.push(
        { id: 'remote-sync', label: t('sourceControl.remote.sync') },
        { id: 'remote-pull', label: t('sourceControl.remote.pull') },
        { id: 'remote-push', label: t('sourceControl.remote.push') },
      )
    }
    items.push(
      { id: 'remote-fetch', label: t('sourceControl.remote.fetch') },
      { id: 'remote-manage', label: t('sourceControl.remote.manage') },
      { type: 'separator' },
      { id: 'stash-push', label: t('sourceControl.stash.push'), enabled: gitStore.hasChanges },
      { id: 'stash-pop-latest', label: t('sourceControl.stash.popLatest'), enabled: hasStash },
      { id: 'stash-manage', label: t('sourceControl.stash.manage'), enabled: hasStash },
      { type: 'separator' },
      { id: 'tag-create', label: t('sourceControl.tag.create') },
      { id: 'tag-manage', label: t('sourceControl.tag.manage') },
      { id: 'tag-push', label: t('sourceControl.tag.push'), enabled: hasUpstream },
      { type: 'separator' },
    )
  }
  items.push(
    { id: 'scm-view-repositories', label: t('sourceControl.view.repositories'), type: 'checkbox', enabled: repo, checked: repo && repos?.visible !== false },
    { id: 'scm-view-changes', label: t('sourceControl.view.changes'), type: 'checkbox', enabled: false, checked: repo },
    { id: 'scm-view-graph', label: t('sourceControl.view.graph'), type: 'checkbox', enabled: repo, checked: repo && graph?.visible !== false },
  )
  try {
    const action = await window.electronAPI.showContextMenu(items, { x: event.clientX, y: event.clientY })
    if (action === 'scm-view-repositories' && repos) repos.visible = repos.visible === false
    else if (action === 'scm-view-graph' && graph) graph.visible = graph.visible === false
    else if (action === 'remote-sync') gitStore.sync()
    else if (action === 'remote-pull') gitStore.pull()
    else if (action === 'remote-push') gitStore.push()
    else if (action === 'remote-fetch') gitStore.fetch()
    else if (action === 'remote-publish') gitStore.publish()
    else if (action === 'remote-manage') openRemoteList()
    else if (action === 'stash-push') openStashPush()
    else if (action === 'stash-pop-latest') gitStore.stashPop(0)
    else if (action === 'stash-manage') openStashList()
    else if (action === 'tag-create') openCreateTag()
    else if (action === 'tag-manage') openTagList()
    else if (action === 'tag-push') gitStore.pushTags()
  } catch (error) {
    console.error('Error showing SCM view menu:', error)
  }
}

// 图谱展开时懒加载；切换工作区后 Graph 若已展开，也必须重新加载新仓库的提交。
watch([
  () => viewerPanes.value.find(p => p.id === 'graph')?.collapsed,
  () => gitStore.isRepo,
], ([collapsed, isRepo]) => {
  if (isRepo && collapsed === false && !gitStore.commits.length) void gitStore.loadGraph()
})
</script>
