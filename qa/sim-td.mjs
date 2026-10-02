// Tower Defense difficulty sim v2: real scene, headless stepping, better skilled bot,
// and runtime-patched tuning so proposals can be tested without editing the game.
// Usage: node qa/sim-td.mjs <runs> <stages e.g. 1,5,10> [tuning.json]   (STYLES=casual to skip the skilled bot)
// Needs the dev server (QA_BASE). Without tuning.json it measures the game exactly as shipped.
import fs from 'node:fs'
import { newPage, start, waitScene, browser } from './e2e.mjs'

const RUNS = Number(process.argv[2] ?? 5)
const STAGES = (process.argv[3] ?? '1,2,3,4,5,6,7,8,9,10').split(',').map(Number)
const tuning = process.argv[4] ? JSON.parse(fs.readFileSync(process.argv[4], 'utf8')) : null
const page = await newPage()
const rows = []

for (const stage of STAGES) {
  const row = { stage }
  for (const style of (process.env.STYLES ?? 'casual,skilled').split(',')) {
    let wins = 0, lives = 0, secs = 0, leaksAt = []
    for (let r = 0; r < RUNS; r++) {
      await page.evaluate((st) => {
        localStorage.setItem('tka:save:v1', JSON.stringify({ progress: { 'tower-defense': { bestStage: st - 1, stageStars: {}, playCount: 1 } }, settings: { soundEnabled: false, vibrationEnabled: false } }))
      }, stage)
      await start(page, 'tower-defense', stage)
      await waitScene(page, 'TowerDefenseScene')
      const res = await page.evaluate(async ({ style, tuning, stage }) => {
        const game = window.__tkaGame
        const s = game.scene.getScene('TowerDefenseScene')
        game.loop.sleep()
        if (tuning) {
          s.gold = tuning.startGold + tuning.goldPerStage * (stage - 1)
          // Rebuild the wave schedule with the proposed counts.
          const types = [...new Set(s.schedule.filter((e) => e.type !== 'boss').map((e) => e.type))]
          const weighted = types.flatMap((t) => (t === 'grunt' ? [t, t, t] : t === 'runner' ? [t, t] : [t]))
          const interval = Math.max(tuning.minInterval, tuning.interval0 - stage * tuning.intervalStep)
          let t = 1500
          const sched = []
          for (let w = 0; w < 3; w++) {
            const count = tuning.count0 + Math.round(stage * tuning.countPerStage) + w * tuning.countPerWave
            for (let i = 0; i < count; i++) { sched.push({ at: t, wave: w + 1, type: weighted[Math.floor(Math.random() * weighted.length)] }); t += interval }
            t += 2500
          }
          s.bossWarnAt = t
          sched.push({ at: t + 1500, wave: 4, type: 'boss' })
          s.schedule = sched
          const orig = s.spawnEnemy.bind(s)
          s.spawnEnemy = (id) => {
            orig(id)
            const e = s.enemies[s.enemies.length - 1]
            const base = { grunt: 40, runner: 22, tank: 160, boss: tuning.bossHp ?? 900 }[id]
            e.hp = e.maxHp = Math.round(base * (1 + tuning.hpGrowth * (stage - 1)))
            e.type = { ...e.type, gold: Math.round(e.type.gold * (tuning.goldMul ?? 1)) }
          }
        }
        const types = s.toolbar.map((b) => b.type) // mg, sniper, cannon
        const samples = []
        for (let d = 0; d < s.pathLength; d += 12) samples.push(s.positionAt(d))
        const coverage = (sl, range) => samples.filter((p) => Math.hypot(p.x - sl.x, p.y - sl.y) <= range).length
        const upCost = (tw) => Math.round(tw.type.cost * (tw.level === 1 ? 0.8 : 1.3))
        let t = performance.now(), step = 0, leakAt = -1, lastLives = s.lives
        const bestSlot = (type) => { const tw = s.slots.filter((x) => x.tower); return s.slots.filter((sl) => !sl.tower).map((sl) => ({ sl, c: coverage(sl, type.range) - 12 * tw.filter((x) => Math.hypot(x.x - sl.x, x.y - sl.y) < 140).length })).sort((a, b) => b.c - a.c) }
        const casual = () => {
          const towers = s.slots.filter((sl) => sl.tower).map((sl) => sl.tower)
          const r = Math.random()
          const type = r < 0.6 ? types[0] : r < 0.85 ? types[2] : types[1]
          const upg = towers.filter((tw) => tw.level < 3)
          if (upg.length && Math.random() < 0.25) {
            const tw = upg[Math.floor(Math.random() * upg.length)]
            if (s.gold >= upCost(tw)) { s.upgrade(tw); return }
          }
          if (s.gold < type.cost) return
          const pool = bestSlot(type).slice(0, 25)
          if (!pool.length) return
          s.selectedType = type
          s.build(pool[Math.floor(Math.random() * pool.length)].sl)
        }
        // Reads the situation like a person: what's on the field + the next 15 spawns.
        const skilled = () => {
          const towers = s.slots.filter((sl) => sl.tower).map((sl) => sl.tower)
          const count = (id) => towers.filter((t) => t.type.id === id).length
          const upcoming = s.schedule.slice(0, 15).map((e) => e.type).concat(s.enemies.map((e) => e.type.id))
          const armored = upcoming.filter((t) => t === 'tank' || t === 'knight' || t === 'boss').length
          const swarm = upcoming.filter((t) => t === 'swarm').length
          let type = types[0]
          if (armored >= 2 && count('sniper') < Math.ceil(armored / 3)) type = types[1]
          else if (swarm >= 3 && count('cannon') < 2) type = types[2]
          else if (towers.length >= 4 && count('cannon') < Math.floor(towers.length / 3)) type = types[2]
          const upg = towers.filter((tw) => tw.level < 3).sort((x, y) => upCost(x) - upCost(y))
          if (upg.length && towers.length >= 5 && s.gold >= upCost(upg[0]) && s.gold < type.cost) { s.upgrade(upg[0]); return }
          if (s.gold >= type.cost) { s.selectedType = type; s.build(bestSlot(type)[0].sl) }
        }
        // The "just spam machine guns" player the user reported: MG only, upgrades included.
        const mgonly = () => {
          const towers = s.slots.filter((sl) => sl.tower).map((sl) => sl.tower)
          const upg = towers.filter((tw) => tw.level < 3).sort((a, b) => upCost(a) - upCost(b))
          if (upg.length && towers.length >= 4 && s.gold >= upCost(upg[0])) { s.upgrade(upg[0]); return }
          if (s.gold >= types[0].cost) { s.selectedType = types[0]; s.build(bestSlot(types[0])[0].sl) }
        }
        while (!s.ended && step < 60 * 400) {
          if (step % (style === 'casual' ? 90 : 30) === 0) ({ casual, skilled, mgonly })[style]()
          t += 1000 / 60
          game.headlessStep(t, 1000 / 60)
          if (s.lives < lastLives && leakAt < 0) leakAt = s.currentWave
          lastLives = s.lives
          step++
        }
        const towers = s.slots.filter((x) => x.tower).map((x) => x.tower.type.id[0] + x.tower.level).join(' ')
        return { cleared: s.lives > 0 && s.spawningDone && s.enemies.length === 0, lives: s.lives, secs: Math.round(step / 60), leakAt, towers, gold: s.gold }
      }, { style, tuning, stage })
      if (res.cleared) { wins++; lives += res.lives; secs += res.secs }
      if (process.env.VERBOSE) console.log('  ', stage, style, JSON.stringify(res))
      leaksAt.push(res.leakAt)
    }
    row[style] = `${wins}/${RUNS}`
    if (style === 'casual') { row.casualLives = wins ? (lives / wins).toFixed(1) : '-'; row.sec = wins ? Math.round(secs / wins) : '-'; row.firstLeakWave = leaksAt.join('') }
  }
  rows.push(row)
  console.log(JSON.stringify(row))
}
console.table(rows)
await browser.close()
