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
const styleTemplatePath = resolve(
  'electron/ai/builtin-skills/creative/reference/style-template/SKILL.md',
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
  assert.match(source, /作为共同创作者/)
  assert.match(source, /不要求作者改用系统分类/)
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
  assert.match(source, /简单人物或设定用一个核心段/)
  assert.match(source, /主要人物或重要设定.*最多.*六条/)
  assert.match(source, /一个事实只在归属对象中写完整内容/)
  assert.match(source, /不得默认整份读取/)
  assert.match(source, /默认预算无法无损表达时/)
  assert.match(source, /不得.*截断已确认事实或关键因果/)
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
  assert.match(characters, /# 人物小传模板/)
  assert.match(characters, /目标或动机.*性格和行为/)
  assert.match(characters, /补充事实按内容直接起句/)
  assert.match(characters, /不设固定字段/)
  assert.match(characters, /人物变化过程保存在 `storylines\.md`/)
  assert.match(characters, /不为满足条数截断/)
  assert.doesNotMatch(characters, /^- (?:行动|关系|表现|条件|变化线)：/m)

  assert.match(world, /不预设分类栏目/)
  assert.match(world, /不写类别名或固定字段/)
  assert.match(world, /运行方式、边界、代价、执行者/)
  assert.match(world, /至少保留一种能进入正文的具体事实/)
  assert.match(world, /不为满足条数截断/)
  assert.doesNotMatch(world, /## 类型要求/)
  assert.doesNotMatch(world, /^- (?:边界|运作|可写表现|空间|人与程序)：/m)

  assert.match(outline, /故事线不是总纲的字段/)
  assert.match(outline, /每个阶段.*一个因果句/)
  assert.match(outline, /单句无法无损表达关键因果/)
  assert.match(outline, /开始条件.*只记录本章实际会使用的状态/)
  assert.match(outline, /不以出现某几个字段名判断/)
  assert.doesNotMatch(outline, /goal.*必选/)

  assert.match(others, /作者说“记一下”“先放着”时直接记录/)
  assert.match(others, /不保留副本/)
})

test('creative templates are loaded for mutations and structural validation, not ordinary reads', () => {
  const prompt = readFileSync(creativePromptPath, 'utf8')
  const paths = [
    novelWorkspacePath,
    projectTemplatePath,
    characterTemplatePath,
    worldTemplatePath,
    outlineTemplatePath,
    othersTemplatePath,
    manuscriptTemplatePath,
    styleTemplatePath,
  ]

  assert.match(prompt, /讨论、理解、评估、生成候选和普通只读时，不因读取项目对象而加载/)
  assert.match(prompt, /创建、修改、迁移或结构校验项目对象前/)
  assert.doesNotMatch(prompt, /操作项目对象前加载/)

  for (const filePath of paths) {
    const source = readFileSync(filePath, 'utf8')
    const match = source.match(/^---\n([\s\S]*?)\n---/)
    assert.ok(match, `${filePath} should have YAML frontmatter`)
    const frontmatter = parseYaml(match[1])
    assert.doesNotMatch(frontmatter.description, /创建、读取|读取、更新|读取[^；]*时使用/)
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
  assert.match(characters, /说话方式、身体动作、注意偏好或社交习惯/)
  assert.match(characters, /沿用作者的称呼/)
  assert.match(characters, /不输出内部检查项或固定字段/)
  assert.match(characters, /人物变化过程写入独立故事线/)

  assert.match(world, /在内部检查/)
  assert.match(world, /动作、用语、物件、痕迹或感官标记/)
  assert.match(world, /涉及某种规则、能力或技术时/)
  assert.match(world, /沿用作品中的名称/)
  assert.match(world, /不输出设定分类或固定字段/)

  assert.match(story, /它不是总纲字段/)
  assert.match(story, /行动 → 回应 → 实际变化 → 新条件/)
  assert.match(story, /不要把四项拆成字段/)

  assert.match(chapter, /这些是语义要求，不是六个必填字段/)
  assert.match(chapter, /可写/)
  assert.match(chapter, /开始条件/)
  assert.match(drafting, /不要求出现固定字段名/)
  assert.match(drafting, /人物小传中与本场相关的目标、性格、关系、经历、能力、局限/)
  assert.match(drafting, /实际使用的设定事实/)
})
