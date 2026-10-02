import { GAME_IDS, SAVE_VERSION, type GameProgress, type PlayerSave, type Stars } from '../../types/save.ts'

export const STORAGE_KEY = 'tka:save:v1'

function createDefaultProgress(): GameProgress {
  return { bestStage: 0, stageStars: {}, playCount: 0 }
}

export function createDefaultSave(): PlayerSave {
  return {
    version: SAVE_VERSION,
    coins: 0,
    progress: Object.fromEntries(GAME_IDS.map((id) => [id, createDefaultProgress()])) as PlayerSave['progress'],
    inventory: [],
    settings: { soundEnabled: true, vibrationEnabled: true },
    updatedAt: 0,
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const nonNegInt = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback

function normalizeProgress(raw: unknown): GameProgress {
  const p = createDefaultProgress()
  if (!isObject(raw)) return p
  p.bestStage = nonNegInt(raw.bestStage, 0)
  p.playCount = nonNegInt(raw.playCount, 0)
  if (isObject(raw.stageStars)) {
    for (const [k, v] of Object.entries(raw.stageStars)) {
      const stage = Number(k)
      if (Number.isInteger(stage) && stage >= 1 && (v === 1 || v === 2 || v === 3)) p.stageStars[stage] = v as Stars
    }
  }
  return p
}

/** Merges a stored (possibly older or corrupt) value field-by-field onto a fresh default. */
export function normalizeSave(raw: unknown): PlayerSave {
  const save = createDefaultSave()
  if (!isObject(raw)) return save
  save.coins = nonNegInt(raw.coins, 0)
  if (isObject(raw.progress)) {
    for (const id of GAME_IDS) save.progress[id] = normalizeProgress(raw.progress[id])
  }
  if (Array.isArray(raw.inventory)) save.inventory = raw.inventory.filter((x): x is string => typeof x === 'string')
  if (isObject(raw.settings)) {
    if (typeof raw.settings.soundEnabled === 'boolean') save.settings.soundEnabled = raw.settings.soundEnabled
    if (typeof raw.settings.vibrationEnabled === 'boolean') save.settings.vibrationEnabled = raw.settings.vibrationEnabled
  }
  save.updatedAt = nonNegInt(raw.updatedAt, 0)
  return save
}

export function loadSave(): PlayerSave {
  try {
    const text = localStorage.getItem(STORAGE_KEY)
    return normalizeSave(text ? JSON.parse(text) : null)
  } catch {
    return createDefaultSave()
  }
}

export function saveSave(save: PlayerSave): void {
  save.updatedAt = Date.now()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save))
  } catch {
    // Storage full or blocked (private mode) — keep playing without persistence.
  }
}

/** Load → mutate → save in one step. Returns the saved object. */
export function updateSave(mutate: (save: PlayerSave) => void): PlayerSave {
  const save = loadSave()
  mutate(save)
  saveSave(save)
  return save
}

export function resetSave(): void {
  saveSave(createDefaultSave())
}
