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

const createNodeDecorations = (
	doc: ProseMirrorNode,
	storage: iwProofreadStorage
): DecorationSet => {
	const decorations: Decoration[] = []

  storage.nodeProofreadMap.withLock((map)=>{
    
    for (const nodep of map.values()) {
      if (nodep.status !== 'checked' || !nodep.result || (nodep.result.errors.length === 0)) continue

      doc.descendants((node, pos) => {
        //if (shouldNotCheckNode(node)) return false
        //if (!containsOnlyTextNodes(node)) return true

        if (generateNodeKey(node) === nodep.result!.id) {
          for (const error of nodep.result!.errors) {
            const from = pos + 1 + error.offset
            const to = from + error.length

            if (from >= 0 && to <= doc.content.size && from < to) {
              decorations.push(
                Decoration.inline(
                  from,
                  to,
                  { class: getErrorClass(error.type) },
                  {
                    error,
                    id: nodep.result!.id,
                  }
                )
              )
            }
          }
        }
      })
    }

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

			// 移除该装饰
			removeDecorationAt(from, to, storage, view)

			view.dispatch(tr)
			app.destroy()
		},
		onIgnore: () => {
			const { from, to } = decoration
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

const getChangedNodes = (transactions: Transaction[], state: EditorState, isNew: boolean = false) => {
	let changeSet = ChangeSet.create(state.doc);

	console.log(isNew? 'getNewChangedNodes' : 'getOldChangedNodes')
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
			if (shouldNotCheckNode(node)) return false
			if (!containsOnlyTextNodes(node)) return true

			changeNodes.push({node, pos})
			return false
		});
	}
	return changeNodes
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
      const nodeResult = map.get(id)
      if (!nodeResult) {
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
      const node = map.get(value.id)
      if (node) {
        if (node.status === 'deleted') {
          map.delete(node.id)
        } else {
          node.status = 'checked'
          if (value.errors && value.errors.length > 0) {
            node.result = value
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
          const oldNodes = getChangedNodes([tr], oldEditorState, false)
          const newNodes = getChangedNodes([tr], newEditorState, true)
          storage.nodeProofreadMap.withLock(async (map) => {
            // delete oldNodes from storage.nodeProofreadMap with lock
            oldNodes.forEach((node) => {
              const id = generateNodeKey(node.node)
              const nodeResult = map.get(id)
              if (nodeResult) {
                if (nodeResult.status !== 'checking'){
                  map.delete(id)
                }
                else {
                  nodeResult.status = 'deleted'
                }
              }

              dumpNode(node.node)
            });
            
            // add newNodes to storage.nodeProofreadMap with lock
            newNodes.forEach((node) => {
              const id = generateNodeKey(node.node)
              const nodeResult = map.get(id)
              if (!nodeResult) {
                map.set(id, {
                  id: id,
                  node: node.node,
                  status: 'idle'
                })
              } else {
                console.log('already has a checked node, maybe a same text.')
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