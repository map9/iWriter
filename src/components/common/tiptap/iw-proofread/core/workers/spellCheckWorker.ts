// 直接使用 import，让 Vite 处理模块
import workerpool from 'workerpool'
import Typo from 'typo-js'

// 类型定义
export interface SpellError {
  offset: number // 相对于node开始位置的偏移
  length: number
  word: string
  suggestions: string[]
  message?: string
  type?: 'spelling' | 'grammar'
}

interface NodeSpellResult {
  nodeId: string
  nodeKey: string
  errors: SpellError[]
  checkedAt: number
}

interface SerializedNode {
  type: string
  text?: string
  textContent?: string
  attrs?: any
  marks?: any[]
}

let dictionary: any = null

async function loadDictionary(language: string, dictionaryPath: string): Promise<void> {
  const affUrl = `${dictionaryPath}/${language}/index.aff`
  const dicUrl = `${dictionaryPath}/${language}/index.dic`

  const [aff, dic] = await Promise.all([
    fetch(affUrl).then(r => r.text()),
    fetch(dicUrl).then(r => r.text())
  ])

  dictionary = new Typo(language, aff, dic)
}

function checkText(text: string): SpellError[] {
  if (!dictionary) return []

  const errors: SpellError[] = []
  const wordRegex = /\b\w+\b/g
  let match: RegExpExecArray | null

  while ((match = wordRegex.exec(text)) !== null) {
    const word = match[0]
    const offset = match.index
    const length = word.length

    if (!dictionary.check(word)) {
      errors.push({
        offset,
        length,
        word,
        suggestions: dictionary.suggest(word),
      })
    }
  }

  return errors
}

// Workerpool 导出的函数
async function initEngine(config: { language: string; dictionaryPath: string }): Promise<void> {
  await loadDictionary(config.language, config.dictionaryPath)
  console.log(`[spellCheckWorker] Engine ready, dictionary loaded for ${config.language}`)
}

function checkSpelling(nodeData: SerializedNode, nodeId: string, nodeKey: string): NodeSpellResult {
  const start = performance.now()
  const errors = checkText(nodeData.textContent || '')
  const duration = performance.now() - start

  console.log({
    function: 'spellCheckWorker.checkSpelling',
    nodeId: nodeId,
    text: nodeData.textContent,
    errors: errors,
    duration
  })

  return {
    nodeId,
    nodeKey,
    errors,
    checkedAt: Date.now(),
  }
}

// 批量检查函数
function batchCheckSpelling(nodes: { nodeData: SerializedNode; nodeId: string; nodeKey: string }[]): NodeSpellResult[] {
  return nodes.map(({ nodeData, nodeId, nodeKey }) => checkSpelling(nodeData, nodeId, nodeKey))
}

// 导出 workerpool 可调用的函数
workerpool.worker({
  initEngine,
  checkSpelling,
  batchCheckSpelling
})