// 上下文菜单项接口
export interface ContextMenuItem {
  id?: string
  label?: string
  type?: 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio'
  enabled?: boolean
  visible?: boolean
  checked?: boolean
  submenu?: ContextMenuItem[]
  accelerator?: string
  role?: string
}

export interface MenuPosition {
  x: number
  y: number
}

export type ShowMenuRequest =
  | {
      kind: 'context'
      items: ContextMenuItem[]
      position: MenuPosition
    }
  | {
      kind: 'app'
      position: MenuPosition
    }

export function createContextMenuRequest(items: ContextMenuItem[], position: MenuPosition): ShowMenuRequest {
  return {
    kind: 'context',
    items,
    position,
  }
}

export function createAppMenuRequest(position: MenuPosition): ShowMenuRequest {
  return {
    kind: 'app',
    position,
  }
}

export interface DesktopAppMenuTemplateItem {
  id?: string
  label?: string
  type?: string
  role?: string
  submenu?: DesktopAppMenuTemplateItem[]
  [key: string]: unknown
}

const desktopAppMenuExtractedIds = new Set([
  'appMenu',
  'file-preferences',
  'file-quit',
  'help-about',
])

const desktopAppMenuExtractedRoles = new Set([
  'about',
  'close',
  'quit',
])

function shouldExtractDesktopAppMenuItem(item: DesktopAppMenuTemplateItem): boolean {
  if (item.id && desktopAppMenuExtractedIds.has(item.id)) return true
  if (item.role && desktopAppMenuExtractedRoles.has(item.role)) return true
  return false
}

function pruneMenuSeparators<T extends DesktopAppMenuTemplateItem>(items: T[]): T[] {
  const pruned: T[] = []

  for (const item of items) {
    if (item.type === 'separator' && (pruned.length === 0 || pruned[pruned.length - 1]?.type === 'separator')) {
      continue
    }
    pruned.push(item)
  }

  while (pruned[pruned.length - 1]?.type === 'separator') {
    pruned.pop()
  }

  return pruned
}

function cloneWithoutExtractedItems<T extends DesktopAppMenuTemplateItem>(item: T): T | null {
  if (shouldExtractDesktopAppMenuItem(item)) return null

  const cloned = { ...item } as T
  if (Array.isArray(item.submenu)) {
    const submenu = item.submenu
      .map(cloneWithoutExtractedItems)
      .filter((child): child is DesktopAppMenuTemplateItem => !!child)
    cloned.submenu = pruneMenuSeparators(submenu)
  }

  return cloned
}

export function createDesktopAppMenuTemplate<T extends DesktopAppMenuTemplateItem>(
  template: T[],
  quickActions: T[],
): T[] {
  const cleanedTemplate = template
    .map(cloneWithoutExtractedItems)
    .filter((item): item is T => !!item)

  return [
    ...cleanedTemplate,
    { type: 'separator' } as T,
    ...quickActions,
  ]
}
