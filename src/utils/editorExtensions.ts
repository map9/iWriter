/**
 * TipTap Editor Extensions 统一配置
 * 用于 MarkdownEditor 和 iwSearchReplaceInFilesService
 */

import { VueNodeViewRenderer } from '@tiptap/vue-3'
import type { EditSetting } from '@/types'
import { getHierarchicalIndexes, TableOfContents } from '@tiptap/extension-table-of-contents'
import { UndoRedo, Dropcursor, Gapcursor, TrailingNode, Focus, Selection } from '@tiptap/extensions'

import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import Emoji, { gitHubEmojis } from '@tiptap/extension-emoji'
import HorizontalRule from '@tiptap/extension-horizontal-rule'

import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Youtube from '@tiptap/extension-youtube'
import FileHandler from '@tiptap/extension-file-handler'

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import css from 'highlight.js/lib/languages/css'
import js from 'highlight.js/lib/languages/javascript'
import ts from 'highlight.js/lib/languages/typescript'
import html from 'highlight.js/lib/languages/xml'
import { all, common, createLowlight } from 'lowlight'

import { InlineMath, BlockMath } from '@tiptap/extension-mathematics'
import { InputRule, mergeAttributes } from '@tiptap/core'
import { nodePasteRule } from '@tiptap/core'
import {
  INLINE_PAREN_INPUT_REGEX, BLOCK_BRACKET_INPUT_REGEX,
  INLINE_PAREN_PASTE_REGEX, BLOCK_BRACKET_PASTE_REGEX,
} from '@/utils/mathDelimiters'

import { ListItem, BulletList, OrderedList, ListKeymap, TaskItem, TaskList } from '@tiptap/extension-list'

import Bold from '@tiptap/extension-bold'
import Italic from '@tiptap/extension-italic'
import Strike from '@tiptap/extension-strike'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Code from '@tiptap/extension-code'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TextStyleKit } from '@tiptap/extension-text-style'

import InvisibleCharacters, { SpaceCharacter, ParagraphNode, HardBreakNode } from '@tiptap/extension-invisible-characters'
import UniqueID from '@tiptap/extension-unique-id'
import { nanoid } from 'nanoid'
import { Plugin, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

// 自定义扩展
import {
  iwAlertBlockquote,
  iwAlertBlockquoteWithView,
  iwTypography,
  iwPopupTools,
  iwLinkPopupTool,
  iwMathPopupTool,
  iwSlashCommand,
} from '@/components/common/tiptap'
import { iwProofreadExtension } from '@/components/common/tiptap/iw-proofread'
import { iwSearchReplaceExtension } from '@/components/common/tiptap/iw-search-replace'
import { iwRangeHighlightExtension } from '@/components/common/tiptap/iw-range-highlight'
import { extractBestImageUrl, isPlaceholderSvgImageUrl, normalizePastedImageHtml } from '@/components/common/tiptap/utils'

// Custom node views (仅用于 MarkdownEditor，搜索服务不需要)
import { iwTableView, iwImageView, iwCodeBlockView, iwMathBlockView } from '@/components/common/tiptap'

// Lowlight 实例
const lowlight = createLowlight(common)

function isMermaidCodeBlock(node: ProseMirrorNode): boolean {
  return node.type.name === 'codeBlock' && node.attrs.language === 'mermaid'
}

const ARROW_DIRECTIONS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

/**
 * Mermaid 代码块的方向键导航：
 * - 非编辑态：方向键移入/移出 mermaid 块时，将其作为整体节点选中（类似公式块的 atom 行为），
 *   而不是进入隐藏的源码文本
 * - 编辑态：方向键到达源码边界时不允许移出该块，必须先结束编辑
 */
function mermaidArrowNavigationPlugin() {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        const dir = ARROW_DIRECTIONS[event.key]
        if (!dir || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false

        const { state } = view
        const { selection } = state
        if (!(selection instanceof TextSelection) || !selection.empty) return false
        if (!view.endOfTextblock(dir)) return false

        const $pos = selection.$head
        const parent = $pos.parent

        if (isMermaidCodeBlock(parent)) {
          // 编辑态下禁止用方向键移出该块，必须先结束编辑
          if (parent.attrs.mermaidEditing) return true
          // 非编辑态下意外停留在隐藏源码中：转为整体选中该节点
          const blockPos = $pos.before($pos.depth)
          view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, blockPos)))
          return true
        }

        // 从外部移动到相邻的 mermaid 块：整体选中而不是进入隐藏源码
        // 注意：$pos 此时落在 textblock（如 <p>）内部，$pos.nodeBefore/nodeAfter 只能取到
        // 行内兄弟节点，无法看到块级兄弟 codeBlock。需先用 before/after 跳到段落边界，
        // 再在该位置解析块级 nodeBefore/nodeAfter。
        const side = dir === 'left' || dir === 'up' ? -1 : 1
        const $blockEdge = state.doc.resolve(
          side < 0 ? $pos.before($pos.depth) : $pos.after($pos.depth)
        )
        const targetNode = side < 0 ? $blockEdge.nodeBefore : $blockEdge.nodeAfter
        if (targetNode && isMermaidCodeBlock(targetNode) && !targetNode.attrs.mermaidEditing) {
          const nodePos = side < 0 ? $blockEdge.pos - targetNode.nodeSize : $blockEdge.pos
          view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, nodePos)).scrollIntoView())
          return true
        }

        return false
      },
    },
  })
}

/**
 * 包装 InvisibleCharacters builder，使其跳过所有 codeBlock 节点内部的区间。
 * 空代码块中，InvisibleCharacters 会在 contentDOM (<code>) 首位插入
 * contenteditable="false" 的 widget，导致 Chromium 将光标逃逸到父 <pre>，
 * 输入文字落在 contentDOM 之外，PM 模型感知不到变化。
 * 代码块本身也不需要显示段落符/空格符。
 *
 * 两层保护：
 * 1. 主动清除：找并移除已落在 codeBlock 范围内的旧残留装饰（toggleCodeBlock 转换时，
 *    旧段落的 --paragraph widget 会通过 decorations.map() 原地保留，需手动清除）
 * 2. 阻止新增：对 codeBlock 内的区间不调用 orig，避免重新生成时再加进去
 */
function excludeCodeBlock<T extends { type: string; createDecoration: (from: number, to: number, doc: ProseMirrorNode, decorations: DecorationSet) => DecorationSet }>(builder: T): T {
  const orig = builder.createDecoration.bind(builder)
  const builderType = builder.type
  builder.createDecoration = (from: number, to: number, doc: ProseMirrorNode, decorations: DecorationSet): DecorationSet => {
    let result: DecorationSet = decorations
    let cursor = from
    doc.nodesBetween(from, to, (node: ProseMirrorNode, pos: number) => {
      if (node.type.name === 'codeBlock') {
        // 1. 清除 codeBlock 内部残留的本类型旧装饰
        const stale = result.find(pos + 1, pos + node.nodeSize - 1, (spec) => spec.key === builderType)
        if (stale.length > 0) result = result.remove(stale)
        // 2. 仅对 codeBlock 之前的范围调用 orig，跳过 codeBlock 内部
        if (cursor < pos) result = orig(cursor, pos, doc, result)
        cursor = pos + node.nodeSize
        return false
      }
      return true
    })
    if (cursor < to) result = orig(cursor, to, doc, result)
    return result
  }
  return builder
}

/**
 * 基础 Extensions 配置（用于搜索服务）
 * 不包含 Vue NodeView 和文件路径相关逻辑
 */
export function createBaseExtensions() {
  return [
    // 基础节点
    Document, Heading, Paragraph, Text, HardBreak,
    Emoji.configure({
      emojis: gitHubEmojis,
      enableEmoticons: true,
    }),
    HorizontalRule,

    TableCell, TableHeader, TableRow, Table,

    Image.configure({
      allowBase64: true
    }),

    Youtube.configure({
      controls: false,
      nocookie: true
    }),

    // 块级元素
    iwAlertBlockquote,
    CodeBlockLowlight.configure({ lowlight }),

    // 数学公式
    InlineMath.extend({
      renderHTML({ node, HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math' }), String(node.attrs['latex'] ?? '')]
      },
      addInputRules() {
        return [
          ...(this.parent?.() ?? []),
          new InputRule({
            find: INLINE_PAREN_INPUT_REGEX,
            handler: ({ state, range, match }) => {
              const latex = match[1]
              const { tr } = state
              tr.replaceWith(range.from, range.to, this.type.create({ latex }))
            },
          }),
        ]
      },
      addPasteRules() {
        return [
          nodePasteRule({
            find: INLINE_PAREN_PASTE_REGEX,
            type: this.type,
            getAttributes: (match) => ({ latex: match[1] ?? '' }),
          }),
        ]
      },
    }).configure({
      onClick: undefined,
      katexOptions: {
        throwOnError: false,
        macros: {
          '\\R': '\\mathbb{R}',
          '\\N': '\\mathbb{N}',
        },
      },
    }),
    BlockMath.extend({
      renderHTML({ node, HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'block-math' }), String(node.attrs['latex'] ?? '')]
      },
      addInputRules() {
        return [
          ...(this.parent?.() ?? []),
          new InputRule({
            find: BLOCK_BRACKET_INPUT_REGEX,
            handler: ({ state, range, match }) => {
              const latex = match[1]
              const { tr } = state
              tr.replaceWith(range.from, range.to, this.type.create({ latex }))
            },
          }),
        ]
      },
      addPasteRules() {
        return [
          nodePasteRule({
            find: BLOCK_BRACKET_PASTE_REGEX,
            type: this.type,
            getAttributes: (match) => ({ latex: match[1] ?? '' }),
          }),
        ]
      },
    }).configure({
      katexOptions: {
        throwOnError: false,
        macros: {
          '\\R': '\\mathbb{R}',
          '\\N': '\\mathbb{N}',
        },
      },
    }),

    // 列表
    BulletList, OrderedList, ListItem, ListKeymap,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),

    // 文本格式化
    Bold, Italic, Strike, Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph', 'image'],
    }),
    Code,

    // 链接
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow'
      }
    }),

    Subscript, Superscript, iwTypography, Highlight,
    //TextStyleKit,
  ]
}

/**
 * 完整 Extensions 配置（用于 MarkdownEditor）
 * 包含 Vue NodeView 和文件路径相关逻辑
 *
 * @param options - 配置选项
 * @param options.tocUpdateCallback - TOC 更新回调
 * @param options.filePathResolver - 文件路径解析器（用于图片相对路径转换）
 * @param options.onFileHandlerDrop - 文件拖放处理器
 * @param options.onFileHandlerPaste - 文件粘贴处理器
 */
export function createMarkdownEditorExtensions(options: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tocUpdateCallback?: (content: any) => void
  filePathResolver?: (src: string) => string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onFileHandlerDrop?: (currentEditor: any, files: File[], pos: number) => void | boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onFileHandlerPaste?: (currentEditor: any, files: File[], pasteContent?: string) => void | boolean
  editSetting?: EditSetting
  onLinkOpen?: (url: string) => void | Promise<void>
}) {
  const {
    tocUpdateCallback,
    filePathResolver,
    onFileHandlerDrop,
    onFileHandlerPaste,
    editSetting,
    onLinkOpen,
  } = options

  // 完整语言支持（编辑器用）
  const lowlight = createLowlight(all)
  lowlight.register('html', html)
  lowlight.register('css', css)
  lowlight.register('js', js)
  lowlight.register('ts', ts)

  return [
    // Table of Contents（带 onUpdate 回调）
    TableOfContents.configure({
      getIndex: getHierarchicalIndexes,
      onUpdate: tocUpdateCallback,
    }),

    // 编辑器核心功能
    UndoRedo, Dropcursor, Gapcursor, TrailingNode,
    Focus.configure({
      mode: 'deepest',
    }),
    Selection.configure({
      className: 'iw-editor-blur-selection',
    }),

    // 基础节点
    Document, Heading, Paragraph, Text, HardBreak,
    Emoji.configure({
      emojis: gitHubEmojis,
      enableEmoticons: true,
    }),
    HorizontalRule,

    // 表格（带 Vue NodeView）
    TableCell, TableHeader, TableRow,
    Table.configure({
      resizable: true
    }).extend({
      addNodeView() {
        return VueNodeViewRenderer(iwTableView)
      }
    }),

    // 图片（完整配置）
    Image.configure({
      allowBase64: true
    }).extend({
      transformPastedHTML(html) {
        return normalizePastedImageHtml(html)
      },
      parseHTML() {
        return [
          {
            tag: 'img[src]',
            getAttrs: element => {
              if (!(element instanceof HTMLElement)) return {}

              const src = element.getAttribute('src')
              if (src && isPlaceholderSvgImageUrl(src) && !extractBestImageUrl(element)) {
                return false
              }

              return {}
            },
          },
        ]
      },
      addAttributes() {
        return {
          src: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const rawSrc = element.getAttribute('src')
              let src = extractBestImageUrl(element) ?? (rawSrc && !isPlaceholderSvgImageUrl(rawSrc) ? rawSrc : null)
              // 使用外部提供的路径解析器
              if (src && filePathResolver) {
                src = filePathResolver(src)
              }
              return src
            },
            renderHTML: (attributes: Record<string, string>) => ({ src: attributes.src })
          },
          alt: {
            default: null,
          },
          title: {
            default: null,
          },
          width: {
            default: null,
          },
          height: {
            default: null,
          },
          textAlign: {
            default: 'center',
            parseHTML: (element: HTMLElement) => {
              const align = element.style.textAlign
              return ['left', 'center', 'right', 'justify'].includes(align) ? align : 'center'
            },
            renderHTML: (attributes: Record<string, string>) => {
              if (!attributes.textAlign || attributes.textAlign === 'center') {
                return {}
              }
              return { style: `text-align: ${attributes.textAlign}` }
            },
          },
        }
      },
      addPasteRules() {
        return [
          {
            find: /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s]*)?)/gi,
            handler: ({ state, range, match }) => {
              const url = match[1]
              const { tr } = state
              const { from, to } = range

              const $from = tr.doc.resolve(from)
              const paragraph = $from.parent

              if (paragraph.textContent.trim() === match[0].trim()) {
                const paragraphStart = $from.before()
                const paragraphEnd = $from.after()
                tr.replaceWith(paragraphStart, paragraphEnd, this.type.create({ src: url }))
              } else {
                tr.delete(from, to)
                const imageNode = this.type.create({ src: url })
                const insertPos = $from.after()
                tr.insert(insertPos, imageNode)
              }
            }
          }
        ]
      },
      addNodeView() {
        return VueNodeViewRenderer(iwImageView)
      },
    }),

    // YouTube
    Youtube.configure({
      controls: false,
      nocookie: true
    }),

    // FileHandler（完整配置）
    FileHandler.configure({
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
      onDrop: onFileHandlerDrop || (() => false),
      onPaste: onFileHandlerPaste || (() => false),
    }),

    // 块级元素
    iwAlertBlockquoteWithView,
    CodeBlockLowlight.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          // 标记 mermaid 代码块是否处于编辑态（仅编辑器会话内状态，不参与渲染/序列化）
          mermaidEditing: {
            default: false,
            rendered: false,
          },
        }
      },
      addNodeView() {
        return VueNodeViewRenderer(iwCodeBlockView)
      },
      addProseMirrorPlugins() {
        return [...(this.parent?.() ?? []), mermaidArrowNavigationPlugin()]
      },
    }).configure({ lowlight }),

    // 数学公式
    InlineMath.extend({
      renderHTML({ node, HTMLAttributes }) {
        return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'inline-math' }), String(node.attrs['latex'] ?? '')]
      },
      addInputRules() {
        return [
          ...(this.parent?.() ?? []),
          new InputRule({
            find: INLINE_PAREN_INPUT_REGEX,
            handler: ({ state, range, match }) => {
              const latex = match[1]
              const { tr } = state
              tr.replaceWith(range.from, range.to, this.type.create({ latex }))
            },
          }),
        ]
      },
      addPasteRules() {
        return [
          nodePasteRule({
            find: INLINE_PAREN_PASTE_REGEX,
            type: this.type,
            getAttributes: (match) => ({ latex: match[1] ?? '' }),
          }),
        ]
      },
    }).configure({
      onClick: undefined,
      katexOptions: {
        throwOnError: false,
        macros: {
          '\\R': '\\mathbb{R}',
          '\\N': '\\mathbb{N}',
        },
      },
    }),
    BlockMath.extend({
      draggable: true,
      renderHTML({ node, HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'block-math' }), String(node.attrs['latex'] ?? '')]
      },
      addNodeView() {
        return VueNodeViewRenderer(iwMathBlockView)
      },
      addInputRules() {
        return [
          ...(this.parent?.() ?? []),
          new InputRule({
            find: BLOCK_BRACKET_INPUT_REGEX,
            handler: ({ state, range, match }) => {
              const latex = match[1]
              const { tr } = state
              tr.replaceWith(range.from, range.to, this.type.create({ latex }))
            },
          }),
        ]
      },
      addPasteRules() {
        return [
          nodePasteRule({
            find: BLOCK_BRACKET_PASTE_REGEX,
            type: this.type,
            getAttributes: (match) => ({ latex: match[1] ?? '' }),
          }),
        ]
      },
    }).configure({
      katexOptions: {
        throwOnError: false,
        macros: {
          '\\R': '\\mathbb{R}',
          '\\N': '\\mathbb{N}',
        },
      },
    }),

    // 列表
    BulletList, OrderedList, ListItem, ListKeymap,
    TaskList,
    TaskItem.configure({
      nested: true,
    }),

    // 文本格式化
    Bold, Italic, Strike, Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph', 'image', 'caption'],
    }),
    Code,

    // Popup Tools
    iwPopupTools.configure({
      tools: [new iwLinkPopupTool(onLinkOpen), new iwMathPopupTool()]
    }),

    // Slash Command 菜单（行首输入 / 触发）
    iwSlashCommand,

    // 链接
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow'
      }
    }),

    Subscript, Superscript, iwTypography,
    Highlight,

    TextStyleKit,

    InvisibleCharacters.configure({
      builders: [
        excludeCodeBlock(new SpaceCharacter()),
        excludeCodeBlock(new ParagraphNode()),
        excludeCodeBlock(new HardBreakNode()),
      ],
    }),

    // 拼写检查扩展
    iwProofreadExtension.configure({
      engineType: editSetting?.proofreadEngineType ?? 'languagetool',
      language: editSetting?.proofreadLanguage ?? 'en-US',
      engineOptions: (editSetting?.proofreadEngineType ?? 'languagetool') === 'languagetool'
        ? {
            apiUrl: editSetting?.proofreadApiUrl ?? 'https://api.languagetool.org/v2/check',
            apiKey: editSetting?.proofreadApiKey || undefined,
            timeout: 8000
          }
        : { dictionaryPath: '/dictionaries' },
      // 仅当全局设置启用了 proofread 时才在 onCreate 创建 worker pool；
      // 若初始为 false，后续通过 enableProofread() 命令懒初始化 service。
      enabled: editSetting?.proofread ?? false,
      showErrors: true,
      debounceTime: 2000,
      maxWorkers: 4
    }),

    // 搜索替换扩展
    iwSearchReplaceExtension,

    // Block ID — stable IDs for AI agentic editing
    UniqueID.configure({
      types: ['paragraph', 'heading', 'codeBlock', 'mathBlock', 'image',
              'horizontalRule', 'blockquote', 'table', 'listItem', 'taskItem'],
      generateID: () => nanoid(8),
    }),

    // Shared overlay range highlights for AI proposal review and search-in-selection
    iwRangeHighlightExtension,
  ]
}
