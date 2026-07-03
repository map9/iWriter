import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { build } from 'esbuild'

let hashModulePromise

async function loadHashModule() {
  if (!hashModulePromise) {
    hashModulePromise = (async () => {
      const result = await build({
        entryPoints: ['src/utils/fileContentHash.ts'],
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }

  return hashModulePromise
}

describe('file content hash guards', () => {
  it('treats an empty disk snapshot as suspicious when the last saved content was non-empty', async () => {
    const {
      computeFileContentHash,
      hasUnexpectedDiskContent,
      isFileContentChangedOnDiskError,
      isSuspiciousEmptyExternalContent,
    } = await loadHashModule()

    const lastSavedHash = computeFileContentHash('# Draft\n\nBody')

    assert.equal(isSuspiciousEmptyExternalContent('', lastSavedHash), true)
    assert.equal(hasUnexpectedDiskContent('', lastSavedHash), true)
    assert.equal(isFileContentChangedOnDiskError(new Error('FILE_CONTENT_CHANGED_ON_DISK')), true)
    assert.equal(
      isFileContentChangedOnDiskError(new Error("Error invoking remote method 'save-file': Error: FILE_CONTENT_CHANGED_ON_DISK")),
      true
    )
  })

  it('does not flag an already-empty saved file as a suspicious empty external change', async () => {
    const {
      computeFileContentHash,
      hasUnexpectedDiskContent,
      isFileContentChangedOnDiskError,
      isSuspiciousEmptyExternalContent,
    } = await loadHashModule()

    const emptyHash = computeFileContentHash('')

    assert.equal(isSuspiciousEmptyExternalContent('', emptyHash), false)
    assert.equal(hasUnexpectedDiskContent('', emptyHash), false)
    assert.equal(isFileContentChangedOnDiskError(new Error('EACCES')), false)
  })
})

describe('save path hash guard placement', () => {
  it('keeps the external-modification content check in the main process save guard', () => {
    const appStoreSource = readFileSync('src/stores/app.ts', 'utf8')
    const saveTabStart = appStoreSource.indexOf('async function saveTab(')
    const saveTabEnd = appStoreSource.indexOf('async function saveActiveTab()', saveTabStart)

    assert.notEqual(saveTabStart, -1)
    assert.notEqual(saveTabEnd, -1)

    const saveTabSource = appStoreSource.slice(saveTabStart, saveTabEnd)

    assert.equal(saveTabSource.includes('hasUnexpectedDiskChangeForSave'), false)
    assert.equal(saveTabSource.includes('readFileSilent'), false)
  })
})
