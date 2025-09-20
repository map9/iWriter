// Main StatusBar framework entry point
// Export everything needed to use the StatusBar framework

// Types and interfaces
export * from './types'

// Core classes
export {
  StatusBarManager,
  StatusBarItem,
  StatusBarGroup,
  NotificationManager,
  // add other exports from './core' that do not conflict here
} from './core'

// Vue components
export * from './components'

// Composables
export * from './composables/useStatusBar'
export * from './composables/useNotification'

// Utilities
export * from './utils/iconParser'
export * from './utils/tooltipRenderers'
export * from './utils/tooltipContentParseAdapter'
export { tooltipManager, createTooltipManager } from './utils/TooltipManager'