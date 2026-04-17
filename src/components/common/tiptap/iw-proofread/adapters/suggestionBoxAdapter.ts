// 建议框相关类型定义
interface Problem {
	from: number
	to: number
	message: string
	shortMessage: string
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
	scrollContainer?: HTMLElement | null
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
 * 这个函数创建一个与TipTap扩展UI风格完全一致的建议框
 * 样式定义在 src/assets/styles/style.scss 中
 */
export function createTipTapSuggestionBox(
	uiStrings?: { noSuggestions?: string }
): CreateSuggestionBox {
	return ({ error, position, scrollContainer, onReplace, onIgnore, onClose }) => {
		// 创建建议框容器 - 使用统一的样式类
		const suggestionWidget = document.createElement('div')
		suggestionWidget.className = 'tiptap proofread-suggestion'
		const suggestionWidgetWrapper = document.createElement('div')
		suggestionWidgetWrapper.className = 'toolbar-wrapper'
		suggestionWidget.appendChild(suggestionWidgetWrapper)

		const suggestionPanel = document.createElement('div')
		suggestionPanel.className = 'toolbar-controls fixed'
		suggestionPanel.style.cssText = `
			left: ${position.x}px;
			top: ${position.y}px;
			min-width: 200px;
			max-width: 300px;
		`
		// 创建内容
		const content = createSuggestionContent(error, onReplace, onIgnore, uiStrings)
		suggestionPanel.appendChild(content)

		// 监听滚动事件
    const handleScroll = () => {
      // 滚动时关闭 suggestion box
      onClose()
    }

		// 点击外部关闭
		const handleOutsideClick = (event: MouseEvent) => {
			if (!suggestionPanel.contains(event.target as Node)) {
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
				
				if (scrollContainer) {
	        scrollContainer.addEventListener('scroll', handleScroll)
	      }
	      window.addEventListener('scroll', handleScroll, true)
			}, 0)

		function destroy() {
				document.removeEventListener('click', handleOutsideClick)
				document.removeEventListener('keydown', handleKeyDown)
				
				if (scrollContainer) {
	        scrollContainer.removeEventListener('scroll', handleScroll)
	      }
	      window.removeEventListener('scroll', handleScroll, true)

			if (suggestionWidget.parentNode) {
				suggestionWidget.parentNode.removeChild(suggestionWidget)
			}
		}

		suggestionWidgetWrapper.appendChild(suggestionPanel)
		document.body.appendChild(suggestionWidget)

		return { destroy }
	}
}

/**
 * 创建建议框内容
 * 使用与TipTap工具条一致的样式系统
 */
function createSuggestionContent(
	error: Problem,
	onReplace: (value: string) => void,
	onIgnore: () => void,
	uiStrings?: { noSuggestions?: string }
) {
	const container = document.createElement('div')
	container.className = 'control-group flex-col'

	// 错误信息
	if (error.message || error.shortMessage) {
		const messageDiv = document.createElement('div')
		messageDiv.className = 'control-text'
		messageDiv.textContent = error.message || error.shortMessage
		container.appendChild(messageDiv)
	}

	// 建议列表容器
	const suggestionsContainer = document.createElement('div')
	suggestionsContainer.className = 'control-group flex-wrap flex-row'

	// 添加替换建议
	if (error.replacements && error.replacements.length > 0) {
		error.replacements.forEach((replacement: string) => {
			// 使用 span 模拟按钮，采用 control-button 的蓝色样式
			const suggestionButton = document.createElement('span')
			suggestionButton.className = 'control-button inline-flex'
			suggestionButton.textContent = replacement.trim().length === 0? '␣' : replacement
			suggestionButton.setAttribute('role', 'button')
			suggestionButton.setAttribute('tabindex', '0')

			suggestionButton.addEventListener('click', () => {
				onReplace(replacement)
			})

			// 键盘支持
			suggestionButton.addEventListener('keydown', (e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault()
					onReplace(replacement)
				}
			})

			suggestionsContainer.appendChild(suggestionButton)
		})
	}

	// 忽略按钮 - 与建议按钮放在一起，作为选项之一
	const ignoreButton = document.createElement('span')
	ignoreButton.className = 'control-button inline-flex cancel-button'
	ignoreButton.textContent = 'Ignore'
	ignoreButton.setAttribute('role', 'button')
	ignoreButton.setAttribute('tabindex', '0')

	ignoreButton.addEventListener('click', () => {
		onIgnore()
	})

	// 键盘支持
	ignoreButton.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault()
			onIgnore()
		}
	})

	suggestionsContainer.appendChild(ignoreButton)

	// 如果没有任何建议，显示提示信息
	if (!error.replacements || error.replacements.length === 0) {
		const noSuggestions = document.createElement('div')
		noSuggestions.className = 'control-text warning'
		noSuggestions.textContent = uiStrings?.noSuggestions || 'No suggestions found'
		container.appendChild(noSuggestions)
	}

	container.appendChild(suggestionsContainer)

	return container
}
