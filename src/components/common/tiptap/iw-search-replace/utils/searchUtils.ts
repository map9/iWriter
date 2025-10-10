/**
 * 转义正则表达式特殊字符
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 构建搜索正则表达式
 */
export function buildSearchPattern(
  searchTerm: string,
  options: { caseSensitive: boolean; wholeWord: boolean; regex: boolean }
): RegExp {
  let pattern = searchTerm

  // 如果不是正则模式，转义特殊字符
  if (!options.regex) {
    pattern = escapeRegExp(pattern)
  }

  // 全词匹配
  if (options.wholeWord) {
    pattern = `\\b${pattern}\\b`
  }

  const flags = options.caseSensitive ? 'gu' : 'gui'

  try {
    return new RegExp(pattern, flags)
  } catch (error) {
    // 如果正则表达式无效，返回一个永远不匹配的正则
    console.error('Invalid regex pattern:', error)
    return /(?!)/g // 永远不匹配的正则表达式
  }
}