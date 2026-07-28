import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const skillPath = 'electron/ai/builtin-skills/common/web-research/SKILL.md'
const researcherPath = 'electron/ai/builtin-subagents/common/researcher/agent.md'
const creativePromptPath = 'src/ai/thread/system-prompts/creative.ts'

function read(path) {
  return readFileSync(path, 'utf8')
}

describe('web-research workflow', () => {
  it('routes simple lookups to a cited answer without a scratch report', () => {
    const skill = read(skillPath)

    assert.match(skill, /## Route the request/)
    assert.match(skill, /Simple lookup/)
    assert.match(skill, /Do not create a temporary research report/)
  })

  it('uses the original three-step directory workflow for complex research', () => {
    const skill = read(skillPath)

    assert.match(skill, /### Step 1: Create and Save Research Plan/)
    assert.match(skill, /### Step 2: Delegate to Research Subagents/)
    assert.match(skill, /### Step 3: Synthesize Findings/)
    assert.match(skill, /\/large_tool_results\/research_<topic_name>\/research_plan\.md/)
    assert.match(skill, /\/large_tool_results\/research_<topic_name>\/findings_<subtopic>\.md/)
    assert.match(skill, /\/large_tool_results\/research_<topic_name>\/research_report\.md/)
  })

  it('coordinates bounded parallel general-purpose research and a final Markdown report', () => {
    const skill = read(skillPath)

    assert.match(skill, /2–5 specific subtopics/)
    assert.match(skill, /task\(subagent_type="general-purpose"/)
    assert.match(skill, /up to 3 subagents in parallel/i)
    assert.match(skill, /Read all findings files before synthesizing/)
    assert.match(skill, /Write `research_report\.md`/)
    assert.doesNotMatch(skill, /exploration\//)
  })

  it('uses all available evidence sources without requiring a Researcher subagent', () => {
    const skill = read(skillPath)
    const creativePrompt = read(creativePromptPath)

    assert.match(skill, /user-provided materials/)
    assert.match(skill, /knowledge-base\/RAG/)
    assert.match(skill, /There is no dedicated Researcher subagent/)
    assert.match(skill, /main agent plans and synthesizes/)
    assert.match(skill, /`general-purpose` subagents/)
    assert.equal(existsSync(researcherPath), false)
    assert.match(
      creativePrompt,
      /复杂研究[^。\n]*task\(subagent_type="general-purpose"\)[^。\n]*委托/,
    )
    assert.doesNotMatch(creativePrompt, /`researcher` \(web research\)/)
    assert.doesNotMatch(creativePrompt, /- `researcher`: brief must contain/)
  })
})
