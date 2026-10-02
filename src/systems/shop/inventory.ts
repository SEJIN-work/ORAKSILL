import { loadSave, updateSave } from '../storage/storage.ts'

/** Owned-items inventory: a flat list of item ids (duplicates = quantity). */

export function getItemCount(itemId: string): number {
  return loadSave().inventory.filter((id) => id === itemId).length
}

export function addItem(itemId: string): void {
  updateSave((s) => {
    s.inventory.push(itemId)
  })
}

/** Removes one copy. Returns whether one was owned. */
export function consumeItem(itemId: string): boolean {
  let ok = false
  updateSave((s) => {
    const i = s.inventory.indexOf(itemId)
    if (i >= 0) {
      s.inventory.splice(i, 1)
      ok = true
    }
  })
  return ok
}
