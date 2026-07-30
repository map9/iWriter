import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'

const creativePromptPath = resolve('src/ai/thread/system-prompts/creative.ts')
const playbookPath = resolve(
  'electron/ai/builtin-skills/creative/main/ideation-outline-playbook/SKILL.md',
)
const novelImportPath = resolve(
  'electron/ai/builtin-skills/creative/main/novel-import/SKILL.md',
)

test('creative prompt resolves nested skill references from the loaded SKILL.md directory', () => {
  const source = readFileSync(creativePromptPath, 'utf8')

  assert.match(source, /SKILL\.md.*相对路径/)
  assert.match(source, /SKILL\.md.*所在目录为根解析/)
  assert.match(source, /creative\/reference/)
})

test('ideation playbook treats design questions in mixed requests as generation work', () => {
  const source = readFileSync(playbookPath, 'utf8')

  assert.match(source, /同一主任务可以同时包含理解现状和发展空白/)
  assert.match(source, /“如何设定”“怎么发展”“契机是什么”/)
  assert.match(source, /不能替代生成结果/)
  assert.match(source, /references\/\.\.\..*相对于本 `SKILL\.md` 所在目录/)
})

test('nested references in creative main skills exist relative to their SKILL.md files', () => {
  for (const skillPath of [playbookPath, novelImportPath]) {
    const source = readFileSync(skillPath, 'utf8')
    const references = [...source.matchAll(/`(references\/[^`]+\.md)`/g)].map(
      match => match[1],
    )

    assert.ok(references.length > 0, `${skillPath} should declare nested references`)
    for (const reference of references) {
      const referencePath = resolve(dirname(skillPath), reference)
      assert.ok(existsSync(referencePath), `${reference} should resolve from ${skillPath}`)
    }
  }
})
