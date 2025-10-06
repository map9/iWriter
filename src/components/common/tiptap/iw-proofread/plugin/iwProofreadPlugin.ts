import { Editor } from '@tiptap/core'
import type { iwProofreadOptions, iwProofreadStorage, ProofreadPluginState } from '../types'

import { Plugin, PluginKey } from '@tiptap/pm/state'
import { DecorationSet, Decoration, EditorView } from '@tiptap/pm/view'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Transaction, EditorState } from '@tiptap/pm/state'
import { ChangeSet } from '@tiptap/pm/changeset'

import { debounce, generateNodeKey } from '../spell-check'
import { createTipTapSuggestionBox } from '../adapters/suggestionBoxAdapter'
import type {
	NodeCheckRequest,
	NodeSpellResult,
	SpellError
} from '../spell-check'

// 错误指纹接口
interface IgnoredErrorId {
  from: number
  to: number
  word: string
  type?: string
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
        } else {
          // 如果内容不匹配，说明用户已修正该错误，自动清除ignore状态
          console.log({function: 'updateIgnoredErrorPositions', info: 'mismatch content', from, to, word, type })
        }
      } else {
        // 如果位置无效，说明该区域被删除，自动清除ignore状态
        console.log({function: 'updateIgnoredErrorPositions', info: `Can't find`, from, to, word, type })
      }
    }
  })
}

const createNodeDecorations = (
	doc: ProseMirrorNode,
	storage: iwProofreadStorage
): DecorationSet => {
	const decorations: Decoration[] = []

  storage.nodeProofreadMap.withLock((nodeMap)=>{
    storage.ignoredErrors.withLock((ignoredMap) => {

      for (const nodep of nodeMap.values()) {
        if (nodep.status !== 'checked' || !nodep.result || (nodep.result.errors.length === 0)) continue

        doc.descendants((node, pos) => {
          //if (shouldNotCheckNode(node)) return false
          //if (!containsOnlyTextNodes(node)) return true

          if (generateNodeKey(node) === nodep.result!.id) {
            nodep.result!.errors.forEach((error, index) => {
              const from = pos + 1 + error.offset
              const to = from + error.length

              // 检查是否被忽略（线程安全）
              const ignoredId = createIgnoredErrorId(from, to, error.word, error.type)
              if (ignoredMap.has(ignoredId)) {
                console.log({function: 'createNodeDecorations', info: 'ignored error', error })
                return  // 跳过已忽略的错误
              }

              if (from >= 0 && to <= doc.content.size && from < to) {
                decorations.push(
                  Decoration.inline(
                    from,
                    to,
                    { class: getErrorClass(error.type) },
                    {
                      error,
                      index,
                      id: nodep.result!.id,
                    }
                  )
                )
              }
            })
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
			return 'spelling-error'
		case 'grammar':
			return 'grammar-error'
		default:
			return 'spell-error'
	}
}

const handleErrorClick = (
	view:  EditorView,
	pos: number,
	event: MouseEvent,
	storage: iwProofreadStorage
): boolean => {
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
	error: SpellError,
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
			msg: error.message || `Misspelled word: ${error.word}`,
			shortmsg: error.message || `Misspelled word: ${error.word}`,
			type: error.type || 'spelling',
			replacements: error.suggestions
		},
		position: { x: rect.left, y: rect.bottom },
		onReplace: (value: string) => {
			const { from, to } = decoration
			const tr = view.state.tr
			tr.replaceWith(from, to, view.state.schema.text(value))
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

const performSpellCheck = async (
	storage: iwProofreadStorage,
	editor: Editor,
	isAllDocument: boolean = false
) => {
	if (!storage.spellService || !storage.isEnabled) return

  while (storage.isProcessing) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }
	storage.isProcessing = true
	
	let nodeProofreadRequests: NodeCheckRequest[] = []
	if (isAllDocument) {
		collectAllNodes(editor, storage)
		console.log({ function: 'collectAllNodes', nodeProofreadMap: await storage.nodeProofreadMap.size() })
	}
  
  nodeProofreadRequests = buildNodeProofreadRequests(storage)
	console.log({ function: 'buildNodeProofreadRequests', nodeProofreadRequests, nodeProofreadMap: await storage.nodeProofreadMap.size() })
	
	try {
		let nodeProofreadResults: NodeSpellResult[] = []
		if (nodeProofreadRequests.length) {
			nodeProofreadResults = await storage.spellService.checkNodes(nodeProofreadRequests)
  		console.log({ function: 'checkNodes', nodeProofreadResults })
    }

		updateNodeProofreadResults(storage, nodeProofreadResults)
		console.log({ function: 'updateNodeProofreadResults', nodeProofreadMap: await storage.nodeProofreadMap.size() })

		const decorations = createNodeDecorations(editor.state.doc, storage)
		console.log({ function: 'createNodeDecorations', nodeProofreadMap: await storage.nodeProofreadMap.size() })
		storage.decorationSet = decorations

		if (editor.view?.dispatch) {
			editor.view.dispatch(
				editor.view.state.tr.setMeta('forceUpdate', true)
			)
		}

	} catch (error) {
		console.error('Spell check error:', error)
	} finally {
		storage.isProcessing = false
	}
}

const dumpNode = (node: ProseMirrorNode) => {
	console.log({
		type: node.type.name,
		content: node.textContent,
		attrs: node.attrs,
		marks: node.marks?.map(mark => ({ type: mark.type.name, attrs: mark.attrs }))
	})
}

const shouldNotCheckNode = (node: ProseMirrorNode): boolean => {
	const noTextNodeTypes = ['blockMath', 'codeBlock', 'horizontalRule', 'inlineMath']
	return (noTextNodeTypes.includes(node.type.name)) ||
		   !Boolean(node.textContent) ||
		   (node.textContent.length == 0)
}

function containsOnlyTextNodes(node: ProseMirrorNode) {
	let onlyText = true;
	node.forEach((child) => {
		if (!child.isText /*&& child.type.name !== 'inline-math' && child.type.name !== 'code'*/) {
			onlyText = false;
			return false;
		}
	});

	return onlyText;
}


const getChangedNodes2 = (transactions: Transaction[], state: EditorState, isNew: boolean = false) => {
	const changeNodes: { node: ProseMirrorNode; pos: number }[] = [];

	// 直接从Transaction的steps中提取变化范围
	for (const txn of transactions.filter((txn) => txn.docChanged)) {
		txn.steps.forEach((step) => {
			const map = step.getMap()

			// StepMap.forEach 提供每个变化的范围信息
			map.forEach((oldStart, oldEnd, newStart, newEnd) => {

        const from = isNew ? newStart : oldStart
				const to = isNew ? newEnd : oldEnd

        state.doc.nodesBetween(from, to, (node, pos) => {
          console.log({function: 'getChangedNodes2', state: isNew? 'NewChange' : 'OldChange', node: node.textContent, pos})
          if (shouldNotCheckNode(node)) return false
          if (!containsOnlyTextNodes(node)) return true

          changeNodes.push({node, pos})
          return false
        });

        console.log({function: 'getChangedNodes2', state: isNew? 'NewChange' : 'OldChange', from, to})
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

	const changeNodes: { node: ProseMirrorNode; pos: number }[] = [];

	for (const change of changeSet.changes) {
		const start = isNew? change.fromB : change.fromA
		const end = isNew? change.toB : change.toA

		state.doc.nodesBetween(start, end, (node, pos) => {
			console.log({function: 'getChangedNodes1', state: isNew? 'NewChange' : 'OldChange', node: node.textContent, pos})
			if (shouldNotCheckNode(node)) return false
			if (!containsOnlyTextNodes(node)) return true

			changeNodes.push({node, pos})
			return false
		});
	}

	return changeNodes
}

const getChangedNodes = (transactions: Transaction[], oldEditorState: EditorState, newEditorState: EditorState): {
  oldNodes: { node: ProseMirrorNode; pos: number }[],
  newNodes: { node: ProseMirrorNode; pos: number }[]
} => {
  const oldNodes1 = getChangedNodes1(transactions, oldEditorState, false)
  console.log({function: 'getChangedNodes1', state: 'OldChange', size: oldNodes1.length})
  const newNodes1 = getChangedNodes1(transactions, newEditorState, true)
  console.log({function: 'getChangedNodes1', state: 'NewChange', size: newNodes1.length})

  // 发现变化为空时，检查是否是等长替换导致 getChangedNodes1 未能检测出来变化
  if (oldNodes1.length === 0 && newNodes1.length === 0) {
    console.log({function: 'getChangedNodes', state: '等长替换检查开始'})
    const oldNodes2 = getChangedNodes2(transactions, oldEditorState, false)
    console.log({function: 'getChangedNodes2', state: 'OldChange', size: oldNodes2.length})
    const newNodes2 = getChangedNodes2(transactions, newEditorState, true)
    console.log({function: 'getChangedNodes2', state: 'NewChange', size: newNodes2.length})

    if (oldNodes2.length === newNodes2.length && newNodes2.length > 0) {
      for(let i = 0; i < oldNodes2.length; i ++) {
        if (oldNodes2[i]!.pos !== newNodes2[i]!.pos) return {oldNodes: [], newNodes: []}
        
        if (oldNodes2[i]!.node.textContent !== newNodes2[i]!.node.textContent) {
          oldNodes1.push(oldNodes2[i]!)
          newNodes1.push(newNodes2[i]!)
          console.log({function: 'getChangedNodes', state: '等长替换', oldContent: oldNodes2[i]!.node.textContent, newContent: newNodes2[i]!.node.textContent})
        }
      }
    }

    console.log({function: 'getChangedNodes', state: '等长替换检查结束', oldSize: oldNodes1.length, newSize: newNodes1.length})
    return {oldNodes: oldNodes1, newNodes: newNodes1}
  } else {
    return {oldNodes: oldNodes1, newNodes: newNodes1}
  }
}
/**
 * 将文档中所有节点作为NodeCheckRequest集合返回
 * @param doc 文档根节点
 * @returns
 */
const collectAllNodes = (editor: Editor, storage: iwProofreadStorage) => {
  const newNodes: { node: ProseMirrorNode; pos: number }[] = [];
  editor.state.doc.descendants((node, pos) => {
    if (shouldNotCheckNode(node)) return false
    if (!containsOnlyTextNodes(node)) return true

    newNodes.push({node, pos})
    return false
  })

  storage.nodeProofreadMap.withLock(async (map) => {
    // add newNodes to storage.nodeProofreadMap with lock
    newNodes.forEach((node) => {
      const id = generateNodeKey(node.node)
      const nodeProofread = map.get(id)
      if (!nodeProofread) {
        map.set(id, {
          id: id,
          node: node.node,
          status: 'idle'
        })
      } else {
        console.log('already has a checked node, maybe a same text.')
      }

      //dumpNode(node.node)
    });
    
  })
}

const buildNodeProofreadRequests = (storage: iwProofreadStorage): NodeCheckRequest[] => {
	const nodeProofreadRequests: NodeCheckRequest[] = []
  storage.nodeProofreadMap.withLock((map)=>{
    map.forEach((value, key) => {
      if (value.status === 'idle') {
        value.status = 'checking'
        nodeProofreadRequests.push({
          id: key,
          node: value.node
        })
      }
    })
  })
  return nodeProofreadRequests
}

const updateNodeProofreadResults = (storage: iwProofreadStorage, nodeProofreadResults: NodeSpellResult[]) => {
  const newNodeResults: NodeSpellResult[] = []
  storage.nodeProofreadMap.withLock((map)=>{
    nodeProofreadResults.forEach((value) => {
      const nodeProofread = map.get(value.id)
      if (nodeProofread) {
        if (nodeProofread.status === 'deleted') {
          console.log({function: 'updateNodeProofreadResults', text: nodeProofread.node.textContent, status: 'deleted'})
          map.delete(nodeProofread.id)
        } else {
          nodeProofread.status = 'checked'
          console.log({function: 'updateNodeProofreadResults', text: nodeProofread.node.textContent, status: 'checked'})
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
  
  const debouncedIncrementalSpellCheck = debounce(() => {
      performSpellCheck(storage, editor)
    }, options.debounceTime || 1000)

  return new Plugin({
    key: iwProofreadPluginKey,

    state: {
      init: () => ({
        //nodeProofreadMap: new LockedSharedMap<string, import('./types').NodeProofread>(),
        //decorations: DecorationSet.empty,
      }),

      apply: (tr, oldState, oldEditorState, newEditorState) => {
        if (tr.docChanged && storage.isEnabled) {
          // 更新ignored errors的位置
          updateIgnoredErrorPositions(tr, storage)

          const { oldNodes, newNodes } = getChangedNodes([tr], oldEditorState, newEditorState)
          storage.nodeProofreadMap.withLock(async (map) => {
            // delete oldNodes from storage.nodeProofreadMap with lock
            console.log(`delete oldNodes from storage.nodeProofreadMap with lock`)
            oldNodes.forEach((node) => {
              const id = generateNodeKey(node.node)
              const nodeProofread = map.get(id)
              console.log(nodeProofread)
              if (nodeProofread) {
                if (nodeProofread.status !== 'checking'){
                  console.log({function: 'apply', text: nodeProofread.node.textContent, status: 'deleted'})
                  map.delete(id)
                }
                else {
                  console.log({function: 'apply', text: nodeProofread.node.textContent, status: 'mark deleted'})
                  nodeProofread.status = 'deleted'
                }
              }

              dumpNode(node.node)
            });

            // add newNodes to storage.nodeProofreadMap with lock
            console.log(`add newNodes to storage.nodeProofreadMap with lock`)
            newNodes.forEach((node) => {
              const id = generateNodeKey(node.node)
              const nodeProofread = map.get(id)
              if (!nodeProofread) {
                map.set(id, {
                  id: id,
                  node: node.node,
                  status: 'idle'
                })
                console.log({function: 'apply', text: node.node.textContent, status: 'idle'})
              } else {
                const oldStatus = nodeProofread.status
                if (nodeProofread.status === 'deleted') nodeProofread.status = 'idle'
                console.log({function: 'apply', text: node.node.textContent, status: nodeProofread.status, oldStatus})
              }

              dumpNode(node.node)
            });

          })

          debouncedIncrementalSpellCheck(storage, editor)
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