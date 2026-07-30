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

test('novel workspace uses compact single-source objects with legacy projects left in place', () => {
  const source = readFileSync(novelWorkspacePath, 'utf8')

  assert.match(source, /storylines\.md.*全部故事线/)
  assert.match(source, /materials\/cards\.md/)
  assert.match(source, /一个核心句 \+ 最多三条必要补充/)
  assert.match(source, /一个事实只在归属对象中写完整内容/)
  assert.match(source, /不得默认整份读取/)
  assert.match(source, /不扫描、迁移或批量改写旧项目/)
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
  assert.match(project, /不要求把 premise.*拆成独立字段/)

  assert.match(characters, /全部人物放在一个文件/)
  assert.match(characters, /分析视角，不是必填字段/)
  assert.doesNotMatch(characters, /false-belief.*必选/)

  assert.match(world, /不要求分别建立“定义、成本、执行、故事压力”等字段/)
  assert.doesNotMatch(world, /rule-systems.*必选/)

  assert.match(outline, /故事线不是总纲的字段/)
  assert.match(outline, /每个阶段一个因果句/)
  assert.match(outline, /不以出现某几个字段名判断/)
  assert.doesNotMatch(outline, /goal.*必选/)

  assert.match(others, /作者说“记一下”“先放着”时直接记录/)
  assert.match(others, /不保留副本/)
})

test('dimension skills retain semantic checks while emitting compact story language', () => {
  const characters = readFileSync(characterDesignPath, 'utf8')
  const world = readFileSync(worldbuildingPath, 'utf8')
  const story = readFileSync(storyDesignPath, 'utf8')
  const chapter = readFileSync(chapterOutlinePath, 'utf8')
  const drafting = readFileSync(draftingPath, 'utf8')

  assert.match(characters, /内部回答/)
  assert.match(characters, /不要为了“人物完整”给每个人推导一套决策模型/)
  assert.match(characters, /不要逐项输出欲望、恐惧/)

  assert.match(world, /在内部检查/)
  assert.match(world, /检查维度，不是五个文件字段/)

  assert.match(story, /它不是总纲字段/)
  assert.match(story, /行动 → 回应 → 实际变化 → 新条件/)
  assert.match(story, /不要把四项拆成字段/)

  assert.match(chapter, /这些是语义要求，不是六个必填字段/)
  assert.match(chapter, /可写/)
  assert.match(drafting, /不要求出现固定字段名/)
})
