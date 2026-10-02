/**
 * Persistent player save shape (PRD 8.4). One shared object for all games —
 * coins are a single economy, never per-game wallets.
 * When this shape changes, bump SAVE_VERSION and extend normalizeSave() in storage.ts.
 */
export const SAVE_VERSION = 1

export type GameId = 'tower-defense' | 'color-parking' | 'stress-breaker' | 'merge-numbers'

export const GAME_IDS: GameId[] = ['tower-defense', 'color-parking', 'stress-breaker', 'merge-numbers']

/** Star rating for a cleared stage (PRD 8.2). */
export type Stars = 1 | 2 | 3

export interface GameProgress {
  /** Highest stage cleared (0 = none). Stages 1..bestStage+1 are playable. */
  bestStage: number
  /** Best star rating per cleared stage, keyed by stage number. */
  stageStars: Record<number, Stars>
  /** Number of attempts started. */
  playCount: number
}

export interface Settings {
  soundEnabled: boolean
  vibrationEnabled: boolean
}

export interface PlayerSave {
  version: number
  coins: number
  progress: Record<GameId, GameProgress>
  /** Owned item ids; duplicates represent quantity. */
  inventory: string[]
  settings: Settings
  updatedAt: number
}
