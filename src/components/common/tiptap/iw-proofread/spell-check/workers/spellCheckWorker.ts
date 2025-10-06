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
  id: string
  errors: SpellError[]
  checkedAt: number
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

// 使用 Intl.Segmenter 提取单词
function getWords(text: string): Array<{word: string, offset: number, length: number}> {
  const words: Array<{word: string, offset: number, length: number}> = []

  // 从字典中获取语言，如果没有则默认为 'en'
  const language = dictionary?.locale || 'en'

  // 检查是否支持 Intl.Segmenter (现代浏览器)
  if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
  //if (false) {
    try {
      // 使用 Intl.Segmenter 进行精确的单词分割，使用正确的语言
      const segmenter = new (Intl as any).Segmenter(language, { granularity: 'word' })
      const segments = segmenter.segment(text)

      for (const segment of segments) {
        // 只处理真正的单词（不包括空格、标点等）
        if (segment.isWordLike) {
          words.push({
            word: segment.segment,
            offset: segment.index,
            length: segment.segment.length
          })
        }
      }
    } catch (error) {
      console.warn('[spellCheckWorker] Intl.Segmenter failed, falling back to regex:', error)
      return getWordsWithRegex(text)
    }
  } else {
    // 回退到正则表达式方法
    return getWordsWithRegex(text)
  }

  return words
}

// 回退的正则表达式方法（移除单词边界 \b 以更好支持Unicode）
function getWordsWithRegex(text: string): Array<{word: string, offset: number, length: number}> {
  const words: Array<{word: string, offset: number, length: number}> = []
  // 不使用 \b，直接匹配Unicode字母、数字和连接符
  const wordRegex = /[\p{L}\p{N}\p{Pc}]+/gu
  let match: RegExpExecArray | null

  while ((match = wordRegex.exec(text)) !== null) {
    words.push({
      word: match[0],
      offset: match.index,
      length: match[0].length
    })
  }

  return words
}

function checkText(text: string): SpellError[] {
  if (!dictionary) return []

  const errors: SpellError[] = []
  const words = getWords(text)

  for (const {word, offset, length} of words) {
    if (!dictionary.check(word)) {
      errors.push({
        offset,
        length,
        word,
        suggestions: dictionary.suggest(word),
        type: 'spelling'
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

function checkSpelling(id: string, text: string): NodeSpellResult {
  const start = performance.now()
  const errors = checkText(text || '')
  const duration = performance.now() - start

  console.log({
    function: 'spellCheckWorker.checkSpelling',
    id: id,
    text: text,
    errors: errors,
    duration
  })

  return {
    id,
    errors,
    checkedAt: Date.now(),
  }
}

// 批量检查函数
function batchCheckSpelling(nodes: {  id: string; text: string }[]): NodeSpellResult[] {
  return nodes.map(({ id, text }) => checkSpelling(id, text))
}

// 导出 workerpool 可调用的函数
workerpool.worker({
  initEngine,
  checkSpelling,
  batchCheckSpelling
})