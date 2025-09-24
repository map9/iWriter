import { InputRule } from '@tiptap/core'
import type { InputRuleFinder } from '@tiptap/core'

/**
 * Enhanced InputRule with enable/disable functionality
 * 支持启用/禁用功能的增强 InputRule
 */
export class iwTextInputRule extends InputRule {
  public enable: boolean = true
  public name: string
  private replaceText: string

  constructor(config: {
    find: InputRuleFinder
    replace: string
    name: string
    enable?: boolean
  }) {
    super({
      find: config.find,
      handler: ({ state, range, match }) => {
        // 检查是否启用
        if (!this.enable) {
          return
        }

        // 执行文本替换逻辑（基于原 textInputRule 实现）
        let insert = this.replaceText
        let start = range.from
        const end = range.to

        if (match[1]) {
          const offset = match[0].lastIndexOf(match[1])
          insert += match[0].slice(offset + match[1].length)
          start += offset

          const cutOff = start - end

          if (cutOff > 0) {
            insert = match[0].slice(offset - cutOff, offset) + insert
            start = end
          }
        }

        state.tr.insertText(insert, start, end)
      },
    })

    this.enable = config.enable ?? true
    this.name = config.name
    this.replaceText = config.replace
  }

  /**
   * 设置规则的启用状态
   */
  setEnable(value: boolean): void {
    this.enable = value
  }

  /**
   * 获取规则的启用状态
   */
  getEnable(): boolean {
    return this.enable
  }

  /**
   * 切换规则的启用状态
   */
  toggle(): void {
    this.enable = !this.enable
  }
}

/**
 * 创建支持启用/禁用的文本输入规则的工厂函数
 * Factory function to create enableable text input rule
 */
export function createIwTextInputRule(config: {
  find: InputRuleFinder
  replace: string
  name: string
  enable?: boolean
}): iwTextInputRule {
  return new iwTextInputRule(config)
}