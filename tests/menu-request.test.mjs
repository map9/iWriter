import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let menuModulePromise

async function loadMenuModule() {
  if (!menuModulePromise) {
    menuModulePromise = (async () => {
      const result = await build({
        entryPoints: ['src/types/menu.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return menuModulePromise
}

describe('menu requests', () => {
  it('builds a context menu request for the unified show-menu IPC', async () => {
    const { createContextMenuRequest } = await loadMenuModule()
    const items = [{ id: 'copy', label: 'Copy' }]
    const position = { x: 12, y: 34 }

    assert.deepEqual(createContextMenuRequest(items, position), {
      kind: 'context',
      items,
      position,
    })
  })

  it('builds an app menu request for the unified show-menu IPC', async () => {
    const { createAppMenuRequest } = await loadMenuModule()
    const position = { x: 4, y: 40 }

    assert.deepEqual(createAppMenuRequest(position), {
      kind: 'app',
      position,
    })
  })

  it('extracts desktop app menu quick actions to the root level', async () => {
    const { createDesktopAppMenuTemplate } = await loadMenuModule()
    const template = [
      {
        id: 'appMenu',
        label: 'iWriter',
        submenu: [
          { role: 'about', label: 'About iWriter' },
          { role: 'quit' },
        ],
      },
      {
        id: 'fileMenu',
        label: 'File',
        submenu: [
          { id: 'open-file', label: 'Open File...' },
          { type: 'separator' },
          { id: 'file-preferences', label: 'Preferences...' },
          { id: 'file-quit', role: 'quit' },
          { role: 'close' },
        ],
      },
      { id: 'editMenu', label: 'Edit' },
      { id: 'viewMenu', label: 'View' },
      { role: 'windowMenu' },
      {
        id: 'helpMenu',
        label: 'Help',
        submenu: [
          { id: 'help-about', role: 'about', label: 'About iWriter' },
          { id: 'whats-new', label: "What's New..." },
        ],
      },
    ]
    const quickActions = [
      { id: 'app-preferences', label: 'Preferences...' },
      { id: 'app-about', role: 'about', label: 'About iWriter' },
      { id: 'app-quit', role: 'quit' },
    ]

    const result = createDesktopAppMenuTemplate(template, quickActions)

    assert.deepEqual(
      result.map((item) => item.id ?? item.role ?? item.type),
      ['fileMenu', 'editMenu', 'viewMenu', 'windowMenu', 'helpMenu', 'separator', 'app-preferences', 'app-about', 'app-quit'],
    )
    assert.deepEqual(
      result[0].submenu.map((item) => item.id ?? item.type ?? item.role),
      ['open-file'],
    )
    assert.deepEqual(
      result[4].submenu.map((item) => item.id ?? item.type ?? item.role),
      ['whats-new'],
    )
  })
})
