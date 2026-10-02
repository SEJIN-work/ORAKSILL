import { NOTICES } from '../data/notices.ts'

/**
 * "Seen" marker for the notice bar's NEW badge. Kept in its own key (not PlayerSave): it's UI
 * state, not game progress, so 데이터 초기화 doesn't need to touch it and no SAVE_VERSION bump.
 */
const SEEN_KEY = 'tka:notice-seen'

export function latestNotice() {
  return NOTICES[0]
}

export function hasUnseenNotice(): boolean {
  const latest = NOTICES[0]
  if (!latest) return false
  try {
    return localStorage.getItem(SEEN_KEY) !== latest.id
  } catch {
    return false
  }
}

export function markNoticesSeen(): void {
  const latest = NOTICES[0]
  if (!latest) return
  try {
    localStorage.setItem(SEEN_KEY, latest.id)
  } catch {
    // Storage blocked — the badge just keeps showing.
  }
}
