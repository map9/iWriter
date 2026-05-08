import fs from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const changelogPath = path.join(rootDir, 'docs', 'changelog.md')
const packageJsonPath = path.join(rootDir, 'package.json')
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))

const args = parseArgs(process.argv.slice(2))
const version = normalizeVersion(args.version || packageJson.version)
const outputPath = args.output ? path.resolve(process.cwd(), args.output) : null

const changelog = fs.readFileSync(changelogPath, 'utf8')
const notes = extractReleaseNotes(changelog, version)

if (!notes) {
  throw new Error(`Could not find release notes for version ${version} in docs/changelog.md.`)
}

const body = `${notes}\n\n[Full changelog](https://github.com/map9/iWriter/blob/main/docs/changelog.md)`

if (outputPath) {
  fs.writeFileSync(outputPath, `${body}\n`)
  console.log(`Wrote release notes for ${version} to ${outputPath}`)
} else {
  process.stdout.write(`${body}\n`)
}

function parseArgs(argv) {
  const parsed = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--version') {
      parsed.version = argv[index + 1]
      index += 1
      continue
    }

    if (arg === '--output') {
      parsed.output = argv[index + 1]
      index += 1
    }
  }

  return parsed
}

function normalizeVersion(input) {
  return String(input || '').trim().replace(/^v/i, '')
}

function extractReleaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/)
  let start = -1
  let end = lines.length

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.startsWith('## ')) {
      continue
    }

    const heading = line.slice(3).trim().replace(/^`|`$/g, '')
    if (heading !== version) {
      continue
    }

    start = index + 1

    for (let cursor = start; cursor < lines.length; cursor += 1) {
      if (lines[cursor].startsWith('## ')) {
        end = cursor
        break
      }
    }

    break
  }

  if (start === -1) {
    return ''
  }

  return lines.slice(start, end).join('\n').trim()
}
