import { Editor } from '@tiptap/core'
import type { iwProofreadOptions, iwProofreadStorage, ProofreadPluginState } from '../types'

import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet, Decoration, EditorView } from '@tiptap/pm/view'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Transaction, EditorState } from '@tiptap/pm/state'
import { ChangeSet } from '@tiptap/pm/changeset'

import { generateNodeKey } from '../service'
import { createTipTapSuggestionBox } from '../adapters/suggestionBoxAdapter'
import type {
	NodeProofreadRequest,
	NodeProofreadResult,
	ProofreadError
} from '../service'

// 错误指纹接口
interface IgnoredErrorId {
  from: number
  to: number
  word: string
  type?: string
}

interface TextNodesWithPosition {
  text: string
  from: number
  to: number
}

interface ChangedNode {
  node: ProseMirrorNode
  pos: number
  nodeContent: string
  textNodesWithPosition?: import('../types').TextNodesWithPosition[]
}

// 检查 node 的 children, 判断 node 是否包含 inlineMath 或者 存在非 text 的 child
function detectNodeChildren(node: ProseMirrorNode) {
	let onlyText = true
	let hasInlineMath = false
	
  node.forEach((child) => {
		if (!child.isText) {
			onlyText = false
		}
    if (child.type.name === 'inlineMath') {
			hasInlineMath = true
		}
	})
  
	return { onlyText, hasInlineMath }
}

//const processNode = processNodeNormal
//const processNode = processNodePlus
const processNode = processNodeAdvanced

// 遍历 node, 对 node 进行处理，这个处理比较简单，就是将 ProseMirror 中被隔断的文本送到 Proofread 中
// 会有语义不清，空白字符，段落不清等问题，不利于后续 AI 的 Proofread 的使用
function _processNodeNormal(
  doc: ProseMirrorNode, from: number, to: number, 
  processFun: (node: ProseMirrorNode, pos: number, nodeContent: string, n?: TextNodesWithPosition[])=>void
) {
  let hasInlineMath = false
  const innerProcess = (node: ProseMirrorNode, pos: number) => {
	  if ((['blockMath', 'codeBlock', 'horizontalRule', 'inlineMath'].includes(node.type.name)) ||
      !Boolean(node.textContent) ||
		  (node.textContent.length == 0)) return false
    const d = detectNodeChildren(node)
    if (node.type.name === 'paragraph') hasInlineMath = d.hasInlineMath
    if (!d.onlyText) return true

    if (hasInlineMath) pos = pos - 1
    processFun(node, pos, node.textContent)
    return false
  }

  if (from === -1 && to === -1) {
    doc.descendants(innerProcess)
  } else {
    doc.nodesBetween(from, to, innerProcess)
  }
}

const inlineMathText = '[Math Exp.]'
const inlineEmojiText = '[Emoji]'

// 后续需要将 inlineMath 拼装为一个完整的句子，送去进行 proofread，现在只是简单解决一下包含 inlineMath 的段落起点位置 pos + 1 的问题。
// 具体拼装的方式为：将所有的 inlineMath 用 [Math Exp.] 来代替，在生成 Decorations 时，来进行处理
// 用于替换 processNodeNormal 函数
function _processNodePlus(
  doc: ProseMirrorNode, from: number, to: number, 
  processFun: (node: ProseMirrorNode, pos: number, nodeContent: string, n?: TextNodesWithPosition[])=>void
) {
  let index = 0
  let textNodesWithPosition: TextNodesWithPosition[] = []
  let paraNode: ProseMirrorNode | null = null
  let paraPos: number = 0

  let packagingCount = 0
  const packaging = () => {
    textNodesWithPosition = textNodesWithPosition.filter(Boolean)
    if (paraNode && textNodesWithPosition.length > 0) {
      let finalText = ''
      let lastPos = paraPos
      for (const {from, to, text} of textNodesWithPosition) {
        if (to === -1) { 
          finalText += text
          lastPos = lastPos + 1
          continue
        }

        const diff = from - lastPos
        // 去掉前面的空格，避免 proofread 给出错误的审校结果
        if (diff > 0 && finalText.length > 0) {
          finalText += Array(diff + 1).join(' ')
        }

        lastPos = to
        finalText += text
      }

      packagingCount ++
      if (finalText.trim().length !== 0) {
        processFun(paraNode, paraPos, finalText, textNodesWithPosition)
      }
    }
    index = 0
    paraNode = null
    paraPos = 0
    textNodesWithPosition = []
  }

  const innerProcess = (node: ProseMirrorNode, pos: number) => {
	  if (['blockMath', 'codeBlock', 'horizontalRule'].includes(node.type.name)) return false

    // 如果是新的一行的开始，则将前面的打包
    if (node.type.name === 'paragraph' || node.type.name === 'heading') {
      packaging()
      paraNode = node
      paraPos = pos
    }

    if (!node.isText) {
      if (node.type.name === 'inlineMath') {
        if (textNodesWithPosition[index]) {
          index += 1
        }

        textNodesWithPosition[index] = {
          text: inlineMathText,
          from: pos,
          to: -1
        }
      }

      index += 1
      return true
    }

    const localTextNode = {
      text: '',
      from: -1,
      to: -1,
    }

    if (textNodesWithPosition[index]) {
      localTextNode.text = textNodesWithPosition[index]!.text + node.text
      localTextNode.from = textNodesWithPosition[index]!.from
      localTextNode.to = localTextNode.from + localTextNode.text.length
    } else {
      localTextNode.text = node.text || ''
      localTextNode.from = pos
      localTextNode.to = pos + localTextNode.text.length
    }
    textNodesWithPosition[index] = localTextNode
    return false
  }

  if (from === -1 && to === -1) {
    doc.descendants(innerProcess)
    packaging()
  } else {
    doc.nodesBetween(from, to, innerProcess)
    // 在nodesBetween(from, to, callback)迭代中，当from = to且恰好位于段落（paragraph）的末尾位置时，
    // nodesBetween只会遍历包含此位置的节点（即段落本身），不会深入到文本节点（因为位置8不在文本节点范围内）。
    // 此时回调函数中只能获取到段落节点，看不到其内部的文本节点，容易误以为 "没有文本子节点"。
    // 但实际上文本节点仍然存在，只是不在from = to的迭代范围内。
    // 为了避免这个情况，需要手工增加
    if (packagingCount === 0 && from === to && paraNode) {
      textNodesWithPosition[0] = {
        //@ts-expect-error don't report
        text: paraNode.textContent,
        from: paraPos,
        to: -1
      }
    }
    packaging()
  }
}

// 这个解决了在一行的头部和尾部进行修改时，出现只对修改后的 paragrap 的子结点（如果 paragraph 被 inlineMath 或者 emoji 分割了的话）进行 proofread。
// 导致 proofread 的内容不是一个整体，同时，由于 pos 在行的头或者尾，不能解决。
function processNodeAdvanced(
  doc: ProseMirrorNode, from: number, to: number, 
  processFun: (node: ProseMirrorNode, pos: number, nodeContent: string, n?: TextNodesWithPosition[])=>void
) {
    const innerProcess = (node: ProseMirrorNode, pos: number) => {
    if ((['blockMath', 'codeBlock', 'horizontalRule'].includes(node.type.name)) ||
      !Boolean(node.textContent) ||
		  (node.textContent.length == 0)) return false

    // 只处理'paragraph', 'heading'
    if (['paragraph', 'heading'].includes(node.type.name)) {
      let finalText = ''
      let lastPos = pos + 1
      const textNodesWithPosition: TextNodesWithPosition[] = []
      node.forEach((child) => {
        if (child.isText && child.text && child.text.length > 0) {
          textNodesWithPosition.push({
            text: child.text,
            from: lastPos,
            to: lastPos + child.nodeSize
          }) 
          finalText += child.text
        } else {
          if (child.nodeSize) {
            let nodeText = Array(child.nodeSize + 1).join(' ')
            if (child.type.name === 'inlineMath') {
              nodeText = inlineMathText
            } else if (child.type.name === 'emoji') {
              nodeText = inlineEmojiText
            }

            textNodesWithPosition.push({
              text: nodeText,
              from: lastPos,
              to: lastPos + child.nodeSize
            })

            finalText += nodeText
          }
        }

        lastPos += child.nodeSize
      })

      processFun(node, pos, finalText, textNodesWithPosition)
      return false
    }    
    return true
  }

  if (from === -1 && to === -1) {
    doc.descendants(innerProcess)
  } else {
    doc.nodesBetween(from, to, innerProcess)
  }
}

// 创建错误指纹
function createIgnoredErrorId(from: number, to: number, word: string, type?: string): string {
  return `${from}:${to}:${word}:${type || 'unknown'}`
}

// 解析错误指纹
function parseIgnoredErrorId(id: string): IgnoredErrorId {
  const [from, to, word, type] = id.split(':')
  return {
    from: parseInt(from || '0'),
    to: parseInt(to || '0'),
    word: word || '',
    type: type || 'unknown'
  }
}

// 更新忽略错误的位置
function updateIgnoredErrorPositions(tr: Transaction, storage: iwProofreadStorage) {
  storage.ignoredErrors.withLock((ignoredMap) => {
    const currentIgnored = Array.from(ignoredMap.keys())

    // 清空当前map
    ignoredMap.clear()

    // 重新验证和添加有效的ignored errors
    for (const ignoredId of currentIgnored) {
      const { from, to, word, type } = parseIgnoredErrorId(ignoredId)

      const newFrom = tr.mapping.map(from)
      const newTo = tr.mapping.map(to)

      if (newFrom !== null && newTo !== null && newFrom < newTo) {
        const newText = tr.doc.textBetween(newFrom, newTo)

        if (newText === word) {
          const newIgnoredId = createIgnoredErrorId(newFrom, newTo, word, type)
          ignoredMap.set(newIgnoredId, true)
        } // else: content mismatch, user already fixed the error, ignore state cleared automatically
      } // else: position invalid, area deleted, ignore state cleared automatically
    }
  })
}

// 辅助函数：从缓存的位置信息计算 error 的准确位置
// 我实在是比较烦这个逻辑，这一段用 TextNodesWithPosition 来解决精确匹配的代码由 Claude Code 生成
// 如果存在 textNodesWithPosition，需要根据它来计算真实位置
function calculateErrorPosition(
  textNodesWithPosition: TextNodesWithPosition[],
  error: ProofreadError
): { from: number; to: number } | null {
  let accumulatedLength = 0  // finalText 中的累计长度

  for (let i = 0; i < textNodesWithPosition.length; i++) {
    const textNode = textNodesWithPosition[i]!
    const textLength = textNode.text.length

    // 检查 error 是否在当前 textNode 范围内
    if (error.offset >= accumulatedLength && error.offset < accumulatedLength + textLength) {
      // error 起始位置在当前 textNode 内
      const offsetInText = error.offset - accumulatedLength

      if (textNode.to === -1) {
        // 这是 inlineMath 占位符，错误不应该在这里
        console.warn({function: 'calculateErrorPosition', info: 'error in inlineMath placeholder', error})
        return null
      }

      // 计算真实文档位置
      const from = textNode.from + offsetInText
      let to: number

      // 检查 error 是否跨越多个 textNode
      const errorEnd = error.offset + error.length
      if (errorEnd <= accumulatedLength + textLength) {
        // error 完全在当前 textNode 内
        to = from + error.length
      } else {
        // error 跨越多个 textNode，需要继续计算
        let remainingLength = error.length - (textLength - offsetInText)
        to = textNode.to

        for (let j = i + 1; j < textNodesWithPosition.length && remainingLength > 0; j++) {
          const nextNode = textNodesWithPosition[j]!
          if (nextNode.to === -1) {
            // 跳过 inlineMath 占位符
            continue
          }

          const nextNodeLength = nextNode.to - nextNode.from
          if (remainingLength <= nextNodeLength) {
            to = nextNode.from + remainingLength
            remainingLength = 0
            break // 这个是否需要加？？
          } else {
            to = nextNode.to
            remainingLength -= nextNodeLength
          }
        }
      }

      return { from, to }
    }

    accumulatedLength += textLength
  }

  return null
}

const createNodeDecorations = async (
	doc: ProseMirrorNode,
	storage: iwProofreadStorage
): Promise<DecorationSet> => {
	const decorations: Decoration[] = []

  await storage.nodeProofreadMap.withLock((nodeMap)=>{
    storage.ignoredErrors.withLock((ignoredMap) => {

      for (const nodep of nodeMap.values()) {
        if (nodep.status !== 'checked' || !nodep.result || (nodep.result.errors.length === 0)) continue

        // === 核心优化：直接使用缓存的位置，不再遍历整个文档 ===
        const { pos, textNodesWithPosition } = nodep

        // 如果缺少位置信息，跳过（不应该发生）
        if (pos === undefined) {
          console.warn({function: 'createNodeDecorations', info: 'Missing position cache for node', id: nodep.id})
          continue
        }

        // 为该节点的每个 error 创建 decoration
        nodep.result.errors.forEach((error, errorIndex) => {
          let from: number = -1
          let to: number = -1

          // 使用缓存的位置信息计算 error 的准确位置
          if (textNodesWithPosition && textNodesWithPosition.length > 0) {
            const errorPosition = calculateErrorPosition(textNodesWithPosition, error)
            if (!errorPosition) {
              console.warn({function: 'createNodeDecorations', info: 'cannot find position', error, nodeContent: nodep.nodeContent})
              return
            }

            from = errorPosition.from
            to = errorPosition.to
          } else {
            // 没有 textNodesWithPosition，使用简单计算（向后兼容）
            from = pos + 1 + error.offset
            to = from + error.length
          }

          // 检查是否被忽略
          const ignoredId = createIgnoredErrorId(from, to, error.word, error.type)
          if (ignoredMap.has(ignoredId)) {
            //console.debug({function: 'createNodeDecorations', info: 'ignored error', error })
            return
          }

          // 验证位置在文档范围内
          if (from >= 0 && to <= doc.content.size && from < to) {
            decorations.push(
              Decoration.inline(
                from,
                to,
                { class: getErrorClass(error.type) },
                {
                  error,
                  index: errorIndex,
                  id: nodep.result!.id,
                }
              )
            )
          } else {
            console.warn({function: 'createNodeDecorations', info: 'Error position out of range', from, to, error})
          }
        })
      }

    })
  })

	return DecorationSet.create(doc, decorations)
}

const getErrorClass = (errorType: string | undefined): string => {
	switch (errorType) {
		case 'spelling':
			return 'iw-proofread-spelling-error'
		case 'grammar':
			return 'iw-proofread-grammar-error'
		case 'style':
			return 'iw-proofread-style-error'
		default:
			return 'iw-proofread-misc-error'
	}
}

const handleErrorClick = (
	view:  EditorView,
	pos: number,
	event: MouseEvent,
	storage: iwProofreadStorage
): boolean => {
	if (!view.editable) return false
	if (!storage.showErrors || !storage.isEnabled) return false

	const decorations = storage.decorationSet.find(pos, pos)

	if (decorations.length > 0) {
		const decoration = decorations[0]
		if (decoration) {
			const error = decoration.spec.error

			if (error) {
				showSuggestionPopup(error, event, view, decoration, storage)
				return true
			}
		}
	}

	const existingBox = document.querySelector('.proofread-suggestion')
	if (existingBox) {
		existingBox.remove()
	}

	return false
}

const showSuggestionPopup = (
	error: ProofreadError,
	event: MouseEvent,
	view: EditorView,
	decoration: Decoration,
	storage: iwProofreadStorage
): void => {
	const rect = (event.target as HTMLElement).getBoundingClientRect()

	const suggestionBox = createTipTapSuggestionBox({
		noSuggestions: 'No suggestions found'
	})

		const app = suggestionBox({
			error: {
				from: decoration.from,
				to: decoration.to,
				message: error.message || `Misspelled word: ${error.word}`,
			shortMessage: error.shortMessage || `misspelling`,
				type: error.type || 'spelling',
				replacements: error.suggestions
			},
			position: { x: rect.left, y: rect.bottom },
			scrollContainer: view.dom as HTMLElement,
		onReplace: (value: string) => {
				if (!view.editable) {
					app.destroy()
					return
			}
			const { from, to } = decoration
			const tr = view.state.tr

			// 获取原文本位置的 marks，以便在替换后保留格式
			const $from = view.state.doc.resolve(from)
			const marks = $from.marks()

			// 创建带有原有 marks 的新文本节点
			tr.replaceWith(from, to, view.state.schema.text(value, marks))
			removeDecorationAt(from, to, storage, view)
			view.dispatch(tr)
			app.destroy()
		},
		onIgnore: () => {
			const { from, to, spec } = decoration
			const error = spec.error

			const ignoredId = createIgnoredErrorId(from, to, error.word, error.type)

			storage.ignoredErrors.withLock((ignoredMap) => {
				ignoredMap.set(ignoredId, true)
			})

			removeDecorationAt(from, to, storage, view)
			app.destroy()
		},
		onClose: () => {
			app.destroy()
		}
	})
}

const removeDecorationAt = (from: number, to: number, storage: iwProofreadStorage, view: EditorView) => {
	const toRemove = storage.decorationSet.find(from, to)
	if (toRemove.length > 0) {
		storage.decorationSet = storage.decorationSet.remove(toRemove)
		if (view?.dispatch) {
			view.dispatch(view.state.tr.setMeta('forceUpdate', true))
		}
	}
}

export const performProofread = async (
	storage: iwProofreadStorage,
	editor: Editor,
	isAllDocument: boolean = false
) => {
	if (!storage.proofreadService || !storage.isEnabled) return
	if (!editor.isEditable) return

	// 检查 editor 是否已销毁
	if (editor.isDestroyed) return

  while (storage.isProcessing) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
	storage.isProcessing = true

	let nodeProofreadRequests: NodeProofreadRequest[] = []
	if (isAllDocument) {
		await collectAllNodes(editor, storage)
		//console.info({ function: 'collectAllNodes', nodeProofreadMap: await storage.nodeProofreadMap.size() })
	}

  nodeProofreadRequests = await buildNodeProofreadRequests(storage)
	//console.info({ function: 'buildNodeProofreadRequests', nodeProofreadRequests, nodeProofreadMap: await storage.nodeProofreadMap.size() })

	try {
		let nodeProofreadResults: NodeProofreadResult[] = []
		if (nodeProofreadRequests.length) {
			nodeProofreadResults = await storage.proofreadService.checkNodes(nodeProofreadRequests)
    }

		// 异步操作后检查 editor 是否已销毁
		if (editor.isDestroyed) {
			return
		}

    // 这里面还有一个问题，就是 createNodeDecorations 还是全量更新
    // 未来需要通过 updateNodeProofreadResults 只对变更后的 nodeProofreadResults 做 createNodeDecorations
		await updateNodeProofreadResults(storage, nodeProofreadResults)
		//console.debug({ function: 'updateNodeProofreadResults', nodeProofreadMap: await storage.nodeProofreadMap.size() })

		const decorations = await createNodeDecorations(editor.state.doc, storage)
		//console.debug({ function: 'createNodeDecorations', nodeProofreadMap: await storage.nodeProofreadMap.size() })
		storage.decorationSet = decorations

		// 最终 dispatch 前再次检查
		if (!editor.isDestroyed && editor.view?.dispatch) {
			editor.view.dispatch(
				editor.view.state.tr.setMeta('forceUpdate', true)
			)
		}

	} catch (error) {
		console.error('Proofread error:', error)
	} finally {
		storage.isProcessing = false
	}
}

const dumpChangedNode = (_node: ChangedNode) => {
  /*
	console.debug({
    function: 'dumpChangedNode',
    pos: node.pos,
    nodeContent: node.nodeContent,
		node: {
      type: node.node.type.name,
		  content: node.node.textContent,
		  attrs: node.node.attrs,
		  marks: node.node.marks?.map(mark => ({ type: mark.type.name, attrs: mark.attrs }))
    }
	})
  */
}

const getChangedNodes2 = (transactions: Transaction[], state: EditorState, isNew: boolean = false) => {
	const changeNodes: ChangedNode[] = [];

	// 直接从Transaction的steps中提取变化范围
	for (const txn of transactions.filter((txn) => txn.docChanged)) {
		txn.steps.forEach((step) => {
			const map = step.getMap()

			// StepMap.forEach 提供每个变化的范围信息
			map.forEach((oldStart, oldEnd, newStart, newEnd) => {

        const from = isNew ? newStart : oldStart
				const to = isNew ? newEnd : oldEnd

        //console.debug({function: 'getChangedNodes2', state: isNew? 'NewChange' : 'OldChange', from, to})
        processNode(state.doc, from, to, (node, pos, nodeContent, textNodesWithPosition) => {
          //console.debug({function: 'getChangedNodes2', state: isNew? 'NewChange' : 'OldChange', node: nodeContent, pos})
          changeNodes.push({node, pos, nodeContent, textNodesWithPosition: textNodesWithPosition})
        })
			})
		})
	}

  return changeNodes
}

const getChangedNodes1 = (transactions: Transaction[], state: EditorState, isNew: boolean = false) => {
	let changeSet = ChangeSet.create(state.doc);

	for (const txn of transactions.filter((txn) => txn.docChanged)) {
		changeSet = changeSet.addSteps(
			changeSet.startDoc,
			txn.steps.map((step) => step.getMap()),
			[]
		);
	}

  const changeNodes: ChangedNode[] = [];

	for (const change of changeSet.changes) {
		const start = isNew? change.fromB : change.fromA
		const end = isNew? change.toB : change.toA

    //console.debug({function: 'getChangedNodes1', state: isNew? 'NewChange' : 'OldChange', start, end})
    processNode(state.doc, start, end, (node, pos, nodeContent, textNodesWithPosition) => {
      //console.debug({function: 'getChangedNodes1', state: isNew? 'NewChange' : 'OldChange', node: nodeContent, pos})
      changeNodes.push({node, pos, nodeContent, textNodesWithPosition: textNodesWithPosition})
    })
	}

	return changeNodes
}

const getChangedNodes = (transactions: Transaction[], oldEditorState: EditorState, newEditorState: EditorState): {
  oldNodes: ChangedNode[],
  newNodes: ChangedNode[]
} => {
  const oldNodes1 = getChangedNodes1(transactions, oldEditorState, false)
  //console.debug({function: 'getChangedNodes1', state: 'OldChange', size: oldNodes1.length})
  const newNodes1 = getChangedNodes1(transactions, newEditorState, true)
  //console.debug({function: 'getChangedNodes1', state: 'NewChange', size: newNodes1.length})

  // 发现变化为空时，检查是否是等长替换导致 getChangedNodes1 未能检测出来变化
  if (oldNodes1.length === 0 && newNodes1.length === 0) {
    //console.info({function: 'getChangedNodes', state: '等长替换检查开始'})
    const oldNodes2 = getChangedNodes2(transactions, oldEditorState, false)
    //console.debug({function: 'getChangedNodes2', state: 'OldChange', size: oldNodes2.length})
    const newNodes2 = getChangedNodes2(transactions, newEditorState, true)
    //console.debug({function: 'getChangedNodes2', state: 'NewChange', size: newNodes2.length})

    if (oldNodes2.length === newNodes2.length && newNodes2.length > 0) {
      for(let i = 0; i < oldNodes2.length; i ++) {
        if (oldNodes2[i]!.pos !== newNodes2[i]!.pos) return {oldNodes: [], newNodes: []}
        
        if (oldNodes2[i]!.nodeContent !== newNodes2[i]!.nodeContent) {
          oldNodes1.push(oldNodes2[i]!)
          newNodes1.push(newNodes2[i]!)
          //console.debug({function: 'getChangedNodes', state: '等长替换', oldContent: oldNodes2[i]!.nodeContent, newContent: newNodes2[i]!.nodeContent})
        }
      }
    }

    //console.info({function: 'getChangedNodes', state: '等长替换检查结束', oldSize: oldNodes1.length, newSize: newNodes1.length})
    return {oldNodes: oldNodes1, newNodes: newNodes1}
  } else {
    return {oldNodes: oldNodes1, newNodes: newNodes1}
  }
}
/**
 * 将文档中所有节点作为NodeProofreadRequest集合返回
 * @param doc 文档根节点
 * @returns
 */
const collectAllNodes = async (editor: Editor, storage: iwProofreadStorage) => {
  const newNodes: ChangedNode[] = [];
  processNode(editor.state.doc, -1, -1, (node, pos, nodeContent, textNodesWithPosition) => {
    newNodes.push({node, pos, nodeContent, textNodesWithPosition: textNodesWithPosition})
  })

  await storage.nodeProofreadMap.withLock(async (map) => {
    // add newNodes to storage.nodeProofreadMap with lock
    newNodes.forEach((node) => {
      const id = generateNodeKey(node.node)
      const nodeProofread = map.get(id)
      if (!nodeProofread) {
        map.set(id, {
          id: id,
          node: node.node,
          nodeContent: node.nodeContent,
          status: 'idle',
          // 记录位置信息
          pos: node.pos,
          textNodesWithPosition: node.textNodesWithPosition
        })
      } else {
        console.warn('already has a checked node, maybe a same text.')
      }

      //dumpChangedNode(node)
    });

  })
}

const buildNodeProofreadRequests = async (storage: iwProofreadStorage): Promise<NodeProofreadRequest[]> => {
	const nodeProofreadRequests: NodeProofreadRequest[] = []
  await storage.nodeProofreadMap.withLock((map)=>{
    map.forEach((value, key) => {
      if (value.status === 'idle') {
        value.status = 'checking'
        nodeProofreadRequests.push({
          id: key,
          nodeContent: value.nodeContent
        })
      }
    })
  })
  return nodeProofreadRequests
}

const updateNodeProofreadResults = async (storage: iwProofreadStorage, nodeProofreadResults: NodeProofreadResult[]) => {
  const newNodeResults: NodeProofreadResult[] = []
  await storage.nodeProofreadMap.withLock((map)=>{
    nodeProofreadResults.forEach((value) => {
      const nodeProofread = map.get(value.id)
      if (nodeProofread) {
        if (nodeProofread.status === 'deleted') {
          //console.debug({function: 'updateNodeProofreadResults', text: nodeProofread.nodeContent, status: 'deleted'})
          map.delete(nodeProofread.id)
        } else {
          nodeProofread.status = 'checked'
          //console.debug({function: 'updateNodeProofreadResults', text: nodeProofread.nodeContent, status: 'checked', errors: value.errors})
          if (value.errors && value.errors.length > 0) {
            nodeProofread.result = value
            newNodeResults.push(value)
          }
        }
      }
    })
  })
  return newNodeResults
}

export const iwProofreadPluginKey = new PluginKey<ProofreadPluginState>('iwProofread')
  
export const iwProofreadPlugin = (editor: Editor, options: iwProofreadOptions, storage: iwProofreadStorage) => {

  // 使用 storage.debounceTimer 实现防抖
  const debouncedIncrementalSpellCheck = () => {
    // 清除之前的定时器
    if (storage.debounceTimer) {
      clearTimeout(storage.debounceTimer)
    }

    // 设置新的定时器
    storage.debounceTimer = setTimeout(() => {
      performProofread(storage, editor)
    }, options.debounceTime || 1000)
  }

  return new Plugin({
    key: iwProofreadPluginKey,

    state: {
      init: () => ({
        //nodeProofreadMap: new LockedSharedMap<string, import('./types').NodeProofread>(),
        //decorations: DecorationSet.empty,
      }),

      apply: (tr, oldState, oldEditorState, newEditorState) => {
        if (tr.docChanged && storage.isEnabled) {
          // 更新所有节点的位置缓存
          storage.nodeProofreadMap.withLock((map) => {
            map.forEach((nodep) => {
              // 只更新有位置信息的节点
              if (nodep.pos !== undefined && nodep.textNodesWithPosition) {
                // 使用 tr.mapping 更新段落位置
                nodep.pos = tr.mapping.map(nodep.pos)

                // 更新文本片段位置
                nodep.textNodesWithPosition = nodep.textNodesWithPosition.map(textNode => {
                  if (textNode.to === -1) {
                    // inlineMath 占位符，只更新 from
                    return {
                      ...textNode,
                      from: tr.mapping.map(textNode.from)
                    }
                  } else {
                    // 普通文本节点，更新 from 和 to
                    return {
                      ...textNode,
                      from: tr.mapping.map(textNode.from),
                      to: tr.mapping.map(textNode.to)
                    }
                  }
                })
              }
            })
          })

          // 更新ignored errors的位置
          updateIgnoredErrorPositions(tr, storage)

          const { oldNodes, newNodes } = getChangedNodes([tr], oldEditorState, newEditorState)
          storage.nodeProofreadMap.withLock(async (map) => {
            // delete oldNodes from storage.nodeProofreadMap with lock
            //console.debug(`delete oldNodes from storage.nodeProofreadMap with lock, nodes count: ${oldNodes.length}`)
            oldNodes.forEach((node) => {
              const id = generateNodeKey(node.node)
              const nodeProofread = map.get(id)
              if (nodeProofread) {
                if (nodeProofread.status !== 'checking'){
                  //console.debug({function: 'apply', text: nodeProofread.nodeContent, status: 'deleted'})
                  map.delete(id)
                }
                else {
                  //console.debug({function: 'apply', text: nodeProofread.nodeContent, status: 'mark deleted'})
                  nodeProofread.status = 'deleted'
                }
              } else {
                console.warn("find a nodeProofread is undefined, node info:")
                dumpChangedNode(node)
              }

              dumpChangedNode(node)
            });

            // add newNodes to storage.nodeProofreadMap with lock
            //console.debug(`add newNodes to storage.nodeProofreadMap with lock, nodes count: ${newNodes.length}`)
            newNodes.forEach((node) => {
              const id = generateNodeKey(node.node)
              const nodeProofread = map.get(id)
              if (!nodeProofread) {
                map.set(id, {
                  id: id,
                  node: node.node,
                  nodeContent: node.nodeContent,
                  status: 'idle',
                  // 记录位置信息
                  pos: node.pos,
                  textNodesWithPosition: node.textNodesWithPosition
                })
                //console.debug({function: 'apply', text: node.nodeContent, status: 'idle'})
              } else {
                //const oldStatus = nodeProofread.status
                if (nodeProofread.status === 'deleted') {
                  nodeProofread.status = 'idle'
                  // 节点复活时更新位置
                  nodeProofread.pos = node.pos
                  nodeProofread.textNodesWithPosition = node.textNodesWithPosition
                }
                //console.debug({function: 'apply', text: node.nodeContent, status: nodeProofread.status, oldStatus})
              }

              dumpChangedNode(node)
            });

          })

          debouncedIncrementalSpellCheck()
        }

        return oldState
      }
    },
    props: {
      decorations: () => {
        return storage.showErrors ?
          storage.decorationSet :
          DecorationSet.empty
      },

      handleClick: (view, pos, event) => {
        return handleErrorClick(view, pos, event, storage)
      },

      handleKeyDown: () => {
        const existingBox = document.querySelector('.proofread-suggestion')
        if (existingBox) {
          existingBox.remove()
        }
        return false
      }
    }
  })

}

export default iwProofreadPlugin
