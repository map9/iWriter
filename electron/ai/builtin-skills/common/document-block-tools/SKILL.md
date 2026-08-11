---
name: document-block-tools
description: Use when editing or creating an iWriter document, or when a document read depends on pagination, list containers, block-ID handoff/lifecycle, or stale/content_mismatch recovery.
---

# 文档块工具协议

这是块模型、分页、列表编辑、工具选择、批处理和块 ID 生命周期的唯一事实源。普通只读可直接依靠工具 schema；加载本 skill 后按以下协议执行。

## 两级块模型

- 叶子块：段落、标题、列表项、图片、代码块、公式等，每个块对应一个 `{b:n}`。
- 容器块：完整的无序、有序或任务列表，拥有独立 `{b:n}`，内部包含列表项叶子块。

块是读取和编辑的原子单位。分页不拆开块；列表、引用、代码块和表格等容器不从中间截断。单个块超过分页预算时独占一页。

## 读取与定位

1. 用 `get_document_outline(file_path=...)` 获取标题结构和块 ID。
2. 用 `get_section(heading_block_id, file_path=..., offset?, limit?)` 读取章节。`limit` 是字符预算，`offset` 是章节内块偏移；`has_more=true` 时以 `next_offset` 继续。
3. 用 `get_sections` 批量读取已知章节；用 `get_blocks` 精确读取准备编辑的块；用 `get_block_context` 获取邻近上下文。

`get_section` 的 `containers` sidecar 提供列表容器的 `block_id`、子项 ID 和完整 Markdown。`get_blocks` 读取列表项时返回 `container_block_id`，读取容器时返回完整列表。

编辑前读取当前内容，并把读取到的原文传入相应 `expected_*` 字段，使文档变化时安全失败。常用字段包括 `expected_current_content`、`expected_anchor_content` 和 `expected_old_content`。

`{b:n}` 只是显示和定位元数据，不是文档内容。传入 `expected_*`、`new_content` 或 `create_document.content` 前删除前导 `{b:n}`；写入结果中不得出现块标记。

向用户或其他 agent 交接文档位置时使用 `{b:n}`，范围用起止块 ID，并附一段短原文。不要用行号或字符偏移代替块位置。

## 选择编辑工具

- `edit_block`：修改一个现有块，且保持块类型和标题层级。标题内容只传文字，不带 `#`；代码块内容不带围栏。
- `insert_block`：在一个块后插入完整 Markdown；`after_block_id=0` 表示文档开头。
- `delete_block`：删除一个现有块。
- `replace_range`：替换一个或多个连续块；改变块类型、标题层级或重写连续范围时使用。`new_content` 传完整 Markdown。
- `create_document`：创建新文档，`content` 传完整 Markdown。

一个块内部的小改动使用 `edit_block`。局部重写、标题格式调整、删除后的衔接修复或跨多个连续块的修改使用 `replace_range`。

## 列表编辑

- 只修改一个列表项文字：对该列表项叶子块调用 `edit_block`。
- 添加、删除、重排、嵌套列表项：对列表容器块调用 `edit_block`，把完整的新列表 Markdown 作为 `new_content`。
- 任务列表保留 `- [ ]` 和 `- [x]`，不要丢失勾选状态。

## 同一快照批处理

块 ID 只对一次文档快照有效。同一文件的一轮修改必须：

1. 从一次读取取得全部目标块 ID。
2. 在同一模型响应中调用多个块编辑工具，不在这些调用之间重新读取。
3. 把整批提交审批；引擎按文档位置逆序应用，调用方不负责排序。
4. 批次应用后重新调用 `get_document_outline`，下一轮只能使用刷新后的 ID。

不得把同一快照上的修改拆成多个审批响应。一个批次应用后，旧 ID 不能再用于 `get_section`、`get_sections`、`get_blocks`、`get_block_context` 或下一批编辑。

## `content_mismatch` 恢复

重新读取目标并纠正一次，然后按顺序检查：

1. `expected_*` 是否误带 `{b:n}`。
2. 是否把整章或多个块原文传给了单块字段；需要精确原文时用 `get_blocks`。
3. 是否复用了已应用批次之前的块 ID。

新读取后仍失败时停止，不第三次重复相同调用，也不改用 `write_file`、`edit_file` 或 shell 绕过。报告目标块、发送的原文和工具错误。

## 创建文档

`create_document(filename, content, directory?, open_in_editor?)` 需要审批。

- `filename` 只能是 basename，不得包含路径分隔符；子目录放在 `directory`。没有扩展名时默认使用 `.md`。
- `directory` 使用工作区相对目录或用户提供的真实绝对目录。传入 `directory` 才会写入磁盘；省略时只创建未保存的内存标签。
- `open_in_editor` 默认 `true`，只在传入 `directory` 时有效。批量创建不需要立即打开的骨架文件时设为 `false`。
- 新建内容同样不得包含 `{b:n}`。

## 审批

同一文件的块编辑显示为一个按文档顺序排列的聚合 diff。用户负责批准、覆写或拒绝；调用方不管理应用顺序。

提交块编辑或 `create_document` 后停止等待审批。遵守主 prompt 的审批家族边界，不在同一响应中混入文件系统变更或 Creative/Git 审批工具。
