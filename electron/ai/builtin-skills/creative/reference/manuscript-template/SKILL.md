---
name: manuscript-template
description: 正文文件的非主流程模板；仅在 drafting/revision/novel-import Playbook 已进入正式创建、更新、迁移或结构校验且本轮目标包含正文或前后材料时加载；定义 manuscript/ch{NNN}.md、front-matter.md 和 back-matter.md。
---

# 正文模板

**前置 Skill：** `novel-workspace`

## 管理对象

```text
{workspace}/manuscript/
  ch{NNN}.md          # 懒创建：章节正文，一级标题＝章名（与章纲一致）
  front-matter.md     # 可选：非章节前置材料
  back-matter.md      # 可选：非章节后置材料
```

Agent 新写或修改章节正文前，该章须有 `confirmed` 的 `ch{NNN}-outline.md`（依赖见 `novel-workspace`）。`novel-import` 可以先机械导入已有正文再重建章纲；该例外不授权 writer 在未确认章纲时改写正文。

正文是“实际发生了什么”的真相来源，人物处境、伏笔实际状态等实际态从正文派生，不回写为规划事实。

## 章节内容

正文文件含三类内容；`> [!TYPE]` GFM Alert 靠 TYPE 区分（TYPE 是固定标记、不本地化，标记内文字用输出语言）：

- **正文**：段落文字。
- **情感节拍 `[!BEAT]`**：`> [!BEAT] [scene-id-beat-M] 一句情感 / 叙事转向`。
  - `[!BEAT]` 是提取锚点（靠标记找，不靠坐标正则）；磁盘上 `\[…\]` 转义等价。
  - 坐标使用章纲的稳定场景 ID 加 beat 序号，例如 `[scene-hospital-proof-beat-1]`。
  - 内容为一句因果必要的情感 / 叙事转向，不带解释尾、文风指令、逐句措辞。
  - 场景间用 `* * *` 分隔；agent 写入时，同场景内 beat 之间空一行，避免相邻无空行会并成一个 alert。
- **注释 `[!TYPE]`**：除 `[!BEAT]` 外的其他 GFM Alert（`NOTE` / `COMMENT` / `WARNING` / `TIP`…），TYPE 表注释类型，非正文。

## 前后材料

- `front-matter.md` 保存扉页、版权、目录、献词等非叙事前置材料。
- `back-matter.md` 保存附录、后记、致谢等非叙事后置材料。
- 叙事性序章、间章、尾声属于故事正文，使用 `ch{NNN}.md`，不能为了绕过章纲依赖放入前后材料。
- 前后材料不使用 `[!BEAT]`，也不要求章节提纲。机械导入时保留转换结果，不为符合模板而让模型重排或重写。
