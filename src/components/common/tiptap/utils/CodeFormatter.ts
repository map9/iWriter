import * as prettier from 'prettier/standalone'
import babelParser from 'prettier/plugins/babel'
import estreeParser from 'prettier/plugins/estree'
import typescriptParser from 'prettier/plugins/typescript'
import htmlParser from 'prettier/plugins/html'
import cssParser from 'prettier/plugins/postcss'
import yamlParser from 'prettier/plugins/yaml'
import type { Options } from 'prettier';

/**
 * Supported languages for code formatting
 */
export const SUPPORTED_LANGUAGES = {
  // JavaScript family
  'javascript': 'babel',
  'js': 'babel',
  'jsx': 'babel',
  'typescript': 'typescript',
  'ts': 'typescript',
  'tsx': 'typescript',
  
  // Web technologies
  'html': 'html',
  'xml': 'html',
  'css': 'css',
  'scss': 'scss',
  'sass': 'scss',
  'less': 'css',
  
  // Data formats
  'json': 'json',
  'json5': 'json5',
  'yaml': 'yaml',
  'yml': 'yaml',
  
  // Markdown
  'markdown': 'markdown',
  'md': 'markdown',
  
  // Others
  'vue': 'vue',
  'angular': 'angular',
  'graphql': 'graphql'
} as const

export type SupportedLanguage = keyof typeof SUPPORTED_LANGUAGES
export type PrettierParser = typeof SUPPORTED_LANGUAGES[SupportedLanguage]

/**
 * Formatting options for different languages
 */
const DEFAULT_FORMAT_OPTIONS: Options = {
  babel: {
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'es5',
    bracketSpacing: true,
    arrowParens: 'avoid'
  },
  typescript: {
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'es5',
    bracketSpacing: true,
    arrowParens: 'avoid'
  },
  html: {
    tabWidth: 2,
    htmlWhitespaceSensitivity: 'css',
    bracketSameLine: false
  },
  css: {
    tabWidth: 2,
    singleQuote: false
  },
  scss: {
    tabWidth: 2,
    singleQuote: false
  },
  json: {
    tabWidth: 2
  },
  json5: {
    tabWidth: 2
  },
  yaml: {
    tabWidth: 2
  },
  markdown: {
    tabWidth: 2,
    proseWrap: 'preserve'
  },
  vue: {
    tabWidth: 2,
    singleQuote: true,
    semi: true
  },
  angular: {
    tabWidth: 2,
    singleQuote: true,
    semi: true
  },
  graphql: {
    tabWidth: 2
  }
}

/**
 * Result of code formatting operation
 */
export interface FormatResult {
  success: boolean
  formattedCode?: string
  error?: string
}

/**
 * Check if a language is supported for formatting
 */
export function isLanguageSupported(language: string | null | undefined): language is SupportedLanguage {
  if (!language) return false
  return language.toLowerCase() in SUPPORTED_LANGUAGES
}

/**
 * Get Prettier parser for a given language
 */
export function getParserForLanguage(language: SupportedLanguage): PrettierParser {
  return SUPPORTED_LANGUAGES[language]
}

/**
 * Get plugins for a given parser
 */
function getPluginsForParser(parser: PrettierParser): unknown[] {
  switch (parser) {
    case 'babel':
      return [babelParser, estreeParser]
    case 'typescript':
      return [typescriptParser, estreeParser]
    case 'html':
      return [htmlParser]
    case 'css':
    case 'scss':
      return [cssParser]
    case 'yaml':
      return [yamlParser]
    case 'json':
    case 'json5':
      return [babelParser, estreeParser]
    case 'markdown':
      return [htmlParser]
    case 'vue':
      return [htmlParser, babelParser, estreeParser]
    case 'angular':
      return [htmlParser, typescriptParser, estreeParser]
    case 'graphql':
      return [babelParser, estreeParser]
    default:
      return [babelParser, estreeParser]
  }
}

/**
 * Format code using Prettier
 */
export async function formatCode(
  code: string, 
  language: string | null | undefined,
  customOptions?: Options
): Promise<FormatResult> {
  try {
    // Check if language is supported
    if (!isLanguageSupported(language)) {
      return {
        success: false,
        error: `Language '${language}' is not supported for formatting`
      }
    }

    // Get parser and options
    const parser = getParserForLanguage(language)
    const defaultOptions = DEFAULT_FORMAT_OPTIONS[parser] || {}
    const plugins = getPluginsForParser(parser)
    
    const formatOptions = {
      parser,
      plugins,
      ...defaultOptions,
      ...customOptions
    }

    // Format the code
    const formattedCode = await prettier.format(code, formatOptions as Options)
    
    return {
      success: true,
      formattedCode: formattedCode.trim() // Remove trailing newlines
    }
    
  } catch (error) {
    console.error('Code formatting error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown formatting error'
    }
  }
}

/**
 * Format code synchronously (for simple cases)
 * Note: This uses the synchronous version and has limitations
 */
export function formatCodeSync(
  code: string,
  language: string | null | undefined,
  customOptions?: Options
): Promise<FormatResult> {
  try {
    // Check if language is supported
    if (!isLanguageSupported(language)) {
      return Promise.resolve({
        success: false,
        error: `Language '${language}' is not supported for formatting`
      })
    }

    // Get parser and options
    const parser = getParserForLanguage(language)
    const defaultOptions = DEFAULT_FORMAT_OPTIONS[parser] || {}
    const plugins = getPluginsForParser(parser)
    
    const formatOptions = {
      parser,
      plugins,
      ...defaultOptions,
      ...customOptions
    }

    // Format the code synchronously (this will still be async due to prettier.format being async)
    // Note: This function is kept for API compatibility but will still return a Promise
    return prettier.format(code, formatOptions as Options).then(formattedCode => ({
      success: true,
      formattedCode: formattedCode.trim()
    })).catch(error => {
      console.error('Code formatting error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown formatting error'
      }
    })
    
  } catch (error) {
    console.error('Code formatting error:', error)
    return Promise.resolve({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown formatting error'
    })
  }
}

/**
 * Get list of all supported languages for UI display
 */
export function getSupportedLanguagesList(): SupportedLanguage[] {
  return Object.keys(SUPPORTED_LANGUAGES) as SupportedLanguage[]
}

/**
 * Get human-readable name for a language
 */
export function getLanguageDisplayName(language: SupportedLanguage): string {
  const displayNames: Record<SupportedLanguage, string> = {
    'javascript': 'JavaScript',
    'js': 'JavaScript',
    'jsx': 'React JSX',
    'typescript': 'TypeScript',
    'ts': 'TypeScript',
    'tsx': 'React TSX',
    'html': 'HTML',
    'xml': 'XML',
    'css': 'CSS',
    'scss': 'SCSS',
    'sass': 'Sass',
    'less': 'Less',
    'json': 'JSON',
    'json5': 'JSON5',
    'yaml': 'YAML',
    'yml': 'YAML',
    'markdown': 'Markdown',
    'md': 'Markdown',
    'vue': 'Vue.js',
    'angular': 'Angular',
    'graphql': 'GraphQL'
  }
  
  return displayNames[language] || language.toUpperCase()
}