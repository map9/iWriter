import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let overlayModulePromise

async function loadOverlayModule() {
  if (!overlayModulePromise) {
    overlayModulePromise = (async () => {
      const result = await build({
        entryPoints: ['electron/titleBarOverlay.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return overlayModulePromise
}

describe('title bar overlay colors', () => {
  it('uses renderer titlebar colors for the system overlay when available', async () => {
    const { resolveTitleBarOverlayColors } = await loadOverlayModule()

    assert.deepEqual(
      resolveTitleBarOverlayColors({
        prefersDark: true,
        rendererColors: {
          backgroundColor: 'rgb(244, 245, 247)',
          symbolColor: 'rgb(31, 41, 55)',
        },
      }),
      {
        color: '#f4f5f7',
        symbolColor: '#1f2937',
      },
    )
  })

  it('falls back to native theme colors when renderer colors are unavailable', async () => {
    const { resolveTitleBarOverlayColors } = await loadOverlayModule()

    assert.deepEqual(
      resolveTitleBarOverlayColors({
        prefersDark: false,
        rendererColors: {
          backgroundColor: 'transparent',
          symbolColor: '',
        },
      }),
      {
        color: '#f5f5f5',
        symbolColor: '#1f2937',
      },
    )
  })

  it('normalizes oklch colors emitted by daisyUI themes', async () => {
    const { resolveTitleBarOverlayColors } = await loadOverlayModule()

    assert.deepEqual(
      resolveTitleBarOverlayColors({
        prefersDark: false,
        rendererColors: {
          backgroundColor: 'oklch(100% 0 0)',
          symbolColor: 'oklch(0% 0 0)',
        },
      }),
      {
        color: '#ffffff',
        symbolColor: '#000000',
      },
    )
  })
})
