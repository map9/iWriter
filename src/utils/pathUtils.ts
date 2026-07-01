// 路径操作工具
function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, '/')
}

function splitPathRoot(path: string): { root: string; rest: string; absolute: boolean } {
  const normalized = normalizePathSeparators(path)
  const uncMatch = normalized.match(/^\/\/+([^/]+)\/+([^/]+)(?:\/+|$)/)
  if (uncMatch) {
    return {
      root: `//${uncMatch[1]}/${uncMatch[2]}`,
      rest: normalized.slice(uncMatch[0].length),
      absolute: true,
    }
  }

  const driveMatch = normalized.match(/^([a-zA-Z]:)\/+/)
  if (driveMatch) {
    return {
      root: `${driveMatch[1]}/`,
      rest: normalized.slice(driveMatch[0].length),
      absolute: true,
    }
  }

  if (normalized.startsWith('/')) {
    return {
      root: '/',
      rest: normalized.replace(/^\/+/, ''),
      absolute: true,
    }
  }

  return { root: '', rest: normalized, absolute: false }
}

function joinRoot(root: string, rest: string): string {
  if (!root) return rest || '.'
  if (!rest) return root
  return root.endsWith('/') ? `${root}${rest}` : `${root}/${rest}`
}

export const pathUtils = {
  basename: (path: string, ext?: string) => {
    if (!path) return '';

    const cleaned = normalizePathSeparators(path).replace(/\/+$/, '')
    let basename = cleaned.split('/').pop() || cleaned;

    if (ext) {
      const suffix = ext.startsWith('.') ? ext : `.${ext}`;
      if (basename.endsWith(suffix)) {
        basename = basename.slice(0, -suffix.length);
      }
    }

    return basename
  },

  // 获取带点的文件扩展名
  extname: (path: string) => {
    if (!path) return '';
    
    const basename = pathUtils.basename(path);
    const lastDot = basename.lastIndexOf('.');
    
    if (lastDot === -1 || lastDot === 0) return '';
    return basename.slice(lastDot);
  },

  // 获取不带点的文件扩展名
  extension: (path: string) => {
    if (!path) return '';
    
    const basename = pathUtils.basename(path);
    const lastDot = basename.lastIndexOf('.');
    
    if (lastDot === -1 || lastDot === 0) return '';
    return basename.slice(lastDot + 1);
  },

  dirname: (path: string) => {
    if (!path) return '.';

    const normalized = pathUtils.normalize(path)
    const { root, rest } = splitPathRoot(normalized)
    const parts = rest.split('/').filter(Boolean)

    if (parts.length <= 1) return root || '.'

    return joinRoot(root, parts.slice(0, -1).join('/'))
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

    const { root, rest, absolute } = splitPathRoot(path)

    // 处理 . 和 .. 
    const parts = rest.split('/');
    const result: string[] = [];
    
    for (const part of parts) {
      if (part === '..') {
        if (result.length > 0 && result[result.length - 1] !== '..') {
          result.pop();
        } else if (!absolute) {
          result.push('..');
        }
      } else if (part !== '.' && part !== '') {
        result.push(part);
      }
    }
    
    const finalPath = result.join('/');
    return joinRoot(root, finalPath)
  },

  isRelativePath(path: string): boolean {
    return (
      path.startsWith('./') ||
      path.startsWith('../') ||
      (!path.startsWith('/') && !/^[a-zA-Z]+:/.test(path))
    );
  },

  isAbsolutePath(path: string): boolean {
    if (!path) return false
    return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('\\\\') || path.startsWith('//')
  },

  parentDir: (path: string): string => {
    if (!path) return '/';

    const dir = pathUtils.dirname(path)
    if (dir === '.') return './'
    if (dir.endsWith('/')) return dir

    return `${dir}/`
  },
}


export default pathUtils
