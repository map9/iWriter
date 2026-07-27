# 来源整备

物理导入只负责机械转换与拆分，不评价、摘要或改写正文。单次 `import_manuscript` 处理一个来源文件；多文件分次导入，并为每次指定连续且不冲突的 `filename_start`。

## Dry-run 输入

- `source_path`：来源文件绝对路径；
- `filename_start`：候选目标文件的首章编号；
- `pandoc_path`：只有运行环境不能自动定位 Pandoc 时才传。

省略 `boundaries` 即为 dry-run，不写文件。返回内容包括：

- 零基行号；
- 章节候选及前后文本；
- 独立的卷界候选；
- 独立的前置材料候选；
- 独立的后置材料候选；
- 可能存在的章前内容；
- Pandoc 机械转换提示。

候选只是启发式结果。普通 H1/H2 可能是书名、目录或篇章名；纯数字标题可能是列表项；没有候选也不代表没有章节。

## 边界核验

1. 排除书名页、目录项、卷标题、场景分隔线和后置材料。
2. 检查低置信度候选，并抽查高置信度候选的首、中、尾样本。
3. 查看相邻章界距离异常的区段：过短可能是假标题，过长可能漏章。
4. 分别确定：
   - 章界列表；
   - 需要保留的卷界列表；
   - 第一章之前内容的保留策略；
   - 最后一章之后内容的起始行与保留策略。
5. 形成完整映射表：源行号、源标题、目标文件、所属卷候选。

叙事性序章、尾声若属于故事正文，应作为章节进入 `boundaries`；扉页、版权、目录、献词、附录、后记、致谢等才属于 `front-matter.md` 或 `back-matter.md`。

## 作者确认

执行前一次性确认：

- 完整 `boundaries`，只含章界；
- `volume_boundaries`：需要保留的卷标题行；工具会把卷标题附在其后第一章开头，避免落入上一章末尾；
- `filename_start` 与目标文件映射；
- `front_matter_policy`：`preserve` / `discard`；
- 如有后置材料，`back_matter_start_line` 与 `back_matter_policy`；
- `collision_policy`：
  - `reject`：任一同名文件存在则整次不写，默认且最安全；
  - `skip`：保留同名文件，只写其余文件；必须披露会形成哪些缺口；
  - `overwrite`：覆盖同名目标；必须是作者的明确选择。

卷界不传入 `boundaries`；需要保留时单独传入 `volume_boundaries`。作者选择“不建立卷纲”也不影响卷标题的物理保留。

## Execute 输入

再次调用同一工具并传：

- `source_path`；
- `target_directory`；
- 已确认 `boundaries`；
- 已确认 `volume_boundaries`（如有）；
- `filename_start`；
- 适用的前后材料策略；
- 已确认 `collision_policy`。

工具在写入前验证所有行号、空章、前后材料和文件碰撞。`reject` 遇到冲突时不写任何文件；不得看到 blocked 结果后擅自改用 `overwrite`。

## 写后校验

对照返回结果检查：

- planned / written / skipped / overwritten 是否与确认方案一致；
- 章节数和编号是否连续或符合计划；
- 第一章、末章及至少一个中段章节的标题和首尾内容；
- `front-matter.md`、`back-matter.md` 是否只包含已确认的非章节内容；
- 是否存在空文件、末章吞入后置材料或卷标题单独成章。

正文不经过模型，因此属于机械保真；但 Pandoc 可能调整段落、列表、标题、脚注、图片引用或边缘空白。需要版式级保真时应保留原文件供对照，不能宣称字节级一致。
