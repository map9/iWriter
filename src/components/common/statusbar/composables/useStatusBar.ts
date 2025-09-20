import type { IStatusBarManager, StatusBarItemOptions } from '../types'
import { StatusBarManager } from '../core'

// Global singleton instance
let statusBarManagerInstance: StatusBarManager | null = null

/**
 * Composable for accessing the global StatusBar manager
 * Provides a Vue-friendly interface to the StatusBar system
 */
export function useStatusBar(): IStatusBarManager {
  // Create singleton instance if it doesn't exist
  if (!statusBarManagerInstance) {
    statusBarManagerInstance = new StatusBarManager()
  }
  
  return statusBarManagerInstance
}

/**
 * Composable for creating and managing a single StatusBar item
 * Provides reactive state and lifecycle management
 */
export function useStatusBarItem(options: StatusBarItemOptions) {
  const manager = useStatusBar()
  const item = manager.createStatusBarItem(options)
  return {
    item: item,
    dispose: () => {
      manager.removeItem(item.id)
    }
  }
}

/**
 * Reset the global StatusBar manager (useful for testing)
 */
export function resetStatusBar(): void {
  if (statusBarManagerInstance) {
    statusBarManagerInstance.clear()
    statusBarManagerInstance = null
  }
}