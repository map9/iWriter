export function normalizeWorkspacePath(workspacePath: string): string {
  return workspacePath
}

export function normalizeWorkspaceBinding(
  workspacePath: string | null | undefined,
): string | null {
  if (workspacePath === undefined || workspacePath === null || workspacePath.length === 0) return null
  return normalizeWorkspacePath(workspacePath)
}

export function areWorkspacePathsEqual(
  left: string | null | undefined,
  right: string | null | undefined,
): boolean {
  const normalizedLeft = normalizeWorkspaceBinding(left)
  const normalizedRight = normalizeWorkspaceBinding(right)
  return normalizedLeft !== null
    && normalizedRight !== null
    && normalizedLeft === normalizedRight
}
