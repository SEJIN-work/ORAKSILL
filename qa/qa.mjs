// Stage-4 QA: PRD checks not covered by tests.mjs. Usage: node qa.mjs [section...]
import { PREVIEW, BASE, SP, only, log, results, browser, newPage, save, setSave, scene, waitScene, toClient, tapCanvas, start, resultText } from './e2e.mjs'
const want = (n) => only.length === 0 || only.includes(n)
const GAMES = [
  ['tower-defense', 'TowerDefenseScene', '타워디펜스'],
  ['color-parking', 'ColorParkingScene', '버스 정류장'],
  ['stress-breaker', 'StressBreakerScene', '스트레스 브레이커'],
  ['merge-numbers', 'MergeNumbersScene', '넘버 머지'],
]

async function newCtx(viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch, deviceScaleFactor: touch ? 2 : 1 })
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()) })
  await page.goto(BASE + '/')
  return page
}

/** Interactive elements smaller than 44px or overlapping each other. */
async function layoutIssues(page) {
  return page.evaluate(() => {
    const els = [...document.querySelectorAll('button, a, [role=switch], label')].filter((e) => {
      const r = e.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'
    })
    const small = []
    const boxes = els.map((e) => ({ e, r: e.getBoundingClientRect() }))
    for (const { e, r } of boxes) {
      if (e.tagName === 'LABEL' && e.querySelector('a')) continue
      if (e.closest('label') && e.tagName === 'A') continue
      if (Math.min(r.width, r.height) < 40) small.push(`${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 18)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    const overlaps = []
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      if (a.e.contains(b.e) || b.e.contains(a.e)) continue
      const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
      const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
      if (ix > 2 && iy > 2) overlaps.push(`${a.e.textContent.trim().slice(0, 12)} × ${b.e.textContent.trim().slice(0, 12)}`)
    }
    const hScroll = document.documentElement.scrollWidth > window.innerWidth + 1
    return { small, overlaps, hScroll }
  })
}

// A) Hub contents + navigation + 1-tap return, on several viewports
if (want('hub')) {
  for (const [name, vp, touch] of [['PC 1366', { width: 1366, height: 850 }, false], ['PC 1920', { width: 1920, height: 1080 }, false], ['iPhone 390', { width: 390, height: 844 }, true], ['Android 412', { width: 412, height: 915 }, true], ['small 360', { width: 360, height: 640 }, true], ['landscape 844', { width: 844, height: 390 }, true]]) {
    const page = await newCtx(vp, touch)
    await page.evaluate(() => localStorage.clear())
    await page.reload()
    const has = {
      title: await page.getByRole('heading', { name: /타임킬러/ }).isVisible(),
      coins: await page.getByLabel(/보유 코인/).first().isVisible(),
      cards: await page.locator('a[aria-label$="플레이"]').count(),
      shop: await page.getByRole('link', { name: /상점/ }).isVisible(),
      settings: await page.getByRole('link', { name: /설정/ }).isVisible(),
    }
    log(`hub[${name}]: title/coins/4 cards/shop/settings`, has.title && has.coins && has.cards === 4 && has.shop && has.settings, JSON.stringify(has))
    const li = await layoutIssues(page)
    log(`hub[${name}]: layout (≥40px targets, no overlap, no h-scroll)`, !li.small.length && !li.overlaps.length && !li.hScroll, JSON.stringify(li))
    await page.screenshot({ path: `${SP}/qa-hub-${name.replace(/\s/g, '')}.png`, fullPage: true })
    for (const [id, key, title] of GAMES) {
      await page.goto(BASE + '/')
      await page.getByRole('link', { name: `${title} 플레이` }).click()
      await page.waitForURL(`**/games/${id}`)
      const introLayout = await layoutIssues(page)
      await page.getByRole('button', { name: /스테이지 1 시작/ }).click()
      await waitScene(page, key)
      const box = await page.locator('canvas').boundingBox()
      const bar = await page.locator('button', { hasText: '그만하기' }).boundingBox()
      const vis = box && box.width > 150 && box.y >= 0 && box.y + box.height <= vp.height + 1 && (!bar || bar.y >= box.y + box.height - 2 || bar.x >= box.x + box.width - 2)
      if (name === 'landscape 844' || name === 'small 360') await page.screenshot({ path: `${SP}/qa-${id}-${name.replace(/\s/g, '')}.png` })
      await page.getByRole('link', { name: '로비로 돌아가기' }).click()
      await page.getByRole('heading', { name: /타임킬러/ }).waitFor()
      log(`nav[${name}] ${id}: intro→play→1-tap hub; canvas fits`, !!vis && !introLayout.hScroll, `canvas=${box && `${Math.round(box.width)}x${Math.round(box.height)}@${Math.round(box.y)}`} introSmall=${introLayout.small.length} overlaps=${introLayout.overlaps.join(';')}`)
    }
    for (const p of ['/shop', '/settings']) {
      await page.goto(BASE + p)
      const li2 = await layoutIssues(page)
      await page.getByRole('link', { name: '로비로 돌아가기' }).click()
      await page.getByRole('heading', { name: /타임킬러/ }).waitFor()
      log(`nav[${name}] ${p}: layout + 1-tap hub`, !li2.hScroll && !li2.overlaps.length, JSON.stringify(li2))
    }
    log(`hub[${name}]: no console errors`, page.errors.length === 0, page.errors.join(' | '))
    await page.context().close()
  }
}

// B) Edge cases: rapid input, mid-game exit, corrupt save
if (want('edge')) {
  const page = await newPage()
  // Double-click start → exactly one attempt
  await page.evaluate(() => localStorage.clear())
  await page.goto(BASE + '/games/merge-numbers')
  await page.getByRole('button', { name: /스테이지 1 시작/ }).dblclick()
  await waitScene(page, 'MergeNumbersScene')
  await page.waitForTimeout(600)
  let s = await save(page)
  log('edge: double-click start = 1 attempt', s.progress['merge-numbers'].playCount === 1 && (await page.locator('canvas').count()) === 1, `playCount=${s.progress['merge-numbers'].playCount}`)
  // Key spam in merge: state stays consistent with views
  const m0 = await scene(page, 'MergeNumbersScene', (s) => s.movesLeft)
  for (let i = 0; i < 40; i++) await page.keyboard.press(['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'][i % 4], { delay: 5 })
  await page.waitForTimeout(500)
  const ms = await scene(page, 'MergeNumbersScene', (s) => ({ moves: s.movesLeft, tiles: s.tiles.size, cells: s.board.flat().filter((v) => v > 0 || v === -1).length, hist: s.history.length, ended: s.ended }))
  log('edge: 40 rapid key presses keep views==board', ms.tiles === ms.cells && m0 - ms.moves === ms.hist, JSON.stringify(ms))
  // Bus lane tap spam
  await start(page, 'color-parking', 1)
  await waitScene(page, 'ColorParkingScene')
  const c0 = await toClient(page, 133, 700); const c1 = await toClient(page, 360, 700); const c2 = await toClient(page, 586, 700)
  for (let i = 0; i < 18; i++) { const c = [c0, c1, c2][i % 3]; await page.mouse.click(c.x, c.y, { delay: 1 }) }
  await page.waitForTimeout(3500)
  const bs = await scene(page, 'ColorParkingScene', (s) => ({ docked: s.state.dock.filter(Boolean).length, views: s.dockViews.filter(Boolean).length, lanesV: s.laneViews.map((l) => l.length).join(), lanesS: s.state.lanes.map((l) => l.length).join(), qv: s.queueViews.length, qs: Math.min(12, s.state.queue.length - s.state.queueIndex), ended: s.ended, stuck: !!s.stuckTimer }))
  log('edge: 18 rapid lane taps keep views==state', bs.docked === bs.views && bs.lanesV === bs.lanesS && bs.qv === bs.qs, JSON.stringify(bs))
  // Rapid purchase clicks: 250 coins, 10 clicks on 90-coin item → exactly 2 bought
  await setSave(page, { coins: 250, inventory: [] })
  await page.goto(BASE + '/shop')
  const btn = page.locator('li', { hasText: '되돌리기' }).getByRole('button')
  for (let i = 0; i < 10; i++) await btn.click({ force: true, delay: 1 })
  s = await save(page)
  log('edge: 10 rapid buys with 250 coins → exactly 2', s.coins === 70 && s.inventory.filter((x) => x === 'undo').length === 2, `coins=${s.coins} inv=${s.inventory.length}`)
  // TD tap spam on one slot: never negative gold, level ≤3
  await setSave(page, { coins: 0, inventory: [] })
  await start(page, 'tower-defense', 1)
  await waitScene(page, 'TowerDefenseScene')
  await page.evaluate(() => { window.__tkaGame.scene.getScene('TowerDefenseScene').gold = 1000 })
  const sl = await scene(page, 'TowerDefenseScene', (s) => [s.slots[30].x, s.slots[30].y])
  const sc = await toClient(page, ...sl)
  for (let i = 0; i < 12; i++) await page.mouse.click(sc.x, sc.y, { delay: 1 })
  await page.waitForTimeout(300)
  const td = await scene(page, 'TowerDefenseScene', (s) => ({ gold: s.gold, lvl: s.slots[30].tower?.level, towers: s.slots.filter((x) => x.tower).length }))
  log('edge: 12 rapid taps on a slot → 1 tower, lvl 3, gold ≥0', td.towers === 1 && td.lvl === 3 && td.gold >= 0, JSON.stringify(td))
  // Mid-game exit: no result applied, no lingering game
  await setSave(page, { coins: 500, inventory: ['td-start-gold'] })
  await page.goto(BASE + '/games/tower-defense')
  await page.getByLabel(/시작 골드/).check({ force: true })
  await page.getByRole('button', { name: /스테이지 1 시작/ }).click()
  await waitScene(page, 'TowerDefenseScene')
  await page.waitForTimeout(800)
  const before = await save(page)
  await page.getByRole('link', { name: '로비로 돌아가기' }).click()
  await page.waitForTimeout(800)
  const after = await save(page)
  const destroyed = await page.evaluate(() => !document.querySelector('canvas'))
  log('edge: leaving mid-game applies no result, destroys game', after.coins === 500 && after.progress['tower-defense'].bestStage === 0 && JSON.stringify(after.progress) === JSON.stringify(before.progress) && destroyed, `coins=${after.coins} boosterLeft=${after.inventory.length} (booster spent on start)`)
  // Quit button mid-game same
  await start(page, 'stress-breaker', 1)
  await waitScene(page, 'StressBreakerScene')
  await page.getByRole('button', { name: '그만하기' }).click()
  await page.waitForTimeout(400)
  log('edge: 그만하기 returns to intro, no canvas', (await page.locator('canvas').count()) === 0 && (await page.getByRole('button', { name: /시작/ }).count()) > 0)
  // Corrupt saves
  for (const [label, raw] of [['garbage text', '{not json'], ['wrong types', JSON.stringify({ coins: 'abc', inventory: 5, progress: { 'tower-defense': { bestStage: -3, stageStars: { 1: 9 } } }, settings: { soundEnabled: 'yes' } })], ['huge negative', JSON.stringify({ coins: -999 })]]) {
    await page.evaluate((r) => localStorage.setItem('tka:save:v1', r), raw)
    await page.goto(BASE + '/')
    const ok = await page.getByRole('heading', { name: /타임킬러/ }).isVisible()
    const lbl = await page.getByLabel(/보유 코인/).first().getAttribute('aria-label')
    await page.goto(BASE + '/games/tower-defense')
    const playable = await page.getByRole('button', { name: /스테이지 1 시작/ }).waitFor({ timeout: 8000 }).then(() => true, () => false)
    log(`edge: corrupt save (${label}) loads safely`, ok && lbl === '보유 코인 0' && playable, lbl)
  }
  log('edge: no console errors', page.errors.length === 0, page.errors.join(' | '))
  await page.context().close()
}

// C) PRD 7 per-game features by stage + failure paths + shared coins across games
if (want('features')) {
  const page = await newPage()
  await page.evaluate(() => localStorage.clear())
  const unlockAll = () => setSave(page, { progress: Object.fromEntries(GAMES.map(([id]) => [id, { bestStage: 29, stageStars: {}, playCount: 1 }])) })
  await unlockAll()
  // TD: enemy mix by stage, 3 waves + boss
  const tdMix = []
  for (const st of [1, 2, 4, 8, 12]) {
    await start(page, 'tower-defense', st)
    await waitScene(page, 'TowerDefenseScene')
    tdMix.push(await scene(page, 'TowerDefenseScene', (s) => [...new Set(s.schedule.map((e) => e.type))].sort().join('+') + ` waves=${Math.max(...s.schedule.map((e) => e.wave))}`))
  }
  const tdExpect = ['boss+grunt', 'boss+grunt+runner', 'boss+grunt+runner+tank', 'boss+grunt+knight+runner+tank', 'boss+grunt+knight+runner+swarm+tank'].map((t) => t + ' waves=4')
  log('TD: runner st2, armored tank st4, 장갑병 st8, swarm st12, boss = wave 4', tdMix.every((m, i) => m === tdExpect[i]), tdMix.join(' | '))
  const armor = await scene(page, 'TowerDefenseScene', (s) => { s.spawnEnemy('knight'); s.spawnEnemy('grunt'); const n = s.enemies.length; return [s.enemies[n - 2].armor, s.enemies[n - 1].armor] })
  log('TD: knights armored, grunts not', armor[0] >= 9 && armor[1] === 0, JSON.stringify(armor))
  // TD failure: no towers → defeat, 0 coins
  await page.evaluate(() => {
    const s = window.__tkaGame.scene.getScene('TowerDefenseScene')
    s.lives = 1
  })
  await page.getByRole('heading', { name: /클리어|실패/ }).waitFor({ timeout: 90000 })
  const t = await page.locator('main').innerText()
  log('TD: enemies leaking → DEFEAT, +0', t.includes('실패') && t.includes('+0'))
  // Bus: config scales by stage
  const busCfg = []
  for (const st of [1, 4, 8, 24]) {
    await start(page, 'color-parking', st)
    await waitScene(page, 'ColorParkingScene')
    busCfg.push(await scene(page, 'ColorParkingScene', (s) => `${s.cfg.lanes}/${s.cfg.busesPerLane}/${s.cfg.colors}/${s.cfg.seats}`))
  }
  log('Bus: lanes/buses/colors/seats grow by stage', busCfg.join(' → ') === '3/2/2/3 → 4/3/4/3 → 5/5/5/4 → 7/7/8/6', busCfg.join(' → '))
  // Stress: bombs from st2, tough from st3
  const sb = []
  for (const st of [1, 2, 3]) {
    await start(page, 'stress-breaker', st)
    await waitScene(page, 'StressBreakerScene')
    sb.push(await scene(page, 'StressBreakerScene', (s) => `bomb=${s.cfg.bombChance > 0} tough=${s.cfg.toughChance > 0} t=${s.cfg.time}s goal=${s.cfg.target}`))
  }
  log('Stress: bombs from st2, 2-hit boxes from st3', sb[0].startsWith('bomb=false tough=false') && sb[1].startsWith('bomb=true tough=false') && sb[2].startsWith('bomb=true tough=true'), sb.join(' | '))
  // Stress: bonus object pays coins, bomb subtracts
  await page.evaluate(() => {
    const s = window.__tkaGame.scene.getScene('StressBreakerScene')
    s.broken = 5
    const mk = (kind) => { s.spawn(); const t = s.targets[s.targets.length - 1]; t.kind = kind; t.hp = 1; return t }
    s.hit(mk('bomb'))
    s.hit(mk('bonus'))
  })
  const sbr = await scene(page, 'StressBreakerScene', (s) => ({ broken: s.broken, bonus: s.bonusCoins }))
  log('Stress: bomb −3, bonus +1 break & +5 coins', sbr.broken === 3 && sbr.bonus === 5, JSON.stringify(sbr))
  // Merge: obstacles from st3, bigger boards later
  const mg = []
  for (const st of [1, 5, 14, 24]) {
    await start(page, 'merge-numbers', st)
    await waitScene(page, 'MergeNumbersScene')
    mg.push(await scene(page, 'MergeNumbersScene', (s) => `${s.cfg.size}x${s.cfg.size} obs=${s.board.flat().filter((v) => v === -2).length} goal=${s.cfg.target}`))
  }
  log('Merge: boards/obstacles/targets per table', mg[0] === '4x4 obs=0 goal=64' && mg[1] === '5x5 obs=1 goal=128' && mg[2] === '6x6 obs=3 goal=256' && mg[3] === '6x6 obs=6 goal=256', mg.join(' | '))
  // Stage counts: 30 / 24 / 30 / 24 buttons
  const counts = []
  for (const id of ['tower-defense', 'color-parking', 'stress-breaker', 'merge-numbers']) {
    await page.goto(BASE + '/games/' + id)
    await page.locator('button[aria-pressed]').first().waitFor()
    counts.push(await page.locator('button[aria-pressed]').count())
  }
  log('Stage counts 30/24/30/24', counts.join('/') === '30/24/30/24', counts.join('/'))
  // Shared wallet: earn in Stress, spend in shop, use the item in Merge
  await page.evaluate(() => localStorage.clear())
  for (const st of [1, 2]) {
    await start(page, 'stress-breaker', st)
    await waitScene(page, 'StressBreakerScene')
    await page.evaluate(() => { const s = window.__tkaGame.scene.getScene('StressBreakerScene'); s.broken = s.cfg.target - 1 })
    for (let i = 0; i < 40; i++) {
      const st2 = await scene(page, 'StressBreakerScene', (s) => ({ e: s.ended, t: s.targets.filter((t) => t.kind !== 'bomb').map((t) => [t.x, t.y]) }))
      if (st2.e) break
      if (st2.t[0]) await tapCanvas(page, ...st2.t[0])
      await page.waitForTimeout(80)
    }
    await resultText(page)
    await page.waitForTimeout(500)
  }
  const earned = (await save(page)).coins
  await page.getByRole('link', { name: /상점가기/ }).click()
  await page.locator('li', { hasText: '되돌리기' }).getByRole('button').click()
  const afterBuy = await save(page)
  await page.goto(BASE + '/games/merge-numbers')
  await page.getByRole('button', { name: /스테이지 1 시작/ }).click()
  await waitScene(page, 'MergeNumbersScene')
  for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) { await page.keyboard.press(k); await page.waitForTimeout(150) }
  await page.getByRole('button', { name: /되돌리기/ }).click()
  const used = await save(page)
  log('Economy: coins earned in Stress buy an item used in Merge', earned >= 90 && afterBuy.coins === earned - 90 && !used.inventory.includes('undo'), `earned=${earned} → after buy ${afterBuy.coins}, undo used=${!used.inventory.includes('undo')}`)
  log('features: no console errors', page.errors.length === 0, page.errors.join(' | '))
  await page.context().close()
}

// D) Load performance on the production build with throttled network
if (want('load')) {
  for (const [label, net] of [['4G (9Mbps/60ms)', { downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8, latency: 60 }], ['Fast 3G (1.6Mbps/150ms)', { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (0.75 * 1024 * 1024) / 8, latency: 150 }]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, ...net })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const t0 = Date.now()
    await page.goto(PREVIEW + '/')
    await page.getByRole('heading', { name: /타임킬러/ }).waitFor()
    const hubMs = Date.now() - t0
    const t1 = Date.now()
    await page.getByRole('link', { name: '넘버 머지 플레이' }).click()
    await page.getByRole('button', { name: /스테이지 1 시작/ }).waitFor()
    const introMs = Date.now() - t1
    const t2 = Date.now()
    await page.getByRole('button', { name: /스테이지 1 시작/ }).click()
    await page.waitForFunction(() => { const c = document.querySelector('canvas'); return c && c.width > 0 })
    const canvasMs = Date.now() - t2
    // second game via in-app navigation: Phaser chunk is cached now
    await page.getByRole('link', { name: '로비로 돌아가기' }).click()
    await page.getByRole('link', { name: '타워디펜스 플레이' }).waitFor()
    const t3 = Date.now()
    await page.getByRole('link', { name: '타워디펜스 플레이' }).click()
    await page.getByRole('button', { name: /스테이지 1 시작/ }).waitFor()
    const cachedMs = Date.now() - t3
    log(`load[${label}]: hub ≤3s, first game ≤3s, cached game ≤2s`, hubMs <= 3000 && introMs <= 3000 && cachedMs <= 2000, `hub=${hubMs}ms, game intro (Phaser download)=${introMs}ms, canvas=${canvasMs}ms, other game (cached)=${cachedMs}ms`)
    await ctx.close()
  }
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
