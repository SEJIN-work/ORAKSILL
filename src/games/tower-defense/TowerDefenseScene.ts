import * as Phaser from 'phaser'
import { sfx } from '../../systems/audio/audio.ts'
import { stageReward, starBonus, starsFromRatio } from '../../systems/economy.ts'
import { vibrate } from '../../systems/haptics.ts'
import { banner, burst, confetti, flash, hitFlash, hitStop, isFrozen, popText, punch, ring, shake } from '../effects.ts'
import { emitResult, getInitData } from '../session.ts'
import { bake, bodyText, displayText, drawHudBar, ensureGlowTexture, hex, NEON, vGradient } from '../theme.ts'

export const MAX_STAGE = 30
export const BOOSTER_GOLD = 100

const START_GOLD = 120
/**
 * Per-stage difficulty (30 stages). Tune with `npm run sim:td` — difficulty is an economy race
 * (incoming HP/s vs. affordable DPS) and, since armor, a composition check: an MG-only build
 * must stop working once armored enemies arrive.
 */
export function stageTuning(stage: number) {
  const s = stage - 1
  return {
    startGold: START_GOLD + 22 * s,
    // HP grows 4.5%/stage to stage 21, then 3.5%/stage so the last stages stay beatable.
    hpMul: 1 + 0.045 * Math.min(s, 20) + 0.035 * Math.max(0, s - 20),
    /** Flat armor added to every armored enemy type. */
    armorBonus: Math.floor(s / 6),
    /** The boss starts unarmored (early players only afford MGs) and hardens every 4 stages. */
    bossArmor: Math.floor(s / 4),
    countBase: 6 + Math.round(stage * 0.45),
    interval: Math.max(420, 900 - stage * 16),
  }
}
/** Every hit deals at least this fraction of its raw damage, however thick the armor. */
const MIN_DAMAGE_RATIO = 0.15
const START_LIVES = 10
const WAVES_PER_STAGE = 3
const HUD_H = 120
const PATH_WIDTH = 56
const GRID_STEP = 64
const SLOT_SIZE = 56
const MULTI_KILL_MS = 650
const DASH_GAP = 40

/** Enemy route through the board; build slots are every grid cell not on it. */
const PATH: [number, number][] = [
  [-40, 230],
  [620, 230],
  [620, 450],
  [100, 450],
  [100, 670],
  [620, 670],
  [620, 890],
  [360, 890],
  [360, 1130],
]

type TowerTypeId = 'mg' | 'sniper' | 'cannon'

interface TowerType {
  id: TowerTypeId
  name: string
  cost: number
  damage: number
  range: number
  fireMs: number
  splash: number
  color: number
}

export const TOWER_TYPES: TowerType[] = [
  { id: 'mg', name: '기관총', cost: 50, damage: 5, range: 150, fireMs: 280, splash: 0, color: NEON.cyan },
  { id: 'sniper', name: '저격', cost: 110, damage: 45, range: 320, fireMs: 1500, splash: 0, color: NEON.purple },
  { id: 'cannon', name: '대포', cost: 130, damage: 22, range: 170, fireMs: 1300, splash: 75, color: NEON.orange },
]

const MAX_TOWER_LEVEL = 3

function towerStats(type: TowerType, level: number) {
  const l = level - 1
  return {
    damage: type.damage * Math.pow(1.6, l),
    range: type.range * (1 + 0.12 * l),
    fireMs: type.fireMs * Math.pow(0.85, l),
    splash: type.splash * (1 + 0.15 * l),
  }
}

function upgradeCost(type: TowerType, level: number): number {
  return Math.round(type.cost * (level === 1 ? 0.8 : 1.3))
}

type EnemyTypeId = 'grunt' | 'runner' | 'tank' | 'knight' | 'swarm' | 'boss'

interface EnemyType {
  id: EnemyTypeId
  hp: number
  speed: number
  gold: number
  radius: number
  color: number
  /** Lives lost when it reaches the end. */
  damage: number
  /** Flat damage removed from every hit (before MIN_DAMAGE_RATIO). MG bullets bounce off. */
  armor: number
}

const ENEMY_TYPES: Record<EnemyTypeId, EnemyType> = {
  grunt: { id: 'grunt', hp: 40, speed: 70, gold: 6, radius: 20, color: NEON.green, damage: 1, armor: 0 },
  runner: { id: 'runner', hp: 22, speed: 125, gold: 5, radius: 15, color: NEON.yellow, damage: 1, armor: 0 },
  tank: { id: 'tank', hp: 150, speed: 40, gold: 15, radius: 26, color: 0xa8b0c8, damage: 2, armor: 5 },
  /** 장갑병: thick armor — needs 저격/대포, MG barely scratches it. */
  knight: { id: 'knight', hp: 80, speed: 62, gold: 13, radius: 22, color: NEON.purple, damage: 2, armor: 9 },
  /** 꼬마 떼: tiny and fast, spawned in packs — 대포 splash food. */
  swarm: { id: 'swarm', hp: 14, speed: 115, gold: 2, radius: 11, color: NEON.orange, damage: 1, armor: 0 },
  boss: { id: 'boss', hp: 800, speed: 42, gold: 80, radius: 42, color: NEON.red, damage: 5, armor: 0 },
}

const SWARM_PACK = 5

/**
 * Enemy mix by stage (repeats weight the pick). Runners from 2, armored tanks from 4,
 * 장갑병 from 8, swarm packs from 12 (new enemy kinds force tower combinations).
 */
function unlockedEnemyTypes(stage: number): EnemyTypeId[] {
  const types: EnemyTypeId[] = ['grunt', 'grunt', 'grunt']
  if (stage >= 2) types.push('runner', 'runner')
  if (stage >= 4) types.push('tank')
  if (stage >= 8) types.push('knight')
  if (stage >= 10) types.push('knight')
  if (stage >= 12) types.push('swarm')
  if (stage >= 16) types.push('tank', 'knight')
  if (stage >= 22) types.push('knight', 'swarm')
  return types
}

interface Tower {
  type: TowerType
  level: number
  x: number
  y: number
  cooldown: number
  base: Phaser.GameObjects.Image
  turret: Phaser.GameObjects.Image
  pips: Phaser.GameObjects.Text
  /** Kept for test/debug compatibility: the turret doubles as the tower's body. */
  body: Phaser.GameObjects.Image
}

interface Enemy {
  type: EnemyType
  hp: number
  maxHp: number
  dist: number
  x: number
  y: number
  body: Phaser.GameObjects.Image
  crown?: Phaser.GameObjects.Text
  aura?: Phaser.GameObjects.Image
  bob: number
  armor: number
}

interface SpawnEntry {
  at: number
  wave: number
  type: EnemyTypeId
}

interface Slot {
  x: number
  y: number
  tower: Tower | null
}

export default class TowerDefenseScene extends Phaser.Scene {
  private stage = 1
  private gold = 0
  private lives = START_LIVES
  private elapsed = 0
  private schedule: SpawnEntry[] = []
  private bossWarnAt = 0
  private bossWarned = false
  private spawningDone = false
  private currentWave = 0
  private enemies: Enemy[] = []
  private slots: Slot[] = []
  private selectedType: TowerType = TOWER_TYPES[0]
  private kills = 0
  private ended = false
  private segments: { x1: number; y1: number; x2: number; y2: number; len: number; start: number }[] = []
  private pathLength = 0
  private goldText!: Phaser.GameObjects.Text
  private livesText!: Phaser.GameObjects.Text
  private waveText!: Phaser.GameObjects.Text
  private toolbar: { type: TowerType; panel: Phaser.GameObjects.Graphics; bounds: Phaser.Geom.Rectangle; icon: Phaser.GameObjects.Image }[] = []
  private hpBars!: Phaser.GameObjects.Graphics
  private shots!: Phaser.GameObjects.Graphics
  private preview!: Phaser.GameObjects.Graphics
  private toast!: Phaser.GameObjects.Text
  private recentKills: number[] = []
  private boss: Enemy | null = null
  private tuning = stageTuning(1)
  private lastBounceAt = -Infinity
  private dashes: Phaser.GameObjects.Image[] = []

  constructor() {
    super('TowerDefenseScene')
  }

  create() {
    const init = getInitData(this)
    this.stage = init.stage
    this.tuning = stageTuning(this.stage)
    this.gold = this.tuning.startGold + (init.boosterActive ? BOOSTER_GOLD : 0)
    this.lives = START_LIVES
    this.elapsed = 0
    this.enemies = []
    this.kills = 0
    this.ended = false
    this.spawningDone = false
    this.bossWarned = false
    this.currentWave = 0
    this.boss = null

    ensureGlowTexture(this)
    makeTextures(this)
    this.dashes = []
    this.buildPath()
    this.buildSlots()
    this.drawField()
    this.buildSchedule()
    this.buildHud()

    this.preview = this.add.graphics().setDepth(2)
    this.hpBars = this.add.graphics().setDepth(6)
    this.shots = this.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD)
    this.toast = this.add.text(360, 1046, '', displayText(30, hex(NEON.yellow))).setOrigin(0.5).setDepth(40).setAlpha(0)

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handlePointerDown(p.x, p.y))
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.drawPreview(p.x, p.y, p.wasTouch))
    this.updateHud()
    if (init.boosterActive) this.showToast(`💰 시작 골드 +${BOOSTER_GOLD}!`)
  }

  /** Path geometry (data only). */
  private buildPath() {
    this.segments = []
    let start = 0
    for (let i = 0; i < PATH.length - 1; i++) {
      const [x1, y1] = PATH[i]
      const [x2, y2] = PATH[i + 1]
      const len = Phaser.Math.Distance.Between(x1, y1, x2, y2)
      this.segments.push({ x1, y1, x2, y2, len, start })
      start += len
    }
    this.pathLength = start
  }

  private distanceToPath(x: number, y: number): number {
    let best = Infinity
    for (const s of this.segments) {
      const dx = s.x2 - s.x1
      const dy = s.y2 - s.y1
      const t = Phaser.Math.Clamp(((x - s.x1) * dx + (y - s.y1) * dy) / (s.len * s.len), 0, 1)
      best = Math.min(best, Phaser.Math.Distance.Between(x, y, s.x1 + t * dx, s.y1 + t * dy))
    }
    return best
  }

  /** Dense grid over the whole board, minus cells overlapping the path. */
  private buildSlots() {
    this.slots = []
    for (let y = HUD_H + 50; y <= 1040; y += GRID_STEP) {
      for (let x = 40; x <= 680; x += GRID_STEP) {
        if (this.distanceToPath(x, y) < PATH_WIDTH / 2 + SLOT_SIZE / 2 - 4) continue
        this.slots.push({ x, y, tower: null })
      }
    }
  }

  /** Ground + road + slot grid, baked into one static texture (see theme.bake). */
  private drawField() {
    bake(this, 'td-field', 720, 1080, (g) => {
      vGradient(g, 0, HUD_H, 720, 1080 - HUD_H, 0x0b1a24, 0x07101a)
      // Scattered neon "grass" specks for texture.
      for (let i = 0; i < 140; i++) {
        g.fillStyle(i % 3 === 0 ? NEON.green : NEON.cyan, 0.08 + Math.random() * 0.1)
        g.fillCircle(Math.random() * 720, HUD_H + Math.random() * (1080 - HUD_H), 1 + Math.random() * 2.5)
      }
      for (const sl of this.slots) {
        g.lineStyle(1, NEON.cyan, 0.12)
        g.strokeRoundedRect(sl.x - SLOT_SIZE / 2, sl.y - SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8)
        g.fillStyle(NEON.cyan, 0.18)
        g.fillCircle(sl.x, sl.y, 2)
      }
      const stroke = (width: number, color: number, alpha: number) => {
        g.lineStyle(width, color, alpha)
        g.beginPath()
        g.moveTo(PATH[0][0], PATH[0][1])
        for (const [x, y] of PATH.slice(1)) g.lineTo(x, y)
        g.strokePath()
        // Round the corners.
        g.fillStyle(color, alpha)
        for (const [x, y] of PATH.slice(1, -1)) g.fillCircle(x, y, width / 2)
      }
      stroke(PATH_WIDTH + 18, NEON.cyan, 0.12)
      stroke(PATH_WIDTH + 8, 0x0a0820, 1)
      stroke(PATH_WIDTH, 0x2a2258, 1)
    }, -10)

    // Dashed centre line marching toward the exit: pooled dot sprites, moved each frame.
    for (let d = 0; d < this.pathLength; d += DASH_GAP) {
      this.dashes.push(this.add.image(0, 0, 'td-dot').setDepth(-4).setAlpha(0.4))
    }

    // Exit gate.
    const gate = this.add.image(PATH[PATH.length - 1][0], 1040, 'td-gate').setDepth(-3)
    this.tweens.add({ targets: gate, alpha: { from: 0.8, to: 1 }, duration: 600, yoyo: true, repeat: -1 })
    // Spawn portal.
    const portal = this.add.image(18, 230, 'glow').setTint(NEON.pink).setBlendMode(Phaser.BlendModes.ADD).setScale(2.2).setDepth(-3)
    this.tweens.add({ targets: portal, scale: { from: 1.8, to: 2.6 }, duration: 700, yoyo: true, repeat: -1 })
  }

  private moveDashes(time: number) {
    const offset = (time / 25) % DASH_GAP
    this.dashes.forEach((dot, i) => {
      const p = this.positionAt(offset + i * DASH_GAP)
      dot.setPosition(p.x, p.y)
    })
  }

  private positionAt(dist: number): { x: number; y: number } {
    for (const s of this.segments) {
      if (dist <= s.start + s.len) {
        const t = (dist - s.start) / s.len
        return { x: s.x1 + (s.x2 - s.x1) * t, y: s.y1 + (s.y2 - s.y1) * t }
      }
    }
    const last = PATH[PATH.length - 1]
    return { x: last[0], y: last[1] }
  }

  private buildSchedule() {
    const types = unlockedEnemyTypes(this.stage)
    const { interval, countBase } = this.tuning
    let t = 1500
    this.schedule = []
    for (let w = 0; w < WAVES_PER_STAGE; w++) {
      const count = countBase + w * 2
      for (let i = 0; i < count; i++) {
        const type = types[Math.floor(Math.random() * types.length)]
        if (type === 'swarm') {
          // A pack arrives in a tight burst.
          for (let k = 0; k < SWARM_PACK; k++) this.schedule.push({ at: t + k * 140, wave: w + 1, type })
          t += SWARM_PACK * 140
        } else {
          this.schedule.push({ at: t, wave: w + 1, type })
        }
        t += interval
      }
      t += 2500
    }
    // The boss is the extra final wave, announced with a warning banner first.
    this.bossWarnAt = t
    this.schedule.push({ at: t + 1500, wave: WAVES_PER_STAGE + 1, type: 'boss' })
  }

  private buildHud() {
    drawHudBar(this, HUD_H, NEON.green)
    this.add.image(34, 34, 'td-coin').setDepth(9)
    this.goldText = this.add.text(58, 14, '', displayText(40, hex(NEON.yellow))).setDepth(9)
    this.add.text(24, 64, '❤', displayText(30, hex(NEON.red))).setDepth(9)
    this.livesText = this.add.text(58, 62, '', displayText(34)).setDepth(9)
    this.waveText = this.add.text(176, 64, '', displayText(26, hex(NEON.green))).setDepth(9)
    this.add.text(176, 22, `STAGE ${this.stage}`, displayText(24, '#c9c2f0')).setDepth(9)

    this.toolbar = TOWER_TYPES.map((type, i) => {
      const x = 400 + i * 108
      const panel = this.add.graphics().setDepth(9)
      const icon = this.add.image(x, 44, `td-turret-${type.id}`).setScale(0.75).setDepth(10).setAngle(-90)
      this.add.image(x, 44, `td-base`).setScale(0.6).setDepth(9.5)
      this.add.text(x, 76, type.name, bodyText(18, '#ffffff')).setOrigin(0.5).setDepth(10)
      this.add.text(x, 98, `${type.cost}G`, displayText(20, hex(NEON.yellow))).setOrigin(0.5).setDepth(10)
      return { type, panel, icon, bounds: new Phaser.Geom.Rectangle(x - 50, HUD_H / 2 - 50, 100, 100) }
    })
    this.refreshToolbar()
  }

  private refreshToolbar() {
    for (const b of this.toolbar) {
      const sel = b.type === this.selectedType
      const r = b.bounds
      b.panel.clear()
      b.panel.fillStyle(sel ? b.type.color : 0x15113a, sel ? 0.35 : 0.9)
      b.panel.fillRoundedRect(r.x, r.y + 4, r.width, r.height - 8, 14)
      b.panel.lineStyle(sel ? 4 : 2, sel ? b.type.color : 0x3a3180, 1)
      b.panel.strokeRoundedRect(r.x, r.y + 4, r.width, r.height - 8, 14)
      b.icon.setAlpha(this.gold >= b.type.cost ? 1 : 0.4)
    }
  }

  private updateHud() {
    const wave = this.currentWave > WAVES_PER_STAGE ? '👑 BOSS' : `WAVE ${Math.max(1, this.currentWave)}/${WAVES_PER_STAGE}`
    this.goldText.setText(`${this.gold}`)
    this.livesText.setText(`${this.lives}`)
    this.waveText.setText(wave).setColor(this.currentWave > WAVES_PER_STAGE ? hex(NEON.red) : hex(NEON.green))
    this.refreshToolbar()
  }

  private slotAt(x: number, y: number): Slot | undefined {
    return this.slots.find((s) => Math.abs(s.x - x) <= SLOT_SIZE / 2 + 4 && Math.abs(s.y - y) <= SLOT_SIZE / 2 + 4)
  }

  /** Desktop hover: ghost tower + range ring, green if affordable. */
  private drawPreview(x: number, y: number, touch: boolean) {
    this.preview.clear()
    if (touch || this.ended || y < HUD_H) return
    const slot = this.slotAt(x, y)
    if (!slot) return
    if (slot.tower) {
      const t = slot.tower
      const range = towerStats(t.type, Math.min(MAX_TOWER_LEVEL, t.level + 1)).range
      const ok = t.level < MAX_TOWER_LEVEL && this.gold >= upgradeCost(t.type, t.level)
      this.preview.lineStyle(2, ok ? NEON.green : NEON.red, 0.7)
      this.preview.strokeCircle(t.x, t.y, range)
      return
    }
    const type = this.selectedType
    const ok = this.gold >= type.cost
    this.preview.fillStyle(ok ? type.color : NEON.red, 0.08)
    this.preview.fillCircle(slot.x, slot.y, type.range)
    this.preview.lineStyle(2, ok ? type.color : NEON.red, 0.6)
    this.preview.strokeCircle(slot.x, slot.y, type.range)
    this.preview.fillStyle(ok ? type.color : NEON.red, 0.35)
    this.preview.fillRoundedRect(slot.x - SLOT_SIZE / 2, slot.y - SLOT_SIZE / 2, SLOT_SIZE, SLOT_SIZE, 8)
  }

  private handlePointerDown(x: number, y: number) {
    if (this.ended) return
    if (y < HUD_H) {
      const button = this.toolbar.find((b) => b.bounds.contains(x, y))
      if (button) {
        this.selectedType = button.type
        sfx.click()
        punch(this, button.icon, 1.3)
        this.refreshToolbar()
      }
      return
    }
    const slot = this.slotAt(x, y)
    if (!slot) return
    if (slot.tower) this.upgrade(slot.tower)
    else this.build(slot)
  }

  private build(slot: Slot) {
    const type = this.selectedType
    if (this.gold < type.cost) {
      this.showToast(`골드가 부족해요 (${type.name} ${type.cost}G)`)
      sfx.error()
      return
    }
    this.gold -= type.cost
    const base = this.add.image(slot.x, slot.y, 'td-base').setDepth(3)
    const turret = this.add.image(slot.x, slot.y, `td-turret-${type.id}`).setDepth(4).setAngle(-90)
    const pips = this.add.text(slot.x, slot.y + 30, '★', displayText(16, hex(NEON.yellow))).setOrigin(0.5).setDepth(4)
    slot.tower = { type, level: 1, x: slot.x, y: slot.y, cooldown: 0, base, turret, pips, body: turret }
    // Drop in from above with a dusty landing.
    for (const o of [base, turret, pips]) {
      const y0 = o.y
      o.y -= 90
      o.setAlpha(0)
      this.tweens.add({ targets: o, y: y0, alpha: 1, duration: 220, ease: 'Bounce.Out' })
    }
    this.time.delayedCall(140, () => {
      burst(this, slot.x, slot.y + 20, 0x8a86b8, { count: 10, speed: 180, size: 8, gravity: 100, glow: false })
      ring(this, slot.x, slot.y, type.color, 60, 4)
      shake(this, 80, 0.003)
    })
    sfx.build()
    vibrate(15)
    this.showRange(slot.tower)
    popText(this, slot.x, slot.y - 30, `-${type.cost}G`, { size: 26, color: NEON.yellow })
    this.updateHud()
  }

  private upgrade(tower: Tower) {
    if (tower.level >= MAX_TOWER_LEVEL) {
      this.showToast('최대 레벨이에요')
      sfx.error()
      return
    }
    const cost = upgradeCost(tower.type, tower.level)
    if (this.gold < cost) {
      this.showToast(`업그레이드에 ${cost}G 필요해요`)
      sfx.error()
      return
    }
    this.gold -= cost
    tower.level += 1
    tower.pips.setText('★'.repeat(tower.level))
    const scale = 1 + (tower.level - 1) * 0.12
    tower.base.setScale(scale)
    tower.turret.setScale(scale)
    tower.base.setTint(tower.level === 3 ? NEON.yellow : 0xffffff)
    this.tweens.add({ targets: [tower.base, tower.turret], scale: { from: scale * 1.35, to: scale }, duration: 260, ease: 'Back.Out' })
    ring(this, tower.x, tower.y, NEON.yellow, 90, 6)
    burst(this, tower.x, tower.y, NEON.yellow, { count: 14, speed: 240, colors: [NEON.yellow, tower.type.color, 0xffffff], gravity: -100 })
    sfx.upgrade(tower.level)
    vibrate(20)
    this.showRange(tower)
    this.showToast(`${tower.type.name} Lv.${tower.level}!`)
    this.updateHud()
  }

  private showRange(tower: Tower) {
    const ring2 = this.add
      .circle(tower.x, tower.y, towerStats(tower.type, tower.level).range, tower.type.color, 0.08)
      .setStrokeStyle(2, tower.type.color, 0.7)
      .setDepth(2)
    this.tweens.add({ targets: ring2, alpha: 0, duration: 900, onComplete: () => ring2.destroy() })
  }

  private showToast(text: string) {
    this.toast.setText(text).setAlpha(1).setScale(0.8)
    this.tweens.killTweensOf(this.toast)
    this.tweens.add({ targets: this.toast, scale: 1, duration: 120, ease: 'Back.Out' })
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1100, duration: 400 })
  }

  update(time: number, delta: number) {
    this.shots.clear()
    this.moveDashes(time)
    if (this.ended || isFrozen(this)) {
      this.drawHpBars()
      return
    }
    this.elapsed += delta

    if (!this.bossWarned && this.elapsed >= this.bossWarnAt) {
      this.bossWarned = true
      this.currentWave = WAVES_PER_STAGE + 1
      this.announceBoss()
      this.updateHud()
    }
    while (this.schedule.length > 0 && this.schedule[0].at <= this.elapsed) {
      const entry = this.schedule.shift()!
      this.spawnEnemy(entry.type)
      if (entry.wave !== this.currentWave && entry.wave <= WAVES_PER_STAGE) {
        this.currentWave = entry.wave
        this.announceWave(entry.wave)
        this.updateHud()
      }
    }
    // Only done once the boss actually exists, so the stage can't "clear" mid-entrance.
    if (this.schedule.length === 0) this.spawningDone = true

    this.moveEnemies(time, delta)
    this.fireTowers(delta)
    this.drawHpBars()

    if (this.lives <= 0) this.finish(false)
    else if (this.spawningDone && this.enemies.length === 0) this.finish(true)
  }

  private announceWave(wave: number) {
    const t = this.add.text(-200, 560, `WAVE ${wave}`, displayText(90, hex(NEON.green), '#0b0820', 10)).setOrigin(0.5).setDepth(50)
    this.tweens.chain({
      targets: t,
      tweens: [
        { x: 360, duration: 280, ease: 'Back.Out' },
        { x: 360, duration: 500 },
        { x: 920, alpha: 0, duration: 260, ease: 'Quad.In', onComplete: () => t.destroy() },
      ],
    })
    sfx.whoosh()
  }

  private announceBoss() {
    sfx.bossWarn()
    vibrate([80, 60, 80, 60, 80])
    const stripe = this.add.rectangle(360, 560, 720, 170, NEON.red, 0.25).setDepth(50)
    const text = this.add
      .text(360, 560, '⚠ BOSS 등장 ⚠', displayText(80, hex(NEON.red), '#0b0820', 10))
      .setOrigin(0.5)
      .setDepth(51)
      .setScale(2)
    this.tweens.add({ targets: text, scale: 1, duration: 250, ease: 'Back.Out' })
    this.tweens.add({ targets: [stripe, text], alpha: { from: 1, to: 0.35 }, duration: 160, yoyo: true, repeat: 5 })
    this.time.delayedCall(1700, () => {
      this.tweens.add({ targets: [stripe, text], alpha: 0, duration: 300, onComplete: () => (stripe.destroy(), text.destroy()) })
    })
    flash(this, 300, NEON.red, 0.25)
  }

  private spawnEnemy(id: EnemyTypeId) {
    const type = ENEMY_TYPES[id]
    const hp = Math.round(type.hp * this.tuning.hpMul)
    const armor = id === 'boss' ? this.tuning.bossArmor : type.armor > 0 ? type.armor + this.tuning.armorBonus : 0
    const { x, y } = this.positionAt(0)
    const body = this.add.image(x, y, `td-enemy-${id}`).setDepth(5)
    const enemy: Enemy = { type, hp, maxHp: hp, dist: 0, x, y, body, bob: Math.random() * Math.PI * 2, armor }
    if (id === 'boss') {
      enemy.aura = this.add.image(x, y, 'glow').setTint(NEON.red).setBlendMode(Phaser.BlendModes.ADD).setScale(3.4).setDepth(4)
      this.tweens.add({ targets: enemy.aura, alpha: { from: 0.5, to: 1 }, duration: 400, yoyo: true, repeat: -1 })
      enemy.crown = this.add.text(x, y - type.radius, '👑', { fontSize: '44px' }).setOrigin(0.5, 1).setDepth(6)
      this.boss = enemy
      shake(this, 500, 0.012)
    }
    body.setScale(0)
    this.tweens.add({ targets: body, scale: 1, duration: 200, ease: 'Back.Out' })
    this.enemies.push(enemy)
  }

  private moveEnemies(time: number, delta: number) {
    for (const e of [...this.enemies]) {
      e.dist += (e.type.speed * delta) / 1000
      if (e.dist >= this.pathLength) {
        this.leak(e)
        continue
      }
      const p = this.positionAt(e.dist)
      const hop = Math.abs(Math.sin(time / 120 + e.bob)) * (e.type.id === 'runner' ? 5 : 3)
      e.x = p.x
      e.y = p.y
      e.body.setPosition(p.x, p.y - hop)
      e.aura?.setPosition(p.x, p.y)
      e.crown?.setPosition(p.x, p.y - e.type.radius - hop)
    }
  }

  private leak(e: Enemy) {
    this.lives = Math.max(0, this.lives - e.type.damage)
    this.removeEnemy(e)
    flash(this, 160, NEON.red, 0.3)
    shake(this, 160, 0.008)
    sfx.leak()
    vibrate(40)
    popText(this, 360, 1000, `-${e.type.damage} ❤`, { size: 44, color: NEON.red })
    punch(this, this.livesText, 1.4)
    this.updateHud()
  }

  private fireTowers(delta: number) {
    for (const slot of this.slots) {
      const t = slot.tower
      if (!t) continue
      t.cooldown -= delta
      const stats = towerStats(t.type, t.level)
      // Target the enemy furthest along the path within range.
      let target: Enemy | null = null
      for (const e of this.enemies) {
        if (Phaser.Math.Distance.Between(t.x, t.y, e.x, e.y) <= stats.range + e.type.radius && (!target || e.dist > target.dist)) {
          target = e
        }
      }
      if (!target) continue
      // Turret tracks its target continuously.
      const angle = Phaser.Math.RadToDeg(Phaser.Math.Angle.Between(t.x, t.y, target.x, target.y))
      t.turret.setAngle(Phaser.Math.Angle.RotateTo(t.turret.rotation, Phaser.Math.DegToRad(angle), 0.35) * Phaser.Math.RAD_TO_DEG)
      if (t.cooldown > 0) continue
      t.cooldown = stats.fireMs
      this.fire(t, target, stats)
    }
  }

  private fire(t: Tower, target: Enemy, stats: ReturnType<typeof towerStats>) {
    const muzzleDist = t.type.id === 'sniper' ? 34 : 26
    const a = Phaser.Math.Angle.Between(t.x, t.y, target.x, target.y)
    const mx = t.x + Math.cos(a) * muzzleDist
    const my = t.y + Math.sin(a) * muzzleDist
    sfx.shoot(t.type.id)
    // Recoil.
    this.tweens.add({ targets: t.turret, x: t.x - Math.cos(a) * 5, y: t.y - Math.sin(a) * 5, duration: 50, yoyo: true })
    const muzzle = this.add.image(mx, my, 'glow').setTint(t.type.color).setBlendMode(Phaser.BlendModes.ADD).setScale(0.8).setDepth(7)
    this.tweens.add({ targets: muzzle, scale: 0.2, alpha: 0, duration: 90, onComplete: () => muzzle.destroy() })

    if (t.type.id === 'cannon') {
      // Lobbed shell: damage lands where the target was when fired.
      const tx = target.x
      const ty = target.y
      const shell = this.add.image(mx, my, 'td-shell').setDepth(8)
      const dist = Phaser.Math.Distance.Between(mx, my, tx, ty)
      this.tweens.add({ targets: shell, x: tx, duration: 220 + dist * 0.4, ease: 'Linear' })
      this.tweens.add({
        targets: shell,
        y: { from: my, to: ty },
        scale: { from: 0.8, to: 1.3 },
        duration: 220 + dist * 0.4,
        ease: 'Sine.In',
        onComplete: () => {
          shell.destroy()
          if (this.ended) return
          this.explode(tx, ty, stats.splash, stats.damage)
        },
      })
      return
    }

    // Hitscan tracer / beam.
    const line = this.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD)
    const w = t.type.id === 'sniper' ? 6 : 3
    line.lineStyle(w * 2.5, t.type.color, 0.3)
    line.lineBetween(mx, my, target.x, target.y)
    line.lineStyle(w, 0xffffff, 0.9)
    line.lineBetween(mx, my, target.x, target.y)
    this.tweens.add({ targets: line, alpha: 0, duration: t.type.id === 'sniper' ? 220 : 70, onComplete: () => line.destroy() })
    if (t.type.id === 'sniper') {
      burst(this, target.x, target.y, NEON.purple, { count: 6, speed: 200, size: 8, gravity: 0 })
      popText(this, target.x + 20, target.y - 20, String(Math.round(stats.damage)), { size: 26, color: NEON.purple, rise: 40, duration: 500 })
    }
    this.applyDamage(target, stats.damage)
  }

  private explode(x: number, y: number, radius: number, damage: number) {
    sfx.explode()
    ring(this, x, y, NEON.orange, radius, 6, 260)
    burst(this, x, y, NEON.orange, { count: 12, speed: 260, size: 10, colors: [NEON.orange, NEON.yellow, 0x555555], gravity: 300 })
    shake(this, 70, 0.003)
    for (const e of [...this.enemies]) {
      if (Phaser.Math.Distance.Between(x, y, e.x, e.y) <= radius + e.type.radius) {
        e.dist = Math.max(0, e.dist - (e.type.id === 'boss' ? 2 : 10)) // knockback
        this.applyDamage(e, damage)
      }
    }
  }

  /** Single chokepoint for direct + splash damage: kills, gold-per-kill and VFX live here. */
  private applyDamage(e: Enemy, raw: number) {
    if (!this.enemies.includes(e)) return
    const amount = Math.max(raw * MIN_DAMAGE_RATIO, raw - e.armor)
    e.hp -= amount
    hitFlash(this, e.body, 50)
    // Teach the armor rule: show when a hit mostly bounced off (throttled).
    if (amount < raw * 0.5 && this.time.now - this.lastBounceAt > 700) {
      this.lastBounceAt = this.time.now
      popText(this, e.x, e.y - e.type.radius - 6, '🛡 튕김!', { size: 22, color: 0xc9c2f0, rise: 30, duration: 500 })
    }
    if (e.hp > 0) return

    this.kills += 1
    this.gold += e.type.gold
    const isBoss = e.type.id === 'boss'
    sfx.enemyDie()
    burst(this, e.x, e.y, e.type.color, {
      count: isBoss ? 40 : 12,
      speed: isBoss ? 600 : 300,
      size: isBoss ? 18 : 10,
      colors: [e.type.color, 0xffffff],
    })
    popText(this, e.x, e.y - 24, `+${e.type.gold}G`, { size: isBoss ? 56 : 28, color: NEON.yellow })
    this.flyCoin(e.x, e.y, isBoss ? 8 : 1)

    if (isBoss) {
      this.boss = null
      sfx.bossDie()
      hitStop(this, 160)
      shake(this, 700, 0.03)
      flash(this, 300, 0xffffff, 0.6)
      vibrate([100, 50, 150])
      ring(this, e.x, e.y, NEON.red, 320, 12, 600)
      ring(this, e.x, e.y, NEON.yellow, 220, 8, 450)
    }

    // Multi-kill callouts.
    const now = this.time.now
    this.recentKills = this.recentKills.filter((t) => now - t < MULTI_KILL_MS)
    this.recentKills.push(now)
    const n = this.recentKills.length
    if (n >= 3 && !isBoss) {
      const word = n >= 5 ? 'MEGA KILL!' : n === 4 ? 'QUAD KILL!' : 'TRIPLE KILL!'
      popText(this, 360, 600, word, { size: 60, color: n >= 5 ? NEON.pink : NEON.orange, rise: 40, duration: 800 })
      shake(this, 120, 0.006)
    }

    this.removeEnemy(e)
    punch(this, this.goldText, 1.2)
    this.updateHud()
  }

  /** Coin(s) arc from the kill to the HUD gold counter. */
  private flyCoin(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const c = this.add.image(x, y, 'td-coin').setDepth(45).setScale(0.8)
      this.tweens.add({ targets: c, x: { from: x, to: 34 }, duration: 520 + i * 40, ease: 'Quad.In', delay: i * 40 })
      this.tweens.add({
        targets: c,
        y: { from: y, to: 34 },
        duration: 520 + i * 40,
        ease: 'Back.In',
        delay: i * 40,
        onComplete: () => {
          c.destroy()
          sfx.coin(2)
        },
      })
    }
  }

  private removeEnemy(e: Enemy) {
    const i = this.enemies.indexOf(e)
    if (i >= 0) this.enemies.splice(i, 1)
    e.body.destroy()
    e.crown?.destroy()
    e.aura?.destroy()
  }

  private drawHpBars() {
    const g = this.hpBars
    g.clear()
    for (const e of this.enemies) {
      if (e.type.id === 'boss' || e.hp >= e.maxHp) continue
      const w = e.type.radius * 2
      const y = e.y + e.type.radius + 6
      g.fillStyle(0x000000, 0.75)
      g.fillRect(e.x - w / 2 - 1, y - 1, w + 2, 7)
      const ratio = Math.max(0, e.hp) / e.maxHp
      g.fillStyle(ratio > 0.5 ? NEON.green : ratio > 0.25 ? NEON.yellow : NEON.red, 1)
      g.fillRect(e.x - w / 2, y, w * ratio, 5)
    }
    // Big boss bar under the HUD.
    if (this.boss) {
      const ratio = Math.max(0, this.boss.hp) / this.boss.maxHp
      g.fillStyle(0x000000, 0.8)
      g.fillRoundedRect(110, HUD_H + 14, 500, 24, 12)
      g.fillStyle(NEON.red, 1)
      g.fillRoundedRect(112, HUD_H + 16, Math.max(20, 496 * ratio), 20, 10)
      g.lineStyle(2, NEON.yellow, 1)
      g.strokeRoundedRect(110, HUD_H + 14, 500, 24, 12)
    }
  }

  private finish(cleared: boolean) {
    if (this.ended) return
    this.ended = true
    this.preview.clear()
    const noDamage = this.lives === START_LIVES
    if (cleared) {
      banner(this, 'VICTORY!', NEON.green, noDamage ? '노데미지 클리어!' : `남은 생명 ${this.lives}`)
      confetti(this)
    } else {
      banner(this, 'DEFEAT', NEON.red, '성문이 뚫렸어요')
      shake(this, 400, 0.015)
    }

    const base = stageReward(this.stage)
    const stars = starsFromRatio(this.lives / START_LIVES, 0.5, 1)
    const noDamageBonus = noDamage ? Math.round(base * 0.5) : 0
    this.time.delayedCall(1400, () =>
      emitResult(this, {
        cleared,
        stars,
        coinsEarned: base + starBonus(base, stars) + noDamageBonus,
        details: [
          `남은 생명 ${this.lives}/${START_LIVES}`,
          `처치 ${this.kills}`,
          noDamage ? `노데미지 보너스 +${noDamageBonus}` : '노데미지 클리어 시 보너스 코인',
        ],
      }),
    )
  }
}

/** Procedural tower / enemy / prop art, generated once per game instance. */
function makeTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('td-base')) return
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false)
    draw(g)
    g.generateTexture(key, w, h)
    g.destroy()
  }

  // Tower platform: octagonal stone with a neon rim.
  make('td-base', 60, 60, (g) => {
    g.fillStyle(0x05040f, 0.6)
    g.fillCircle(30, 33, 27)
    g.fillStyle(0x3b3470, 1)
    g.fillCircle(30, 30, 27)
    g.fillStyle(0x4f4790, 1)
    g.fillCircle(30, 28, 22)
    g.lineStyle(2, 0x8a82d8, 1)
    g.strokeCircle(30, 30, 27)
  })

  // Turrets point to +x so rotation = aim angle.
  make('td-turret-mg', 64, 64, (g) => {
    g.fillStyle(0x0a2e3a, 1)
    g.fillRect(32, 21, 28, 8)
    g.fillRect(32, 35, 28, 8)
    g.fillStyle(NEON.cyan, 1)
    g.fillRect(34, 23, 26, 4)
    g.fillRect(34, 37, 26, 4)
    g.fillStyle(0x0a2e3a, 1)
    g.fillCircle(30, 32, 17)
    g.fillStyle(NEON.cyan, 1)
    g.fillCircle(30, 32, 13)
    g.fillStyle(0xffffff, 0.6)
    g.fillCircle(26, 28, 4)
  })
  make('td-turret-sniper', 72, 64, (g) => {
    g.fillStyle(0x2a0a4a, 1)
    g.fillRect(30, 28, 42, 8)
    g.fillStyle(NEON.purple, 1)
    g.fillRect(32, 30, 40, 4)
    g.fillStyle(0xffffff, 1)
    g.fillRect(66, 29, 6, 6)
    g.fillStyle(0x2a0a4a, 1)
    g.fillTriangle(14, 18, 46, 32, 14, 46)
    g.fillStyle(NEON.purple, 1)
    g.fillTriangle(18, 22, 40, 32, 18, 42)
    g.fillStyle(0xffffff, 0.6)
    g.fillCircle(24, 30, 3)
  })
  make('td-turret-cannon', 64, 64, (g) => {
    g.fillStyle(0x4a1e00, 1)
    g.fillRoundedRect(30, 22, 30, 20, 6)
    g.fillStyle(NEON.orange, 1)
    g.fillRoundedRect(32, 25, 26, 14, 5)
    g.fillStyle(0x4a1e00, 1)
    g.fillCircle(28, 32, 19)
    g.fillStyle(NEON.orange, 1)
    g.fillCircle(28, 32, 15)
    g.fillStyle(0x4a1e00, 1)
    g.fillCircle(56, 32, 5)
    g.fillStyle(0xffffff, 0.5)
    g.fillCircle(23, 27, 4)
  })

  const eyes = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number, angry = false) => {
    g.fillStyle(0xffffff, 1)
    g.fillCircle(cx - s, cy, s * 0.8)
    g.fillCircle(cx + s, cy, s * 0.8)
    g.fillStyle(0x000000, 1)
    g.fillCircle(cx - s + s * 0.25, cy, s * 0.4)
    g.fillCircle(cx + s + s * 0.25, cy, s * 0.4)
    if (angry) {
      g.lineStyle(Math.max(2, s * 0.35), 0x000000, 1)
      g.lineBetween(cx - s * 1.8, cy - s * 1.2, cx - s * 0.3, cy - s * 0.6)
      g.lineBetween(cx + s * 1.8, cy - s * 1.2, cx + s * 0.3, cy - s * 0.6)
    }
  }
  make('td-enemy-grunt', 48, 48, (g) => {
    g.fillStyle(0x0d5c30, 1)
    g.fillCircle(24, 26, 20)
    g.fillStyle(NEON.green, 1)
    g.fillCircle(24, 24, 19)
    g.fillStyle(0xffffff, 0.3)
    g.fillCircle(17, 16, 5)
    eyes(g, 24, 24, 6)
  })
  make('td-enemy-runner', 40, 40, (g) => {
    g.fillStyle(0x6a5a00, 1)
    g.fillTriangle(4, 36, 20, 2, 36, 36)
    g.fillStyle(NEON.yellow, 1)
    g.fillTriangle(7, 33, 20, 6, 33, 33)
    eyes(g, 20, 24, 4, true)
  })
  make('td-enemy-tank', 60, 60, (g) => {
    g.fillStyle(0x3a3f52, 1)
    g.fillRoundedRect(4, 6, 52, 52, 10)
    g.fillStyle(0xa8b0c8, 1)
    g.fillRoundedRect(6, 4, 48, 48, 10)
    g.fillStyle(0x6a7088, 1)
    for (const [x, y] of [
      [12, 10],
      [44, 10],
      [12, 42],
      [44, 42],
    ])
      g.fillCircle(x, y, 4)
    eyes(g, 30, 26, 6, true)
  })
  make('td-enemy-knight', 52, 52, (g) => {
    // Purple shield-bearer with a steel rim.
    g.fillStyle(0x3a1d6b, 1)
    g.fillRoundedRect(4, 6, 44, 44, 12)
    g.fillStyle(NEON.purple, 1)
    g.fillRoundedRect(6, 4, 40, 42, 12)
    g.lineStyle(4, 0xd8d4ff, 1)
    g.strokeRoundedRect(6, 4, 40, 42, 12)
    g.fillStyle(0xd8d4ff, 1)
    g.fillTriangle(26, 12, 38, 18, 26, 40)
    g.fillTriangle(26, 12, 14, 18, 26, 40)
    g.fillStyle(0x3a1d6b, 1)
    g.fillRect(24, 14, 4, 24)
  })
  make('td-enemy-swarm', 26, 26, (g) => {
    g.fillStyle(0x6a3000, 1)
    g.fillCircle(13, 14, 11)
    g.fillStyle(NEON.orange, 1)
    g.fillCircle(13, 12, 10)
    eyes(g, 13, 12, 3.2, true)
  })
  make('td-enemy-boss', 100, 100, (g) => {
    g.fillStyle(0x5c0a1c, 1)
    g.fillCircle(50, 54, 44)
    g.fillStyle(NEON.red, 1)
    g.fillCircle(50, 50, 42)
    g.fillStyle(0xffffff, 0.25)
    g.fillCircle(36, 32, 12)
    // Horns.
    g.fillStyle(0xffe14d, 1)
    g.fillTriangle(18, 22, 30, 14, 14, 2)
    g.fillTriangle(82, 22, 70, 14, 86, 2)
    eyes(g, 50, 46, 11, true)
    g.fillStyle(0x000000, 1)
    g.fillRect(34, 68, 32, 8)
    g.fillStyle(0xffffff, 1)
    for (let i = 0; i < 4; i++) g.fillTriangle(36 + i * 8, 68, 42 + i * 8, 68, 39 + i * 8, 75)
  })
  make('td-coin', 36, 36, (g) => {
    g.fillStyle(0x8a5c00, 1)
    g.fillCircle(18, 19, 15)
    g.fillStyle(0xffd23f, 1)
    g.fillCircle(18, 17, 15)
    g.fillStyle(0xfff3a6, 1)
    g.fillCircle(14, 13, 6)
    g.lineStyle(3, 0x8a5c00, 1)
    g.strokeCircle(18, 17, 10)
  })
  make('td-dot', 8, 8, (g) => {
    g.fillStyle(NEON.cyan, 1)
    g.fillCircle(4, 4, 3)
  })
  make('td-shell', 24, 24, (g) => {
    g.fillStyle(0x111111, 1)
    g.fillCircle(12, 12, 10)
    g.fillStyle(NEON.orange, 1)
    g.fillCircle(12, 12, 5)
  })
  make('td-gate', 140, 80, (g) => {
    g.fillStyle(0x1a1440, 1)
    g.fillRoundedRect(4, 10, 132, 70, 14)
    g.fillStyle(0x3b3470, 1)
    for (let i = 0; i < 5; i++) g.fillRect(8 + i * 27, 0, 18, 22)
    g.fillStyle(0x05040f, 1)
    g.fillRoundedRect(40, 30, 60, 50, { tl: 30, tr: 30, bl: 0, br: 0 })
    g.lineStyle(3, NEON.cyan, 0.9)
    g.strokeRoundedRect(4, 10, 132, 70, 14)
  })
}
