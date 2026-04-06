<template>
  <div class="flex flex-wrap gap-1.5 px-3 py-2 border-t border-border-separator">
    <button
      v-for="action in actions"
      :key="action.id"
      @click="triggerAction(action)"
      :disabled="disabled"
      class="px-2 py-1 text-xs rounded-full border border-border-separator bg-background-content text-text-secondary hover:bg-accent-primary/10 hover:border-accent-primary/50 hover:text-accent-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      :title="action.description"
    >
      {{ action.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { useAiStore } from '@/ai/store/ai'
import { useAppStore } from '@/stores/app'
import type { Editor } from '@tiptap/core'

defineProps<{ disabled?: boolean }>()

const aiStore = useAiStore()
const appStore = useAppStore()

interface QuickAction {
  id: string
  label: string
  description: string
  buildPrompt: (selectedText: string, docText: string) => string
}

const actions: QuickAction[] = [
  {
    id: 'expand',
    label: '扩充',
    description: '扩充选中的内容，增加细节和深度',
    buildPrompt: (sel, _doc) =>
      sel
        ? `请扩充以下内容，增加细节、例证或深度，保持原有风格：\n\n${sel}`
        : `请对当前文档进行扩充，增加细节、例证或深度`,
  },
  {
    id: 'condense',
    label: '缩减',
    description: '精简选中的内容，保留核心意思',
    buildPrompt: (sel, _doc) =>
      sel
        ? `请精简以下内容，保留核心意思，删除冗余：\n\n${sel}`
        : `请精简当前文档，保留核心意思，删除冗余内容`,
  },
  {
    id: 'continue',
    label: '续写',
    description: '从当前内容继续写下去',
    buildPrompt: (_sel, doc) => {
      const tail = doc.slice(-500)
      return `请根据以下内容的风格和主题，自然地续写下去：\n\n...${tail}`
    },
  },
  {
    id: 'grammar',
    label: '语法检查',
    description: '检查并修正语法和拼写错误',
    buildPrompt: (sel, _doc) =>
      sel
        ? `请检查以下内容的语法、拼写和标点，修正所有错误，保持原意不变：\n\n${sel}`
        : `请检查当前文档的语法、拼写和标点，修正所有错误，保持原意不变`,
  },
  {
    id: 'style',
    label: '风格转换',
    description: '转换文字风格（正式/通俗/学术等）',
    buildPrompt: (sel, _doc) =>
      sel
        ? `请将以下内容转换为更正式、专业的风格：\n\n${sel}`
        : `请将当前文档转换为更正式、专业的风格`,
  },
  {
    id: 'summarize',
    label: '摘要',
    description: '生成文档摘要',
    buildPrompt: (_sel, doc) =>
      `请为以下内容生成一段简洁的摘要（100字以内）：\n\n${doc.slice(0, 3000)}`,
  },
]

function triggerAction(action: QuickAction) {
  const editor = appStore.activeTab?.editorInstance as Editor | undefined
  const selectedText = editor
    ? (() => {
        const { from, to } = editor.state.selection
        return from !== to ? editor.state.doc.textBetween(from, to) : ''
      })()
    : ''
  const docText = editor?.getText() ?? ''

  const prompt = action.buildPrompt(selectedText, docText)
  aiStore.sendMessage(prompt)
}
</script>
