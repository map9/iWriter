# AI Provider 配置

> 适用版本：iWriter `0.1.6`
>
> 最后更新：2026-04-29

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
- 部分 Provider 支持模型列表或能力配置

## 当前内置预设说明

- `OpenAI-compatible`：适合接入兼容 OpenAI Chat 接口的服务
- `DeepSeek`：当前代码已处理 `reasoning_content` 兼容问题，适合带推理输出的模型
- `Anthropic`：适合 Claude 系列模型
- `Gemini`：适合 Google Gemini 系列模型
- `Ollama`：面向本地模型，模型列表会从本地 Ollama 服务自动读取
- `GLM`：面向智谱 AI GLM 系列

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
