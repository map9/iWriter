import {
  areWorkspacePathsEqual,
} from '@shared/workspace/path'

export type WorkspaceTransitionActivity = 'idle' | 'running' | 'hitl'

export type WorkspaceTransitionCommit = () => void

export interface WorkspaceTransitionPorts {
  prepareTarget(targetPath: string | null): Promise<boolean>
  getActivity(): WorkspaceTransitionActivity
  confirm(
    activity: Exclude<WorkspaceTransitionActivity, 'idle'>,
    targetPath: string | null,
  ): Promise<boolean>
  prepareCurrent(): Promise<WorkspaceTransitionCommit | null>
  prepareNext(targetPath: string | null): WorkspaceTransitionCommit | null
  terminateCurrent(activity: WorkspaceTransitionActivity): Promise<boolean>
  commitWorkspace(targetPath: string | null): void
}

export async function executeWorkspaceTransition(
  targetPath: string | null,
  ports: WorkspaceTransitionPorts,
): Promise<boolean> {
  if (!await ports.prepareTarget(targetPath)) return false

  const activity = ports.getActivity()
  if (activity !== 'idle' && !await ports.confirm(activity, targetPath)) {
    return false
  }

  const commitCurrent = await ports.prepareCurrent()
  if (!commitCurrent) return false
  const commitNext = ports.prepareNext(targetPath)
  if (!commitNext) return false
  if (!await ports.terminateCurrent(activity)) return false

  ports.commitWorkspace(targetPath)
  commitCurrent()
  commitNext()
  return true
}

export function isThreadWorkspaceSelectable(
  threadWorkspacePath: string | null | undefined,
  currentWorkspacePath: string | null | undefined,
): boolean {
  return areWorkspacePathsEqual(threadWorkspacePath, currentWorkspacePath)
}
