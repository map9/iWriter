import { execFile } from 'child_process'
import { pathToFileURL } from 'url'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import * as os from 'os'
import type {
  LibreOfficeAvailabilityResult,
  OfficeConvertRequest,
  OfficeConvertResult,
} from '../src/types/libreoffice'

export class LibreOfficeService {
  /** 转换产物的缓存目录 */
  private readonly cacheDir: string
  /** LibreOffice 独立用户 profile 目录（持久化，避免使用用户现有 GUI profile 中的字体替换规则） */
  private readonly loProfileDir: string

  constructor() {
    this.cacheDir = path.join(os.tmpdir(), 'iwriter-office')
    this.loProfileDir = path.join(os.homedir(), '.iwriter', 'lo-profile')
  }

  async checkAvailability(sofficePath?: string): Promise<LibreOfficeAvailabilityResult> {
    try {
      const executablePath = await this.resolveExecutable(sofficePath)
      const { stdout } = await this.run(executablePath, ['--version'])
      const versionLine = stdout.split(/\r?\n/, 1)[0]?.trim()
      return {
        available: true,
        version: versionLine || undefined,
        executablePath,
        installHint: this.getInstallHint(),
        installCommand: this.getInstallCommand(),
        downloadUrl: 'https://www.libreoffice.org/download/',
      }
    } catch (error) {
      return {
        available: false,
        error: this.toErrorMessage(error),
        installHint: this.getInstallHint(),
        installCommand: this.getInstallCommand(),
        downloadUrl: 'https://www.libreoffice.org/download/',
      }
    }
  }

  async convertToPdf(request: OfficeConvertRequest): Promise<OfficeConvertResult> {
    const { inputPath, sofficePath } = request

    const availability = await this.checkAvailability(sofficePath)
    if (!availability.available || !availability.executablePath) {
      return {
        success: false,
        errorCode: 'NOT_INSTALLED',
        error: availability.error ?? 'LibreOffice is not installed',
      }
    }

    // 先检查缓存
    try {
      const cachedPath = await this.getCachedPdfPath(inputPath)
      if (cachedPath) {
        return { success: true, pdfPath: cachedPath }
      }
    } catch {
      // 缓存检查失败时继续转换
    }

    // 确保缓存目录存在
    await fs.mkdir(this.cacheDir, { recursive: true })

    // 使用唯一子目录承接 LibreOffice 的输出，避免同名文件冲突
    const convTmpDir = path.join(
      this.cacheDir,
      `conv-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    await fs.mkdir(convTmpDir, { recursive: true })

    try {
      const executable = availability.executablePath
      await fs.mkdir(this.loProfileDir, { recursive: true })
      await this.run(executable, [
        '--headless',
        '--norestore',
        `-env:UserInstallation=${pathToFileURL(this.loProfileDir).href}`,
        '--convert-to',
        'pdf',
        '--outdir',
        convTmpDir,
        inputPath,
      ])

      // LibreOffice 以输入文件名（去掉扩展名）命名输出文件
      const baseName = path.basename(inputPath, path.extname(inputPath))
      const tmpOutputPath = path.join(convTmpDir, `${baseName}.pdf`)

      try {
        await fs.access(tmpOutputPath)
      } catch {
        return {
          success: false,
          errorCode: 'OUTPUT_NOT_FOUND',
          error: `LibreOffice did not produce output file: ${tmpOutputPath}`,
        }
      }

      // 以内容 hash 命名产物并移入缓存目录
      const hash = await this.computeHash(inputPath)
      const cachedPath = path.join(this.cacheDir, `${hash}.pdf`)
      await fs.rename(tmpOutputPath, cachedPath)

      return { success: true, pdfPath: cachedPath }
    } catch (error) {
      return {
        success: false,
        errorCode: 'CONVERSION_FAILED',
        error: this.toErrorMessage(error),
      }
    } finally {
      // 清理本次转换的临时子目录
      await fs.rm(convTmpDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  /** 应用退出时清理整个缓存目录 */
  async cleanupCache(): Promise<void> {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true })
    } catch {
      // 忽略清理失败
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getCachedPdfPath(inputPath: string): Promise<string | null> {
    const hash = await this.computeHash(inputPath)
    const cachedPath = path.join(this.cacheDir, `${hash}.pdf`)
    try {
      await fs.access(cachedPath)
      return cachedPath
    } catch {
      return null
    }
  }

  private async computeHash(inputPath: string): Promise<string> {
    const stat = await fs.stat(inputPath)
    const raw = `${path.resolve(inputPath)}:${stat.mtimeMs}:${stat.size}`
    return crypto.createHash('md5').update(raw).digest('hex')
  }

  private async resolveExecutable(sofficePath?: string): Promise<string> {
    const trimmed = sofficePath?.trim()
    if (trimmed) {
      const normalized = trimmed.replace(/^"(.*)"$/, '$1')
      try {
        const stats = await fs.stat(normalized)
        if (stats.isDirectory()) {
          return path.join(
            normalized,
            process.platform === 'win32' ? 'soffice.exe' : 'soffice',
          )
        }
      } catch {
        // 直接用作路径
      }
      return normalized
    }

    // 按平台探测默认安装路径
    if (process.platform === 'darwin') {
      const macPath = '/Applications/LibreOffice.app/Contents/MacOS/soffice'
      try {
        await fs.access(macPath)
        return macPath
      } catch {
        // 回退到 PATH 上的 soffice
      }
    } else if (process.platform === 'win32') {
      for (const p of [
        'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
        'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
      ]) {
        try {
          await fs.access(p)
          return p
        } catch {
          // continue
        }
      }
    }

    // Linux 或 fallback：依赖 PATH
    return this.resolveExecutablePath('soffice')
  }

  private async resolveExecutablePath(executable: string): Promise<string> {
    const locator = process.platform === 'win32' ? 'where.exe' : 'which'
    return new Promise(resolve => {
      execFile(locator, [executable], { timeout: 5_000 }, (error, stdout) => {
        const detected = error ? '' : stdout.toString().split(/\r?\n/, 1)[0]?.trim()
        resolve(detected || executable)
      })
    })
  }

  private run(executable: string, args: string[]) {
    return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const dir = path.dirname(executable)
      execFile(
        executable,
        args,
        {
          encoding: 'utf8',
          maxBuffer: 20 * 1024 * 1024,
          timeout: 120_000,
          windowsHide: true,
          // LO on Windows resolves its own resources relative to its program dir;
          // without this, it fails with "Could not find platform independent libraries"
          cwd: dir !== '.' ? dir : undefined,
        },
        (error, stdout, stderr) => {
          if (error) {
            // 优先展示 LibreOffice 的 stderr 诊断信息
            const detail = stderr?.trim()
            reject(new Error(detail || error.message))
            return
          }
          resolve({ stdout, stderr })
        },
      )
    })
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private getInstallHint(): string {
    switch (process.platform) {
      case 'darwin':
        return 'brew install --cask libreoffice\n\nor download from https://www.libreoffice.org/download/'
      case 'win32':
        return 'winget install TheDocumentFoundation.LibreOffice\n\nor download from https://www.libreoffice.org/download/'
      default:
        return 'sudo apt install libreoffice   # Debian/Ubuntu\nsudo dnf install libreoffice   # Fedora\n\nor download from https://www.libreoffice.org/download/'
    }
  }

  private getInstallCommand(): string {
    switch (process.platform) {
      case 'darwin':
        return 'brew install --cask libreoffice'
      case 'win32':
        return 'winget install TheDocumentFoundation.LibreOffice'
      default:
        return 'sudo apt install libreoffice'
    }
  }
}
