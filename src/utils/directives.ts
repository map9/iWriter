import type { DirectiveBinding } from 'vue'

interface ClickOutsideEl extends HTMLElement {
  _clickOutside?: (e: Event) => void
}

export const vClickOutside = {
  mounted(el: ClickOutsideEl, binding: DirectiveBinding) {
    el._clickOutside = (e: Event) => {
      if (!el.contains(e.target as Node)) binding.value(e)
    }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el: ClickOutsideEl) {
    if (el._clickOutside) document.removeEventListener('click', el._clickOutside)
  },
}
