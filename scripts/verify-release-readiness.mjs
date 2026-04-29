import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const changelogPath = path.join(rootDir, 'docs', 'changelog.md')
const changelog = fs.readFileSync(changelogPath, 'utf8')

if (!changelog.includes('## Unreleased')) {
  console.error(
    'Release check failed: docs/changelog.md must include a "## Unreleased" section before running npm version.'
  )
  process.exit(1)
}

console.log('Release check passed: found "## Unreleased" in docs/changelog.md.')
