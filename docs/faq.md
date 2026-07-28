# 常见问题（FAQ）

> 适用版本：iWriter `0.2.2`
>
> 最后更新：2026-07-28

## iWriter 是在线文档平台吗？

不是。iWriter 以本地文件为核心，优先处理本机工作区中的文档与素材。

## AI 会未经确认直接改我的文件吗？

不会。`Edit` 模式先给出提案，你审批后才会写入。`Creative` 的项目对象修改同样需要审批；正文写作先确认目标章节和写作意图，完成后再通过整章差异接受、返工或回滚。

## Git 功能会把仓库变成 iWriter 专用格式吗？

不会。iWriter 使用工作区中的标准 `.git` 仓库，需要系统安装 Git，并可与命令行、GitHub、GitLab 或其他 Git 客户端互通。

## 为什么有时看不到自动更新？

自动更新仅在生产环境启用；开发环境默认关闭。

## 可以使用哪些 AI Provider？

支持 OpenAI-compatible、DeepSeek、Anthropic、Gemini，以及通过 OpenAI-compatible 接入的 Ollama/GLM。

## Tag 面板为什么内容不完整？

当前为示例数据实现（mock），不是完整标签索引系统。

## 支持哪些文件类型？

- 文本编辑：`md` `markdown` `txt` `iwt` 及常见代码文件
- 图片查看：`jpg` `jpeg` `png` `gif` `bmp` `svg` `webp` `ico`
- PDF 查看：`pdf`
