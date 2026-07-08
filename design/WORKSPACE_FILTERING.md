# Workspace Filtering

本文档描述 iWriter 工作区文件过滤规则的设计结论。  
核心原则：`.iwtignore` 管 iWriter 工作区，`.gitignore` 管 Git 版本管理；二者可以选择联动，但默认不混同。

## 当前结论

iWriter 是本地写作、资料管理与 AI 协作工具，不是以 Git 为中心的代码 IDE。工作区文件过滤的核心语义应该是：

- 资源管理器里哪些文件对当前写作上下文可见
- 跨文件搜索应该覆盖哪些文件
- 文件监听应该关心哪些变化
- AI 工作区检索应该把哪些文件视为可用上下文

Git 的 `.gitignore` 语义是“是否纳入版本管理”，它与 iWriter 的“是否属于当前工作区上下文”经常重叠，但不等价。

因此：

- `.iwtignore` 是 iWriter 的一等工作区过滤规则。
- `.gitignore` 是 Git 的版本控制规则。
- iWriter 可以可选复用 `.gitignore`，但不应默认把 `.gitignore` 当成工作区过滤规则。

## 规则分层

### 系统默认规则

系统默认规则用于跳过明显不属于创作内容的系统、版本控制与平台元数据。

建议默认包含：

```txt
.git/
.iwriter/
.DS_Store
**/.DS_Store
._*
__MACOSX
```

这一层属于 iWriter 内置保护规则，主要目标是减少噪声、避免监听和遍历无意义内容。

`.iwriter/` 属于 iWriter 工程态目录，默认也纳入系统默认规则。它不是用户日常写作资料视图的一部分，默认过滤它的目的不是权限隔离，而是降低资源树、搜索和文件监听中的工程态噪声。

### 用户全局默认规则

用户可以在偏好设置中配置个人习惯规则。

适用场景：

- 长期不希望在 iWriter 中看到的临时目录
- 个人固定的导出目录、备份文件、缓存文件
- 多个工作区共用的过滤习惯

### 工作区 `.iwtignore`

工作区根目录的 `.iwtignore` 是项目级 iWriter 过滤规则。

它表达的是：

> 这些内容不属于当前 iWriter 工作区的写作、资料、搜索或 AI 上下文。

`.iwtignore` 应影响：

- Explorer 文件树
- 跨文件搜索
- 文件监听
- AI 工作区检索，若该检索复用 iWriter 工作区搜索能力

### Git `.gitignore`

`.gitignore` 继续表达 Git 版本管理边界。

它表达的是：

> 这些内容不进入 Git 版本管理。

默认情况下，`.gitignore` 不应影响 iWriter Explorer、搜索或监听。

如果用户希望复用 `.gitignore`，应通过明确开关启用。

## 默认行为

新安装或默认配置下：

```ts
useGitignoreForExplorer = false
useGitignoreForSearch = false
useGitignoreForWatcher = false
```

默认只应用：

```txt
系统默认规则
+ 用户全局默认规则
+ 工作区 .iwtignore
```

`.gitignore` 不自动参与 iWriter 工作区过滤。

## `.gitignore` 联动范围

推荐将 `.gitignore` 联动拆成三个 scope：

```ts
type WorkspaceFilterScope = 'explorer' | 'search' | 'watcher'
```

当前阶段 AI 工作区检索复用 `search` scope。原因是 AI 检索语义更接近“可被内容检索使用的写作上下文”，而不是资源树展示或底层文件监听。如果未来 AI 需要独立规则，再新增 `ai` scope，而不是隐式复用 `explorer` 或 `watcher`。

### Explorer

控制资源管理器是否隐藏 `.gitignore` 命中的文件。

建议默认关闭。

原因：有些不进 Git 的文件仍然是写作上下文，例如导出稿、PDF 原件、图片素材、私密草稿或 AI 派生资料。

### Search

控制跨文件搜索是否排除 `.gitignore` 命中的文件。

建议默认关闭。

原因：搜索是写作上下文检索，不是 Git 状态检索。用户可能希望搜索未提交、未纳管或私有资料。

### Watcher

控制文件监听是否跳过 `.gitignore` 命中的文件。

建议默认关闭。

原因：监听决定 iWriter 是否感知外部变化。被 Git 忽略的文件仍可能需要在资源树中刷新，或被打开标签感知变化。

## 规则合并顺序

推荐合并顺序：

```txt
系统默认规则
+ 用户全局默认规则
+ scope 可选的 .gitignore
+ 工作区 .iwtignore
```

理由：

- `.gitignore` 是外部系统规则。
- `.iwtignore` 是 iWriter 工作区规则。
- 当二者冲突时，`.iwtignore` 应作为 iWriter 语义的最终裁决。

示例：

```txt
# .gitignore
exports/

# .iwtignore
!exports/final.pdf
```

如果用户在当前工作区希望 iWriter 仍看到 `exports/final.pdf`，`.iwtignore` 应具备覆盖能力。

## 偏好设置设计

偏好设置中建议使用“工作区文件过滤”区域。

建议结构：

```txt
工作区文件过滤

默认过滤规则
[textarea]

项目过滤规则
说明：可在工作区根目录创建 .iwtignore，用于控制当前项目在 iWriter 中的可见、可搜索和可监听内容。

Git 忽略规则联动
[ ] 资源管理器隐藏 .gitignore 中的文件
[ ] 跨文件搜索排除 .gitignore 中的文件
[ ] 文件监听跳过 .gitignore 中的文件
```

文案重点：

- `.iwtignore` 控制 iWriter 工作区。
- `.gitignore` 控制 Git。
- 开启 Git 联动后，被 Git 忽略的文件会在对应 iWriter 功能中被排除。

设置形态：

```ts
interface EditSetting {
  workspaceIgnoreRules?: string
  useGitignoreForExplorer?: boolean
  useGitignoreForSearch?: boolean
  useGitignoreForWatcher?: boolean
}
```

`workspaceIgnoreRules` 只表示用户全局默认规则，不代表任何功能的最终有效规则。Explorer、Search、Watcher 都必须通过 scope-aware API 获取最终规则。

不保留旧的单一 Git 联动字段。新目标状态下，Git 联动只由各 scope 对应的布尔设置表达。

## `.iwriter/` 目录

`.iwriter/` 是 iWriter 项目级工程态目录，可能包含：

- AI 工程态
- 项目级 skills
- 派生缓存
- 本地数据库

默认策略：

```txt
.iwriter/
```

`.iwriter/` 默认加入系统默认过滤规则，适用于 `explorer`、`search`、`watcher`。这表示 iWriter 默认不在资源树、跨文件搜索和普通监听结果中暴露内部工程态文件。

长期策略：

- 提供“显示 iWriter 工程文件”开关。
- 在没有该开关前，不建议用 `.iwtignore` 反向规则暴露 `.iwriter/`。这会把内部工程态目录的可见性绑定到普通项目过滤规则，语义不够清晰。

## API 与实现方向

建议将现有全局函数改为 scope-aware。

```ts
function getEffectiveWorkspaceIgnoreRules(
  workspaceRoot: string,
  scope: WorkspaceFilterScope
): Promise<string>
```

构建规则时根据 scope 决定是否读取并合并 `.gitignore`。

```ts
function buildWorkspaceIgnoreRules(options: {
  preferenceRules?: string | null
  gitignoreRules?: string | null
  workspaceRules?: string | null
  useGitignore?: boolean
}): string
```

调用方分别传入自己的 scope：

- Explorer 遍历：`explorer`
- SearchPanel / workspace search：`search`
- chokidar watcher：`watcher`

实现约束：

- `globalEditSetting.workspaceIgnoreRules` 只作为用户全局默认规则输入。
- `getEffectiveWorkspaceIgnoreRules(workspaceRoot, scope)` 负责读取 `.iwtignore`，并按 scope 判断是否读取 `.gitignore`。
- SearchPanel 不能直接读取 `globalEditSetting.workspaceIgnoreRules` 作为最终规则，应请求 `search` scope 的有效规则。
- chokidar watcher 使用 `watcher` scope 的有效规则。

## 刷新策略

规则或设置变化后，各功能按自己的 scope 刷新：

| 变更 | Explorer | Search | Watcher |
| --- | --- | --- | --- |
| 默认过滤规则变更 | 重新加载资源树 | 若搜索面板有查询，重新搜索 | 重启 watcher |
| `.iwtignore` 变更 | 重新加载资源树 | 若搜索面板有查询，重新搜索 | 重启 watcher |
| `useGitignoreForExplorer` 变更 | 重新加载资源树 | 不触发 | 不触发 |
| `useGitignoreForSearch` 变更 | 不触发 | 若搜索面板有查询，重新搜索 | 不触发 |
| `useGitignoreForWatcher` 变更 | 不触发 | 不触发 | 重启 watcher |
| `.gitignore` 变更 | 仅当 explorer scope 启用时刷新 | 仅当 search scope 启用时重搜 | 仅当 watcher scope 启用时重启 |

Watcher 的 ignore predicate 必须始终允许规则文件自身触发事件：

- 工作区根目录 `.iwtignore` 不应被当前过滤规则吞掉。
- 当任意 Git 联动 scope 启用时，工作区根目录 `.gitignore` 的变化也应能被感知。

否则用户修改过滤规则后，iWriter 可能无法收到规则文件变化事件，也就无法刷新资源树、搜索结果或 watcher。

## 影响范围

主要影响文件：

| 文件 | 调整 |
| --- | --- |
| `src/services/workspace/filtering.ts` | 增加 scope-aware 规则构建与类型 |
| `src/stores/app.ts` | 工作区树、监听、偏好设置状态改为按 scope 获取规则 |
| `src/components/sidebar/SearchPanel.vue` | 搜索使用 search scope 的有效规则 |
| `src/components/common/tiptap/iw-search-replace/iwSearchReplaceInFilesService.ts` | 跨文件搜索使用统一 search scope |
| `electron/App.ts` | 文件监听使用 watcher scope 传入的规则 |
| `src/components/preferences/PreferencesDialog.vue` | 增加 Git 联动分项开关 |
| `src/i18n/messages/*.ts` | 更新偏好设置文案 |
| `docs/docs/workspace.md` | 更新用户文档 |
| `docs/docs/preferences.md` | 更新偏好设置说明 |

## 测试建议

至少覆盖：

1. 默认不合并 `.gitignore`。
2. `.iwtignore` 可影响 Explorer、Search、Watcher。
3. 三个 `.gitignore` scope 可独立开关。
4. `.iwtignore` 在合并顺序上可覆盖 `.gitignore`。
5. 目录规则、反向规则、basename 规则仍保持现有行为。
6. `.git/`、`.DS_Store` 等系统默认规则始终生效。

## 非目标

本设计不处理：

- Git 状态展示。
- Git tracked / untracked 文件徽标。
- 多层子目录 `.gitignore` 的完整 Git 语义模拟。
- 与 VS Code 完全一致的 `files.exclude` / `search.exclude` 配置模型。

当前目标是先建立 iWriter 自己清晰、可解释的工作区过滤语义。
