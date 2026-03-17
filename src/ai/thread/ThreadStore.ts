import type { AiSettings, AiThread } from '@/types/ai'
import { DEFAULT_AI_SETTINGS } from '@/types/ai'

const STORAGE_KEY_THREADS = 'iwriter-ai-threads'
const STORAGE_KEY_SETTINGS = 'iwriter-ai-settings'
const MAX_THREADS = 50

/**
 * ThreadStore — persists AI threads and settings to localStorage.
 *
 * Follows the same static-method pattern as StateStorage.ts.
 * Threads are stored sorted by updatedAt desc; capped at MAX_THREADS.
 */
export class ThreadStore {
  // ── Threads ──────────────────────────────────────────────────────────────

  static loadThreads(): AiThread[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_THREADS)
      if (!raw) return []
      const parsed = JSON.parse(raw) as AiThread[]
      // Sort newest first
      return parsed.sort((a, b) => b.updatedAt - a.updatedAt)
    } catch {
      return []
    }
  }

  static saveThread(thread: AiThread): void {
    try {
      const threads = this.loadThreads()
      const idx = threads.findIndex(t => t.id === thread.id)
      if (idx >= 0) {
        threads[idx] = thread
      } else {
        threads.unshift(thread)
      }
      // Enforce cap — keep the most recently updated threads
      const capped = threads
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_THREADS)
      localStorage.setItem(STORAGE_KEY_THREADS, JSON.stringify(capped))
    } catch (err) {
      console.error('[ThreadStore] Failed to save thread:', err)
    }
  }

  static deleteThread(id: string): void {
    try {
      const threads = this.loadThreads().filter(t => t.id !== id)
      localStorage.setItem(STORAGE_KEY_THREADS, JSON.stringify(threads))
    } catch (err) {
      console.error('[ThreadStore] Failed to delete thread:', err)
    }
  }

  static getThread(id: string): AiThread | null {
    return this.loadThreads().find(t => t.id === id) ?? null
  }

  static clearThreads(): void {
    localStorage.removeItem(STORAGE_KEY_THREADS)
  }

  // ── Settings ─────────────────────────────────────────────────────────────

  static loadSettings(): AiSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETTINGS)
      if (!raw) return { ...DEFAULT_AI_SETTINGS }
      return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_AI_SETTINGS }
    }
  }

  static saveSettings(settings: AiSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings))
    } catch (err) {
      console.error('[ThreadStore] Failed to save settings:', err)
    }
  }

  static updateSettings(partial: Partial<AiSettings>): void {
    const current = this.loadSettings()
    this.saveSettings({ ...current, ...partial })
  }
}
