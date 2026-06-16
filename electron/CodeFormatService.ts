import type { Options } from 'prettier'
import {
  getPrettierParserForLanguage,
  isSupportedCodeFormatLanguage,
  type CodeFormatResult,
  type PrettierParser,
} from '../src/types/code-format'

type PrettierModule = typeof import('prettier')
type FormatOptions = Omit<Options, 'parser' | 'plugins'>

const DEFAULT_FORMAT_OPTIONS: Partial<Record<PrettierParser, FormatOptions>> = {
  babel: {
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'es5',
    bracketSpacing: true,
    arrowParens: 'avoid',
  },
  typescript: {
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'es5',
    bracketSpacing: true,
    arrowParens: 'avoid',
  },
  html: {
    tabWidth: 2,
    htmlWhitespaceSensitivity: 'css',
    bracketSameLine: false,
  },
  css: {
    tabWidth: 2,
    singleQuote: false,
  },
  scss: {
    tabWidth: 2,
    singleQuote: false,
  },
  json: {
    tabWidth: 2,
  },
  json5: {
    tabWidth: 2,
  },
  yaml: {
    tabWidth: 2,
  },
  markdown: {
    tabWidth: 2,
    proseWrap: 'preserve',
  },
  vue: {
    tabWidth: 2,
    singleQuote: true,
    semi: true,
  },
  angular: {
    tabWidth: 2,
    singleQuote: true,
    semi: true,
  },
  graphql: {
    tabWidth: 2,
  },
}

let prettierPromise: Promise<PrettierModule> | null = null

async function loadPrettier(): Promise<PrettierModule> {
  if (!prettierPromise) {
    prettierPromise = import('prettier')
  }
  return prettierPromise
}

export async function formatCodeInMain(
  code: string,
  language: string | null | undefined,
): Promise<CodeFormatResult> {
  if (!isSupportedCodeFormatLanguage(language)) {
    return {
      success: false,
      error: `Language '${language}' is not supported for formatting`,
    }
  }

  try {
    const parser = getPrettierParserForLanguage(language)
    const prettier = await loadPrettier()
    const formattedCode = await prettier.format(code, {
      parser,
      ...DEFAULT_FORMAT_OPTIONS[parser],
    })

    return {
      success: true,
      formattedCode: formattedCode.trim(),
    }
  } catch (error) {
    console.error('[CodeFormatService] Code formatting error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown formatting error'
    // Extract first line only (removes the code-frame block that prettier appends)
    const firstLine = msg.split('\n')[0] ?? msg
    // Extract loc from error object or fall back to parsing the "(line:col)" in the message
    let loc: { line: number; column: number } | undefined
    const errAny = error as Record<string, unknown>
    if (
      errAny.loc &&
      typeof (errAny.loc as Record<string, unknown>).start === 'object' &&
      (errAny.loc as Record<string, unknown>).start !== null
    ) {
      const start = (errAny.loc as Record<string, unknown>).start as Record<string, unknown>
      if (typeof start.line === 'number' && typeof start.column === 'number') {
        loc = { line: start.line, column: start.column }
      }
    }
    if (!loc) {
      const m = firstLine.match(/\((\d+):(\d+)\)/)
      if (m) loc = { line: Number(m[1]), column: Number(m[2]) }
    }
    return {
      success: false,
      error: firstLine,
      loc,
    }
  }
}
