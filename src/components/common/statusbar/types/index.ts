// Export all types and interfaces
export * from './statusbar'
export * from './notification'
export * from './tooltip'

// Re-export for convenience
export type { IBasicStatusBarItem as BasicStatusBarItem } from './statusbar'
export type { IStatusBarItem as StatusBarItem } from './statusbar'
export type { IStatusBarGroup as StatusBarGroup } from './statusbar'
export type { IStatusBarManager as StatusBarManager } from './statusbar'
export type { INotificationManager as NotificationManager } from './notification'
export type { NotificationItem, NotificationDisplayOptions, NotificationState, ConflictStrategy } from './notification'