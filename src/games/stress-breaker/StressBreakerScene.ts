import * as Phaser from 'phaser'
import { sfx } from '../../systems/audio/audio.ts'
import { stageReward, starBonus, starsFromRatio } from '../../systems/economy.ts'
import { vibrate } from '../../systems/haptics.ts'
import { banner, burst, confetti, flash, hitFlash, hitStop, isFrozen, popText, punch, ring, shake, shards, zoomPunch } from '../effects.ts'
import { emitResult, getInitData } from '../session.ts'
import { displayText, drawBackdrop, drawHudBar, ensureGlowTexture, hex, NEON } from '../theme.ts'

export const MAX_STAGE = 10
export const BOOSTER_SECONDS = 10

interface StageConfig {
  time: number
  target: number
  spawnMs: number
  maxAlive: number
  lifetimeMs: number
  bombChance: number
  bonusChance: number
  toughChance: number
}

/**
 * Difficulty (PRD 7.3): higher target, faster spawns, shorter lifetimes, bombs from stage 2,
 * 2-hit boxes from stage 3. Tuned 2026-10-02 with a human-model sim (casual player clears
 * 100%→32% across stages 1-10). Keep total spawns comfortably above `target`: the previous table
 * made stages 6-10 mathematically unwinnable (fewer objects spawned than the target).
 */
export function stageConfig(stage: number): StageConfig {
  return {
    time: 30,
    target: Math.round(16 + stage * 3.3),
    spawnMs: Math.max(410, 820 - stage * 41),
    maxAlive: 4 + Math.ceil(stage / 2),
    lifetimeMs: Math.max(1600, 2700 - stage * 100),
    bombChance: stage >= 2 ? Math.min(0.17, 0.05 + stage * 0.013) : 0,
    bonusChance: 0.07,
    toughChance: stage >= 3 ? Math.min(0.3, stage * 0.035) : 0,
  }
}

type Kind = 'box' | 'glass' | 'balloon' | 'bomb' | 'bonus'

const KIND_COLOR: Record<Kind, number> = {
  box: 0xc98a4b,
  glass: 0x7fe9ff,
  balloon: 0xff4d8d,
  bomb: 0xff6b2b,
  bonus: 0xffd23f,
}

interface Target {
  kind: Kind
  hp: number
  x: number
  y: number
  bornAt: number
  container: Phaser.GameObjects.Container
  sprite: Phaser.GameObjects.Image
  crack?: Phaser.GameObjects.Graphics
}

const RADIUS = 62
const BONUS_COINS = 5
const BOMB_PENALTY = 3
const COMBO_WINDOW_MS = 1000
const HUD_H = 150
const TRAIL_MS = 140

const COMBO_CALLOUTS: Record<number, [string, number]> = {
  5: ['GOOD!', NEON.cyan],
  10: ['GREAT!', NEON.green],
  15: ['AWESOME!', NEON.yellow],
  20: ['INSANE!!', NEON.pink],
  30: ['GODLIKE!!!', NEON.purple],
}

export default class StressBreakerScene extends Phaser.Scene {
  private cfg!: StageConfig
  private stage = 1
  private timeLimit = 0
  private timeLeft = 0
  private broken = 0
  private combo = 0
  private maxCombo = 0
  private lastBreakAt = -Infinity
  private bonusCoins = 0
  private targets: Target[] = []
  private ended = false
  private spawnTimer = 0
  private strokeHits = new Set<Target>()
  private lastPoint: { x: number; y: number } | null = null
  private trail: { x: number; y: number; t: number }[] = []
  private trailGfx!: Phaser.GameObjects.Graphics
  private timeText!: Phaser.GameObjects.Text
  private countText!: Phaser.GameObjects.Text
  private comboText!: Phaser.GameObjects.Text
  private bars!: Phaser.GameObjects.Graphics
  private lastTickSecond = -1

  constructor() {
    super('StressBreakerScene')
  }

  create() {
    const init = getInitData(this)
    this.stage = init.stage
    this.cfg = stageConfig(this.stage)
    this.timeLimit = this.cfg.time + (init.boosterActive ? BOOSTER_SECONDS : 0)
    this.timeLeft = this.timeLimit
    this.targets = []
    this.ended = false

    makeTextures(this)
    ensureGlowTexture(this)
    drawBackdrop(this, HUD_H, NEON.pink)
    drawHudBar(this, HUD_H, NEON.pink)

    this.add.text(28, 20, 'TIME', displayText(22, hex(NEON.pink))).setDepth(9)
    this.timeText = this.add.text(28, 42, '', displayText(54)).setDepth(9)
    this.add.text(692, 20, 'BREAK', displayText(22, hex(NEON.pink))).setOrigin(1, 0).setDepth(9)
    this.countText = this.add.text(692, 42, '', displayText(54)).setOrigin(1, 0).setDepth(9)
    this.add.text(360, 30, `STAGE ${this.stage}`, displayText(28, '#ffffff')).setOrigin(0.5, 0).setDepth(9)
    if (init.boosterActive) this.add.text(360, 66, `⏱ +${BOOSTER_SECONDS}s`, displayText(22, hex(NEON.yellow))).setOrigin(0.5, 0).setDepth(9)
    this.bars = this.add.graphics().setDepth(9)
    this.comboText = this.add.text(360, HUD_H + 60, '', displayText(64, hex(NEON.yellow))).setOrigin(0.5).setDepth(40).setAlpha(0)
    this.trailGfx = this.add.graphics().setDepth(50).setBlendMode(Phaser.BlendModes.ADD)

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.strokeHits.clear()
      this.lastPoint = { x: p.x, y: p.y }
      this.trail = [{ x: p.x, y: p.y, t: this.time.now }]
      this.hitAlong(p.x, p.y, p.x, p.y)
    })
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.lastPoint) return
      const d = Phaser.Math.Distance.Between(this.lastPoint.x, this.lastPoint.y, p.x, p.y)
      if (d > 40) sfx.whoosh()
      this.hitAlong(this.lastPoint.x, this.lastPoint.y, p.x, p.y)
      this.lastPoint = { x: p.x, y: p.y }
      this.trail.push({ x: p.x, y: p.y, t: this.time.now })
    })
    this.input.on('pointerup', () => {
      this.lastPoint = null
    })

    // Open with a few targets already up so the first second isn't empty.
    for (let i = 0; i < 3; i++) this.time.delayedCall(i * 120, () => this.spawn())
    this.updateHud()
  }

  update(time: number, delta: number) {
    this.drawTrail(time)
    if (this.ended || isFrozen(this)) return
    this.timeLeft = Math.max(0, this.timeLeft - delta / 1000)

    this.spawnTimer += delta
    if (this.spawnTimer >= this.cfg.spawnMs) {
      this.spawnTimer = 0
      this.spawn()
    }

    for (const t of [...this.targets]) {
      if (t.kind === 'balloon') {
        t.y -= (delta / 1000) * 70
        t.container.y = t.y
      }
      const age = time - t.bornAt
      // Blink before vanishing so expiry never feels unfair.
      if (age > this.cfg.lifetimeMs - 450) t.container.setAlpha(Math.floor(age / 70) % 2 ? 0.35 : 1)
      if (age > this.cfg.lifetimeMs || t.y < HUD_H + 20) this.expire(t)
    }

    if (this.combo > 0 && time - this.lastBreakAt > COMBO_WINDOW_MS) {
      this.combo = 0
      this.tweens.add({ targets: this.comboText, alpha: 0, duration: 200 })
    }

    const sec = Math.ceil(this.timeLeft)
    if (this.timeLeft <= 5 && sec !== this.lastTickSecond && sec > 0) {
      this.lastTickSecond = sec
      sfx.countTick()
      punch(this, this.timeText, 1.25, 110)
    }

    this.updateHud()
    if (this.timeLeft <= 0) this.finish(false)
  }

  private spawn() {
    if (this.targets.length >= this.cfg.maxAlive) return
    const r = Math.random()
    let kind: Kind
    if (r < this.cfg.bombChance) kind = 'bomb'
    else if (r < this.cfg.bombChance + this.cfg.bonusChance) kind = 'bonus'
    else kind = (['box', 'glass', 'balloon'] as const)[Math.floor(Math.random() * 3)]

    let x = 0
    let y = 0
    for (let attempt = 0; attempt < 12; attempt++) {
      x = Phaser.Math.Between(90, 630)
      y = Phaser.Math.Between(HUD_H + 110, 1000)
      if (this.targets.every((t) => Phaser.Math.Distance.Between(t.x, t.y, x, y) > RADIUS * 2.1)) break
    }

    const hp = kind === 'box' && Math.random() < this.cfg.toughChance ? 2 : 1
    const shadow = this.add.ellipse(0, RADIUS + 4, RADIUS * 1.5, 18, 0x000000, 0.35)
    const sprite = this.add.image(0, 0, hp > 1 ? 'sb-box-tough' : `sb-${kind}`)
    const container = this.add.container(x, y, [shadow, sprite]).setScale(0).setDepth(10)
    if (kind === 'bomb') {
      const spark = this.add.image(26, -RADIUS + 2, 'glow').setTint(NEON.orange).setBlendMode(Phaser.BlendModes.ADD).setScale(0.7)
      container.add(spark)
      this.tweens.add({ targets: spark, scale: { from: 0.4, to: 0.9 }, alpha: { from: 0.6, to: 1 }, duration: 90, yoyo: true, repeat: -1 })
    }
    this.tweens.add({ targets: container, scale: 1, duration: 220, ease: 'Back.Out' })
    this.tweens.add({ targets: sprite, angle: { from: -4, to: 4 }, duration: 600 + Math.random() * 300, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    this.targets.push({ kind, hp, x, y, bornAt: this.time.now, container, sprite })
  }

  /** Hits every target touched by the segment (a tap is a zero-length segment). Each target once per stroke. */
  private hitAlong(x1: number, y1: number, x2: number, y2: number) {
    if (this.ended) return
    for (const t of [...this.targets]) {
      if (this.strokeHits.has(t)) continue
      if (distanceToSegment(t.x, t.y, x1, y1, x2, y2) <= RADIUS) {
        this.strokeHits.add(t)
        this.hit(t)
      }
    }
  }

  private hit(t: Target) {
    t.hp -= 1
    if (t.hp > 0) {
      // First hit on a tough crate: crack it, flash, knock it about.
      sfx.thud()
      vibrate(10)
      hitFlash(this, t.sprite, 60)
      t.crack = this.add.graphics()
      t.crack.lineStyle(5, 0x2a1400, 1)
      drawCrack(t.crack, RADIUS * 0.9)
      t.container.add(t.crack)
      punch(this, t.container, 1.18, 70)
      burst(this, t.x, t.y, KIND_COLOR.box, { count: 6, size: 10, glow: false })
      return
    }
    this.removeTarget(t)
    const now = this.time.now

    if (t.kind === 'bomb') {
      this.broken = Math.max(0, this.broken - BOMB_PENALTY)
      this.combo = 0
      this.comboText.setAlpha(0)
      sfx.bomb()
      vibrate([60, 30, 90])
      flash(this, 180, NEON.red, 0.45)
      shake(this, 380, 0.025)
      burst(this, t.x, t.y, NEON.orange, { count: 26, speed: 520, size: 16, colors: [NEON.orange, NEON.red, NEON.yellow, 0x333333] })
      ring(this, t.x, t.y, NEON.orange, 200, 10, 420)
      popText(this, t.x, t.y - 30, `-${BOMB_PENALTY}`, { size: 64, color: NEON.red })
      punch(this, this.countText, 1.3)
      this.updateHud()
      return
    }

    this.combo = now - this.lastBreakAt <= COMBO_WINDOW_MS ? this.combo + 1 : 1
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    this.lastBreakAt = now
    this.broken += 1

    // Impact frame: stop, zoom, shake — scaled up with the combo.
    const heat = Math.min(this.combo, 20) / 20
    hitStop(this, 30 + heat * 40)
    zoomPunch(this, 1.015 + heat * 0.03)
    shake(this, 90, 0.004 + heat * 0.01)
    vibrate(15 + Math.round(heat * 25))
    sfx.smash(this.combo, t.kind === 'bonus' ? 'bonus' : t.kind)

    const color = KIND_COLOR[t.kind]
    if (t.kind === 'glass') shards(this, t.x, t.y, NEON.cyan, 12, 300)
    else if (t.kind === 'box') shards(this, t.x, t.y, 0xa86a32, 9, 240)
    burst(this, t.x, t.y, color, { count: 12 + Math.round(heat * 10), colors: [color, 0xffffff] })
    ring(this, t.x, t.y, color, 110 + heat * 60)

    if (t.kind === 'bonus') {
      this.bonusCoins += BONUS_COINS
      burst(this, t.x, t.y, NEON.yellow, { count: 16, colors: [NEON.yellow, 0xffffff, NEON.orange], gravity: 900 })
      popText(this, t.x, t.y - 40, `+${BONUS_COINS} 코인`, { size: 44, color: NEON.yellow })
    } else {
      popText(this, t.x, t.y - 20, this.combo >= 2 ? `+1 ×${this.combo}` : '+1', { size: 34 + Math.min(this.combo, 15) })
    }

    this.showCombo()
    punch(this, this.countText, 1.2)
    this.updateHud()
    if (this.broken >= this.cfg.target) this.finish(true)
  }

  private showCombo() {
    if (this.combo < 2) return
    const callout = COMBO_CALLOUTS[this.combo]
    const color = this.combo >= 20 ? NEON.pink : this.combo >= 10 ? NEON.green : NEON.yellow
    this.comboText.setText(`${this.combo} COMBO`).setColor(hex(color)).setAlpha(1)
    punch(this, this.comboText, 1.35, 80)
    if (callout) {
      const [word, c] = callout
      const t = this.add.text(360, 560, word, displayText(110, hex(c), '#0b0820', 12)).setOrigin(0.5).setDepth(60).setScale(2.5).setAlpha(0)
      this.tweens.add({ targets: t, scale: 1, alpha: 1, angle: { from: -12, to: -4 }, duration: 220, ease: 'Back.Out' })
      this.tweens.add({ targets: t, alpha: 0, y: 500, delay: 600, duration: 300, onComplete: () => t.destroy() })
      flash(this, 120, c, 0.18)
      sfx.star(Math.min(3, Math.floor(this.combo / 10) + 1))
    }
  }

  private expire(t: Target) {
    this.removeTarget(t, true)
  }

  private removeTarget(t: Target, fadeOut = false) {
    const i = this.targets.indexOf(t)
    if (i >= 0) this.targets.splice(i, 1)
    this.tweens.killTweensOf(t.container)
    this.tweens.killTweensOf(t.sprite)
    if (fadeOut) {
      this.tweens.add({ targets: t.container, scale: 0, alpha: 0, duration: 160, onComplete: () => t.container.destroy() })
    } else {
      t.container.destroy()
    }
  }

  /** Fruit-Ninja style blade: a tapered, glowing polyline of recent pointer positions. */
  private drawTrail(now: number) {
    this.trail = this.trail.filter((p) => now - p.t < TRAIL_MS)
    const g = this.trailGfx
    g.clear()
    if (this.trail.length < 2) return
    for (let i = 1; i < this.trail.length; i++) {
      const a = this.trail[i - 1]
      const b = this.trail[i]
      const life = 1 - (now - b.t) / TRAIL_MS
      const w = 4 + 18 * life * (i / this.trail.length)
      g.lineStyle(w * 2.2, NEON.pink, 0.25 * life)
      g.lineBetween(a.x, a.y, b.x, b.y)
      g.lineStyle(w, 0xffffff, 0.9 * life)
      g.lineBetween(a.x, a.y, b.x, b.y)
    }
  }

  private updateHud() {
    this.timeText.setText(this.timeLeft.toFixed(1))
    this.timeText.setColor(this.timeLeft <= 5 ? hex(NEON.red) : '#ffffff')
    this.countText.setText(`${this.broken}/${this.cfg.target}`)

    const g = this.bars
    g.clear()
    const w = 664
    // Time bar (full width) and break-progress bar.
    g.fillStyle(0x000000, 0.5)
    g.fillRoundedRect(28, 112, w, 14, 7)
    const tRatio = this.timeLeft / this.timeLimit
    g.fillStyle(this.timeLeft <= 5 ? NEON.red : NEON.cyan, 1)
    g.fillRoundedRect(28, 112, Math.max(14, w * tRatio), 14, 7)
    g.fillStyle(0x000000, 0.5)
    g.fillRoundedRect(28, 132, w, 8, 4)
    g.fillStyle(NEON.yellow, 1)
    g.fillRoundedRect(28, 132, Math.max(8, w * Math.min(1, this.broken / this.cfg.target)), 8, 4)
  }

  private finish(cleared: boolean) {
    if (this.ended) return
    this.ended = true
    this.targets.forEach((t) => this.removeTarget(t, true))
    if (cleared) {
      banner(this, 'CLEAR!', NEON.green, `최대 ${this.maxCombo} 콤보`)
      confetti(this)
      shake(this, 250, 0.01)
    } else {
      banner(this, 'TIME UP', NEON.red, `${this.broken}/${this.cfg.target}`)
    }
    sfx.explode()

    const base = stageReward(this.stage)
    const stars = starsFromRatio(this.timeLeft / this.timeLimit, 0.08, 0.2)
    const comboBonus = Math.floor(this.maxCombo / 5) * 3
    this.time.delayedCall(1300, () =>
      emitResult(this, {
        cleared,
        stars,
        coinsEarned: base + starBonus(base, stars) + comboBonus + this.bonusCoins,
        details: [
          `파괴 ${this.broken}/${this.cfg.target}`,
          `최대 콤보 ${this.maxCombo} (보너스 +${comboBonus})`,
          `보너스 오브젝트 코인 +${this.bonusCoins}`,
          `남은 시간 ${this.timeLeft.toFixed(1)}초`,
        ],
      }),
    )
  }
}

/** Distance from point (px, py) to segment (x1, y1)-(x2, y2). */
function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Phaser.Math.Clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1)
  return Phaser.Math.Distance.Between(px, py, x1 + t * dx, y1 + t * dy)
}

function drawCrack(g: Phaser.GameObjects.Graphics, r: number) {
  let x = -r * 0.2
  let y = -r * 0.8
  g.beginPath()
  g.moveTo(x, y)
  for (let i = 0; i < 5; i++) {
    x += Phaser.Math.Between(-22, 22)
    y += r * 0.35
    g.lineTo(x, y)
  }
  g.strokePath()
  g.lineBetween(-r * 0.1, -r * 0.1, r * 0.55, r * 0.15)
  g.lineBetween(-r * 0.15, r * 0.3, -r * 0.6, r * 0.45)
}

/** Procedural object art, generated once per game instance. */
function makeTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('sb-box')) return
  const S = RADIUS * 2 + 16
  const c = S / 2
  const make = (key: string, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false)
    draw(g)
    g.generateTexture(key, S, S)
    g.destroy()
  }
  const crate = (g: Phaser.GameObjects.Graphics, tough: boolean) => {
    const s = RADIUS * 1.6
    const x0 = c - s / 2
    g.fillStyle(0x5a3415, 1)
    g.fillRoundedRect(x0 - 4, x0 - 4, s + 8, s + 8, 10)
    g.fillStyle(0xc98a4b, 1)
    g.fillRoundedRect(x0, x0, s, s, 8)
    g.fillStyle(0xb07436, 1)
    for (let i = 1; i < 4; i++) g.fillRect(x0 + 6, x0 + (s / 4) * i - 2, s - 12, 4)
    g.lineStyle(12, 0x8a5424, 1)
    g.lineBetween(x0 + 10, x0 + 10, x0 + s - 10, x0 + s - 10)
    g.lineStyle(6, 0xe0a56a, 1)
    g.strokeRoundedRect(x0 + 4, x0 + 4, s - 8, s - 8, 6)
    if (tough) {
      g.fillStyle(0xb8c2d6, 1)
      for (const [px, py] of [
        [x0, x0],
        [x0 + s - 24, x0],
        [x0, x0 + s - 24],
        [x0 + s - 24, x0 + s - 24],
      ]) {
        g.fillRect(px, py, 24, 24)
        g.fillStyle(0x6a7488, 1)
        g.fillCircle(px + 12, py + 12, 4)
        g.fillStyle(0xb8c2d6, 1)
      }
      g.lineStyle(5, 0xffffff, 0.9)
      g.strokeRoundedRect(x0 - 4, x0 - 4, s + 8, s + 8, 10)
    }
  }
  make('sb-box', (g) => crate(g, false))
  make('sb-box-tough', (g) => crate(g, true))
  make('sb-glass', (g) => {
    const w = RADIUS * 1.5
    const h = RADIUS * 1.8
    g.fillStyle(0x2a5b7a, 1)
    g.fillRoundedRect(c - w / 2 - 6, c - h / 2 - 6, w + 12, h + 12, 8)
    g.fillStyle(0x7fe9ff, 0.55)
    g.fillRect(c - w / 2, c - h / 2, w, h)
    g.fillStyle(0xffffff, 0.75)
    g.fillTriangle(c - w / 2 + 8, c - h / 2 + 8, c - w / 2 + 40, c - h / 2 + 8, c - w / 2 + 8, c - h / 2 + 50)
    g.fillStyle(0xffffff, 0.4)
    g.fillRect(c + 6, c - h / 2 + 10, 8, h - 20)
    g.lineStyle(4, 0xd4f7ff, 1)
    g.strokeRect(c - w / 2, c - h / 2, w, h)
  })
  make('sb-balloon', (g) => {
    g.lineStyle(3, 0xffffff, 0.7)
    g.lineBetween(c, c + RADIUS * 0.8, c + 6, S - 2)
    g.fillStyle(0xc4004f, 1)
    g.fillEllipse(c, c - 4, RADIUS * 1.55, RADIUS * 1.75)
    g.fillStyle(0xff4d8d, 1)
    g.fillEllipse(c - 3, c - 8, RADIUS * 1.4, RADIUS * 1.6)
    g.fillStyle(0xffffff, 0.7)
    g.fillEllipse(c - 20, c - 32, 18, 30)
    g.fillStyle(0xc4004f, 1)
    g.fillTriangle(c - 8, c + RADIUS * 0.82, c + 8, c + RADIUS * 0.82, c, c + RADIUS * 0.7)
  })
  make('sb-bomb', (g) => {
    g.fillStyle(0x111111, 1)
    g.fillCircle(c, c + 6, RADIUS * 0.82)
    g.fillStyle(0x333344, 1)
    g.fillCircle(c - 4, c + 2, RADIUS * 0.72)
    g.fillStyle(0xffffff, 0.35)
    g.fillEllipse(c - 22, c - 18, 26, 18)
    g.fillStyle(0x666677, 1)
    g.fillRect(c + 8, c - RADIUS * 0.75, 22, 16)
    g.lineStyle(5, 0xc9a26b, 1)
    g.lineBetween(c + 20, c - RADIUS * 0.75, c + 26, c - RADIUS + 2)
    g.fillStyle(0xff2e2e, 1)
    g.fillCircle(c, c + 8, 12)
  })
  make('sb-bonus', (g) => {
    g.fillStyle(0x8a5c00, 1)
    g.fillCircle(c, c + 4, RADIUS * 0.85)
    g.fillStyle(0xffd23f, 1)
    g.fillCircle(c, c, RADIUS * 0.85)
    g.fillStyle(0xfff3a6, 1)
    g.fillCircle(c - 8, c - 8, RADIUS * 0.6)
    g.fillStyle(0xffd23f, 1)
    g.fillCircle(c, c, RADIUS * 0.55)
    g.lineStyle(6, 0x8a5c00, 1)
    g.strokeCircle(c, c, RADIUS * 0.55)
    g.fillStyle(0x8a5c00, 1)
    g.fillRect(c - 5, c - 26, 10, 52)
    g.fillRect(c - 20, c - 10, 40, 8)
    g.fillRect(c - 20, c + 4, 40, 8)
  })
}
