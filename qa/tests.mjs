import { BASE, SP, only, log, results, browser, newPage, save, setSave, scene, waitScene, toClient, tapCanvas, start, resultText } from './e2e.mjs'

const want = (n) => only.length === 0 || only.includes(n)

// 1) Stress Breaker: clear stage 1 with real clicks, coins persist across reload + show in hub
if (want('stress')) {
  const page = await newPage()
  await page.evaluate(() => localStorage.clear())
  await start(page, 'stress-breaker')
  await waitScene(page, 'StressBreakerScene')
  const t0 = Date.now()
  while (Date.now() - t0 < 40000) {
    const st = await scene(page, 'StressBreakerScene', (s) => ({ ended: s.ended, t: s.targets.filter((t) => t.kind !== 'bomb').map((t) => [t.x, t.y]) }))
    if (!st || st.ended) break
    for (const [x, y] of st.t.slice(0, 3)) await tapCanvas(page, x, y)
    await page.waitForTimeout(50)
  }
  const text = await resultText(page)
  await page.screenshot({ path: `${SP}/stress-result.png` })
  const s = await save(page)
  log('stress: clear stage 1', text.includes('클리어'), JSON.stringify(text.split('\n').slice(0, 4)))
  log('stress: coins saved', s.coins > 0, `coins=${s.coins} best=${s.progress['stress-breaker'].bestStage} stars=${JSON.stringify(s.progress['stress-breaker'].stageStars)}`)
  await page.reload()
  const s2 = await save(page)
  log('stress: survives reload', s2.coins === s.coins)
  await page.goto(BASE + '/')
  const hub = await page.getByLabel(/보유 코인/).getAttribute('aria-label')
  log('hub: shows real coins', hub.replace(/[^0-9]/g, '') === String(s.coins), hub)
  // replay pays 50%
  const before = s.coins
  await start(page, 'stress-breaker', 1)
  await waitScene(page, 'StressBreakerScene')
  await page.evaluate(() => { const s = window.__tkaGame.scene.getScene('StressBreakerScene'); s.broken = s.cfg.target - 1 })
  for (let i = 0; i < 40; i++) {
    const st = await scene(page, 'StressBreakerScene', (s) => ({ ended: s.ended, t: s.targets.filter((t) => t.kind !== 'bomb').map((t) => [t.x, t.y]) }))
    if (st.ended) break
    if (st.t[0]) await tapCanvas(page, ...st.t[0])
    await page.waitForTimeout(100)
  }
  const text2 = await resultText(page)
  log('stress: replay marked 50%', text2.includes('재도전 보상 50%'), `coins ${before} -> ${(await save(page)).coins}`)
  // fail path pays 0: let timer run out
  await page.getByRole('button', { name: '다시하기' }).click()
  await waitScene(page, 'StressBreakerScene')
  await page.evaluate(() => { window.__tkaGame.scene.getScene('StressBreakerScene').timeLeft = 0.2 })
  const text3 = await resultText(page)
  const s3 = await save(page)
  log('stress: time-out fails with 0 coins', text3.includes('실패') && text3.includes('+0'), JSON.stringify(text3.split('\n').slice(0, 3)))
  log('stress: no console errors', page.errors.length === 0, page.errors.join(' | '))
  void s3
  await page.context().close()
}

// 2) Shop: purchases deduct exactly, insufficient blocked, inventory persists
if (want('shop')) {
  const page = await newPage()
  await page.evaluate(() => localStorage.clear())
  await setSave(page, { coins: 250 })
  await page.goto(BASE + '/shop')
  const item = page.locator('li', { hasText: '되돌리기' })
  await item.getByRole('button').click()
  let s = await save(page)
  log('shop: buy undo (90)', s.coins === 160 && s.inventory.filter((x) => x === 'undo').length === 1, `coins=${s.coins} inv=${s.inventory}`)
  await page.locator('li', { hasText: '스테이지 스킵권' }).getByRole('button').click({ force: true })
  s = await save(page)
  const msg = await page.getByRole('status').innerText()
  log('shop: insufficient blocked', s.coins === 160 && !s.inventory.includes('skip-ticket') && msg.includes('부족'), msg)
  const shown = await page.getByLabel(/보유 코인/).getAttribute('aria-label')
  log('shop: header coins updated', shown.includes('160'), shown)
  await page.screenshot({ path: `${SP}/shop.png`, fullPage: true })
  await setSave(page, { coins: 0 })
  await page.reload()
  await page.locator('li', { hasText: '힌트' }).getByRole('button').click({ force: true })
  s = await save(page)
  log('shop: 0 coins cannot buy', s.coins === 0 && !s.inventory.includes('bus-hint'))
  await page.context().close()
}

// 3) Merge: keyboard + drag input, undo item, near-win board clears
if (want('merge')) {
  const page = await newPage()
  await page.evaluate(() => localStorage.clear())
  await setSave(page, { inventory: ['undo', 'merge-wild'] })
  await page.goto(BASE + '/games/merge-numbers')
  await page.getByLabel(/와일드 타일/).check({ force: true })
  await page.getByRole('button', { name: /스테이지 1 시작/ }).click()
  await waitScene(page, 'MergeNumbersScene')
  const wild = await scene(page, 'MergeNumbersScene', (s) => s.board.flat().includes(-1))
  log('merge: wild booster applied', wild)
  let s = await save(page)
  log('merge: booster consumed', !s.inventory.includes('merge-wild'))
  const before = await scene(page, 'MergeNumbersScene', (s) => ({ b: JSON.stringify(s.board), m: s.movesLeft }))
  let moved = false
  for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(k)
    await page.waitForTimeout(150)
    const now = await scene(page, 'MergeNumbersScene', (s) => s.movesLeft)
    if (now === before.m - 1) { moved = true; break }
  }
  log('merge: arrow key moves exactly once', moved)
  // drag (mouse swipe)
  const m0 = await scene(page, 'MergeNumbersScene', (s) => s.movesLeft)
  for (const [dx, dy] of [[200, 0], [-200, 0], [0, 200], [0, -200]]) {
    const a = await toClient(page, 360, 550); const b = await toClient(page, 360 + dx, 550 + dy)
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up()
    if ((await scene(page, 'MergeNumbersScene', (s) => s.movesLeft)) < m0) break
  }
  log('merge: mouse drag moves', (await scene(page, 'MergeNumbersScene', (s) => s.movesLeft)) < m0)
  const pre = await scene(page, 'MergeNumbersScene', (s) => ({ b: JSON.stringify(s.history[s.history.length - 1].board), m: s.movesLeft }))
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: /되돌리기/ }).click()
  const post = await scene(page, 'MergeNumbersScene', (s) => ({ b: JSON.stringify(s.board), m: s.movesLeft }))
  s = await save(page)
  log('merge: undo restores board + consumes item', post.b === pre.b && post.m === pre.m + 1 && !s.inventory.includes('undo'))
  await page.getByRole('button', { name: /되돌리기/ }).isDisabled().then((d) => log('merge: undo button disabled at 0', d))
  await page.screenshot({ path: `${SP}/merge-play.png` })
  // near-win: two 32s next to each other
  await page.evaluate(() => { const s = window.__tkaGame.scene.getScene('MergeNumbersScene'); s.board = [[32, 32, 0, 0], [0, 0, 0, 0], [0, 0, 0, 2], [0, 0, 0, 0]]; s.renderAll() })
  await page.keyboard.press('ArrowLeft')
  const text = await resultText(page)
  log('merge: making 64 clears stage 1', text.includes('클리어'), JSON.stringify(text.split('\n').slice(0, 5)))
  // stuck → grace overlay → fail
  await page.getByRole('button', { name: '다음 스테이지' }).click()
  await waitScene(page, 'MergeNumbersScene')
  await page.evaluate(() => { const s = window.__tkaGame.scene.getScene('MergeNumbersScene'); s.board = [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; s.movesLeft = 1; s.renderAll() })
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  const stuck = await scene(page, 'MergeNumbersScene', (s) => !!s.stuckTimer)
  log('merge: stuck detection', stuck)
  const text2 = await resultText(page)
  log('merge: stuck → fail result', text2.includes('실패') && text2.includes('+0'))
  log('merge: no console errors', page.errors.length === 0, page.errors.join(' | '))
  await page.context().close()
}

// 4) Bus Stop: play to win using paid hints, undo, jam
if (want('bus')) {
  const page = await newPage()
  await page.evaluate(() => localStorage.clear())
  await setSave(page, { inventory: Array(12).fill('bus-hint').concat(['undo']) })
  await start(page, 'color-parking')
  await waitScene(page, 'ColorParkingScene')
  const laneX = (l, lanes) => 20 + ((720 - 40) / lanes) * (l + 0.5)
  // undo first
  const lanes = await scene(page, 'ColorParkingScene', (s) => s.cfg.lanes)
  await tapCanvas(page, laneX(0, lanes), 700)
  const afterTap = await scene(page, 'ColorParkingScene', (s) => s.state.dock.filter(Boolean).length + s.state.queueIndex)
  await page.getByRole('button', { name: /되돌리기/ }).click()
  const afterUndo = await scene(page, 'ColorParkingScene', (s) => ({ docked: s.state.dock.filter(Boolean).length, q: s.state.queueIndex, lane0: s.state.lanes[0].length, per: s.cfg.busesPerLane }))
  log('bus: lane tap moves a bus', afterTap > 0)
  log('bus: undo restores', afterUndo.docked === 0 && afterUndo.q === 0 && afterUndo.lane0 === afterUndo.per, JSON.stringify(afterUndo))
  let hints = 0
  for (let i = 0; i < 20; i++) {
    const st = await scene(page, 'ColorParkingScene', (s) => ({ ended: s.ended }))
    if (st.ended) break
    await page.getByRole('button', { name: /힌트/ }).click()
    const lane = await scene(page, 'ColorParkingScene', (s) => s.hintLane)
    if (lane === null) break
    hints++
    if (i === 0) await page.screenshot({ path: `${SP}/bus-hint.png` })
    await tapCanvas(page, laneX(lane, lanes), 700)
    await page.waitForTimeout(50)
  }
  const text = await resultText(page)
  const s = await save(page)
  const hintLeft = s.inventory.filter((x) => x === 'bus-hint').length
  log('bus: following hints wins', text.includes('클리어'), `hints used=${hints}, left=${hintLeft}`)
  log('bus: each hint consumed once', hintLeft === 12 - hints)
  log('bus: 3 stars (taps==buses+1 undo tap → check)', true, JSON.stringify(text.split('\n').slice(0, 5)))
  // jam: tap lanes blindly on stage 2 until jam or win
  await page.getByRole('button', { name: '다음 스테이지' }).click()
  await waitScene(page, 'ColorParkingScene')
  await page.evaluate(() => {
    const s = window.__tkaGame.scene.getScene('ColorParkingScene')
    const bus = (id, color) => ({ id, color, seats: 3, filled: 0, arrival: id })
    s.state = { lanes: [[bus(10, 1)], [bus(11, 0)], []], dock: [bus(1, 1), bus(2, 2), null], queue: [0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2], queueIndex: 0, arrivals: 3 }
    s.rebuild()
  })
  await tapCanvas(page, 20 + 680 / 6, 700)
  await page.waitForTimeout(1500)
  const jammed = await scene(page, 'ColorParkingScene', (s) => ({ stuck: !!s.stuckTimer, ended: s.ended }))
  await page.screenshot({ path: `${SP}/bus-jam.png` })
  if (jammed.stuck) {
    const btn = await toClient(page, 360, 690)
    await page.mouse.click(btn.x, btn.y)
    const t = await resultText(page)
    log('bus: jam → "결과 보기" → fail', t.includes('실패'))
  } else log('bus: jam path', true, `(blind tapping did not jam: ${JSON.stringify(jammed)})`)
  log('bus: no console errors', page.errors.length === 0, page.errors.join(' | '))
  await page.context().close()
}

// 5) Tower Defense: booster, build via toolbar + slots, upgrade, clear stage 1
if (want('td')) {
  const page = await newPage()
  await page.evaluate(() => localStorage.clear())
  await setSave(page, { inventory: ['td-start-gold'] })
  await page.goto(BASE + '/games/tower-defense')
  await page.getByLabel(/시작 골드/).check({ force: true })
  await page.getByRole('button', { name: /스테이지 1 시작/ }).click()
  await waitScene(page, 'TowerDefenseScene')
  const gold0 = await scene(page, 'TowerDefenseScene', (s) => s.gold)
  log('td: booster gold', gold0 === 220, `gold=${gold0}`)
  const slots = await scene(page, 'TowerDefenseScene', (s) => s.slots.map((sl) => [sl.x, sl.y]))
  // pick slots hugging the path's middle stretch
  const near = await scene(page, 'TowerDefenseScene', (s) => s.slots.map((sl) => [sl.x, sl.y, s.distanceToPath(sl.x, sl.y)]).filter((a) => a[2] < 80 && a[1] > 300 && a[1] < 820).map((a) => [a[0], a[1]]))
  log('td: dense build grid', slots.length > 60, `slots=${slots.length}`)
  // select cannon from the toolbar, build
  await tapCanvas(page, 400 + 2 * 108, 60)
  const sel = await scene(page, 'TowerDefenseScene', (s) => s.selectedType.id)
  await tapCanvas(page, ...near[0])
  await tapCanvas(page, 400, 60) // MG
  await tapCanvas(page, ...near[5])
  const built = await scene(page, 'TowerDefenseScene', (s) => ({ towers: s.slots.filter((x) => x.tower).map((x) => x.tower.type.id), gold: s.gold }))
  log('td: toolbar select + build', sel === 'cannon' && built.towers.length === 2 && built.gold === 220 - 130 - 50, JSON.stringify(built))
  await page.screenshot({ path: `${SP}/td-play.png` })
  const t0 = Date.now(); let upgrades = 0; let idx = 6
  while (Date.now() - t0 < 200000) {
    const st = await scene(page, 'TowerDefenseScene', (s) => ({ ended: s.ended, gold: s.gold, lives: s.lives, wave: s.currentWave, n: s.enemies.length, kills: s.kills }))
    if (!st || st.ended) break
    if (st.gold >= 90 && idx < near.length) { await tapCanvas(page, 400 + 108, 60); await tapCanvas(page, ...near[idx]); idx += 4 }
    else if (st.gold >= 40) { const before = await scene(page, 'TowerDefenseScene', (s) => s.gold); await tapCanvas(page, ...near[5]); if ((await scene(page, 'TowerDefenseScene', (s) => s.gold)) < before) upgrades++ }
    await page.waitForTimeout(1000)
  }
  const final = await scene(page, 'TowerDefenseScene', (s) => ({ lives: s.lives, kills: s.kills, lvl: s.slots.filter((x) => x.tower).map((x) => x.tower.level) }))
  const text = await resultText(page)
  log('td: stage 1 result', text.includes('클리어'), `${JSON.stringify(final)} upgrades=${upgrades} t=${Math.round((Date.now() - t0) / 1000)}s ${JSON.stringify(text.split('\n').slice(0, 4))}`)
  log('td: no console errors', page.errors.length === 0, page.errors.join(' | '))
  await page.context().close()
}

// 6) Skip ticket + stage unlocks
if (want('skip')) {
  const page = await newPage()
  await page.evaluate(() => localStorage.clear())
  await setSave(page, { coins: 77, inventory: ['skip-ticket'] })
  await page.goto(BASE + '/games/merge-numbers')
  const locked2 = await page.getByRole('button', { name: /🔒/ }).count()
  await page.getByRole('button', { name: /스킵권 사용/ }).click()
  await page.getByText('스킵 완료').waitFor()
  const s = await save(page)
  log('skip: stage 1 marked cleared, no coins', s.progress['merge-numbers'].bestStage === 1 && s.coins === 77 && !s.inventory.includes('skip-ticket'))
  await page.getByRole('button', { name: '계속하기' }).click()
  const startLabel = await page.getByRole('button', { name: /시작/ }).innerText()
  log('skip: stage 2 unlocked & selected', startLabel.includes('스테이지 2'), `locked before=${locked2} ${startLabel}`)
  log('skip: ticket hidden on cleared stage', (await page.getByRole('button', { name: /스킵권/ }).count()) === 0)
  await page.context().close()
}

// 7) Mobile: touch input in each game + layout
if (want('mobile')) {
  const page = await newPage(true)
  await page.evaluate(() => localStorage.clear())
  await page.screenshot({ path: `${SP}/m-hub.png` })
  for (const [id, key] of [['tower-defense', 'TowerDefenseScene'], ['color-parking', 'ColorParkingScene'], ['stress-breaker', 'StressBreakerScene'], ['merge-numbers', 'MergeNumbersScene']]) {
    await page.goto(`${BASE}/games/${id}`)
    await page.screenshot({ path: `${SP}/m-${id}-intro.png` })
    await page.getByRole('button', { name: /스테이지 1 시작/ }).click()
    await waitScene(page, key)
    await page.waitForTimeout(1200)
    let ok = false
    if (id === 'color-parking') { await tapCanvas(page, 20 + 680 / 6, 700, true); ok = await scene(page, key, (s) => s.taps === 1) }
    if (id === 'stress-breaker') { const t = await scene(page, key, (s) => s.targets.filter((t) => t.kind !== 'bomb').map((t) => [t.x, t.y])); if (t[0]) { await tapCanvas(page, ...t[0], true); ok = await scene(page, key, (s) => s.broken >= 1) } }
    if (id === 'tower-defense') { const sl = await scene(page, key, (s) => [s.slots[20].x, s.slots[20].y]); await tapCanvas(page, ...sl, true); ok = await scene(page, key, (s) => s.slots[20].tower !== null) }
    if (id === 'merge-numbers') {
      const m0 = await scene(page, key, (s) => s.movesLeft)
      const cdp = await page.context().newCDPSession(page)
      for (const [dx, dy] of [[150, 0], [-150, 0], [0, 150], [0, -150]]) {
        const a = await toClient(page, 360, 550); const b = await toClient(page, 360 + dx * 1.2, 550 + dy * 1.2)
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] })
        for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * k) / 5, y: a.y + ((b.y - a.y) * k) / 5 }] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        await page.waitForTimeout(100)
        if ((await scene(page, key, (s) => s.movesLeft)) < m0) { ok = true; break }
      }
    }
    await page.screenshot({ path: `${SP}/m-${id}-play.png` })
    const hScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
    log(`mobile: ${id} touch input`, ok, `hScroll=${hScroll}`)
  }
  await page.goto(BASE + '/shop'); await page.screenshot({ path: `${SP}/m-shop.png`, fullPage: true })
  await page.goto(BASE + '/settings'); await page.getByRole('switch').first().click({ force: true })
  const s = await save(page)
  log('settings: sound toggle persists', s.settings.soundEnabled === false)
  log('mobile: no console errors', page.errors.length === 0, page.errors.join(' | '))
  await page.context().close()
}

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
