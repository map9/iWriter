import TurndownService from 'turndown'
import { gfm } from '@guyplusplus/turndown-plugin-gfm'
import { configureAlertTurndown } from '@/utils/markdownAlerts'

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  br: '<br>',
})

turndownService.use(gfm)
configureAlertTurndown(turndownService)
turndownService.addRule('inlineMath', {
  filter: (node) =>
    node.nodeName === 'SPAN' && (node as HTMLElement).getAttribute('data-type') === 'inline-math',
  replacement: (_content, node) => {
    const latex = (node as HTMLElement).getAttribute('data-latex') ?? ''
    return `$${latex}$`
  },
})
turndownService.addRule('blockMath', {
  filter: (node) =>
    node.nodeName === 'DIV' && (node as HTMLElement).getAttribute('data-type') === 'block-math',
  replacement: (_content, node) => {
    const latex = (node as HTMLElement).getAttribute('data-latex') ?? ''
    return `\n\n$$\n${latex}\n$$\n\n`
  },
})

export function htmlToMarkdown(html: string): string {
  return turndownService.turndown(html)
}
