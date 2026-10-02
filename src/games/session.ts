import * as Phaser from 'phaser'
import type { Stars } from '../types/save.ts'

/**
 * Contract between GameRunner (React) and a game's Phaser Scene.
 * GameRunner puts `initData` + `bus` into game.registry before the scene boots;
 * the scene reads them with getInitData() and reports back with emitResult().
 */
export interface GameInitData {
  stage: number
  /** The game's pre-start booster was consumed for this attempt. */
  boosterActive: boolean
}

export interface GameResult {
  cleared: boolean
  /** Must be 0 on failure — only a clear pays out. */
  coinsEarned: number
  /** 1-3 on a clear. */
  stars?: Stars
  /** Short per-game breakdown lines shown on the result screen. */
  details?: string[]
}

export const REGISTRY_INIT = 'initData'
export const REGISTRY_BUS = 'bus'

export const RESULT_EVENT = 'game:result'
export const USE_HINT_EVENT = 'item:hint'
export const USE_UNDO_EVENT = 'item:undo'
export type ItemEvent = typeof USE_HINT_EVENT | typeof USE_UNDO_EVENT

export type SessionBus = Phaser.Events.EventEmitter

export function createSessionBus(): SessionBus {
  return new Phaser.Events.EventEmitter()
}

export function getInitData(scene: Phaser.Scene): GameInitData {
  return (scene.registry.get(REGISTRY_INIT) as GameInitData | undefined) ?? { stage: 1, boosterActive: false }
}

function getBus(scene: Phaser.Scene): SessionBus | undefined {
  return scene.registry.get(REGISTRY_BUS) as SessionBus | undefined
}

/** Reports the attempt outcome. Only the first call per attempt is honored by GameRunner. */
export function emitResult(scene: Phaser.Scene, result: GameResult): void {
  getBus(scene)?.emit(RESULT_EVENT, result.cleared ? result : { ...result, coinsEarned: 0, stars: undefined })
}

/**
 * Registers an in-game item handler. The handler returns whether the item actually did
 * something — GameRunner only removes the item from the inventory on `true`.
 */
export function onItemUse(scene: Phaser.Scene, event: ItemEvent, handler: () => boolean): void {
  const bus = getBus(scene)
  if (!bus) return
  const listener = (reply: (used: boolean) => void) => reply(handler())
  bus.on(event, listener)
  // game.destroy() fires DESTROY (not SHUTDOWN) — without both, a destroyed game's scene stays
  // subscribed (e.g. StrictMode's discarded first mount) and its handler throws on use.
  const off = () => bus.off(event, listener)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, off)
  scene.events.once(Phaser.Scenes.Events.DESTROY, off)
}

/** GameRunner side: asks the running scene to use an item. Resolves false if no scene handled it. */
export function requestItemUse(bus: SessionBus, event: ItemEvent): boolean {
  let used = false
  bus.emit(event, (u: boolean) => {
    used = used || u
  })
  return used
}
