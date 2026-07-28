import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const packageJsonPath = path.join(rootDir, 'package.json')
const readmePath = path.join(rootDir, 'README.md')
const docsDir = path.join(rootDir, 'docs')
const changelogPath = path.join(docsDir, 'changelog.md')
const homePagePath = path.join(docsDir, 'index.md')
const downloadPagePath = path.join(docsDir, 'download.md')

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
const version = packageJson.version
const today = new Date().toISOString().slice(0, 10)
const finalizeRelease = process.argv.includes('--finalize-release')

const docFiles = collectMarkdownFiles(docsDir)

for (const filePath of docFiles) {
  let content = fs.readFileSync(filePath, 'utf8')

  content = content.replaceAll(
    /> 适用版本：iWriter `[^`]+`/g,
    `> 适用版本：iWriter \`${version}\``
  )

  content = content.replaceAll(
    /> 最后更新：\d{4}-\d{2}-\d{2}/g,
    `> 最后更新：${today}`
  )

  if (filePath === downloadPagePath) {
    content = content.replace(
      /- 当前文档对应版本：`[^`]+`/g,
      `- 当前文档对应版本：\`${version}\``
    )
  }

  if (filePath === changelogPath) {
    content = syncChangelog(content, version, finalizeRelease)
  }

  fs.writeFileSync(filePath, content)
}

let homePageContent = fs.readFileSync(homePagePath, 'utf8')
homePageContent = homePageContent.replace(
  /适用版本：iWriter <code>[^<]+<\/code>/g,
  `适用版本：iWriter <code>${version}</code>`
)
homePageContent = homePageContent.replace(
  /最后更新：\d{4}-\d{2}-\d{2}/g,
  `最后更新：${today}`
)
fs.writeFileSync(homePagePath, homePageContent)

let readmeContent = fs.readFileSync(readmePath, 'utf8')
readmeContent = readmeContent.replace(
  /> 当前版本：`[^`]+`/g,
  `> 当前版本：\`${version}\``
)
fs.writeFileSync(readmePath, readmeContent)

console.log(
  `Synced docs version metadata to ${version} (${today})${finalizeRelease ? ' and finalized changelog.' : '.'}`
)

function collectMarkdownFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }

  return files
}

function syncChangelog(content, currentVersion, shouldFinalizeRelease) {
  if (!shouldFinalizeRelease) {
    return content
  }

  if (content.includes('## Unreleased')) {
    return content.replace('## Unreleased', `## \`${currentVersion}\``)
  }

  if (content.includes(`## \`${currentVersion}\``)) {
    return content
  }

  throw new Error(
    'docs/changelog.md must contain a "## Unreleased" section before running npm version.'
  )
}
