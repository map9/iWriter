// 文件操作类型枚举
export enum FileOperationType {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  RENAME = 'rename',
  MOVE = 'move',
  COPY = 'copy'
}

// 文件操作结果接口
export interface FileOperationResult {
  success: boolean
  conflictAction: 'keepBoth' | 'replace' | 'cancel'
  newPath: string
}

// 文件信息接口
export interface FileInfo {
  name: string
  isDirectory: boolean
  isWritable?: boolean
  isHidden?: boolean
  path: string
  size?: number
  created?: Date
  modified?: Date
  accessed?: Date
  changed?: Date
}

// 文件变化接口
export interface FileChange {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir'
  path: string
  timestamp: Date
}
