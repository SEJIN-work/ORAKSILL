// Bus Stop guarantee check: every generated puzzle must be winnable by replaying its recorded
// solution, the hint solver must find a win from the start, and following hints must always win.
// Also smoke-tests Merge rules. Usage: node qa/bus-guarantee.ts [N per stage]
import * as B from '../src/games/color-parking/busStopLogic.ts'
import * as M from '../src/games/merge-numbers/mergeLogic.ts'

let seed = 12345
const rng = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

const N = Number(process.argv[2] ?? 2000)
B.STAGES.forEach((cfg, si) => {
  let replayWins = 0, solverFound = 0, hintBotWins = 0, naiveWins = 0, maxQ = 0
  let t = Date.now()
  for (let i = 0; i < N; i++) {
    const { state, solution } = B.generate(cfg, rng)
    maxQ = Math.max(maxQ, state.queue.length)
    // 1) replay recorded solution under the real rules
    const s = B.cloneState(state)
    for (const lane of solution) { if (!B.moveLane(s, lane)) break }
    if (B.getStatus(s) === 'won') replayWins++
    // 2) solver from start
    if (B.solve(B.cloneState(state)) !== null) solverFound++
    // 3) bot that follows the hint (solver) every move
    const h = B.cloneState(state)
    while (B.getStatus(h) === 'playing') { const l = B.solve(h); if (l === null) break; B.moveLane(h, l) }
    if (B.getStatus(h) === 'won') hintBotWins++
    // 4) naive random player
    const r = B.cloneState(state)
    while (B.getStatus(r) === 'playing') { const legal = r.lanes.map((_, k) => k).filter((k) => B.canMove(r, k)); B.moveLane(r, legal[Math.floor(rng() * legal.length)]) }
    if (B.getStatus(r) === 'won') naiveWins++
  }
  console.log(`bus stage ${si + 1}: replay ${replayWins}/${N}, solver ${solverFound}/${N}, hint-bot ${hintBotWins}/${N}, random ${naiveWins}/${N}, passengers ${maxQ}, ${Date.now() - t}ms`)
})

// Merge sanity
const b: M.Board = [[2, 2, 4, 0], [M.OBSTACLE, 2, 0, 2], [M.WILD, 8, 0, 0], [4, 4, 4, 4]]
const res = M.move(b, 'left')
console.log('merge left', JSON.stringify(res.board), res.merges.length, res.moved)
console.log('expect     [[4,4,0,0],[-2,4,0,0],[16,0,0,0],[8,8,0,0]]')
const up = M.move([[2, 0], [2, 0]], 'up'); console.log('up', JSON.stringify(up.board))
console.log('stuck?', M.canAnyMove([[2, 4], [4, 2]]), M.canAnyMove([[2, 2], [4, 8]]))

// Merge greedy bot: can stages be cleared within move limit?
M.STAGES.forEach((cfg, si) => {
  let wins = 0; const runs = 200
  for (let i = 0; i < runs; i++) {
    let board = M.createBoard(cfg, rng)
    for (let m = 0; m < cfg.moves; m++) {
      const order: M.Direction[] = ['down', 'left', 'right', 'up']
      let best: M.MoveResult | null = null
      for (const d of order) { const r = M.move(board, d); if (r.moved) { best = r; break } }
      if (!best) break
      board = best.board; M.spawnTile(board, rng)
      if (M.maxTile(board) >= cfg.target) { wins++; break }
    }
  }
  console.log(`merge stage ${si + 1} (${cfg.size}x${cfg.size}, ${cfg.target}, ${cfg.moves} moves, ${cfg.obstacles} obs): corner-bot ${wins}/${runs}`)
})
