// Bus Stop + Merge difficulty sims against the real rule modules.
// Usage: node qa/sim-puzzles.ts [bus|merge|both] [N] [busTable.json]   (MERGE_TABLE=merge.json for Merge proposals)
import * as B0 from '../src/games/color-parking/busStopLogic.ts'
import fs from 'node:fs'
// Optional proposal tables (JSON arrays shaped like the real STAGES) to try before editing the game.
const busTable: B0.StageConfig[] | null = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : null
const B = busTable ? { ...B0, STAGES: busTable } : B0
import * as M from '../src/games/merge-numbers/mergeLogic.ts'

const which = process.argv[2] ?? 'both'
const N = Number(process.argv[3] ?? 400)
const pct = (a: number, b: number) => `${Math.round((100 * a) / b)}%`

if (which !== 'merge') {
  // Casual: match the front passenger if possible, else a lane whose colour is already docked, else random.
  // Skilled: same priorities but never makes a move that jams on the spot, and looks 2 moves ahead.
  const casualPick = (s: B.BusStopState): number => {
    const legal = s.lanes.map((_, k) => k).filter((k) => B.canMove(s, k))
    const front = s.queue[s.queueIndex]
    const active = new Set(s.dock.filter(Boolean).map((b) => b!.color))
    return legal.find((k) => s.lanes[k][0].color === front) ?? legal.find((k) => active.has(s.lanes[k][0].color)) ?? legal[Math.floor(Math.random() * legal.length)]
  }
  // Visible queue = 12 passengers; a player can see each lane's second bus too.
  const soonness = (s: B.BusStopState, lane: number) => {
    const next = s.lanes[lane][1]
    if (!next) return 0 // emptying a lane is fine
    const idx = s.queue.slice(s.queueIndex, s.queueIndex + 12).indexOf(next.color)
    return idx < 0 ? 99 : idx
  }
  const byNeed = (s: B.BusStopState, lanes: number[]) => [...lanes].sort((a, b) => soonness(s, a) - soonness(s, b))
  const averagePick = (s: B.BusStopState): number => {
    const legal = s.lanes.map((_, k) => k).filter((k) => B.canMove(s, k))
    const front = s.queue[s.queueIndex]
    const soon = s.queue.slice(s.queueIndex, s.queueIndex + 4)
    const active = new Set(s.dock.filter(Boolean).map((b) => b!.color))
    const match = byNeed(s, legal.filter((k) => s.lanes[k][0].color === front))
    return match[0]
      ?? legal.find((k) => active.has(s.lanes[k][0].color))
      ?? byNeed(s, legal.filter((k) => soon.includes(s.lanes[k][0].color)))[0]
      ?? byNeed(s, legal)[0]
  }
  const survives = (s: B.BusStopState, depth: number): boolean => {
    const st = B.getStatus(s)
    if (st !== 'playing') return st === 'won'
    if (depth === 0) return true
    return s.lanes.some((_, k) => {
      if (!B.canMove(s, k)) return false
      const n = B.cloneState(s)
      B.moveLane(n, k)
      return survives(n, depth - 1)
    })
  }
  const skilledPick = (s: B.BusStopState): number => {
    const legal = s.lanes.map((_, k) => k).filter((k) => B.canMove(s, k))
    const ok = legal.filter((k) => { const n = B.cloneState(s); B.moveLane(n, k); return survives(n, 2) })
    const pool = ok.length ? ok : legal
    const front = s.queue[s.queueIndex]
    const active = new Set(s.dock.filter(Boolean).map((b) => b!.color))
    return byNeed(s, pool.filter((k) => s.lanes[k][0].color === front))[0] ?? pool.find((k) => active.has(s.lanes[k][0].color)) ?? byNeed(s, pool)[0]
  }
  const rows: Record<string, unknown>[] = []
  B.STAGES.forEach((cfg, i) => {
    const r: Record<string, unknown> = { stage: i + 1, cfg: `${cfg.lanes}L×${cfg.busesPerLane} c${cfg.colors} s${cfg.seats}` }
    for (const [name, pick] of [['casual', casualPick], ['average', averagePick], ['skilled', skilledPick]] as const) {
      let w = 0
      let withUndo = 0
      for (let n = 0; n < N; n++) {
        const s = B.generate(cfg).state
        while (B.getStatus(s) === 'playing') B.moveLane(s, pick(s))
        if (B.getStatus(s) === 'won') w++
        // One undo: on jam, step back once and try a different move (a typical "rescue").
        const s2 = B.generate(cfg).state
        let undos = 1
        const hist: B.BusStopState[] = []
        while (true) {
          const st = B.getStatus(s2)
          if (st === 'won') { withUndo++; break }
          if (st === 'jammed') {
            if (undos-- <= 0 || !hist.length) break
            const prev = hist.pop()!
            Object.assign(s2, B.cloneState(prev))
            const alt = prev.lanes.map((_, k) => k).filter((k) => B.canMove(prev, k))
            const k = alt[Math.floor(Math.random() * alt.length)]
            hist.push(B.cloneState(s2)); B.moveLane(s2, k)
            continue
          }
          hist.push(B.cloneState(s2))
          B.moveLane(s2, pick(s2))
        }
      }
      r[name] = pct(w, N)
      if (name === 'casual') r.casualUndo1 = pct(withUndo, N)
    }
    const buses = cfg.lanes * cfg.busesPerLane
    r.estSec = Math.round(buses * 2.2) // ~2.2s per tap incl. thinking + animation
    rows.push(r)
  })
  console.log('BUS STOP')
  console.table(rows)
}

if (which !== 'bus') {
  const score = (b: M.Board) => {
    const empt = M.emptyCells(b).length
    const max = M.maxTile(b)
    const n = b.length
    const corner = [b[0][0], b[0][n - 1], b[n - 1][0], b[n - 1][n - 1]].includes(max) ? 1 : 0
    return empt * 10 + corner * 20 + Math.log2(Math.max(2, max))
  }
  const dirs: M.Direction[] = ['down', 'left', 'right', 'up']
  const casual = (b: M.Board) => {
    let best: M.MoveResult | null = null
    let bs = -Infinity
    for (const d of dirs) {
      const r = M.move(b, d)
      if (!r.moved) continue
      const sc = M.emptyCells(r.board).length * 10 + r.merges.length + (d === 'up' ? -15 : 0)
      if (sc > bs) { bs = sc; best = r }
    }
    return best
  }
  const skilled = (b: M.Board) => {
    let best: M.MoveResult | null = null
    let bs = -Infinity
    for (const d of dirs) {
      const r = M.move(b, d)
      if (!r.moved) continue
      const cells = M.emptyCells(r.board)
      const sample = cells.length > 6 ? cells.sort(() => Math.random() - 0.5).slice(0, 6) : cells
      let total = 0
      for (const [rr, cc] of sample) {
        const nb = M.cloneBoard(r.board)
        nb[rr][cc] = 2
        let inner = -50
        for (const d2 of dirs) { const r2 = M.move(nb, d2); if (r2.moved) inner = Math.max(inner, score(r2.board)) }
        total += inner
      }
      const sc = sample.length ? total / sample.length : score(r.board)
      if (sc > bs) { bs = sc; best = r }
    }
    return best
  }
  const rows: Record<string, unknown>[] = []
  const mergeTable: M.StageConfig[] = process.env.MERGE_TABLE ? JSON.parse(fs.readFileSync(process.env.MERGE_TABLE, 'utf8')) : M.STAGES
  mergeTable.forEach((cfg, i) => {
    const r: Record<string, unknown> = { stage: i + 1, cfg: `${cfg.size}x${cfg.size} →${cfg.target} ${cfg.moves}mv ${cfg.obstacles}obs` }
    for (const [name, pick, runs] of [['casual', casual, N], ['skilled', skilled, Math.max(60, N / 4)]] as const) {
      let w = 0
      let used = 0
      let outOfMoves = 0
      for (let n = 0; n < runs; n++) {
        let b = M.createBoard(cfg)
        let m = 0
        let won = false
        for (; m < cfg.moves; m++) {
          const res = pick(b)
          if (!res) break
          b = res.board
          M.spawnTile(b)
          if (M.maxTile(b) >= cfg.target) { won = true; m++; break }
        }
        if (won) { w++; used += m } else if (m >= cfg.moves) outOfMoves++
      }
      r[name] = pct(w, runs)
      if (name === 'casual') {
        r.casualFailByMoves = pct(outOfMoves, runs)
        r.estSec = w ? Math.round((used / w) * 0.9) : '-' // ~0.9s per swipe incl. animation
      }
    }
    rows.push(r)
  })
  console.log('MERGE NUMBERS')
  console.table(rows)
}
