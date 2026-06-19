import { nextTick } from 'vue'
import type { Editor } from '@tiptap/core'
import type { FileTab } from '@/types/file-tab'

/**
 * 等待编辑器实例就绪
 * 文件打开后，编辑器实例需要时间完成初始化和内容加载
 *
 * 检查条件：
 * 1. tab 存在且有 editorInstance
 * 2. editor.state 和 editor.view 已初始化
 * 3. 文档内容已加载（doc.content.size > 2，空文档的 size 为 2）
 *
 * @param getTab 返回目标 tab 的函数（每次轮询都重新读取，以获取最新的 reactive 状态）
 * @param maxAttempts 最大尝试次数（默认 40 次，共 2 秒）
 * @returns Editor 实例或 null
 */
export async function waitForEditorReady(
  getTab: () => FileTab | undefined,
  maxAttempts: number = 40,
): Promise<Editor | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await nextTick()

    const tab = getTab()
    if (tab?.editorInstance) {
      const editor = tab.editorInstance as Editor

      // 确保编辑器已完全初始化
      if (editor.state && editor.view && editor.view.dom) {
        // 关键检查：文档内容已加载
        // 空文档的 size 为 2（开始和结束标记）
        // 有内容的文档 size > 2
        if (editor.state.doc.content.size > 2) {
          return editor
        }
      }
    }

    // 等待 50ms 后重试
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  return null
}
