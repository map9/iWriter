import { execFile } from 'child_process'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'

import type {
  PandocAvailabilityResult,
  PandocExportRequest,
  PandocExportResult,
  PandocImportRequest,
  PandocImportResult,
} from '../src/types/pandoc'
import { getPandocExportFormat, getPandocImportFormat } from '../src/import-export/pandocFormats'

export class PandocService {
  private readonly executable = 'pandoc'

  async checkAvailability(pandocPath?: string): Promise<PandocAvailabilityResult> {
    try {
      const executablePath = await this.resolveExecutable(pandocPath)
      const { stdout } = await this.run(executablePath, ['--version'])
      const versionLine = stdout.split(/\r?\n/, 1)[0]?.trim()
      return {
        available: true,
        version: versionLine || undefined,
        executablePath,
      }
    } catch (error) {
      return {
        available: false,
        error: this.toErrorMessage(error),
        installHint: this.getInstallHint(),
      }
    }
  }

  async importFile(request: PandocImportRequest): Promise<PandocImportResult> {
    const extension = path.extname(request.inputPath).replace(/^\./, '').toLowerCase()
    const sourceFormat = getPandocImportFormat(extension)

    if (!sourceFormat) {
      return {
        success: false,
        errorCode: 'UNSUPPORTED_FORMAT',
        error: `Unsupported import format: .${extension || 'unknown'}`,
      }
    }

    const availability = await this.checkAvailability(request.pandocPath)
    if (!availability.available) {
      return {
        success: false,
        errorCode: 'NOT_INSTALLED',
        error: availability.error ?? 'Pandoc is not installed',
      }
    }

    try {
      const executablePath = availability.executablePath || await this.resolveExecutable(request.pandocPath)
      const { stdout } = await this.run(executablePath, [
        '--from',
        sourceFormat,
        '--to',
        'gfm',
        '--wrap=none',
        request.inputPath,
      ])

      return {
        success: true,
        markdown: stdout,
        sourceFormat,
      }
    } catch (error) {
      return {
        success: false,
        errorCode: 'CONVERSION_FAILED',
        error: this.toErrorMessage(error),
      }
    }
  }

  async exportFile(request: PandocExportRequest): Promise<PandocExportResult> {
    const extension = path.extname(request.outputPath).replace(/^\./, '').toLowerCase()
    const targetFormat = getPandocExportFormat(extension)

    if (!targetFormat) {
      return {
        success: false,
        errorCode: 'UNSUPPORTED_FORMAT',
        error: `Unsupported export format: .${extension || 'unknown'}`,
      }
    }

    const availability = await this.checkAvailability(request.pandocPath)
    if (!availability.available) {
      return {
        success: false,
        errorCode: 'NOT_INSTALLED',
        error: availability.error ?? 'Pandoc is not installed',
      }
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'iwriter-pandoc-'))
    const tempInputPath = path.join(tempDir, 'input.md')

    try {
      await fs.writeFile(tempInputPath, request.markdown, 'utf8')
      const executablePath = availability.executablePath || await this.resolveExecutable(request.pandocPath)

      const args = [
        '--from',
        'gfm',
        '--to',
        targetFormat,
        '--standalone',
        '--output',
        request.outputPath,
        tempInputPath,
      ]

      if (request.title && (targetFormat === 'html' || targetFormat === 'epub')) {
        args.unshift('--metadata', `title=${request.title}`)
      }

      if (request.options?.referenceDocPath && targetFormat === 'docx') {
        args.unshift(`--reference-doc=${request.options.referenceDocPath}`)
      }

      if (request.options?.templatePath && targetFormat === 'odt') {
        args.unshift(`--reference-doc=${request.options.templatePath}`)
      }

      if (request.options?.cssPath && (targetFormat === 'html' || targetFormat === 'epub')) {
        args.unshift(`--css=${request.options.cssPath}`)
      }

      if (request.options?.tocDepth && targetFormat === 'epub') {
        args.unshift(`--toc-depth=${request.options.tocDepth}`, '--toc')
      }

      if (request.options?.customArgs) {
        args.unshift(...this.tokenizeArgs(request.options.customArgs))
      }

      await this.run(executablePath, args)

      return {
        success: true,
        outputPath: request.outputPath,
        targetFormat,
      }
    } catch (error) {
      return {
        success: false,
        errorCode: 'CONVERSION_FAILED',
        error: this.toErrorMessage(error),
      }
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true })
    }
  }

  private async resolveExecutable(pandocPath?: string): Promise<string> {
    const trimmed = pandocPath?.trim()
    if (!trimmed) return this.executable

    const normalized = trimmed.replace(/^"(.*)"$/, '$1')
    try {
      const stats = await fs.stat(normalized)
      if (stats.isDirectory()) {
        return path.join(normalized, process.platform === 'win32' ? 'pandoc.exe' : 'pandoc')
      }
    } catch {
      // Fall through to direct path usage.
    }
    return normalized
  }

  private run(executable: string, args: string[]) {
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile(executable, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr?.trim() || error.message))
          return
        }

        resolve({
          stdout,
          stderr,
        })
      })
    })
  }

  private tokenizeArgs(input: string): string[] {
    const tokens: string[] = []
    let current = ''
    let quote: '"' | "'" | null = null

    for (let i = 0; i < input.length; i++) {
      const char = input[i] ?? ''
      if (quote) {
        if (char === quote) {
          quote = null
        } else if (char === '\\' && i + 1 < input.length) {
          current += input[++i] ?? ''
        } else {
          current += char
        }
        continue
      }

      if (char === '"' || char === "'") {
        quote = char
        continue
      }

      if (/\s/.test(char)) {
        if (current) {
          tokens.push(current)
          current = ''
        }
        continue
      }

      if (char === '\\' && i + 1 < input.length) {
        current += input[++i]
        continue
      }

      current += char
    }

    if (current) tokens.push(current)
    return tokens
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private getInstallHint(): string {
    switch (process.platform) {
      case 'darwin':
        return 'Install pandoc with Homebrew: brew install pandoc'
      case 'win32':
        return 'Install pandoc from https://pandoc.org/installing.html and restart iWriter afterwards.'
      default:
        return 'Install pandoc from your package manager or https://pandoc.org/installing.html.'
    }
  }
}
