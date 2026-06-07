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

import Blockquote from '@tiptap/extension-blockquote'
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

import InvisibleCharacters from '@tiptap/extension-invisible-characters'
import UniqueID from '@tiptap/extension-unique-id'
import { nanoid } from 'nanoid'

// 自定义扩展
import { iwTypography, iwPopupTools, iwLinkPopupTool, iwMathPopupTool, iwSlashCommand } from '@/components/common/tiptap'
import { iwProofreadExtension } from '@/components/common/tiptap/iw-proofread'
import { iwSearchReplaceExtension } from '@/components/common/tiptap/iw-search-replace'
import { iwRangeHighlightExtension } from '@/components/common/tiptap/iw-range-highlight'
import { extractBestImageUrl, isPlaceholderSvgImageUrl, normalizePastedImageHtml } from '@/components/common/tiptap/utils'

// Custom node views (仅用于 MarkdownEditor，搜索服务不需要)
import { iwTableView, iwImageView, iwCodeBlockView, iwMathBlockView } from '@/components/common/tiptap'

// Lowlight 实例
const lowlight = createLowlight(common)

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
    Blockquote,
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
            default: 'left',
            parseHTML: (element: HTMLElement) => {
              const align = element.style.textAlign
              return ['left', 'center', 'right', 'justify'].includes(align) ? align : 'left'
            },
            renderHTML: (attributes: Record<string, string>) => {
              if (!attributes.textAlign || attributes.textAlign === 'left') {
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
    Blockquote,
    CodeBlockLowlight.extend({
      addNodeView() {
        return VueNodeViewRenderer(iwCodeBlockView)
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

    InvisibleCharacters,

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
