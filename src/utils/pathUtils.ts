// 路径操作工具
export const pathUtils = {
  basename: (path: string, ext?: string) => {
    if (!path) return '';

    const cleaned = path.replace(/\\/g, '/').replace(/\/+$/, '')
    let basename = cleaned.split('/').pop() || cleaned;
    if (ext && basename.endsWith(ext)) {
      basename = basename.slice(0, -ext.length);
    }

    return basename
  },

  extname: (path: string) => {
    if (!path) return '';
    
    const basename = pathUtils.basename(path);
    const lastDot = basename.lastIndexOf('.');
    
    if (lastDot === -1 || lastDot === 0) return '';
    return basename.slice(lastDot);
  },

  extension: (path: string) => {
    if (!path) return '';
    
    const basename = pathUtils.basename(path);
    const lastDot = basename.lastIndexOf('.');
    
    if (lastDot === -1 || lastDot === 0) return '';
    return basename.slice(lastDot + 1);
  },

  dirname: (path: string) => {
    if (!path) return '.';
    
    const cleaned = path.replace(/\\/g, '/').replace(/\/+$/, '')
    
    const lastSlash = cleaned.lastIndexOf('/');
    if (lastSlash === -1) return '.';
    if (lastSlash === 0) return '/';
    
    return cleaned.slice(0, lastSlash);
  },
  
  join: (...paths: string[]) => {
    if (paths.length === 0) return '.';
    
    // 过滤空字符串
    const validPaths = paths.filter(p => p && typeof p === 'string');
    if (validPaths.length === 0) return '.';
    
    // 拼接路径
    const joined = validPaths.join('/');
    return pathUtils.normalize(joined);
  },

  normalize(path: string) {
    if (!path) return '.';
    
    // 将所有反斜杠转换为正斜杠
    let normalized = path.replace(/\\/g, '/');
    
    // 处理多个连续的斜杠
    normalized = normalized.replace(/\/+/g, '/');
    
    // 处理 . 和 .. 
    const parts = normalized.split('/');
    const result = [];
    
    for (const part of parts) {
      if (part === '..') {
        if (result.length > 0 && result[result.length - 1] !== '..') {
          result.pop();
        } else if (!normalized.startsWith('/')) {
          result.push('..');
        }
      } else if (part !== '.' && part !== '') {
        result.push(part);
      }
    }
    
    // 保持绝对路径的前导斜杠
    const finalPath = result.join('/');
    if (normalized.startsWith('/')) {
      return '/' + finalPath;
    }
    return finalPath || '.';
  }
}


export default pathUtils