export type WorkspaceTransitionActivity = 'idle' | 'running' | 'hitl'

export type WorkspaceTransitionResult =
  | { status: 'completed' }
  | { status: 'preparation-failed' }
  | { status: 'cancelled' }
  | { status: 'termination-failed' }

export interface WorkspaceTransitionPorts {
  prepareTarget(targetPath: string | null): Promise<boolean>
  getActivity(): WorkspaceTransitionActivity
  confirm(
    activity: Exclude<WorkspaceTransitionActivity, 'idle'>,
    targetPath: string | null,
  ): Promise<boolean>
  terminateCurrent(activity: WorkspaceTransitionActivity): Promise<boolean>
  commit(targetPath: string | null): void
  afterCommit(targetPath: string | null): void
}

export async function executeWorkspaceTransition(
  targetPath: string | null,
  ports: WorkspaceTransitionPorts,
): Promise<WorkspaceTransitionResult> {
  if (!await ports.prepareTarget(targetPath)) {
    return { status: 'preparation-failed' }
  }

  const activity = ports.getActivity()
  if (activity !== 'idle' && !await ports.confirm(activity, targetPath)) {
    return { status: 'cancelled' }
  }

  if (!await ports.terminateCurrent(activity)) {
    return { status: 'termination-failed' }
  }

  // Everything after this boundary is an in-memory commit. Any fallible target
  // validation and current-resource shutdown has already completed.
  ports.commit(targetPath)
  ports.afterCommit(targetPath)
  return { status: 'completed' }
}

export function normalizeWorkspacePath(workspacePath: string): string {
  const withForwardSlashes = workspacePath.trim().replace(/\\/g, '/')
  const normalized = withForwardSlashes === '/' || /^[a-z]:\/$/i.test(withForwardSlashes)
    ? withForwardSlashes
    : withForwardSlashes.replace(/\/+$/, '')
  const isWindowsPath = /^[a-z]:\//i.test(normalized) || normalized.startsWith('//')
  return isWindowsPath ? normalized.toLowerCase() : normalized
}

export function isThreadWorkspaceSelectable(
  threadWorkspacePath: string | null | undefined,
  currentWorkspacePath: string | null | undefined,
): boolean {
  if (!threadWorkspacePath || !currentWorkspacePath) return false
  return normalizeWorkspacePath(threadWorkspacePath) === normalizeWorkspacePath(currentWorkspacePath)
}
