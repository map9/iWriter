import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { parse as parseYaml } from 'yaml'

const creativePromptPath = resolve('src/ai/thread/system-prompts/creative.ts')
const playbookPath = resolve(
  'electron/ai/builtin-skills/creative/main/ideation-outline-playbook/SKILL.md',
)
const novelImportPath = resolve(
  'electron/ai/builtin-skills/creative/main/novel-import/SKILL.md',
)
const novelWorkspacePath = resolve(
  'electron/ai/builtin-skills/creative/reference/novel-workspace/SKILL.md',
)
const projectTemplatePath = resolve(
  'electron/ai/builtin-skills/creative/reference/project-template/SKILL.md',
)
const characterTemplatePath = resolve(
  'electron/ai/builtin-skills/creative/reference/characters-template/SKILL.md',
)
const worldTemplatePath = resolve(
  'electron/ai/builtin-skills/creative/reference/worldbuilding-template/SKILL.md',
)
const outlineTemplatePath = resolve(
  'electron/ai/builtin-skills/creative/reference/outline-template/SKILL.md',
)
const othersTemplatePath = resolve(
  'electron/ai/builtin-skills/creative/reference/others-template/SKILL.md',
)
const manuscriptTemplatePath = resolve(
  'electron/ai/builtin-skills/creative/reference/manuscript-template/SKILL.md',
)
const characterDesignPath = resolve(
  'electron/ai/builtin-skills/creative/main/ideation-outline-playbook/references/character-design.md',
)
const worldbuildingPath = resolve(
  'electron/ai/builtin-skills/creative/main/ideation-outline-playbook/references/worldbuilding.md',
)
const storyDesignPath = resolve(
  'electron/ai/builtin-skills/creative/main/ideation-outline-playbook/references/story-design.md',
)
const chapterOutlinePath = resolve(
  'electron/ai/builtin-skills/creative/main/ideation-outline-playbook/references/chapter-outline.md',
)
const draftingPath = resolve(
  'electron/ai/builtin-skills/creative/main/drafting-playbook/SKILL.md',
)
const creativeSkillsRoot = resolve('electron/ai/builtin-skills/creative')

function listSkillFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = resolve(directory, entry.name)
    if (entry.isDirectory()) return listSkillFiles(entryPath)
    return entry.name === 'SKILL.md' ? [entryPath] : []
  })
}

test('all creative skills have valid minimal frontmatter', () => {
  const allowedKeys = new Set(['name', 'description', 'license', 'allowed-tools', 'metadata'])

  for (const skillPath of listSkillFiles(creativeSkillsRoot)) {
    const source = readFileSync(skillPath, 'utf8')
    const match = source.match(/^---\n([\s\S]*?)\n---/)
    assert.ok(match, `${skillPath} should have YAML frontmatter`)

    const frontmatter = parseYaml(match[1])
    assert.equal(typeof frontmatter, 'object', `${skillPath} frontmatter should be an object`)
    assert.match(frontmatter.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    assert.ok(frontmatter.name.length <= 64)
    assert.equal(typeof frontmatter.description, 'string')
    assert.ok(frontmatter.description.length <= 1024)
    assert.doesNotMatch(frontmatter.description, /[<>]/)

    for (const key of Object.keys(frontmatter)) {
      assert.ok(allowedKeys.has(key), `${skillPath} has unexpected frontmatter key ${key}`)
    }
  }
})

test('creative prompt resolves nested skill references from the loaded SKILL.md directory', () => {
  const source = readFileSync(creativePromptPath, 'utf8')

  assert.match(source, /SKILL\.md.*相对路径/)
  assert.match(source, /SKILL\.md.*所在目录为根解析/)
  assert.match(source, /creative\/reference/)
})

test('creative prompt keeps analysis methods out of project fields and reads object blocks selectively', () => {
  const source = readFileSync(creativePromptPath, 'utf8')

  assert.match(source, /内部推导视角/)
  assert.match(source, /不默认写成项目字段/)
  assert.match(source, /目标 ID 块/)
  assert.match(source, /单文件集合不得默认整份读入/)
  assert.match(source, /一个事实只写入唯一归属对象/)
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

test('novel workspace uses compact single-source objects', () => {
  const source = readFileSync(novelWorkspacePath, 'utf8')

  assert.match(source, /storylines\.md.*全部故事线/)
  assert.match(source, /materials\/cards\.md/)
  assert.match(source, /简单人物或设定用一个核心句/)
  assert.match(source, /承重人物或设定.*默认不超过六条/)
  assert.match(source, /一个事实只在归属对象中写完整内容/)
  assert.match(source, /不得默认整份读取/)
})

test('compact templates merge fields without dropping semantic ownership', () => {
  const project = readFileSync(projectTemplatePath, 'utf8')
  const characters = readFileSync(characterTemplatePath, 'utf8')
  const world = readFileSync(worldTemplatePath, 'utf8')
  const outline = readFileSync(outlineTemplatePath, 'utf8')
  const others = readFileSync(othersTemplatePath, 'utf8')

  assert.match(project, /## 作品（work）/)
  assert.match(project, /## 故事（story）/)
  assert.match(project, /## 创作边界（constraints）/)

  assert.match(characters, /全部人物保存在一个文件/)
  assert.match(characters, /`行动`.*惯用办法及其代价/)
  assert.match(characters, /`关系`.*索取或回避.*可用筹码/)
  assert.match(characters, /`表现`.*声音.*身体习惯/)
  assert.match(characters, /`条件`.*能力.*知识边界/)
  assert.match(characters, /`变化线`.*只引用人物变化线 ID/)
  assert.match(characters, /承重人物.*默认不超过六条/)

  assert.match(world, /规则或系统.*运行条件.*硬边界/)
  assert.match(world, /地点.*空间关系.*感官标记/)
  assert.match(world, /至少保留一种正文可见的表现/)
  assert.match(world, /承重条目.*默认不超过六条/)

  assert.match(outline, /故事线不是总纲的字段/)
  assert.match(outline, /每个阶段一个因果句/)
  assert.match(outline, /不以出现某几个字段名判断/)
  assert.doesNotMatch(outline, /goal.*必选/)

  assert.match(others, /作者说“记一下”“先放着”时直接记录/)
  assert.match(others, /不保留副本/)
})

test('creative object contracts contain no legacy-project compatibility rules', () => {
  const paths = [
    novelWorkspacePath,
    projectTemplatePath,
    characterTemplatePath,
    worldTemplatePath,
    outlineTemplatePath,
    othersTemplatePath,
    manuscriptTemplatePath,
  ]

  for (const filePath of paths) {
    const source = readFileSync(filePath, 'utf8')
    assert.doesNotMatch(source, /旧项目|旧格式|兼容|迁移|fragments\.md/)
  }
})

test('dimension skills retain semantic checks while emitting compact story language', () => {
  const characters = readFileSync(characterDesignPath, 'utf8')
  const world = readFileSync(worldbuildingPath, 'utf8')
  const story = readFileSync(storyDesignPath, 'utf8')
  const chapter = readFileSync(chapterOutlinePath, 'utf8')
  const drafting = readFileSync(draftingPath, 'utf8')

  assert.match(characters, /内部回答/)
  assert.match(characters, /能力、资源、知识和社会位置/)
  assert.match(characters, /措辞、身体动作、注意偏好或社交习惯/)
  assert.match(characters, /承重人物按需保留行动、关系、表现和条件/)
  assert.match(characters, /人物变化过程写入独立故事线/)

  assert.match(world, /在内部检查/)
  assert.match(world, /动作、用语、物件、痕迹或感官标记/)
  assert.match(world, /规则或技术.*触发、能力、限制/)
  assert.match(world, /承重设定按需保留边界、运作、空间、人和程序、可写表现/)

  assert.match(story, /它不是总纲字段/)
  assert.match(story, /行动 → 回应 → 实际变化 → 新条件/)
  assert.match(story, /不要把四项拆成字段/)

  assert.match(chapter, /这些是语义要求，不是六个必填字段/)
  assert.match(chapter, /可写/)
  assert.match(drafting, /不要求出现固定字段名/)
  assert.match(drafting, /人物的行动、关系、表现与能力边界/)
  assert.match(drafting, /世界规则、程序、空间与可写表现/)
})
