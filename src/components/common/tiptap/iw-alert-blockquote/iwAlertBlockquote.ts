import { mergeAttributes, wrappingInputRule } from '@tiptap/core'
import Blockquote from '@tiptap/extension-blockquote'
import {
  alertTypeToClass,
  normalizeAlertType,
  parseAlertMarker,
} from '@/utils/markdownAlerts'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    iwAlertBlockquote: {
      setAlertType: (type: string) => ReturnType
      unsetAlertType: () => ReturnType
      toggleAlert: (type: string) => ReturnType
      insertAlert: (type: string) => ReturnType
    }
  }
}

function alertHtmlAttributes(alertType: unknown): Record<string, string> {
  const normalized = normalizeAlertType(String(alertType ?? ''))
  if (!normalized) return {}

  return {
    'data-alert-type': normalized,
    class: `markdown-alert ${alertTypeToClass(normalized)}`,
  }
}

export const iwAlertBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alertType: {
        default: null,
        parseHTML: element => {
          const parentBlockquote = element.parentElement?.closest('blockquote')
          if (parentBlockquote) return null
          return normalizeAlertType(element.getAttribute('data-alert-type'))
        },
        renderHTML: attributes => alertHtmlAttributes(attributes.alertType),
      },
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ['blockquote', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setAlertType: type => ({ commands, editor }) => {
        const alertType = normalizeAlertType(type)
        if (!alertType) return false

        if (editor.isActive(this.name)) {
          return commands.updateAttributes(this.name, { alertType })
        }

        return commands.wrapIn(this.name, { alertType })
      },
      unsetAlertType: () => ({ commands, editor }) => {
        if (!editor.isActive(this.name)) return false
        return commands.updateAttributes(this.name, { alertType: null })
      },
      toggleAlert: type => ({ commands, editor }) => {
        const alertType = normalizeAlertType(type)
        if (!alertType) return false

        if (editor.isActive(this.name, { alertType })) {
          return commands.updateAttributes(this.name, { alertType: null })
        }

        if (editor.isActive(this.name)) {
          return commands.updateAttributes(this.name, { alertType })
        }

        return commands.wrapIn(this.name, { alertType })
      },
      insertAlert: type => ({ commands }) => {
        const alertType = normalizeAlertType(type)
        if (!alertType) return false

        return commands.insertContent({
          type: this.name,
          attrs: { alertType },
          content: [{ type: 'paragraph' }],
        })
      },
    }
  },

  addInputRules() {
    return [
      ...(this.parent?.() ?? []),
      wrappingInputRule({
        find: /^\s*>\s+\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|BEAT|COMMENT)\]\s$/i,
        type: this.type,
        getAttributes: match => ({ alertType: normalizeAlertType(match[1]) }),
      }),
    ]
  },
})

export { parseAlertMarker }
