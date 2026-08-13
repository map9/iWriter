import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'
import { listSkills } from 'deepagents/node'
import { build } from 'esbuild'

let promptsPromise

async function loadPrompts() {
  if (!promptsPromise) {
    promptsPromise = (async () => {
      const result = await build({
        stdin: {
          contents: `
            export { buildEditSystemPrompt } from './electron/ai/domain/edit/systemPrompt.ts'
            export { buildCreativeSystemPrompt } from './electron/ai/domain/creative/systemPrompt.ts'
          `,
          resolveDir: process.cwd(),
          sourcefile: 'edit-prompt-skills-entry.ts',
        },
        bundle: true,
        platform: 'node',
        format: 'esm',
        write: false,
      })
      const code = result.outputFiles[0].text
      return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
    })()
  }
  return promptsPromise
}

describe('Edit prompt responsibility boundaries', () => {
  it('keeps a concise Chinese resource and approval contract without embedded PDF or skill manuals', async () => {
    const { buildEditSystemPrompt } = await loadPrompts()
    const prompt = buildEditSystemPrompt('zh-CN')

    assert.match(prompt, /你是 iWriter 的智能编辑助手/)
    assert.match(prompt, /只有任务依赖当前标签、选区、光标或 open tabs 时，才调用 `get_editor_state`/)
    assert.match(prompt, /仅在确实需要其他标签时传 `include_open_tabs=true`/)
    assert.match(prompt, /system prompt.*真实绝对路径/)
    assert.match(prompt, /完整绝对路径/)
    assert.doesNotMatch(prompt, /工作区对象使用相对路径/)
    assert.match(prompt, /附件和用户明确输入的外部绝对路径保持原值/)
    assert.match(prompt, /\.iwt\/.md\/.txt/)
    assert.match(prompt, /必须通过 DocumentTools 读取，通过块工具修改/)
    assert.match(prompt, /目标优先级：用户明确指定的对象 > 本线程已建立的目标 > 工具搜索结果 > 当前编辑器状态/)
    assert.match(prompt, /`document-editing-workflow`/)
    assert.match(prompt, /`document-block-tools`/)
    assert.match(prompt, /一次响应只能提交一种需要审批的写操作家族/)
    assert.match(prompt, /普通读取、搜索和分析工具不受此限制/)

    assert.doesNotMatch(prompt, /## (Core Workflow|Dynamic Editor State|Files & Paths|Reading Documents|Edit Strategy & Operations|Edit Tools|Skills|Web Research|PDF Files)/)
    assert.doesNotMatch(prompt, /get_pdf_outline|get_pdf_pages/)
    assert.doesNotMatch(prompt, /create_document\(filename, content, reason\?\)/)
  })

  it('gives Creative the same direct resource boundary and its three approval families', async () => {
    const { buildCreativeSystemPrompt } = await loadPrompts()
    const prompt = buildCreativeSystemPrompt('zh-CN')

    assert.match(prompt, /只有任务依赖当前标签、选区、光标或 open tabs 时，才调用 `get_editor_state`/)
    assert.match(prompt, /仅在确实需要其他标签时传 `include_open_tabs=true`/)
    assert.match(prompt, /system prompt.*真实绝对路径/)
    assert.match(prompt, /完整绝对路径/)
    assert.doesNotMatch(prompt, /工作区对象使用相对路径/)
    assert.match(prompt, /附件和用户明确输入的外部绝对路径保持原值/)
    assert.match(prompt, /用户文档 `\.iwt`、`\.md`、`\.txt` 的内容必须通过 DocumentTools 读取，通过块工具修改/)
    assert.match(prompt, /目标优先级：作者明确指定的对象 > 本线程已建立的目标 > 工具搜索结果 > 当前编辑器状态/)
    assert.match(prompt, /①块编辑与 `create_document`；②文件系统变更；③创作确认、导入与 Git 操作/)
    assert.match(prompt, /普通读取、搜索和分析工具不受此限制/)
  })
})

describe('Edit skills responsibility boundaries', () => {
  it('discovers the editing workflow and narrows document-block-tools to edits or advanced reads', () => {
    const editSkillsDir = resolve('electron/ai/builtin-skills/edit')
    const commonSkillsDir = resolve('electron/ai/builtin-skills/common')
    const editSkills = listSkills({ projectSkillsDir: editSkillsDir })
    const commonSkills = listSkills({ projectSkillsDir: commonSkillsDir })

    assert.ok(editSkills.some(skill => skill.name === 'document-editing-workflow'))

    const blockSkill = commonSkills.find(skill => skill.name === 'document-block-tools')
    assert.ok(blockSkill)
    assert.match(blockSkill.description, /^Use when /)
    assert.match(blockSkill.description, /editing or creating/)
    assert.match(blockSkill.description, /pagination|list containers|block-ID/)
    assert.doesNotMatch(blockSkill.description, /before reading or editing any document/)
  })

  it('keeps edit orchestration separate from the block protocol', () => {
    const workflowPath = resolve('electron/ai/builtin-skills/edit/document-editing-workflow/SKILL.md')
    const blockPath = resolve('electron/ai/builtin-skills/common/document-block-tools/SKILL.md')

    assert.ok(existsSync(workflowPath), 'document-editing-workflow must exist')
    const workflow = readFileSync(workflowPath, 'utf8')
    const blockProtocol = readFileSync(blockPath, 'utf8')

    assert.match(workflow, /原子修改/)
    assert.match(workflow, /局部改写/)
    assert.match(workflow, /关联多点修改/)
    assert.match(workflow, /大范围改写/)
    assert.match(workflow, /document-block-tools/)
    assert.doesNotMatch(workflow, /container_block_id|content_mismatch|expected_current_content/)

    assert.match(blockProtocol, /container_block_id/)
    assert.match(blockProtocol, /content_mismatch/)
    assert.match(blockProtocol, /expected_current_content/)
    assert.match(blockProtocol, /directory/)
  })
})
