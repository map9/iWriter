import Typo from 'typo-js'

let dictionary: any = null
let engineConfig: any = null

async function loadDictionary(language: string, dictionaryPath: string): Promise<void> {

  const affUrl = `${dictionaryPath}/${language}.aff`
  const dicUrl = `${dictionaryPath}/${language}.dic`

  const [aff, dic] = await Promise.all([
    fetch(affUrl).then(r => r.text()),
    fetch(dicUrl).then(r => r.text())
  ])

  dictionary = new Typo(language, aff, dic)
  console.log(`[spellCheckWorker] Dictionary loaded: ${language}`)
}

interface SpellError {
  offset: number
  length: number
  word: string
  message: string
  suggestions: string[]
  type: 'spelling' | 'grammar'
}

function checkText(text: string): SpellError[] {
  if (!dictionary) return []

  console.log('[spellCheckWorker] Checking text:', text)
  
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
        message: 'Possible spelling mistake',
        suggestions: dictionary.suggest(word),
        type: 'spelling'
      })
    }
  }

  return errors
}

// Worker 消息处理
self.onmessage = async (event) => {
  const { type, taskId, payload } = event.data

  try {
    switch (type) {
      case 'INIT_ENGINE': {
        try {
          engineConfig = payload.engineConfig
          console.log(`[spellCheckWorker] Initializing engine with language: ${engineConfig.language}`)
          await loadDictionary(engineConfig.language, engineConfig.dictionaryPath)

          console.log(`[spellCheckWorker] Engine ready, sending ENGINE_READY for task: ${taskId}`)
          self.postMessage({
            type: 'ENGINE_READY',
            taskId
          })
        } catch (error) {
          console.error('[spellCheckWorker] Failed to initialize engine:', error)
          self.postMessage({
            type: 'ERROR',
            taskId,
            error: `Failed to initialize engine: ${error instanceof Error ? error.message : String(error)}`
          })
        }
        break
      }

      case 'CHECK_NODE': {
        const start = performance.now()
        const nodeData = payload.nodeData
        const errors = checkText(nodeData.textContent || '')
        console.log({
          function: 'spellCheckWorker',
          taskId: taskId,
          text:nodeData.textContent,
          start,
          duration: performance.now() - start
        })

        self.postMessage({
          type: 'NODE_RESULT',
          taskId,
          result: {
            nodeId: payload.nodeId,
            nodeKey: JSON.stringify(nodeData),
            errors,
            checkedAt: Date.now(),
            processingTime: performance.now() - start
          }
        })
        break
      }

      case 'TERMINATE': {
        console.log('[spellCheckWorker] Terminating worker')
        self.close()
        break
      }

      default: {
        console.warn('[spellCheckWorker] Unknown message type:', type)
        self.postMessage({
          type: 'ERROR',
          taskId,
          error: 'Unknown message type'
        })
      }
    }
  } catch (err) {
    console.error('[spellCheckWorker] Error handling task:', err)
    self.postMessage({
      type: 'ERROR',
      taskId,
      error: `Failed to initialize engine: ${err instanceof Error ? err.message : String(err)}`
    })
  }
}
