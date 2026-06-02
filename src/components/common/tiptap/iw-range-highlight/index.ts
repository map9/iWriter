import './style.scss'

export { iwRangeHighlightExtension, setRangeHighlights, removeRangeHighlights } from './iwRangeHighlightExtension'
export type { EditorRangeHighlight, RangeHighlightInput, RangeHighlightStorage, RangeHighlightVariant } from './iwRangeHighlightExtension'
export { default as BlockHighlightLayer } from './BlockHighlightLayer.vue'
export { default as InlineHighlightLayer } from './InlineHighlightLayer.vue'
export type { InsetBox } from './useHighlightOverlays'
