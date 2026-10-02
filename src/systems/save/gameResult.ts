import type { GameId, Stars } from '../../types/save.ts'
import { REPLAY_REWARD_RATE } from '../economy.ts'
import { updateSave } from '../storage/storage.ts'

export interface AppliedResult {
  /** Coins actually added to the wallet (after the replay rate). */
  coinsAwarded: number
  isReplay: boolean
  /** True when this attempt raised an existing star record. */
  improvedStars: boolean
  /** Best star rating for this stage after merging (0 = never cleared). */
  bestStars: Stars | 0
}

/** The one place a finished attempt's reward + progress gets merged into the save. */
export function applyGameResult(
  gameId: GameId,
  stage: number,
  result: { cleared: boolean; coinsEarned: number; stars?: Stars },
): AppliedResult {
  const applied: AppliedResult = { coinsAwarded: 0, isReplay: false, improvedStars: false, bestStars: 0 }
  updateSave((s) => {
    const p = s.progress[gameId]
    applied.isReplay = stage <= p.bestStage
    applied.bestStars = p.stageStars[stage] ?? 0
    if (!result.cleared) return

    const coins = Math.max(0, Math.floor(result.coinsEarned * (applied.isReplay ? REPLAY_REWARD_RATE : 1)))
    s.coins += coins
    applied.coinsAwarded = coins
    if (stage > p.bestStage) p.bestStage = stage

    const stars = result.stars ?? 1
    const prev = p.stageStars[stage] ?? 0
    if (stars > prev) {
      p.stageStars[stage] = stars
      applied.improvedStars = prev > 0
    }
    applied.bestStars = p.stageStars[stage]
  })
  return applied
}

/** Counts an attempt start (for stats). */
export function recordAttempt(gameId: GameId): void {
  updateSave((s) => {
    s.progress[gameId].playCount += 1
  })
}

/** Skip ticket: marks a not-yet-cleared stage as cleared with 1 star and no coins. */
export function applySkip(gameId: GameId, stage: number): void {
  updateSave((s) => {
    const p = s.progress[gameId]
    if (stage > p.bestStage) p.bestStage = stage
    if (!p.stageStars[stage]) p.stageStars[stage] = 1
  })
}
