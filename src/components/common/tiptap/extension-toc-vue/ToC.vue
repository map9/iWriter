<template>
  <template v-if="items.length === 0">
    <ToCEmptyState />
  </template>
  <template v-else>
    <ToCItem v-for="(item, i) in items" :key="item.id" :item="item" :index="i + 1" @item-click="onItemClick" />
  </template>
</template>

<script setup lang="ts">
import { TextSelection } from '@tiptap/pm/state'
import type { Editor } from '@tiptap/vue-3'

import ToCEmptyState from './ToCEmptyState.vue'
import ToCItem from './ToCItem.vue'

interface Props {
  items: any[]
  editor: Editor
}

const props = withDefaults(defineProps<Props>(), {
  items: () => [],
})

function onItemClick(e: Event, id: string) {
  if (props.editor) {
    const element = props.editor.view.dom.querySelector(`[data-toc-id="${id}"]`)
    if (!element) return
    
    const pos = props.editor.view.posAtDOM(element, 0)

    // set focus
    const tr = props.editor.view.state.tr

    tr.setSelection(new TextSelection(tr.doc.resolve(pos)))

    props.editor.view.dispatch(tr)

    props.editor.view.focus()

    if (history.pushState) {
      history.pushState(null, null as any, `#${id}`)
    }

    window.scrollTo({
      top: element.getBoundingClientRect().top + window.scrollY,
      behavior: 'smooth',
    })
  }
}
</script>