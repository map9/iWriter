/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  electronAPI: {
    platform: string
    
    // File operations
    openFolder: () => Promise<string | null>
    openFile: () => Promise<string | null>
    saveFile: (content: string, filePath?: string) => Promise<string | null>
    readFile: (filePath: string) => Promise<string | null>
    getFiles: (folderPath: string) => Promise<any[]>
    
    // File management operations
    createFile: (folderPath: string, fileName: string) => Promise<string>
    createFolder: (parentPath: string, folderName: string) => Promise<string>
    deleteFile: (filePath: string) => Promise<void>
    renameFile: (oldPath: string, newName: string) => Promise<string>
    moveFile: (sourcePath: string, targetDir: string, conflictAction?: 'keepBoth' | 'replace' | 'cancel') => Promise<any>
    
    // Menu actions
    onMenuAction: (callback: (action: string) => void) => void
    removeMenuActionListener: () => void
    
    // Window state requests
    onWindowStateRequest: (callback: () => void) => void
    removeWindowStateRequestListener: () => void
    
    // Window controls
    minimize: () => void
    maximize: () => void
    close: () => void
    isMaximized: () => Promise<boolean>
    
    // Dialogs
    showSaveDialog: (fileName: string) => Promise<'save' | 'dontSave' | 'cancel'>
    
    // Window state changes
    onWindowStateChanged?: (callback: (state: { maximized: boolean }) => void) => void
    
    // Menu state updates
    updateMenuState: (updates: any) => Promise<void>
    setAutoSave: (enabled: boolean) => Promise<void>
    setDocumentState: (hasDocument: boolean) => Promise<void>
    setFormattingState: (formatting: any) => Promise<void>
    setFolderState: (hasFolderOpen: boolean) => Promise<void>
    setWindowState: (hasMainWindow: boolean) => Promise<void>
  }
}