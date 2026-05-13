# Creative Agent Phase 4 회고 + 후속 개선안

## Context

Phase 4A(SubAgent 화 + 논리 품질 강화) 구현이 완료된 후 첫 번째 본격 세션(`/Users/sunyafu/Desktop/test.json`, 6215줄 / 작업물은 `/Users/sunyafu/Desktop/小说/`)을 통해 다음을 검증하려 함.

1. agent의 실제 동작이 설계 의도와 일치하는가
2. UI 표시 동작이 자연스러운가(plan/findings 카드, 다국어)
3. StoryBible이 작가에게 의미 있는 컨텍스트인가
4. 작성 워크플로우의 도구 커버리지가 충분한가

분석 결과 워크플로우는 ch02–ch06 사이클에서 설계대로 작동했으나, 5개 영역에서 체감 가능한 약점이 확인됨. 이 문서는 **분석 결과 + 권장 개선안**을 담음(즉시 구현 지시가 아니라 우선순위 검토용).

---

## 1. 워크플로우 동작 분석(test.json 기준)

### ✅ 잘 된 부분

- ch02–ch06 모두 `task(planner)` → `confirm_writing_plan` → `write_to_chapter` → `task(consistency_checker)` 순으로 정확히 회전(5회 완전 사이클).
- 세션 시작 시 `get_session_diff` + `read_storybible` + `get_storybible_rebuild_signal` 3종 세트가 매번 병렬 호출되어 startup protocol 준수.
- HITL 분기에서 `logicAudit`이 `confirm_writing_plan` 인자로 정상 전달되어 CreativeReviewSurface에서 보이는 구조가 잘 작동.

### ⚠ 문제 1 — Planner 출력 잘림 시 fallback 동작

- 라인 629에서 PlannerAgent 응답이 `"现在输出完整结构化规划："`에서 **token limit으로 잘림**.
- 메인 에이전트는 이 사실을 인식했음에도 retry 없이 **자체 plan을 작성**(라인 646).
- 결과적으로 Phase 4A의 "logic-first" 분리 원칙이 깨짐 — 메인 LLM의 작성 본능이 planner 책임을 가로챔.

### ⚠ 문제 2 — 재구조화 단계에서 sub-agent 전체 우회

- 사용자가 7장 구조 재배치를 승인한 뒤(라인 4290), 메인 에이전트는 **planner / consistency_checker를 한 번도 호출하지 않고** `write_to_chapter`(replace_range)로 ch01~ch07을 11회 덮어씀.
- system prompt §"Plan-first rules"는 "rewriting more than one paragraph"는 plan-first 필수로 명시하지만, 실제로는 "approved restructure plan을 따른다"는 명분으로 우회됨.

---

## 2. UI 이슈 — 스트림 vs 카드 형성 타이밍

### 근본 원인

**Plan 카드(`creative_plan`)**: deepagents의 sub-agent는 `task` ToolMessage에 plan 본문을 JSON으로 반환함. 메인 에이전트는 이 결과를 받은 직후 `confirm_writing_plan(plan=..., ...)`을 호출하지만, 그 사이 turn에서 메인 에이전트의 어시스턴트 텍스트(예: "规划器返回了... 我打算...")가 스트리밍되어 **plan 카드 형성 전에 평문 텍스트로 노출**됨. 이는 system prompt가 "plan을 본문에 다시 적지 말라"는 제약을 두지 않기 때문.

**Consistency 카드(`consistency-findings` fenced block)**: `splitTextWithFences`(`src/ai/message/fenced-blocks.ts:62`)는 닫는 ` ``` `까지 정규식이 매칭돼야 카드로 분리됨. 스트리밍 중에는 `[ { "layer": ...` 같은 **JSON 평문이 마크다운 코드 블록으로 노출**되었다가, 닫는 fence가 도착한 시점에 비로소 finding 카드로 교체됨.

### 권장 개선

| 위치 | 변경 |
|---|---|
| `src/ai/thread/system-prompts/creative.ts` Plan-first 섹션 | "Do not restate the plan body in your assistant message. After receiving the planner's response, call `confirm_writing_plan` immediately. Your assistant text may contain only one short status line (e.g. '已生成方案，请审批')." 추가 |
| `src/ai/thread/system-prompts/creative.ts` Post-write consistency 섹션 | "Emit the fenced block as a single contiguous output. Do not write the opening fence before the findings JSON is fully composed." 추가(혹은 메인 에이전트가 ToolMessage 받은 직후에만 fence 시작) |
| `src/ai/message/fenced-blocks.ts` | 스트리밍 중 열린 fence가 감지되면 임시 "drafting findings…" placeholder를 노출하는 옵션을 도입(낙관적 UI) |
| `src/components/ai/agent-panel/chat-area/views/ToolCallCard.vue:186` `subagent_task` detail | 사용자가 plan/findings raw JSON을 보고 싶지 않다면 기본 접힘 상태로 변경 |

### 언어 일관성

- 현재 `CREATIVE_SYSTEM_PROMPT`, `PLANNER_SYSTEM_PROMPT`, `CONSISTENCY_SYSTEM_PROMPT` **모두 영어로 작성됨**.
- 어디에도 "respond in the user's language" 지시가 없음. 따라서 `reasoning_content`(thinking)는 모델 기본인 영어가 되고, ConsistencyAgent의 `description`도 중영 혼용으로 나옴(라인 1114).
- i18n locale이 prompt로 주입되는 경로 없음 (`grep -rn "language\|locale" .../subAgents/*.ts`는 빈 결과).

#### 권장 개선

1. **언어 감지 헬퍼 도입**: 사용자의 최근 turn 본문에서 한자 ≥ 30% → `zh-CN`, 아니면 UI locale fallback. `src/ai/message/` 하단에 `detectInputLanguage(messages)` 신설.
2. **system prompt 동적 prefix**: thread 시작 시 감지된 언어를 `CREATIVE_SYSTEM_PROMPT` 앞에 다음과 같이 prepend:
   ```
   ## Output language
   The author writes in Chinese. Respond in Chinese, including all narrative prose, plan text, rationale, logicAudit fields, and consistency-findings description/suggestion. Tool names and JSON keys remain English. Do not switch languages mid-response.
   ```
3. **Sub-agent 동기화**: `buildPlannerSubAgent` / `buildConsistencySubAgent`이 `systemPrompt`를 받을 때 같은 prefix를 받도록 capability builder에서 주입(현재 sub-agent prompts는 static export — 함수 인자로 변경 필요).
4. **logicAudit 필드 한글화 점검**: `PlannerResponseSchema`의 `derivation`/`trigger` 등이 작가 언어로 채워지도록 prompt에서 명시.

---

## 3. StoryBible — 주제·동기 누락

### 현재 템플릿(`electron/ai/tools/CreativeTools.ts:12`)

```
# StoryBible
## Characters
## World
## Story State
## Writing Constraints
## Open Questions
```

작가의 지적대로 **"이 소설이 왜 쓰이는가/무엇을 말하려는가"라는 근본 동기가 빠진 채** 캐릭터부터 입력되는 구조. 실제 storybible.md(작업물)도 5명 캐릭터 + 세계관 + 줄거리 + 제약으로 채워졌고, **주제·premise는 캐릭터 변화호 안에 부수적으로만 언급**됨.

### 권장 개선

`STORYBIBLE_TEMPLATE`을 다음으로 교체:

```markdown
# StoryBible

_Last updated: not yet established_

## Premise
<!-- 한 문장: 이 소설은 누구의 어떤 변화를 다루는가 -->

## Theme
<!-- 작가가 독자에게 남기고 싶은 질문 / 정서 / 가치 명제. 작가 본인의 동기. -->

## Promise to Reader
<!-- 첫 장면이 독자에게 약속하는 톤·장르·정서. 결말과 호응. -->

## Characters
## World
## Story State
## Writing Constraints
## Open Questions
```

system prompt §"StoryBible maintenance"에 **"새 프로젝트에서 첫 character 추가 전에 Premise/Theme/Promise 세 섹션이 비어 있다면 작가에게 먼저 질문하여 채우라"** 규칙 추가. `get_storybible_rebuild_signal`에 `missing_premise: boolean` 신호도 함께 반환하면 startup protocol에서 자연스럽게 환기됨(`electron/ai/tools/CreativeAnalysisTools.ts` 수정).

추가로 PlannerAgent 시스템 프롬프트에 "각 plan은 Theme/Premise와의 연결을 한 줄로 명시해야 한다"는 항목을 넣으면, 매 챕터가 주제와 분리되지 않도록 강제할 수 있음.

---

## 4. Open Questions — 폐쇄 루프 부재

세션 기록 전체에 `OpenQuestion`/`open_question` 트래킹 0건. 템플릿에 섹션은 있지만 **작가에게 다시 물어보거나 챕터 작성 전에 환기시키는 메커니즘이 없음**. 작가가 지적한 "StoryBible 구축 후 Open Questions 그대로 둔 채 챕터 작성으로 진입" 정확히 일치.

### 권장 개선

| 위치 | 변경 |
|---|---|
| `electron/ai/tools/CreativeAnalysisTools.ts` `get_storybible_rebuild_signal` | 반환 객체에 `open_questions: string[]` 추가(`## Open Questions` 섹션 파싱) |
| `src/ai/thread/system-prompts/creative.ts` Plan-first 섹션 | "Before calling `task(planner)` for a new chapter, if `open_questions` is non-empty, surface them to the author with `advise_directions`(or short prose) and offer to resolve before proceeding. Do not silently bypass." 추가 |
| 새 tool `resolve_open_question(question, resolution)` | resolution을 해당 캐릭터/세계관 섹션에 patch하면서 Open Questions 항목 삭제. interruptOn으로 작가 승인 받음 |

---

## 5. 챕터 추가/삭제 도구 누락

`buildCreativeTools`(`electron/ai/tools/CreativeTools.ts:489–501`)가 노출하는 draft 도구는 `read_chapter` / `write_to_chapter` / `read_fragments` / `add_fragment` / `search_draft` 뿐. **chapter level의 add/delete/rename/list/reorder가 모두 없음.**

세션에서 사용자가 7장 구조 재배치를 승인했을 때, agent는 `edit_file`(file-level, sandbox backend)로 ch03(沈望)을 생성하고 ch04~ch07을 한 칸씩 미는 식으로 처리(라인 3935·4030). 이는 다음 위험을 안음:

- 파일명 충돌(같은 이름의 임시 파일 충돌)을 거치며 작가의 미커밋 변경 덮어쓰기 가능
- 단순 이름 변경인데도 plan-first / HITL을 거치지 않음
- ToC, 챕터 메타데이터, 챕터 간 cross-link이 누락

### 권장 도구 신설

`electron/ai/tools/CreativeTools.ts`에 다음을 추가:

| Tool | HITL | 기능 |
|---|---|---|
| `list_chapters()` | L1 | `draft/ch*.md` 파일을 sort된 리스트로 반환(파일명·첫 H1·자수) |
| `create_chapter(filename, after?)` | L2 (approve/reject) | 빈 챕터 파일 생성 + 필요 시 후속 ch 자동 renumber |
| `delete_chapter(filename, cascade_renumber=true)` | L2 (approve/reject) | 파일 삭제 + 후속 renumber. 삭제 전 storybible.md Story State에 변경 반영 제안 |
| `rename_chapter(filename, newName)` | L2 (approve/reject) | 파일 rename, ch 번호 충돌 검사 |
| `reorder_chapters(order: string[])` | L2 (approve/reject) | 명시적 순서로 일괄 renumber. 트랜잭션(전체 성공/실패) |

세션 ch03 삽입 시나리오에서는 `reorder_chapters(["ch01.md","ch02.md","ch03-shen-wang.md","ch04-...md", ...])` 한 번으로 처리 가능. CreativeReviewSurface에는 새 `creative_chapter_structure` 카드 kind 추가(파일 목록 + diff 미리보기).

---

## 6. 用户决策（2026-05-13）

- ✅ 本轮推进 5 项全部：语言一致性 / Premise·Theme / 流式泄漏 / Open Questions 闭环 / 章节增删重排工具。
- ✅ 重构模式（多章节重写）必须**每个章节都走 planner + consistency** 完整闭环。不允许"批量 plan 一次审批后跳过单章 cycle"。
- ✅ StoryBible 三个根本性段落标题统一为：**Premise / Theme / Promise to Reader**。

---

## 7. 落地拆分（按 PR）

### PR 1 — 语言一致性（小 PR，先行）

| 文件 | 变更 |
|---|---|
| `src/ai/message/detectInputLanguage.ts`（新建） | 扫描最近若干 user turn，按汉字 ≥30% / 假名 / 拉丁字符占比判定 `'zh-CN' \| 'en-US' \| 'ja-JP' \| 'other'`，无信号时回退到 UI locale |
| `src/ai/thread/system-prompts/creative.ts` | 导出函数 `buildCreativeSystemPrompt(language)`，在原 prompt 顶部 prepend `## Output language` 段，明确"叙事正文 / plan 文本 / rationale / logicAudit 字段 / consistency-findings description+suggestion 都使用 {language}；工具名和 JSON key 保持英文；不要在一次响应中切换语言"|
| `electron/ai/domain/creative/subAgents/planner.ts` | `buildPlannerSubAgent(plannerTools, language)` — 把同样的 language 段 prepend 到 PLANNER_SYSTEM_PROMPT |
| `electron/ai/domain/creative/subAgents/consistency.ts` | 同上，加到 CONSISTENCY_SYSTEM_PROMPT |
| `electron/ai/domain/creative/buildCreativeCapabilities.ts` | 接收 language 参数并向下传递；如何拿到 language 取决于现有 thread 构造路径（最可能在 `src/ai/thread/` 层把 detect 结果传到 IPC 启动调用）|

### PR 2 — StoryBible Premise/Theme/Promise to Reader

| 文件 | 变更 |
|---|---|
| `electron/ai/tools/CreativeTools.ts:12` | `STORYBIBLE_TEMPLATE` 顶部插入三段：`## Premise` / `## Theme` / `## Promise to Reader`，每段下方放注释提示作者填什么 |
| `electron/ai/tools/CreativeAnalysisTools.ts` `get_storybible_rebuild_signal` | 返回值增加 `missing_premise: boolean`（三段任意一段为空或仅有占位即为 true）|
| `src/ai/thread/system-prompts/creative.ts` `## StoryBible maintenance` | 增加规则："首次为新项目添加 character 之前，若 Premise/Theme/Promise 任一为空，必须先与作者对话确认，写入后再继续。Session startup 中若 missing_premise=true，在第一次响应里向作者抛出三个问题（一个一个问，不一次性塞）。" |
| `src/ai/thread/system-prompts/creative.ts` Plan-first 段 | PlannerAgent 调用前要求"每个 plan 一句话锚定 Theme"，logicAudit 中 motivationTrace 的 derivation 字段需引用 Premise/Theme |
| `electron/ai/domain/creative/subAgents/planner.ts` | PLANNER_SYSTEM_PROMPT 增加"plan 必须包含一行 `Theme tie: ...`"指令 |

### PR 3 — Plan/Findings 流式泄漏

| 文件 | 变更 |
|---|---|
| `src/ai/thread/system-prompts/creative.ts` Plan-first 段 | "拿到 planner 结果后立即调用 confirm_writing_plan。assistant 文本只能有一句状态行（如『已生成方案，请审批』），**不要在文本里复述 plan/rationale/logicAudit 任何内容**。" |
| `src/ai/thread/system-prompts/creative.ts` Post-write 段 | "consistency-findings 围栏块必须一次性输出（先在内部完成 JSON，再写 ```consistency-findings + JSON + ```）。不要边想边写打开围栏。" |
| `src/ai/message/fenced-blocks.ts` | `splitTextWithFences` 增加可选参数 `placeholderForOpenFence`：检测到未闭合围栏时返回一个 `{kind: 'pending', name: 'consistency-findings'}` 节点 |
| `src/components/ai/agent-panel/chat-area/views/`（消费端） | 渲染 `pending` 节点为简单的"正在生成一致性建议…"占位条 |
| `src/components/ai/agent-panel/chat-area/views/ToolCallCard.vue:186` | `subagent_task` detail 默认折叠（planner / consistency 的 raw JSON 不主动展开）|

### PR 4 — Open Questions 闭环 + 章节增删重排

#### 4a. Open Questions 闭环
| 文件 | 变更 |
|---|---|
| `electron/ai/tools/CreativeAnalysisTools.ts` | rebuild signal 增加 `open_questions: string[]`（按 `- ` bullet 解析 `## Open Questions` 段）|
| `electron/ai/tools/CreativeTools.ts` | 新增 `resolve_open_question(question, resolution, target_section)` 工具：在 target_section（Characters/World/...）upsert resolution，然后从 `## Open Questions` 段移除该 bullet。L2 HITL（approve/edit/reject）|
| `src/ai/thread/system-prompts/creative.ts` Plan-first 段 | "在 task(planner) 之前，若 open_questions 非空，先用 advisor-directions 或简短散文向作者列出未解问题，主动询问是否要先 resolve_open_question 再进入写作。绝不静默跳过。" |

#### 4b. 章节增删重排（5 个新工具）
| 工具 | HITL | 行为 |
|---|---|---|
| `list_chapters()` | L1 | 扫描 `draft/ch*.md`，返回 `[{filename, h1, wordCount}]` 排序数组 |
| `create_chapter(filename, after_filename?)` | L2 approve/reject | 创建空章节文件；若 `after_filename` 指定且会造成编号冲突，自动 renumber 后续章节（事务性）|
| `delete_chapter(filename, cascade_renumber=true)` | L2 approve/reject | 删除文件并 cascade renumber；删除前要求 agent 向作者说明对 Story State 的影响 |
| `rename_chapter(filename, new_filename)` | L2 approve/reject | 重命名；检查目标名冲突 |
| `reorder_chapters(order: string[])` | L2 approve/reject | 一次性按 order 列表 renumber 全部章节，事务性 |

| 文件 | 变更 |
|---|---|
| `electron/ai/tools/CreativeTools.ts` | 上述 5 个新工具实现；统一走 `resolveDraftMarkdownPath` 校验 |
| `electron/ai/domain/creative/buildCreativeCapabilities.ts` | `interruptOn` 增加四个 L2 工具的审批入口 |
| `src/ai/types.ts` | 新增 `CreativeChapterStructureReviewItem`（kind: `'creative_chapter_structure'`），含 before/after 文件列表 diff |
| `src/ai/ipc/CreativeReviewAdapter.ts` | 把四个工具的 actionRequest 映射到新 review kind |
| `src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue` | 新增 `creative_chapter_structure` 卡片：显示文件列表 before/after 表格 + 受影响的章节数 |
| `src/i18n/messages/{zh-CN,en-US}.ts` | 5 个新工具名 + 新 review kind 的本地化文案 |

### PR 5 — 重构模式强制单章 cycle

| 文件 | 变更 |
|---|---|
| `src/ai/thread/system-prompts/creative.ts` Plan-first 段 | 增加明确条款："`write_to_chapter` 每次只对**一个**章节生效，无论是首次起草还是覆盖重写。多章节重构必须按章节循环：每个章节单独调用 task(planner) → confirm_writing_plan → write_to_chapter → task(consistency_checker)。**不允许"一次批量 plan 审批后直接连续 write_to_chapter 跳过单章 cycle"**。如果作者要求批量重写 N 章，先告知会执行 N 个完整 cycle 并请确认。" |
| 同文件 | 在示例中放反例："❌ Wrong: write_to_chapter(ch01) → write_to_chapter(ch02) → ... 没有 planner 介入" |

---

## 8. 核心文件索引

- `electron/ai/tools/CreativeTools.ts` — STORYBIBLE_TEMPLATE、章节工具新增点、resolve_open_question
- `electron/ai/tools/CreativeAnalysisTools.ts` — rebuild signal 增 `missing_premise` 与 `open_questions`
- `electron/ai/domain/creative/subAgents/{planner,consistency}.ts` — system prompt 接受 language 参数
- `electron/ai/domain/creative/buildCreativeCapabilities.ts` — language 透传 + 新工具 interruptOn
- `src/ai/thread/system-prompts/creative.ts` — 语言 prefix / Premise·Theme 规则 / 流式泄漏防护 / OQ 环节 / 单章 cycle 强制
- `src/ai/message/detectInputLanguage.ts`（新建）— 输入语言检测
- `src/ai/message/fenced-blocks.ts` — 流式 fence placeholder
- `src/ai/types.ts` — `CreativeChapterStructureReviewItem` 新 kind
- `src/ai/ipc/CreativeReviewAdapter.ts` — 章节结构 review 映射
- `src/components/ai/agent-panel/domains/creative/CreativeReviewSurface.vue` — 新卡片
- `src/components/ai/agent-panel/chat-area/views/ToolCallCard.vue:186` — subagent_task 默认折叠
- `src/i18n/messages/{zh-CN,en-US}.ts` — 新工具名 + 新 kind 文案

---

## 9. 验证矩阵

每个 PR 之后都需要执行：

```bash
npm run lint
npm run type-check
```

并按 PR 维度做行为验证：

| PR | 端到端测试 |
|---|---|
| 1 语言 | 用纯中文 / 纯英文 / 纯日文 各起一个 thread，跑 5 轮，trace 检查 reasoning_content + 正文 + logicAudit + consistency findings 全部使用对应语言 |
| 2 Premise/Theme | 新建空 workspace → 让 agent 协助"开始一部新小说" → 验证 agent 在创建任何 character 之前先问 Premise/Theme/Promise；session startup 时 `missing_premise=true` 触发提醒 |
| 3 流式泄漏 | 让 agent 写一个新场景 → 观察从 task(planner) 返回到 confirm_writing_plan 调用之间的 assistant 文本是否只有一行状态；consistency-findings 渲染过程中是否只看到 placeholder 而非 raw JSON |
| 4a OQ 闭环 | storybible.md 含未解决 Q → 让 agent "写下一章" → 验证 planner 之前先列出 Q 并询问 |
| 4b 章节工具 | 在中间插入新章节场景：`create_chapter("ch03-shen-wang.md", after="ch02.md")` + 自动 cascade renumber ch03→ch04, ch04→ch05 … 一次完成 |
| 5 单章 cycle | 让作者说"帮我重写 ch01 到 ch07" → 验证 agent 主动告知会跑 7 个完整 cycle，且实际执行中每章都有 task(planner) 和 task(consistency_checker) |
