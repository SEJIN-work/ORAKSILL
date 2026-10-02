import type { Settings } from '../types/save.ts'
import { loadSave, updateSave } from './storage/storage.ts'

export function getSettings(): Settings {
  return loadSave().settings
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Settings {
  return updateSave((s) => {
    s.settings[key] = value
  }).settings
}
