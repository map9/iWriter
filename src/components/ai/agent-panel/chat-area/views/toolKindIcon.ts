import type { Component } from 'vue'
import {
  IconEye,
  IconSearch,
  IconPencil,
  IconTrash,
  IconTerminal2,
  IconUsers,
  IconTool,
} from '@tabler/icons-vue'
import type { AiToolCallKind } from '@/ai/types'

export function kindToIcon(kind: AiToolCallKind): Component {
  switch (kind) {
    case 'read': return IconEye
    case 'search': return IconSearch
    case 'edit': return IconPencil
    case 'delete': return IconTrash
    case 'execute': return IconTerminal2
    case 'delegate': return IconUsers
    case 'other':
    default: return IconTool
  }
}
