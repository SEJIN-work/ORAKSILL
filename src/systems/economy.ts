import type { Stars } from '../types/save.ts'

/** Base coins for clearing a stage (before per-game bonuses). */
export function stageReward(stage: number): number {
  return 20 + stage * 10
}

/**
 * Converts a game-specific performance ratio (0..1, higher = better) into 1-3 stars.
 * `two`/`three` are the minimum ratios for 2 and 3 stars.
 */
export function starsFromRatio(ratio: number, two: number, three: number): Stars {
  if (ratio >= three) return 3
  if (ratio >= two) return 2
  return 1
}

/** Extra coins for a better star rating, on top of the base reward. */
export function starBonus(base: number, stars: Stars): number {
  return stars === 3 ? Math.round(base * 0.5) : stars === 2 ? Math.round(base * 0.2) : 0
}

/** Re-clearing an already-cleared stage pays this fraction, to keep the shop meaningful (PRD 13). */
export const REPLAY_REWARD_RATE = 0.5
