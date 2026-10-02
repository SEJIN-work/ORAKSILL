import { loadSave, updateSave } from '../storage/storage.ts'

/** Shared coin economy (PRD 8.1): one wallet across every game. */

export function getCoins(): number {
  return loadSave().coins
}

/** Returns the new balance. */
export function addCoins(amount: number): number {
  const n = Math.max(0, Math.floor(amount))
  return updateSave((s) => {
    s.coins += n
  }).coins
}

/** Deducts if affordable. Returns whether it succeeded. */
export function spendCoins(amount: number): boolean {
  const n = Math.max(0, Math.floor(amount))
  let ok = false
  updateSave((s) => {
    if (s.coins >= n) {
      s.coins -= n
      ok = true
    }
  })
  return ok
}
