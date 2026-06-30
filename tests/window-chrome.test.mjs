import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let chromeModulePromise

function electronStubPlugin() {
  return {
    name: 'electron-stub',
    setup(buildContext) {
      buildContext.onResolve({ filter: /^electron$/ }, () => ({
        path: 'electron',
        namespace: 'electron-stub',
      }))

      buildContext.onLoad({ filter: /^electron$/, namespace: 'electron-stub' }, () => ({
        contents: `
          export const app = { isPackaged: true }
          export class BrowserWindow {}
          export const ipcMain = { handle() {}, removeHandler() {} }
          export const dialog = {}
          export const nativeTheme = { shouldUseDarkColors: false }
        `,
        loader: 'js',
      }))
    },
  }
}

async function loadChromeModule() {
  if (!chromeModulePromise) {
    chromeModulePromise = (async () => {
      const result = await build({
        stdin: {
          contents: "export { buildWindowChromeOptions } from './electron/WindowManager.ts'",
          resolveDir: process.cwd(),
          loader: 'js',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
        plugins: [electronStubPlugin()],
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return chromeModulePromise
}

describe('window chrome options', () => {
  it('keeps macOS traffic lights in the system titlebar area', async () => {
    const { buildWindowChromeOptions } = await loadChromeModule()

    assert.deepEqual(buildWindowChromeOptions('darwin'), {
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: { x: 20, y: 10 },
    })
  })

  it('uses custom frameless chrome on Windows without titlebar overlay', async () => {
    const { buildWindowChromeOptions } = await loadChromeModule()

    assert.deepEqual(buildWindowChromeOptions('win32'), {
      titleBarStyle: 'hidden',
      frame: false,
      autoHideMenuBar: true,
    })
  })

  it('uses the same custom frameless chrome on Linux without titlebar overlay', async () => {
    const { buildWindowChromeOptions } = await loadChromeModule()

    assert.deepEqual(buildWindowChromeOptions('linux'), {
      titleBarStyle: 'hidden',
      frame: false,
      autoHideMenuBar: true,
    })
  })
})
