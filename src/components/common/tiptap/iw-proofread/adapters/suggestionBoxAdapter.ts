// 建议框相关类型定义
interface Problem {
	from: number
	to: number
	msg: string
	shortmsg: string
	type: string
	replacements: string[]
}

interface Position {
	x: number
	y: number
}

type OnReplaceCallback = (value: string) => void
type OnIgnoreCallback = () => void
type OnCloseCallback = () => void

interface SuggestionBoxOptions {
	error: Problem
	position: Position
	onReplace: OnReplaceCallback
	onIgnore: OnIgnoreCallback
	onClose: OnCloseCallback
}

type Destroy = {
	destroy: () => void
}

export type CreateSuggestionBox = (options: SuggestionBoxOptions) => Destroy

/**
 * 创建适配TipTap的建议框
 * 这个函数创建一个与原有TipTap扩展UI风格一致的建议框
 */
export function createTipTapSuggestionBox(
	uiStrings?: { noSuggestions?: string }
): CreateSuggestionBox {
	return ({ error, position, onReplace, onIgnore, onClose }) => {
		// 创建建议框容器
		const suggestionBox = document.createElement('div')
		suggestionBox.className = 'proofread-suggestion iw-spell-check-suggestions'
		suggestionBox.style.cssText = `
			position: absolute;
			left: ${position.x}px;
			top: ${position.y}px;
			background: white;
			border: 1px solid #ddd;
			border-radius: 4px;
			box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
			z-index: 1000;
			min-width: 200px;
			max-width: 300px;
		`

		// 创建内容
		const content = createSuggestionContent(error, onReplace, onIgnore, uiStrings)
		suggestionBox.appendChild(content)

		// 添加到页面
		document.body.appendChild(suggestionBox)

		// 点击外部关闭
		const handleOutsideClick = (event: MouseEvent) => {
			if (!suggestionBox.contains(event.target as Node)) {
				onClose()
			}
		}

		// 键盘事件处理
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				onClose()
			}
		}

		setTimeout(() => {
			document.addEventListener('click', handleOutsideClick)
			document.addEventListener('keydown', handleKeyDown)
		}, 0)

		function destroy() {
			document.removeEventListener('click', handleOutsideClick)
			document.removeEventListener('keydown', handleKeyDown)
			if (suggestionBox.parentNode) {
				suggestionBox.parentNode.removeChild(suggestionBox)
			}
		}

		return { destroy }
	}
}

/**
 * 创建建议框内容
 */
function createSuggestionContent(
	error: Problem,
	onReplace: (value: string) => void,
	onIgnore: () => void,
	uiStrings?: { noSuggestions?: string }
) {
	const container = document.createElement('div')
	container.style.cssText = 'padding: 8px;'

	// 错误信息
	if (error.msg || error.shortmsg) {
		const messageDiv = document.createElement('div')
		messageDiv.className = 'error-message'
		messageDiv.style.cssText = `
			font-size: 12px;
			color: #666;
			margin-bottom: 8px;
			padding: 4px 8px;
			background: #f5f5f5;
			border-radius: 3px;
		`
		messageDiv.textContent = error.shortmsg || error.msg
		container.appendChild(messageDiv)
	}

	// 建议列表
	if (error.replacements && error.replacements.length > 0) {
		const suggestionsList = document.createElement('ul')
		suggestionsList.className = 'suggestions-list'
		suggestionsList.style.cssText = `
			list-style: none;
			margin: 0;
			padding: 0;
			max-height: 200px;
			overflow-y: auto;
		`

		error.replacements.forEach((replacement: string) => {
			const li = document.createElement('li')
			li.className = 'suggestion-item'
			li.style.cssText = `
				padding: 6px 12px;
				cursor: pointer;
				border-radius: 3px;
				transition: background-color 0.2s;
			`
			li.textContent = replacement

			li.addEventListener('mouseenter', () => {
				li.style.backgroundColor = '#e6f3ff'
			})

			li.addEventListener('mouseleave', () => {
				li.style.backgroundColor = 'transparent'
			})

			li.addEventListener('click', () => {
				onReplace(replacement)
			})

			suggestionsList.appendChild(li)
		})

		container.appendChild(suggestionsList)
	} else {
		// 无建议时的显示
		const noSuggestions = document.createElement('div')
		noSuggestions.className = 'no-suggestions'
		noSuggestions.style.cssText = `
			font-style: italic;
			color: #999;
			text-align: center;
			padding: 12px;
		`
		noSuggestions.textContent = uiStrings?.noSuggestions || 'No suggestions found'
		container.appendChild(noSuggestions)
	}

	// 操作按钮
	const actionsDiv = document.createElement('div')
	actionsDiv.className = 'suggestion-actions'
	actionsDiv.style.cssText = `
		border-top: 1px solid #eee;
		margin-top: 8px;
		padding-top: 8px;
		text-align: right;
	`

	// 忽略按钮
	const ignoreButton = document.createElement('button')
	ignoreButton.className = 'ignore-button'
	ignoreButton.textContent = 'Ignore'
	ignoreButton.style.cssText = `
		background: none;
		border: 1px solid #ddd;
		border-radius: 3px;
		padding: 4px 12px;
		cursor: pointer;
		font-size: 12px;
		margin-left: 8px;
		transition: all 0.2s;
	`

	ignoreButton.addEventListener('mouseenter', () => {
		ignoreButton.style.backgroundColor = '#f5f5f5'
	})

	ignoreButton.addEventListener('mouseleave', () => {
		ignoreButton.style.backgroundColor = 'transparent'
	})

	ignoreButton.addEventListener('click', () => {
		onIgnore()
	})

	actionsDiv.appendChild(ignoreButton)
	container.appendChild(actionsDiv)

	return container
}

/**
 * 默认的建议框样式CSS
 * 这些样式可以被外部CSS覆盖
 */
export const defaultSuggestionBoxCSS = `
.iw-spell-check-suggestions {
	font-family: system-ui, -apple-system, sans-serif;
	font-size: 14px;
	line-height: 1.4;
}

.iw-spell-check-suggestions .suggestion-item:hover {
	background-color: #e6f3ff !important;
}

.iw-spell-check-suggestions .ignore-button:hover {
	background-color: #f5f5f5 !important;
	border-color: #bbb;
}

.iw-spell-check-suggestions .suggestions-list::-webkit-scrollbar {
	width: 6px;
}

.iw-spell-check-suggestions .suggestions-list::-webkit-scrollbar-track {
	background: #f1f1f1;
	border-radius: 3px;
}

.iw-spell-check-suggestions .suggestions-list::-webkit-scrollbar-thumb {
	background: #c1c1c1;
	border-radius: 3px;
}

.iw-spell-check-suggestions .suggestions-list::-webkit-scrollbar-thumb:hover {
	background: #a8a8a8;
}
`