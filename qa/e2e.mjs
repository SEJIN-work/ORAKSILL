// Shared Playwright helpers for every qa/ script. Uses the system Chrome (channel: 'chrome') via
// playwright-core, so no browser download is needed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

/** Dev server under test (`npm run dev`). Override with QA_BASE, e.g. when 5173 is taken. */
const BASE = process.env.QA_BASE ?? 'http://localhost:5173'
/** Production build (`npm run build && npx vite preview`), used by the load-time checks. */
export const PREVIEW = process.env.QA_PREVIEW ?? 'http://localhost:4173'
/** Screenshots/logs go here (gitignored). */
const SP = path.join(path.dirname(fileURLToPath(import.meta.url)), 'output').replace(/\\/g, '/')
fs.mkdirSync(SP, { recursive: true })
const only = process.argv.slice(2)
const results = []
const log = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${info}`) }

const browser = await chromium.launch({ channel: 'chrome', headless: true })

async function newPage(mobile = false) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }
    : { viewport: { width: 1366, height: 850 } })
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', (e) => page.errors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()) })
  await page.goto(BASE + '/')
  return page
}
const save = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('tka:save:v1') || 'null'))
const setSave = (page, mut) => page.evaluate((m) => {
  const s = JSON.parse(localStorage.getItem('tka:save:v1') || 'null') || {}
  Object.assign(s, m)
  localStorage.setItem('tka:save:v1', JSON.stringify(s))
}, mut)
const scene = (page, key, fn) => page.evaluate(({ key, fn }) => {
  const s = window.__tkaGame?.scene?.getScene(key)
  return s ? new Function('s', `return (${fn})(s)`)(s) : null
}, { key, fn: fn.toString() })
const waitScene = async (page, key) => {
  await page.waitForFunction((k) => { const s = window.__tkaGame?.scene?.getScene(k); return !!(s && s.sys.settings.status >= 5) }, key, { timeout: 15000 })
  await page.waitForTimeout(400)
}
async function toClient(page, x, y) {
  const b = await page.locator('canvas').boundingBox()
  return { x: b.x + (x * b.width) / 720, y: b.y + (y * b.height) / 1080 }
}
async function tapCanvas(page, x, y, mobile = false) {
  const c = await toClient(page, x, y)
  if (mobile) await page.touchscreen.tap(c.x, c.y)
  else await page.mouse.click(c.x, c.y)
  await page.waitForTimeout(80) // Phaser processes queued input on its next frame
}
async function start(page, gameId, stage = 1) {
  await page.goto(`${BASE}/games/${gameId}`)
  await page.locator('button[aria-pressed]').nth(stage - 1).click()
  await page.getByRole('button', { name: new RegExp(`스테이지 ${stage} 시작`) }).click()
}
const resultText = async (page) => {
  await page.getByRole('heading', { name: /클리어|실패/ }).waitFor({ timeout: 20000 })
  return page.locator('main').innerText()
}

export { BASE, SP, only, log, results, browser, newPage, save, setSave, scene, waitScene, toClient, tapCanvas, start, resultText }
