import { VueRenderer, type Editor as VueEditor } from '@tiptap/vue-3'
import type { SuggestionOptions } from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import { i18n } from '@/i18n'
import { slashCommands, type SlashCommandItem } from './commands'
import SlashCommandList from './SlashCommandList.vue'
import { onEditorMenuAction } from '@/components/pages/markdown-editor/menu-action'

const slashCommandPluginKey = new PluginKey('iwSlashCommand')

/** 弹层宽度（与 SlashCommandList.vue 的 w-64 一致，256px） */
const MENU_WIDTH = 256
/** 弹层最大高度（max-h-72，288px） */
const MENU_MAX_HEIGHT = 288

function positionMenu(el: HTMLElement, getRect: (() => DOMRect | null) | null | undefined) {
  if (!getRect) return
  const rect = getRect()
  if (!rect) return

  const vw = window.innerWidth
  const vh = window.innerHeight

  // 水平：跟随光标左侧，夹在视口内
  const left = Math.max(8, Math.min(rect.left, vw - MENU_WIDTH - 8))

  // 垂直：默认在光标下方，若下方空间不足则翻到上方
  const spaceBelow = vh - rect.bottom - 4
  let top: number
  if (spaceBelow >= MENU_MAX_HEIGHT || spaceBelow >= 120) {
    // 下方放得下，或至少能显示几行，紧贴光标下方
    top = rect.bottom + 4
  } else {
    // 翻到光标上方
    top = rect.top - Math.min(MENU_MAX_HEIGHT, vh - 16) - 4
    top = Math.max(8, top)
  }

  el.style.left = `${Math.round(left)}px`
  el.style.top = `${Math.round(top)}px`
}

export function createSlashCommandSuggestion(): Partial<SuggestionOptions<SlashCommandItem, SlashCommandItem>> {
  let component: VueRenderer | null = null
  let containerEl: HTMLElement | null = null

  return {
    pluginKey: slashCommandPluginKey,
    char: '/',
    startOfLine: true,
    allowSpaces: false,

    allow({ editor, state }) {
      if (!editor.isEditable) return false
      const { $from } = state.selection
      const parent = $from.parent
      // 不在代码块、数学块或行内代码内触发
      if (parent.type.name === 'codeBlock') return false
      if (parent.type.name === 'mathBlock') return false
      if (state.schema.marks.code && $from.marks().some(m => m.type === state.schema.marks.code)) return false
      return true
    },

    items({ query }) {
      const q = query.toLowerCase().trim()
      if (q === '') return slashCommands

      return slashCommands.filter(item => {
        const label = i18n.global.t(item.labelKey).toLowerCase()
        const desc = i18n.global.t(item.descKey).toLowerCase()
        if (label.includes(q) || desc.includes(q)) return true
        return item.keywords.some(kw => kw.toLowerCase().includes(q))
      })
    },

    command({ editor, range, props: item }) {
      // 删除已输入的 /query 文本，再执行插入命令
      editor.chain().focus().deleteRange(range).run()
      // SuggestionOptions 中 editor 类型为 @tiptap/core.Editor，
      // onEditorMenuAction 接收 @tiptap/vue-3.Editor，运行时同一实例，强转安全。
      onEditorMenuAction(editor as unknown as VueEditor, item.action)
    },

    render() {
      return {
        onStart(props) {
          containerEl = document.createElement('div')
          document.body.appendChild(containerEl)

          component = new VueRenderer(SlashCommandList, {
            props: {
              items: props.items,
              command: props.command,
            },
            // SuggestionProps.editor 是 @tiptap/core.Editor；VueRenderer 需要
            // @tiptap/vue-3.Editor，两者运行时完全兼容，仅类型定义不同。
            editor: props.editor as unknown as VueEditor,
          })

          if (component.element) {
            containerEl.appendChild(component.element)
          }
          positionMenu(component.element as HTMLElement, props.clientRect)
        },

        onUpdate(props) {
          if (!component) return
          component.updateProps({
            items: props.items,
            command: props.command,
          })
          positionMenu(component.element as HTMLElement, props.clientRect)
        },

        onKeyDown(props) {
          if (props.event.key === 'Escape') {
            return false
          }
          return (component?.ref as InstanceType<typeof SlashCommandList> | null)?.onKeyDown(props) ?? false
        },

        onExit() {
          component?.destroy()
          component = null
          containerEl?.remove()
          containerEl = null
        },
      }
    },
  }
}
