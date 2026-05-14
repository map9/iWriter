// Shared regex and HTML serializers for math delimiters

export const INLINE_PAREN_INPUT_REGEX = /\\\(([^\n]+?)\\\)/
export const BLOCK_BRACKET_INPUT_REGEX = /^\\\[(.+)\\\]$/

// Global variants for paste rules (must match all occurrences in pasted text)
export const INLINE_PAREN_PASTE_REGEX = /\\\(([^\n]+?)\\\)/g
export const BLOCK_BRACKET_PASTE_REGEX = /\\\[([\s\S]+?)\\\]/g

function escapeHtmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function renderInlineMathHtml(latex: string): string {
  return `<span data-type="inline-math" data-latex="${escapeHtmlAttr(latex)}"></span>`
}

export function renderBlockMathHtml(latex: string): string {
  return `<div data-type="block-math" data-latex="${escapeHtmlAttr(latex)}"></div>`
}
