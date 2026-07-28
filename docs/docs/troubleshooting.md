# 故障排查

> 适用版本：iWriter `0.1.25`
>
> 最后更新：2026-07-28

## 无法打开工作区

- 确认目录权限可读写。
- 确认目录未被系统安全策略拦截。
- Windows 工作区包含联接点、符号链接或其他 NTFS 重解析点时，iWriter 会跳过无法读取的系统对象；如果仍反复报错，可以先缩小打开目录，或在 `.iwtignore` 中排除对应路径。

## 跨文件搜索无结果

- 检查是否选中了正确工作区。
- 检查正则、大小写、全词选项是否设置过严。

## AI 请求失败

- 检查 Provider、API Key、Base URL、模型名。
- 检查网络与代理连通性。
- 如果提示超过自动摘要阈值或单次请求硬上限，减少附件与当前输入，或开启新会话；上下文圆环只显示进度，不能手动触发摘要。

## Git 文档版本管理不可用

- 确认系统已安装 Git，并能在终端执行 `git --version`。
- 在“文档版本管理”面板点击“重新检测”。
- HTTPS 认证失败时检查系统 Git credential helper；SSH 认证失败时检查 ssh-agent 与密钥权限。
- 出现 `index.lock` 时先确认没有其他 Git 客户端正在写仓库，再刷新面板。
- Pull / Sync 后出现冲突时，从 Merge Changes 打开合并标签页处理，不要直接删除冲突标记文件。

## 图片 / PDF / Office 无法显示

- 检查文件是否损坏。
- 检查是否属于支持格式。
- Office 文件预览需要安装 LibreOffice；未安装时可按预览页提示安装，或在偏好设置中手动指定 LibreOffice 路径。
- Windows 上如果已安装 LibreOffice 但仍提示不可用，尝试在偏好设置的“导出”分组中指定 `C:\Program Files\LibreOffice\program\soffice.exe` 或对应 `program` 目录，而不是只填写 `soffice`。
- 如果 Office 转换失败，可先用系统应用打开原文件，确认文件本身是否能被 LibreOffice 或办公套件正常读取。

## 更新失败

- 确认在生产环境中运行。
- 确认能访问 GitHub Releases。
- 必要时走手动下载安装覆盖。
