#!/usr/bin/env node
import { readdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join, extname, relative } from 'node:path'
import sharp from 'sharp'

const ROOT = fileURLToPath(new URL('../docs/public/images/', import.meta.url))
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const MAX_WIDTH = 720
const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp'])

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name.endsWith('main-window.png')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(full)
    } else if (EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      yield full
    }
  }
}

let scanned = 0
let resized = 0
let skipped = 0
const errors = []

for await (const file of walk(ROOT)) {
  scanned++
  const rel = relative(REPO_ROOT, file)
  try {
    const metadata = await sharp(file).metadata()
    if (!metadata.width || metadata.width <= MAX_WIDTH) {
      skipped++
      continue
    }

    const buffer = await sharp(file)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .toBuffer()
    await writeFile(file, buffer)
    resized++
    console.log(`  resized ${rel}: ${metadata.width}px -> ${MAX_WIDTH}px`)
  } catch (err) {
    errors.push({ file: rel, error: err })
    console.warn(`  skip ${rel}: ${err.message}`)
  }
}

console.log(
  `[optimize-docs-images] scanned=${scanned} resized=${resized} skipped=${skipped}` +
    (errors.length ? ` errors=${errors.length}` : '')
)

if (errors.length) {
  process.exitCode = 1
}
