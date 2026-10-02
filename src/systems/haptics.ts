import { loadSave } from './storage/storage.ts'

/** navigator.vibrate wrapper gated on settings.vibrationEnabled; no-ops where unsupported. */
export function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return
  if (!loadSave().settings.vibrationEnabled) return
  try {
    navigator.vibrate(pattern)
  } catch {
    // Some browsers throw if called without a recent user gesture.
  }
}
