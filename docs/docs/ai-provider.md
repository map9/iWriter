# AI Provider 配置

> 适用版本：iWriter `0.1.5`
>
> 最后更新：2026-04-22

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

## 配置建议

1. 先使用官方示例模型验证连通性。
2. 再按成本、速度、效果切换模型。
3. 对生产环境单独配置专用 API Key。

## 常见问题

- 401/403：多为 API Key 无效或权限不足。
- 超时：检查网络、代理和 Base URL。
- 模型不可用：确认该 Provider 下模型名称是否正确。