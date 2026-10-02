/**
 * Pure Bus Stop rules (no Phaser) so they can be simulated/verified outside the browser.
 *
 * Lanes hold buses front-first. Tapping a lane moves its front bus into a free dock slot
 * (DOCK_SIZE max). After every move the passenger queue boards greedily: while the front
 * passenger's color matches a docked bus with free seats, they board the earliest-arrived
 * such bus. Full buses depart and free their slot.
 */

export const DOCK_SIZE = 3

export interface StageConfig {
  lanes: number
  busesPerLane: number
  colors: number
  seats: number
  /**
   * Generator: chance to pull another bus into the dock while it still has room, instead of
   * boarding. Higher = colours buried deeper behind each other = harder. Default 0.45.
   */
  bury?: number
}

/**
 * Difficulty table (PRD 7.2), 24 stages: up to 7 lanes × 7 buses (49 buses, ~290 passengers),
 * 8 colours. Bigger boards get a LOWER `bury` so they stay fair: with many buses the hard part
 * becomes choosing WHICH same-coloured lane to pull (the bus behind it matters), not deep digs.
 * Sim (`npm run sim:puzzles`, 2026-10-02): a player who looks at the next bus/queue ("average")
 * 100% → ~60% (stage 9) → 20-33% (19-24); random lane choice drops to <10% late; skilled 2-ply
 * look-ahead 100% → 50-67%. Max 8 colours (scene COLORS/SYMBOLS have 8 entries).
 */
export const STAGES: StageConfig[] = [
  { lanes: 3, busesPerLane: 2, colors: 2, seats: 3, bury: 0.12 },
  { lanes: 3, busesPerLane: 3, colors: 3, seats: 3, bury: 0.12 },
  { lanes: 4, busesPerLane: 3, colors: 3, seats: 3, bury: 0.12 },
  { lanes: 4, busesPerLane: 3, colors: 4, seats: 3, bury: 0.12 },
  { lanes: 4, busesPerLane: 4, colors: 4, seats: 4, bury: 0.1 },
  { lanes: 5, busesPerLane: 4, colors: 4, seats: 4, bury: 0.08 },
  { lanes: 5, busesPerLane: 4, colors: 5, seats: 4, bury: 0.08 },
  { lanes: 5, busesPerLane: 5, colors: 5, seats: 4, bury: 0.06 },
  { lanes: 5, busesPerLane: 5, colors: 5, seats: 5, bury: 0.06 },
  { lanes: 6, busesPerLane: 5, colors: 5, seats: 4, bury: 0.05 },
  { lanes: 6, busesPerLane: 5, colors: 6, seats: 4, bury: 0.05 },
  { lanes: 6, busesPerLane: 5, colors: 6, seats: 5, bury: 0.04 },
  { lanes: 6, busesPerLane: 6, colors: 6, seats: 4, bury: 0.03 },
  { lanes: 6, busesPerLane: 6, colors: 6, seats: 5, bury: 0.03 },
  { lanes: 6, busesPerLane: 6, colors: 7, seats: 4, bury: 0.03 },
  { lanes: 7, busesPerLane: 6, colors: 7, seats: 4, bury: 0.02 },
  { lanes: 7, busesPerLane: 6, colors: 7, seats: 5, bury: 0.02 },
  { lanes: 7, busesPerLane: 6, colors: 7, seats: 6, bury: 0.02 },
  { lanes: 7, busesPerLane: 7, colors: 7, seats: 4, bury: 0.01 },
  { lanes: 7, busesPerLane: 7, colors: 7, seats: 5, bury: 0.01 },
  { lanes: 7, busesPerLane: 7, colors: 8, seats: 4, bury: 0.01 },
  { lanes: 7, busesPerLane: 7, colors: 8, seats: 5, bury: 0 },
  { lanes: 7, busesPerLane: 7, colors: 8, seats: 6, bury: 0 },
  { lanes: 7, busesPerLane: 7, colors: 8, seats: 6, bury: 0 },
]

export interface Bus {
  id: number
  color: number
  seats: number
  filled: number
  /** Arrival order into the dock; boarding prefers the earliest. */
  arrival: number
}

export interface BusStopState {
  lanes: Bus[][]
  dock: (Bus | null)[]
  queue: number[]
  /** Index of the front passenger in `queue`. */
  queueIndex: number
  arrivals: number
}

export interface BoardEvent {
  passengerIndex: number
  busId: number
  slot: number
}

export interface MoveEvents {
  slot: number
  boarded: BoardEvent[]
  /** Slots whose bus filled up and departed, in order. */
  departed: { slot: number; busId: number }[]
}

export type Status = 'playing' | 'won' | 'jammed'

export function cloneState(s: BusStopState): BusStopState {
  return {
    lanes: s.lanes.map((l) => l.map((b) => ({ ...b }))),
    dock: s.dock.map((b) => (b ? { ...b } : null)),
    queue: s.queue,
    queueIndex: s.queueIndex,
    arrivals: s.arrivals,
  }
}

export function freeSlot(s: BusStopState): number {
  return s.dock.indexOf(null)
}

export function canMove(s: BusStopState, lane: number): boolean {
  return (s.lanes[lane]?.length ?? 0) > 0 && freeSlot(s) >= 0
}

/** Boards passengers greedily from the queue front. Mutates `s`. */
export function runBoarding(s: BusStopState, events: MoveEvents): void {
  while (s.queueIndex < s.queue.length) {
    const color = s.queue[s.queueIndex]
    let best = -1
    for (let i = 0; i < s.dock.length; i++) {
      const b = s.dock[i]
      if (b && b.color === color && b.filled < b.seats && (best < 0 || b.arrival < s.dock[best]!.arrival)) best = i
    }
    if (best < 0) return
    const bus = s.dock[best]!
    bus.filled += 1
    events.boarded.push({ passengerIndex: s.queueIndex, busId: bus.id, slot: best })
    s.queueIndex += 1
    if (bus.filled >= bus.seats) {
      events.departed.push({ slot: best, busId: bus.id })
      s.dock[best] = null
    }
  }
}

/** Moves the lane's front bus to the dock and boards. Returns null if the move is illegal. Mutates `s`. */
export function moveLane(s: BusStopState, lane: number): MoveEvents | null {
  if (!canMove(s, lane)) return null
  const slot = freeSlot(s)
  const bus = s.lanes[lane].shift()!
  bus.arrival = s.arrivals++
  s.dock[slot] = bus
  const events: MoveEvents = { slot, boarded: [], departed: [] }
  runBoarding(s, events)
  return events
}

export function getStatus(s: BusStopState): Status {
  if (s.queueIndex >= s.queue.length) {
    const lanesEmpty = s.lanes.every((l) => l.length === 0)
    const dockEmpty = s.dock.every((b) => b === null)
    return lanesEmpty && dockEmpty ? 'won' : 'playing'
  }
  if (freeSlot(s) >= 0 && s.lanes.some((l) => l.length > 0)) return 'playing'
  return 'jammed'
}

function stateKey(s: BusStopState): string {
  const docked = s.dock
    .filter((b): b is Bus => b !== null)
    .sort((a, b) => a.arrival - b.arrival)
    .map((b) => `${b.id}:${b.filled}`)
    .join(',')
  return `${s.lanes.map((l) => l.length).join('.')}|${docked}|${s.queueIndex}`
}

/**
 * Depth-first search for a winning line from `s`. Returns the first lane of a win,
 * or null if none was found within the node budget (or the state is lost).
 */
export function solve(s: BusStopState, budget = 50000): number | null {
  const dead = new Set<string>()
  let nodes = 0
  const dfs = (st: BusStopState): boolean => {
    const status = getStatus(st)
    if (status === 'won') return true
    if (status === 'jammed') return false
    const key = stateKey(st)
    if (dead.has(key) || ++nodes > budget) return false
    for (const lane of laneOrder(st)) {
      const next = cloneState(st)
      moveLane(next, lane)
      if (dfs(next)) return true
    }
    dead.add(key)
    return false
  }
  for (const lane of laneOrder(s)) {
    const next = cloneState(s)
    moveLane(next, lane)
    if (dfs(next)) return lane
  }
  return null
}

/** Legal lanes, most promising first: front bus matches the front passenger, then an active dock color. */
function laneOrder(s: BusStopState): number[] {
  const front = s.queue[s.queueIndex]
  const active = new Set(s.dock.filter((b): b is Bus => b !== null).map((b) => b.color))
  const score = (lane: number) => {
    const c = s.lanes[lane][0].color
    return c === front ? 0 : active.has(c) ? 1 : 2
  }
  return s.lanes
    .map((_, i) => i)
    .filter((i) => canMove(s, i))
    .sort((a, b) => score(a) - score(b))
}

export type Rng = () => number

function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/**
 * Builds a puzzle that is guaranteed winnable: lanes are shuffled randomly, then the passenger
 * queue is written by simulating a playthrough with the real boarding rules. Replaying that
 * playthrough's lane order always wins (the real game can only board earlier, which frees
 * slots sooner — never later).
 */
export function generate(config: StageConfig, rng: Rng = Math.random): { state: BusStopState; solution: number[] } {
  const total = config.lanes * config.busesPerLane
  const colors = shuffle(
    Array.from({ length: total }, (_, i) => i % config.colors),
    rng,
  )
  const lanes: Bus[][] = Array.from({ length: config.lanes }, () => [])
  colors.forEach((color, id) => {
    lanes[id % config.lanes].push({ id, color, seats: config.seats, filled: 0, arrival: -1 })
  })

  const initialLanes = lanes.map((l) => l.map((b) => ({ ...b })))
  const sim: BusStopState = { lanes, dock: Array(DOCK_SIZE).fill(null), queue: [], queueIndex: 0, arrivals: 0 }
  const solution: number[] = []
  const pending = () => sim.dock.filter((b): b is Bus => b !== null && b.filled < b.seats)

  for (let guard = 0; guard < 10000; guard++) {
    const lanesLeft = sim.lanes.map((l, i) => (l.length > 0 ? i : -1)).filter((i) => i >= 0)
    const open = pending()
    if (lanesLeft.length === 0 && open.length === 0) break
    const mustEmit = freeSlot(sim) < 0 || lanesLeft.length === 0
    // Popping while the dock still has room is what buries colors and makes order matter.
    const pop = !mustEmit && (open.length === 0 || rng() < (config.bury ?? 0.45))
    if (pop) {
      const lane = lanesLeft[Math.floor(rng() * lanesLeft.length)]
      const bus = sim.lanes[lane].shift()!
      bus.arrival = sim.arrivals++
      sim.dock[freeSlot(sim)] = bus
      solution.push(lane)
    } else {
      const target = open[Math.floor(rng() * open.length)]
      sim.queue.push(target.color)
      runBoarding(sim, { slot: -1, boarded: [], departed: [] })
    }
  }

  return {
    state: { lanes: initialLanes, dock: Array(DOCK_SIZE).fill(null), queue: sim.queue, queueIndex: 0, arrivals: 0 },
    solution,
  }
}
