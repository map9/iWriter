import { VueNodeViewRenderer } from '@tiptap/vue-3'
import { iwAlertBlockquote } from './iwAlertBlockquote'
import iwAlertBlockquoteView from './iwAlertBlockquoteView.vue'

export const iwAlertBlockquoteWithView = iwAlertBlockquote.extend({
  addNodeView() {
    return VueNodeViewRenderer(iwAlertBlockquoteView)
  },
})
