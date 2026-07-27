---
name: project-template
description: 创建、读取、更新或校验小说工作区根目录 project.md 时使用；只定义作品级立项对象的 schema 与结构规则。
---

# 项目模板

**前置 Skill：** `novel-workspace`

## 管理对象

```text
{workspace}/project.md      # 必需：作品级立项信息的唯一来源
```

`project.md` 保存进入世界观、人物和提纲设计前需要共享的作品级事实；不保存剧情当前状态、候选方向或协作偏好。

## 文件结构

H2 字段：

- `title`（必选）：书名；可以是作者确认的暂定名。
- `genre-tags`（必选）：题材与标签；自由文本，不限定枚举。
- `premise`（必选）：故事核心句，包含人物、可行动目标、核心阻碍和失败代价。
- `theme`（必选）：可争论的主题命题，不是主题词或正确口号。
- `reader-promise`（必选）：作品持续向目标读者兑现的主要体验。
- `core-change`（必选）：故事最核心的不可逆变化，写明从什么状态变为什么状态。
- `narrative-engine`（必选）：能够反复产生事件、选择、升级、揭示或悬念的机制，不是一次性开端。
- `scale-plan`（必选）：用列表记录作品形态、预计总字数、预计章节数、每章目标字数、是否分卷、预计卷数；这些数值是规划估算，不是创作质量配额。
- `target-audience`（可选）：目标读者的类型经验、阅读动机、偏好与接受度。
- `narrative-pov`（可选）：叙事视角；未指定时 writer 默认第三人称有限，但不自动回写本字段。
- `style`（可选）：指向 `styles/{slug}.md` 的全局风格对象；缺省表示无风格对象。

## 变更影响

修改 `premise`、`theme`、`reader-promise`、`core-change` 或 `narrative-engine` 时，提示世界观、人物与提纲可能需要复核，不自动改下游。调整 `style` 也须由作者确认。
