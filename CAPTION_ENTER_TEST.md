# Caption回车退出功能测试

这是一个测试文档，用于验证Caption节点的回车退出功能。

## 测试步骤

1. 在编辑器中插入一个带标题的图片
2. 点击图片标题进入编辑模式
3. 在标题中输入一些文本
4. 按回车键
5. 验证光标是否跳出标题，到达下一个段落

## 期望行为

- 在Caption中按回车键应该：
  - 退出Caption编辑模式
  - 在包含该Caption的MediaWithCaption容器后创建新段落
  - 将光标移动到新段落的开始位置
  - 不应该在Caption内部创建新行

## 功能特性

### 新增的Caption功能：

1. **isolating: true** - 隔离节点，提高编辑行为控制
2. **exitCaption命令** - 专门处理退出Caption的逻辑
3. **isInCaption命令** - 检查当前是否在Caption中
4. **Enter键快捷键** - 绑定回车键到exitCaption命令

### 实现逻辑：

1. 检测当前光标是否在Caption节点中
2. 向上查找包含Caption的MediaWithCaption容器
3. 在容器结束位置插入新的段落节点
4. 将光标移动到新段落的开始位置

### 兼容性：

- 向后兼容现有的ImageWithCaption功能
- 支持所有媒体类型的标题（Image, Video, Audio, Table, YouTube）
- 不影响其他编辑器功能

## 测试结果

- [ ] Caption编辑正常
- [ ] 回车键能正确退出Caption
- [ ] 光标跳转到正确位置
- [ ] 不影响其他编辑功能

---

*测试完成后请删除此文件*