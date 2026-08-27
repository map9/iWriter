export function normalizeWorkspacePath(workspacePath: string): string {
  const withForwardSlashes = workspacePath.trim().replace(/\\/g, '/')
  const normalized = withForwardSlashes === '/' || /^[a-z]:\/$/i.test(withForwardSlashes)
    ? withForwardSlashes
    : withForwardSlashes.replace(/\/+$/, '')
  const isWindowsPath = /^[a-z]:(?:\/|$)/i.test(normalized) || normalized.startsWith('//')
  return isWindowsPath ? normalized.toLowerCase() : normalized
}

export function normalizeWorkspaceBinding(
  workspacePath: string | null | undefined,
): string | null {
  if (!workspacePath?.trim()) return null
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
