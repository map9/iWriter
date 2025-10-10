import {
  IconPercentage0,
  IconRefresh,
  IconSettings,
  IconBug,
  IconAlertTriangle,
  IconAlertCircle,
  IconInfoCircle,
  IconCheck,
  IconX,
  IconGitBranch,
  IconGitCommit,
  IconGitMerge,
  IconFile,
  IconFolder,
  IconSearch,
  IconPuzzle,
  IconTerminal,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlayerPause,
  IconLoader,
  IconLoader2,
  IconHeart,
  IconStar,
  IconBookmark,
  IconHome,
  IconMail,
  IconBell,
  IconUser,
  IconUsers,
  IconCode,
  IconDatabase,
  IconServer,
  IconCloud,
  IconDownload,
  IconUpload,
  IconLock,
  IconLockOpen,
  IconEye,
  IconEyeOff,
  IconArrowRight,
  IconArrowLeft,
  IconArrowUp,
  IconArrowDown,
  IconChevronRight,
  IconChevronLeft,
  IconChevronUp,
  IconChevronDown
} from '@tabler/icons-vue'

import type { Component } from 'vue'

// 图标解析回调接口（同步）
export interface IconResolver {
  (iconName: string): Component | null
}

// 简化配置
export interface IconParserConfig {
  // 外部回调解析器
  externalResolver?: IconResolver

  // 默认图标组件
  defaultIcon?: Component | null

}

// Icon name mappings from VSCode-style names to Tabler icon components
const iconNameMap: Record<string, Component> = {
  'blank': IconPercentage0,
  'sync': IconRefresh,
  'gear': IconSettings,
  'settings': IconSettings,
  'bug': IconBug,
  'warning': IconAlertTriangle,
  'error': IconAlertCircle,
  'info': IconInfoCircle,
  'check': IconCheck,
  'x': IconX,
  'git-branch': IconGitBranch,
  'git-commit': IconGitCommit,
  'git-merge': IconGitMerge,
  'file': IconFile,
  'folder': IconFolder,
  'search': IconSearch,
  'extensions': IconPuzzle,
  'terminal': IconTerminal,
  'debug': IconBug,
  'play': IconPlayerPlay,
  'stop': IconPlayerStop,
  'pause': IconPlayerPause,
  'loading': IconLoader,
  'spinner': IconLoader2,
  'heart': IconHeart,
  'star': IconStar,
  'bookmark': IconBookmark,
  'home': IconHome,
  'mail': IconMail,
  'bell': IconBell,
  'user': IconUser,
  'users': IconUsers,
  'code': IconCode,
  'database': IconDatabase,
  'server': IconServer,
  'cloud': IconCloud,
  'download': IconDownload,
  'upload': IconUpload,
  'lock': IconLock,
  'unlock': IconLockOpen,
  'eye': IconEye,
  'eye-closed': IconEyeOff,
  'arrow-right': IconArrowRight,
  'arrow-left': IconArrowLeft,
  'arrow-up': IconArrowUp,
  'arrow-down': IconArrowDown,
  'chevron-right': IconChevronRight,
  'chevron-left': IconChevronLeft,
  'chevron-up': IconChevronUp,
  'chevron-down': IconChevronDown,
  // Direct Tabler icon names
  'refresh': IconRefresh,
  'alert-triangle': IconAlertTriangle,
  'alert-circle': IconAlertCircle,
  'info-circle': IconInfoCircle,
  'puzzle': IconPuzzle,
  'player-play': IconPlayerPlay,
  'player-stop': IconPlayerStop,
  'player-pause': IconPlayerPause,
  'loader': IconLoader,
  'loader-2': IconLoader2,
  'lock-open': IconLockOpen,
  'eye-off': IconEyeOff,
}

// 新增：外部解析器配置
let externalIconResolver: IconResolver | null = null
let defaultIconComponent: Component | null = IconPercentage0

/**
 * 设置图标解析配置
 */
export function setupIconResolver(config: IconParserConfig): void {
  externalIconResolver = config.externalResolver || null
  defaultIconComponent = config.defaultIcon || null

  console.debug('[IconParser] Icon resolver configured:', {
    hasExternalResolver: !!externalIconResolver,
    hasDefaultIcon: !!defaultIconComponent
  })
}

/**
 * Supported Tailwind CSS animations
 */
export type IconAnimation = 'spin' | 'ping' | 'pulse' | 'bounce' | null

/**
 * Content segment type for rich text parsing
 */
export interface ContentSegment {
  type: 'icon' | 'text'
  value: string
  animation?: IconAnimation
}

/**
 * Parse text containing VSCode-style icon syntax: $(icon-name)
 * Returns array of content segments with icons and text
 * Example: '$(icon1) Hello $(icon2) World' → [
 *   { type: 'icon', value: 'icon1' },
 *   { type: 'text', value: ' Hello ' },
 *   { type: 'icon', value: 'icon2' },
 *   { type: 'text', value: ' World' }
 * ]
 */
export function parseRichContent(text: string): ContentSegment[] {
  if (!text) return []

  const segments: ContentSegment[] = []
  const iconPattern = /\$\(([^)]+)\)/g
  let lastIndex = 0
  let match

  while ((match = iconPattern.exec(text)) !== null) {
    // Add text before icon (if any)
    if (match.index > lastIndex) {
      const textBefore = text.substring(lastIndex, match.index)
      if (textBefore) {
        segments.push({ type: 'text', value: textBefore })
      }
    }

    // Add icon
    const iconName = match[1]
    if (iconName) {
      const processedIcon = processIconName(iconName)
      segments.push({
        type: 'icon',
        value: processedIcon.name,
        animation: processedIcon.animation
      })
    }

    lastIndex = iconPattern.lastIndex
  }

  // Add remaining text after last icon (if any)
  if (lastIndex < text.length) {
    const textAfter = text.substring(lastIndex)
    if (textAfter) {
      segments.push({ type: 'text', value: textAfter })
    }
  }

  // If no icons found, return the entire text as a single text segment
  if (segments.length === 0 && text) {
    segments.push({ type: 'text', value: text })
  }

  return segments
}

/**
 * Parse text containing VSCode-style icon syntax: $(icon-name)
 * Returns separated icon name and remaining text
 * @deprecated Use parseRichContent for better multi-icon support
 */
export function parseIconText(text: string): { iconName: string | null; text: string } {
  const iconPattern = /\$\(([^)]+)\)/
  const match = text.match(iconPattern)

  if (match && match[1]) {
    const iconName = match[1]
    const cleanText = text.replace(iconPattern, '').trim()
    return {
      iconName: mapIconName(iconName),
      text: cleanText || ''
    }
  }

  return {
    iconName: null,
    text: text || ''
  }
}

/**
 * Process icon name and extract animation information
 */
function processIconName(iconName: string): { name: string; animation: IconAnimation } {
  const supportedAnimations: IconAnimation[] = ['spin', 'ping', 'pulse', 'bounce']
  let animation: IconAnimation = null
  let baseName = iconName

  // Check for animation suffix
  for (const anim of supportedAnimations) {
    if (iconName.includes(`~${anim}`)) {
      animation = anim
      baseName = iconName.replace(`~${anim}`, '')
      break
    }
  }

  return {
    name: mapIconName(baseName),
    animation
  }
}

/**
 * Map VSCode icon names to Tabler icon names
 */
function mapIconName(vscodeIconName: string): string {
  // Handle special cases like sync~spin (already cleaned by processIconName)
  const baseName = vscodeIconName.split('~')[0] || vscodeIconName
  return baseName || 'blank'
}

/**
 * 增强的图标获取函数
 * 查找顺序：内置映射 → 外部回调 → 默认图标
 */
export function getTablerIcon(iconName: string): Component | null {
  // 1. 首先尝试内置映射（保持向后兼容）
  const builtinIcon = iconNameMap[iconName]
  if (builtinIcon) {
    console.debug(`[IconParser] Icon '${iconName}' found in builtin map`)
    return builtinIcon
  }

  // 2. 尝试外部解析器
  if (externalIconResolver) {
    try {
      const externalIcon = externalIconResolver(iconName)
      if (externalIcon) {
        console.debug(`[IconParser] Icon '${iconName}' resolved by external resolver`)
        return externalIcon
      }
    } catch (error) {
      console.warn(`[IconParser] External resolver failed for '${iconName}':`, error)
    }
  }

  // 3. 返回默认图标
  if (defaultIconComponent) {
    console.debug(`[IconParser] Using default icon for '${iconName}'`)
    return defaultIconComponent
  }

  // 4. 都没有找到
  console.warn(`[IconParser] No icon found for '${iconName}'`)
  return null
}

/**
 * 修改 setTablerIcon 函数，支持强制覆盖
 */
export function setTablerIcon(iconName: string, icon: Component, forceOverride = false): boolean {
  if (!iconNameMap[iconName] || forceOverride) {
    iconNameMap[iconName] = icon
    console.debug(`[IconParser] Icon '${iconName}' registered in builtin map`)
    return true
  } else {
    console.warn(`[IconParser] Icon '${iconName}' already exists in builtin map`)
    return false
  }
}

/**
 * 清理配置（主要用于测试）
 */
export function resetIconResolver(): void {
  externalIconResolver = null
  defaultIconComponent = null
}

/**
 * 获取当前配置状态
 */
export function getIconResolverStatus(): {
  hasExternalResolver: boolean
  hasDefaultIcon: boolean
  builtinIconCount: number
} {
  return {
    hasExternalResolver: !!externalIconResolver,
    hasDefaultIcon: !!defaultIconComponent,
    builtinIconCount: Object.keys(iconNameMap).length
  }
}