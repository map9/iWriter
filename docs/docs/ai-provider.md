# AI Provider 配置

> 适用版本：iWriter `0.1.24`
>
> 最后更新：2026-07-27

## 支持的 Provider 预设

- OpenAI-compatible
- DeepSeek
- Anthropic
- Gemini
- Ollama（通过 OpenAI-compatible 接入）
- GLM（通过 OpenAI-compatible 接入）

## 基本配置项

- API Key
- Base URL
- Model
- 备用模型
- 模型能力配置
- 部分 Provider 支持模型列表或能力配置

AI 设置页左侧分为 **Providers** 与 **Web Search** 两组。Providers 用于管理模型接口，Web Search 用于管理 AI 工具调用时使用的搜索服务。

## 当前内置预设说明

- `OpenAI-compatible`：适合接入兼容 OpenAI Chat 接口的服务
- `DeepSeek`：当前代码已处理 `reasoning_content` 兼容问题，适合带推理输出的模型
- `Anthropic`：适合 Claude 系列模型
- `Gemini`：适合 Google Gemini 系列模型
- `Ollama`：面向本地模型，模型列表会从本地 Ollama 服务自动读取
- `GLM`：面向智谱 AI GLM 系列

## 模型能力与备用模型

对于自定义 Provider，可以用 JSON 配置每个模型的能力，例如最大输入 / 输出 token、是否支持 reasoning 输出、工具调用、工具选择和结构化输出。配置后，模型选择器和 AI 运行时会按能力决定可用模式与回退策略。

备用模型是可选项。当主模型调用失败且备用模型可用时，iWriter 会尝试切换到备用模型继续任务，并在界面中提示。

当前版本不再暴露 Temperature、Top P、Frequency Penalty 和 Presence Penalty 等采样参数。不同 Provider 与推理模型对这些参数的支持差异较大，iWriter 让模型接口使用自身默认策略。

模型提供上下文 profile 时，AI 面板会显示基于该 profile 的自动摘要阈值和模型上限；自定义模型没有 profile 时使用 DeepAgents 的默认 token 阈值。该圆环是只读状态，不是手动压缩按钮。

## Web Search 配置

Web Search 支持以下预设：

- Bocha
- Exa
- Serper
- Tavily

每个搜索服务需要单独填写 API Key，可按需覆盖 Base URL。AI 的 `web_search` 工具会使用当前可用的搜索配置返回标题、链接和摘要；Bocha 与 Tavily 等服务还可能返回可直接嵌入文档的图片链接。

## 配置建议

1. 先使用官方示例模型验证连通性。
2. 再按成本、速度、效果切换模型。
3. 对生产环境单独配置专用 API Key。
4. 若使用自建网关或代理，优先确认 `Base URL` 与模型名格式完全匹配。

## 常见问题

- 401/403：多为 API Key 无效或权限不足。
- 超时：检查网络、代理和 Base URL。
- 模型不可用：确认该 Provider 下模型名称是否正确。
- Ollama 无模型列表：确认本地 Ollama 服务已启动且接口可访问。
- Web Search 不可用：确认至少一个搜索服务已填写 API Key，并在 AI 设置中保持可用。
