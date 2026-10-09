import { searchInputSchema } from '~~/shared/schemas/report'
import type { Platform } from '~~/shared/types'

export interface PlayerSearchHistoryEntry {
  name: string
  platform: Platform
}

const storageKey = 'pubg-droplog:search-history'
const maxEntries = 10

export function usePlayerSearchHistory() {
  const entries = ref<PlayerSearchHistoryEntry[]>([])

  function read() {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
      const valid: PlayerSearchHistoryEntry[] = []
      if (Array.isArray(stored)) {
        for (const item of stored) {
          const result = searchInputSchema.safeParse(item)
          if (!result.success || result.data.name.includes(';')) continue
          if (
            valid.some(
              (entry) => entry.name === result.data.name && entry.platform === result.data.platform,
            )
          )
            continue
          valid.push(result.data)
          if (valid.length === maxEntries) break
        }
      }
      entries.value = valid
    } catch {
      // Search remains available when storage is blocked or contains invalid JSON.
    }
  }

  function persist() {
    try {
      if (entries.value.length) localStorage.setItem(storageKey, JSON.stringify(entries.value))
      else localStorage.removeItem(storageKey)
    } catch {
      // Keep this visit's history usable even when browser storage is unavailable.
    }
  }

  function remember(entry: PlayerSearchHistoryEntry) {
    read()
    entries.value = [
      entry,
      ...entries.value.filter(
        (item) => item.name !== entry.name || item.platform !== entry.platform,
      ),
    ].slice(0, maxEntries)
    persist()
  }

  function remove(entry: PlayerSearchHistoryEntry) {
    entries.value = entries.value.filter(
      (item) => item.name !== entry.name || item.platform !== entry.platform,
    )
    persist()
  }

  function clear() {
    entries.value = []
    persist()
  }

  onMounted(read)

  return { entries, remember, remove, clear }
}
