// Stress Breaker difficulty sim: mirrors StressBreakerScene's spawn/lifetime/bomb rules with a
// human model (seconds per hit, bomb misclick rate, swipe multi-hit for skilled players).
// Usage: node qa/sim-stress.mjs [proposalTable.json]   (array of 10 stageConfig-shaped objects)
import fs from 'node:fs'

// MUST mirror StressBreakerScene.stageConfig() (the scene imports Phaser, so Node can't import it).
// Update both together when re-tuning.
const current = (stage) => ({
  time: 30,
  target: Math.round(16 + stage * 3.3),
  spawnMs: Math.max(410, 820 - stage * 41),
  maxAlive: 4 + Math.ceil(stage / 2),
  lifetimeMs: Math.max(1600, 2700 - stage * 100),
  bombChance: stage >= 2 ? Math.min(0.17, 0.05 + stage * 0.013) : 0,
  bonusChance: 0.07,
  toughChance: stage >= 3 ? Math.min(0.3, stage * 0.035) : 0,
})
/** 3★ rule in the scene: ≥20% of the time limit left. */
const THREE_STAR = 0.2
const table = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : null
const cfgFor = (s) => (table ? table[s - 1] : current(s))

const PLAYERS = {
  // Casual: ~0.55s to spot+tap a new object, 0.3s for a follow-up tap, 5% chance to slap a bomb when one is up.
  casual: { hit: 0.55, followUp: 0.3, bombSlip: 0.05, swipe: 1 },
  // Skilled: faster and sometimes swipes through 2 objects in one stroke.
  skilled: { hit: 0.38, followUp: 0.2, bombSlip: 0.02, swipe: 1.35 },
}

function run(cfg, p, booster = 0) {
  const dt = 0.01
  const limit = cfg.time + booster
  let t = 0
  let spawnTimer = 0
  let broken = 0
  let busyUntil = 0
  const alive = []
  const spawn = () => {
    if (alive.length >= cfg.maxAlive) return
    const r = Math.random()
    const kind = r < cfg.bombChance ? 'bomb' : r < cfg.bombChance + cfg.bonusChance ? 'bonus' : 'obj'
    const hp = kind === 'obj' && Math.random() < cfg.toughChance * 0.33 ? 2 : 1 // tough only on boxes (1/3 of objs)
    alive.push({ kind, hp, born: t, dies: t + cfg.lifetimeMs / 1000 })
  }
  const pending = [0, 0.12, 0.24]
  while (t < limit) {
    while (pending.length && pending[0] <= t) { pending.shift(); spawn() }
    spawnTimer += dt * 1000
    if (spawnTimer >= cfg.spawnMs) { spawnTimer = 0; spawn() }
    for (let i = alive.length - 1; i >= 0; i--) if (alive[i].dies <= t) alive.splice(i, 1)
    if (t >= busyUntil) {
      const bombs = alive.filter((a) => a.kind === 'bomb')
      const targets = alive.filter((a) => a.kind !== 'bomb' && a.dies > t + p.hit * 0.6).sort((a, b) => a.dies - b.dies)
      if (bombs.length && targets.length && Math.random() < p.bombSlip) {
        alive.splice(alive.indexOf(bombs[0]), 1)
        broken = Math.max(0, broken - 3)
        busyUntil = t + p.hit
      } else if (targets.length) {
        const k = Math.min(targets.length, Math.random() < p.swipe - 1 ? 2 : 1)
        for (const tg of targets.slice(0, k)) {
          tg.hp -= 1
          if (tg.hp <= 0) { alive.splice(alive.indexOf(tg), 1); broken++ }
        }
        busyUntil = t + (targets[0].hp > 0 ? p.followUp : p.hit)
        if (broken >= cfg.target) return { cleared: true, t, left: limit - t }
      }
    }
    t += dt
  }
  return { cleared: false, t: limit, left: 0 }
}

const N = 1500
const rows = []
for (let s = 1; s <= 10; s++) {
  const cfg = cfgFor(s)
  const supply = Math.round(((cfg.time * 1000) / cfg.spawnMs + 3) * (1 - cfg.bombChance))
  const row = { stage: s, target: cfg.target, time: cfg.time, supply }
  for (const [name, p] of Object.entries(PLAYERS)) {
    let wins = 0
    let dur = 0
    let stars3 = 0
    for (let i = 0; i < N; i++) {
      const r = run(cfg, p)
      if (r.cleared) { wins++; dur += r.t; if (r.left / cfg.time >= THREE_STAR) stars3++ }
    }
    row[name] = `${Math.round((100 * wins) / N)}%`
    if (name === 'casual') row.casualSec = wins ? Math.round(dur / wins) : '-'
    row[`${name}3star`] = `${Math.round((100 * stars3) / N)}%`
  }
  let bw = 0
  for (let i = 0; i < N; i++) if (run(cfg, PLAYERS.casual, 10).cleared) bw++
  row.casualWithBooster = `${Math.round((100 * bw) / N)}%`
  rows.push(row)
}
console.table(rows)
