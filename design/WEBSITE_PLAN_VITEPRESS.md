# iWriter 官网与生产文档提纲（VitePress）

> 更新时间：2026-04-22  
> 依据：当前仓库代码实现（`src/` + `electron/` + `package.json`）

## 1. 目标

- 对外形成一套可持续迭代的产品文档站
- 让用户完成 3 件事：
  - 了解 iWriter 做什么
  - 完成安装并成功启动
  - 在 5-10 分钟内跑通核心工作流

## 2. 内容原则（必须遵守）

- 所有对外描述以代码现状为准，不引用内部方案文档作为事实来源
- “已实现能力”与“规划能力”分栏展示，避免营销式混写
- 对不完整能力明确标记（例如当前 `Tag` 面板为示例实现）

## 3. 推荐站点结构（MVP）

```text
website/
├─ index.md                  # 首页
├─ download.md               # 下载与安装
├─ quick-start.md            # 5-10分钟上手
├─ features.md               # 功能总览
├─ changelog.md              # 更新日志
├─ faq.md                    # 常见问题
├─ privacy.md                # 隐私政策
├─ terms.md                  # 服务条款
├─ docs/
│  ├─ index.md               # 文档首页
│  ├─ workspace.md           # 工作区与文件管理
│  ├─ editor.md              # 编辑器使用
│  ├─ search.md              # 搜索与替换
│  ├─ toc.md                 # 目录与结构导航
│  ├─ ai-overview.md         # AI 总览
│  ├─ ai-edit-mode.md        # Edit 模式 + 审批流
│  ├─ ai-creative-mode.md    # Creative 模式
│  ├─ ai-provider.md         # Provider 配置
│  ├─ preferences.md         # 偏好设置
│  ├─ update.md              # 更新机制
│  └─ troubleshooting.md     # 故障排查
└─ .vitepress/
   └─ config.ts
```

## 4. 页面级内容提纲

## 4.1 首页（`index.md`）

1. 一句话定位
- 本地文件优先的 AI 写作工作台

2. 核心能力卡片
- 本地工作区管理
- 富文本/Markdown 编辑
- 图片与 PDF 同窗查看
- AI 编辑提案审批流（HITL）

3. 支持平台
- macOS / Windows / Linux（按 release 实际状态展示）

4. CTA
- 下载
- 快速上手
- 使用文档

## 4.2 下载页（`download.md`）

1. 当前稳定版本
2. 各平台安装包入口
3. 安装步骤
4. 升级方式（自动更新/手动覆盖）
5. 常见安装问题

## 4.3 快速上手（`quick-start.md`）

1. 打开文件夹
2. 新建或打开文档
3. 使用左侧 Explorer / Search / TOC
4. 打开 AI 面板并发起一次编辑提案
5. 审批提案并保存

## 4.4 功能总览（`features.md`）

按“真实能力矩阵”组织：

- 文件与工作区
- 编辑器能力
- 图片/PDF 查看
- AI 三模式
- 更新机制
- 偏好设置

并增加“当前边界”节：

- Tag 面板当前为示例数据
- AI 编辑为审批后执行，不是自动无确认改写

## 4.5 文档首页（`docs/index.md`）

- 文档导航入口
- 推荐阅读顺序（新手/进阶/管理员）

## 5. 关键专题文档要求

## 5.1 `docs/workspace.md`

- 文件树能力（新建/重命名/移动/删除）
- 文件监听与外部变更同步
- 多标签与恢复

## 5.2 `docs/editor.md`

- 格式化能力清单
- 表格、数学公式、代码块
- 只读/自动保存

## 5.3 `docs/search.md`

- 文内搜索替换
- 跨文件搜索替换（正则、整词、大小写）

## 5.4 `docs/ai-overview.md`

- Edit / Creative / Minimal 的差异
- 线程、历史与上下文附件

## 5.5 `docs/ai-edit-mode.md`

- Proposal/HITL 流程图
- approve/edit/reject 三种决策
- 安全边界与失败回退说明

## 5.6 `docs/ai-provider.md`

- Provider 预设（OpenAI-compatible / DeepSeek / Anthropic / Gemini 等）
- API Key / Base URL / 模型选择说明

## 5.7 `docs/update.md`

- 自动更新触发机制
- 跳过版本、手动检查
- 生产环境与开发环境差异

## 6. 导航建议（VitePress）

顶栏：

- Features
- Download
- Quick Start
- Docs
- Changelog
- FAQ

侧栏（Docs）：

- Workspace
- Editor
- Search
- TOC
- AI Overview
- AI Edit Mode
- AI Creative Mode
- AI Provider
- Preferences
- Update
- Troubleshooting

## 7. GitHub Pages 发布建议

- 使用 GitHub Actions 自动部署
- `base` 与仓库路径保持一致
- 产物目录统一为 `.vitepress/dist`

## 8. 文档质量门槛（发布前自检）

每篇对外文档发布前至少满足：

- 有“适用版本”标识
- 有“最后更新日期”
- 所有菜单路径和按钮文案可在当前版本找到
- 未实现能力不写成既有能力

## 9. 后续可扩展章节（第二阶段）

- `security.md`
- `roadmap.md`
- `community.md`
- 商业化后补 `pricing.md`
