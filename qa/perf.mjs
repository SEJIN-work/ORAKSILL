// FPS under 4× CPU throttle (≈ mid-range phone): Stress Breaker spam + a heavy TD scene.
import { BASE, newPage, start, waitScene, scene, tapCanvas, browser } from './e2e.mjs'
const page = await newPage(true)
await page.evaluate(() => localStorage.clear())
const cdp = await page.context().newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
const fps = () => page.evaluate(() => Math.round(window.__tkaGame.loop.actualFps))
// Stress breaker: hammer targets for 6s
await start(page, 'stress-breaker', 1)
await waitScene(page, 'StressBreakerScene')
const samples = []
const t0 = Date.now()
while (Date.now() - t0 < 6000) {
  const t = await scene(page, 'StressBreakerScene', (s) => s.ended ? [] : s.targets.filter((t) => t.kind !== 'bomb').map((t) => [t.x, t.y]))
  for (const [x, y] of t.slice(0, 3)) await tapCanvas(page, x, y, true)
  samples.push(await fps())
}
console.log('stress fps min/avg', Math.min(...samples), Math.round(samples.reduce((a, b) => a + b) / samples.length))
// TD: many towers + jump to boss wave with lots of enemies
await page.goto(BASE + '/games/tower-defense')
await page.getByRole('button', { name: /스테이지 1 시작/ }).click()
await waitScene(page, 'TowerDefenseScene')
await page.evaluate(() => {
  const s = window.__tkaGame.scene.getScene('TowerDefenseScene')
  s.gold = 5000
  const near = s.slots.filter((sl) => s.distanceToPath(sl.x, sl.y) < 80)
  near.slice(0, 18).forEach((sl, i) => { s.selectedType = s.toolbar[i % 3].type; s.build(sl) })
  for (let i = 0; i < 40; i++) s.spawnEnemy(i % 5 === 0 ? 'tank' : 'grunt')
})
const tds = []
for (let i = 0; i < 12; i++) { await page.waitForTimeout(500); tds.push(await fps()) }
console.log('td fps samples', tds.join(','))
await browser.close()
