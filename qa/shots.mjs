import { BASE, SP, browser, newPage, setSave, scene, waitScene, tapCanvas, start, only } from './e2e.mjs'

const mobile = only.includes('mobile')
const tag = mobile ? 'm' : 'pc'
const page = await newPage(mobile)
await page.evaluate(() => localStorage.clear())
await setSave(page, {
  coins: 1840,
  inventory: ['undo', 'undo', 'bus-hint', 'bus-hint', 'td-start-gold', 'skip-ticket'],
  progress: { 'tower-defense': { bestStage: 3, stageStars: { 1: 3, 2: 2, 3: 1 }, playCount: 4 }, 'merge-numbers': { bestStage: 1, stageStars: { 1: 2 }, playCount: 2 } },
})
const shot = async (name, full = false) => page.screenshot({ path: `${SP}/s3-${tag}-${name}.png`, fullPage: full })

await page.goto(BASE + '/')
await page.waitForTimeout(900)
await shot('hub', true)

// Stress Breaker mid-combo
await page.goto(BASE + '/games/stress-breaker')
await page.waitForTimeout(700)
await shot('stress-intro')
await page.getByRole('button', { name: /스테이지 1 시작/ }).click()
await waitScene(page, 'StressBreakerScene')
await page.waitForTimeout(2500)
await shot('stress-objects')
for (let k = 0; k < 6; k++) {
  const t = await scene(page, 'StressBreakerScene', (s) => s.targets.filter((t) => t.kind !== 'bomb').map((t) => [t.x, t.y]))
  for (const [x, y] of t.slice(0, 2)) await tapCanvas(page, x, y, mobile)
  await page.waitForTimeout(150)
  if (k === 2) await shot('stress-hit')
}
await page.waitForTimeout(40)
await shot('stress-play')

// Merge with some tiles
await page.goto(BASE + '/games/merge-numbers')
await page.locator('button[aria-pressed]').nth(1).click()
await page.getByRole('button', { name: /스테이지 2 시작/ }).click()
await waitScene(page, 'MergeNumbersScene')
await page.evaluate(() => { const s = window.__tkaGame.scene.getScene('MergeNumbersScene'); s.board = [[2, 4, 8, 16], [32, 64, 128, 0], [0, 4, 4, 0], [2, 0, 0, 2]]; s.renderAll() })
await page.keyboard.press('ArrowLeft')
await page.waitForTimeout(70)
await shot('merge-anim')
await page.waitForTimeout(500)
await shot('merge-play')

// Bus stop mid-boarding
await start(page, 'color-parking', 1)
await waitScene(page, 'ColorParkingScene')
await page.waitForTimeout(900)
await shot('bus-start')
const lanes = await scene(page, 'ColorParkingScene', (s) => s.cfg.lanes)
const laneX = (l) => 20 + ((720 - 40) / lanes) * (l + 0.5)
await page.getByRole('button', { name: /힌트/ }).click()
const lane = await scene(page, 'ColorParkingScene', (s) => s.hintLane)
await page.waitForTimeout(200)
await shot('bus-hint')
await tapCanvas(page, laneX(lane), 700, mobile)
await page.waitForTimeout(450)
await shot('bus-boarding')
await page.waitForTimeout(900)
await shot('bus-after')

// Tower defense with towers + enemies
await page.goto(BASE + '/games/tower-defense')
await page.waitForTimeout(500)
await shot('td-intro')
await page.getByLabel(/시작 골드/).check({ force: true })
await page.locator('button[aria-pressed]').nth(0).click()
await page.getByRole('button', { name: /스테이지 1 시작/ }).click()
await waitScene(page, 'TowerDefenseScene')
const near = await scene(page, 'TowerDefenseScene', (s) => s.slots.map((sl) => [sl.x, sl.y, s.distanceToPath(sl.x, sl.y)]).filter((a) => a[2] < 80 && a[1] > 300 && a[1] < 820).map((a) => [a[0], a[1]]))
await tapCanvas(page, 400 + 2 * 108, 60, mobile)
await tapCanvas(page, ...near[0], mobile)
await tapCanvas(page, 400, 60, mobile)
await tapCanvas(page, ...near[5], mobile)
await tapCanvas(page, 400 + 108, 60, mobile)
await page.evaluate(() => { window.__tkaGame.scene.getScene('TowerDefenseScene').gold += 300 })
await tapCanvas(page, ...near[9], mobile)
await tapCanvas(page, ...near[5], mobile)
await page.waitForTimeout(7000)
await shot('td-play')
await page.evaluate(() => { const s = window.__tkaGame.scene.getScene('TowerDefenseScene'); s.elapsed = s.bossWarnAt - 10 })
await page.waitForTimeout(450)
await shot('td-bosswarn')
await page.waitForTimeout(3000)
await shot('td-boss')

// Result screen (clear)
await start(page, 'stress-breaker', 1)
await waitScene(page, 'StressBreakerScene')
await page.evaluate(() => { const s = window.__tkaGame.scene.getScene('StressBreakerScene'); s.broken = s.cfg.target - 1; s.maxCombo = 12 })
for (let i = 0; i < 30; i++) {
  const st = await scene(page, 'StressBreakerScene', (s) => ({ e: s.ended, t: s.targets.filter((t) => t.kind !== 'bomb').map((t) => [t.x, t.y]) }))
  if (st.e) break
  if (st.t[0]) await tapCanvas(page, ...st.t[0], mobile)
  await page.waitForTimeout(100)
}
await page.waitForTimeout(250)
await shot('stress-clear-banner')
await page.getByRole('heading', { name: /클리어|실패/ }).waitFor({ timeout: 10000 })
await page.waitForTimeout(2600)
await shot('result')

await page.goto(BASE + '/shop')
await page.waitForTimeout(500)
await page.locator('li', { hasText: '되돌리기' }).getByRole('button').click()
await page.waitForTimeout(300)
await shot('shop', true)
await page.goto(BASE + '/settings')
await page.waitForTimeout(400)
await shot('settings')
console.log('errors:', page.errors)
await browser.close()
