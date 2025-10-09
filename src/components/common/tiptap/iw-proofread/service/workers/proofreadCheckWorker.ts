import workerpool from 'workerpool'
import Typo from 'typo-js'

interface ProofreadError {
  offset: number // 相对于node开始位置的偏移
  length: number
  word: string
  suggestions: string[]
  message?: string
  shortMessage?: string
  type?: 'spelling' | 'grammar' | 'style' | 'misc'
}

interface NodeProofreadResult {
  id: string
  errors: ProofreadError[]
  checkedAt: number
}

type ProofreadEngineType = 'typo' | 'languagetool' | 'custom'

interface TypoEngineOptions {
  dictionaryPath: string
}

interface LanguageToolEngineOptions {
  apiUrl?: string
  apiKey?: string
  timeout?: number
}

interface ProofreadEngineConfig {
  type: ProofreadEngineType
  language: string
  engineOptions?: TypoEngineOptions | LanguageToolEngineOptions | Record<string, unknown>
}

// ===== 引擎抽象接口 =====
interface ProofreadEngine {
  init(config: ProofreadEngineConfig): Promise<void>
  check(text: string): Promise<ProofreadError[]>
}

// ===== Typo.js 引擎实现 =====
class TypoEngine implements ProofreadEngine {
  private dictionary: Typo | null = null
  private language = 'en'

  async init(config: ProofreadEngineConfig): Promise<void> {
    this.language = config.language
    const options = config.engineOptions as TypoEngineOptions | undefined

    if (!options?.dictionaryPath) {
      throw new Error('TypoEngine: dictionaryPath is required')
    }

    const affUrl = `${options.dictionaryPath}/${this.language}/index.aff`
    const dicUrl = `${options.dictionaryPath}/${this.language}/index.dic`

    const [aff, dic] = await Promise.all([
      fetch(affUrl).then(r => r.text()),
      fetch(dicUrl).then(r => r.text())
    ])

    this.dictionary = new Typo(this.language, aff, dic)
    console.log(`[TypoEngine] Dictionary loaded for ${this.language}`)
  }

  async check(text: string): Promise<ProofreadError[]> {
    if (!this.dictionary) return []

    const errors: ProofreadError[] = []
    const words = this.getWords(text)

    for (const {word, offset, length} of words) {
      if (!this.dictionary.check(word)) {
        errors.push({
          offset,
          length,
          word,
          suggestions: this.dictionary.suggest(word),
          type: 'spelling'
        })
      }
    }

    return errors
  }

  private getWords(text: string): Array<{word: string, offset: number, length: number}> {
    const words: Array<{word: string, offset: number, length: number}> = []

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof Intl !== 'undefined' && (Intl as any).Segmenter) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const segmenter = new (Intl as any).Segmenter(this.language, { granularity: 'word' })
        const segments = segmenter.segment(text)

        for (const segment of segments) {
          if (segment.isWordLike) {
            words.push({
              word: segment.segment,
              offset: segment.index,
              length: segment.segment.length
            })
          }
        }
      } catch (error) {
        console.warn('[TypoEngine] Intl.Segmenter failed, falling back to regex:', error)
        return this.getWordsWithRegex(text)
      }
    } else {
      return this.getWordsWithRegex(text)
    }

    return words
  }

  private getWordsWithRegex(text: string): Array<{word: string, offset: number, length: number}> {
    const words: Array<{word: string, offset: number, length: number}> = []
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
}

// ===== LanguageTool 引擎实现 =====
class LanguageToolEngine implements ProofreadEngine {
  private misspellingCategories = [
    'TYPOS', 'CONFUSED_WORDS', 'NONSTANDARD_PHRASES', 'MULTITOKEN_SPELLING', 
  ]

  private grammarCategories = [
    'GRAMMAR', 'COLLOCATION', 
  ]

  private styleCategories = [
    'STYLE', 'REDUNDANCY', 'REPETITIONS_STYLE', 'PLAIN_ENGLISH',
    'WIKIPEDIA', 'CREATIVE_WRITING', 'TON_ACADEMIC', 
  ]

  private miscCategories = [
    // 排版类型的错误
    'TYPOGRAPHY', 'CASING', 'PUNCTUATION',
    // 组合词错误
    'COMPOUNDING',
    // 专用名词大小写错误
    'PROPER_NOUNS',
    // 语义不明错误
    'SEMANTICS',
    'MISC',
  ]

  private apiUrl = 'https://api.languagetool.org/v2/check'
  private language = 'en'
  private apiKey?: string
  private timeout = 5000

  async init(config: ProofreadEngineConfig): Promise<void> {
    this.language = config.language
    const options = config.engineOptions as LanguageToolEngineOptions | undefined

    if (options?.apiUrl) {
      this.apiUrl = options.apiUrl
    }
    if (options?.apiKey) {
      this.apiKey = options.apiKey
    }
    if (options?.timeout) {
      this.timeout = options.timeout
    }

    console.log(`[LanguageToolEngine] Initialized for ${this.language}, API: ${this.apiUrl}`)
  }

  async check(text: string): Promise<ProofreadError[]> {
    if (!text || text.trim().length === 0) return []

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.timeout)

      const formData = new URLSearchParams({
        text: text,
        language: this.language
      })

      const headers: HeadersInit = {
        'Content-Type': 'application/x-www-form-urlencoded'
      }

      if (this.apiKey) {
        headers['Authorization'] = `Bearer ${this.apiKey}`
      }

      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: headers,
        body: formData.toString(),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`LanguageTool API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()

      return this.convertMatches(data.matches || [], text)

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        console.error('[LanguageToolEngine] Request timeout')
      } else {
        console.error('[LanguageToolEngine] Check failed:', error)
      }
      return []
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertMatches(matches: any[], text: string): ProofreadError[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return matches.map((match: any) => ({
      offset: match.offset,
      length: match.length,
      word: text.substring(match.offset, match.offset + match.length),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      suggestions: (match.replacements || []).map((r: any) => r.value).slice(0, 10),
      message: match.message,
      shortMessage: match.shortMessage,
      type: this.detectErrorType(match.rule?.category?.id)
    }))
  }

  private detectErrorType(categoryId?: string): 'spelling' | 'grammar' | 'style' | 'misc' {
    if (!categoryId) return 'spelling'

    if (this.misspellingCategories.includes(categoryId.toUpperCase())) {
      return 'spelling'
    } else if (this.grammarCategories.includes(categoryId.toUpperCase())) {
      return 'grammar'
    } else if (this.styleCategories.includes(categoryId.toUpperCase())) {
      return 'style'
    } else if (this.miscCategories.includes(categoryId.toUpperCase())) {
      return 'misc'
    } else {
      console.warn(`Can't find categoryId: ${categoryId}.`)
      return 'spelling'
    }
  }
}

// ===== 引擎工厂 =====
function createEngine(config: ProofreadEngineConfig): ProofreadEngine {
  switch (config.type) {
    case 'typo':
      return new TypoEngine()
    case 'languagetool':
      return new LanguageToolEngine()
    case 'custom':
      throw new Error('Custom engine not implemented')
    default:
      throw new Error(`Unknown engine type: ${config.type}`)
  }
}

// ===== Worker 全局状态 =====
let engine: ProofreadEngine | null = null

// ===== Worker 导出函数 =====
async function initEngine(config: ProofreadEngineConfig): Promise<void> {
  engine = createEngine(config)
  await engine.init(config)
  console.log(`[proofreadCheckWorker] Engine ready: ${config.type}, language: ${config.language}`)
}

async function proofread(id: string, text: string): Promise<NodeProofreadResult> {
  if (!engine) {
    throw new Error('Engine not initialized')
  }

  const start = performance.now()
  const errors = await engine.check(text || '')
  const duration = performance.now() - start

  console.log({
    function: 'proofreadCheckWorker.proofread',
    id: id,
    text: text.substring(0, 50),
    errorCount: errors.length,
    duration
  })

  return {
    id,
    errors,
    checkedAt: Date.now(),
  }
}

async function batchProofread(nodes: {id: string; text: string}[]): Promise<NodeProofreadResult[]> {
  return Promise.all(nodes.map(({id, text}) => proofread(id, text)))
}

// 导出 workerpool 可调用的函数
workerpool.worker({
  initEngine,
  proofread,
  batchProofread
})
