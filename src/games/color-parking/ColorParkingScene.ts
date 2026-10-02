import * as Phaser from 'phaser'
import { sfx } from '../../systems/audio/audio.ts'
import { stageReward, starBonus, starsFromRatio } from '../../systems/economy.ts'
import { vibrate } from '../../systems/haptics.ts'
import { banner, burst, confetti, flash, popText, punch, ring, shake } from '../effects.ts'
import { emitResult, getInitData, onItemUse, USE_HINT_EVENT, USE_UNDO_EVENT } from '../session.ts'
import { bodyText, displayText, drawBackdrop, drawHudBar, ensureGlowTexture, hex, NEON } from '../theme.ts'
import {
  cloneState,
  DOCK_SIZE,
  generate,
  getStatus,
  moveLane,
  solve,
  STAGES,
  type Bus,
  type BusStopState,
  type MoveEvents,
  type StageConfig,
} from './busStopLogic.ts'

export const MAX_STAGE = STAGES.length

const COLORS = [0xff4d6d, 0x3d8bff, 0x3ddc84, 0xffd23f, 0xb06dff, 0xff8c3d, 0x2ee6e6, 0xff7ad9]
/** Colour-independent symbols so colour-blind players can match too (PRD 11). */
const SYMBOLS = ['●', '▲', '■', '◆', '★', '✚', '♥', '♣']

const HUD_H = 100
const QUEUE_Y = 196
const DOCK_Y = 372
const LANES_TOP = 500
const LANES_BOTTOM = 1060
const LANE_MARGIN = 20
const QUEUE_VISIBLE = 12
const QUEUE_X0 = 52
const QUEUE_DX = 54
const STUCK_GRACE_MS = 3000
const DOCK_BUS_W = 112
const DOCK_BUS_H = 128

interface BusView {
  busId: number
  container: Phaser.GameObjects.Container
  pips: Phaser.GameObjects.Arc[]
  filled: number
}

export default class ColorParkingScene extends Phaser.Scene {
  private cfg!: StageConfig
  private stage = 1
  private state!: BusStopState
  private totalBuses = 0
  private taps = 0
  private history: BusStopState[] = []
  private ended = false
  /** Set once the logic says won/jammed, until the animation finishes resolving it. */
  private resolving = false
  private hintLane: number | null = null
  private hintTimer: Phaser.Time.TimerEvent | null = null
  private stuckTimer: Phaser.Time.TimerEvent | null = null
  private giveUpButton: Phaser.Geom.Rectangle | null = null
  private drawnStuck: Phaser.GameObjects.GameObject[] = []
  private laneViews: Phaser.GameObjects.Container[][] = []
  private dockViews: (BusView | null)[] = []
  private queueViews: Phaser.GameObjects.Container[] = []
  private moreText!: Phaser.GameObjects.Text
  private laneGfx!: Phaser.GameObjects.Graphics
  private hintArrow!: Phaser.GameObjects.Text
  private animTimers: Phaser.Time.TimerEvent[] = []
  /** Queue index of the passenger the queue views show at the front (lags the logic mid-animation). */
  private viewQueueIndex = 0
  private hudText!: Phaser.GameObjects.Text
  private tapText!: Phaser.GameObjects.Text
  private toast!: Phaser.GameObjects.Text

  constructor() {
    super('ColorParkingScene')
  }

  create() {
    const init = getInitData(this)
    this.stage = init.stage
    this.cfg = STAGES[Math.min(this.stage, MAX_STAGE) - 1]
    this.state = generate(this.cfg).state
    this.totalBuses = this.cfg.lanes * this.cfg.busesPerLane
    this.taps = 0
    this.history = []
    this.ended = false
    this.resolving = false

    ensureGlowTexture(this)
    makeTextures(this)
    drawBackdrop(this, HUD_H, NEON.yellow)
    drawHudBar(this, HUD_H, NEON.yellow)
    this.drawStatic()

    this.add.text(24, 18, `STAGE ${this.stage}`, displayText(24, hex(NEON.yellow))).setDepth(9)
    this.hudText = this.add.text(24, 46, '', displayText(34)).setDepth(9)
    this.add.text(696, 18, 'TAPS', displayText(24, hex(NEON.yellow))).setOrigin(1, 0).setDepth(9)
    this.tapText = this.add.text(696, 46, '', displayText(34)).setOrigin(1, 0).setDepth(9)
    this.moreText = this.add.text(0, QUEUE_Y, '', displayText(26, '#c9c2f0')).setOrigin(0, 0.5).setDepth(6)
    this.laneGfx = this.add.graphics().setDepth(1)
    this.hintArrow = this.add.text(0, 0, '▼', displayText(48, hex(NEON.yellow))).setOrigin(0.5, 1).setDepth(20).setVisible(false)
    this.tweens.add({ targets: this.hintArrow, y: '+=14', duration: 300, yoyo: true, repeat: -1 })
    this.toast = this.add.text(360, 1050, '', displayText(30, hex(NEON.yellow))).setOrigin(0.5).setDepth(40).setAlpha(0)

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.handlePointer(p.x, p.y))
    onItemUse(this, USE_UNDO_EVENT, () => this.undo())
    onItemUse(this, USE_HINT_EVENT, () => this.hint())

    this.rebuild()
    // Opening: buses roll into their lanes, passengers line up.
    this.laneViews.flat().forEach((v, i) => {
      const y = v.y
      v.y = LANES_BOTTOM + 120
      this.tweens.add({ targets: v, y, delay: i * 35, duration: 380, ease: 'Back.Out' })
    })
    this.queueViews.forEach((v, i) => {
      v.setScale(0)
      this.tweens.add({ targets: v, scale: 1, delay: 300 + i * 40, duration: 200, ease: 'Back.Out' })
    })
  }

  private laneWidth() {
    return (720 - LANE_MARGIN * 2) / this.cfg.lanes
  }

  private laneX(l: number) {
    return LANE_MARGIN + l * this.laneWidth() + this.laneWidth() / 2
  }

  private busH() {
    return Math.min(104, (LANES_BOTTOM - LANES_TOP - 24) / this.cfg.busesPerLane - 10)
  }

  private laneBusY(i: number) {
    return LANES_TOP + 22 + i * (this.busH() + 10) + this.busH() / 2
  }

  private dockX(slot: number) {
    return 130 + slot * 230
  }

  private queueX(i: number) {
    return QUEUE_X0 + i * QUEUE_DX
  }

  private drawStatic() {
    // Baked once: static Graphics are re-tessellated every frame otherwise (see theme.bake).
    const g = this.make.graphics({ x: 0, y: 0 }, false)
    // Queue platform.
    g.fillStyle(0x15113a, 1)
    g.fillRoundedRect(14, QUEUE_Y - 44, 692, 88, 20)
    g.lineStyle(2, NEON.yellow, 0.4)
    g.strokeRoundedRect(14, QUEUE_Y - 44, 692, 88, 20)
    this.add.text(24, QUEUE_Y - 72, '🧍 대기 승객  (맨 앞 ←)', bodyText(22, '#c9c2f0'))

    // Bus-stop bays.
    this.add.text(24, DOCK_Y - 104, '🚏 BUS STOP', displayText(26, hex(NEON.yellow)))
    this.add.text(696, DOCK_Y - 100, `최대 ${DOCK_SIZE}대`, bodyText(22, '#8e86c2')).setOrigin(1, 0)
    for (let i = 0; i < DOCK_SIZE; i++) {
      const x = this.dockX(i)
      g.fillStyle(0x0d0a26, 1)
      g.fillRoundedRect(x - 100, DOCK_Y - 70, 200, 140, 16)
      g.lineStyle(4, NEON.yellow, 0.75)
      g.lineBetween(x - 92, DOCK_Y - 62, x - 92, DOCK_Y + 62)
      g.lineBetween(x + 92, DOCK_Y - 62, x + 92, DOCK_Y + 62)
      g.lineStyle(2, NEON.yellow, 0.25)
      g.strokeRoundedRect(x - 100, DOCK_Y - 70, 200, 140, 16)
    }

    // Lanes: dark asphalt with dashed separators.
    this.add.text(24, LANES_TOP - 36, '👆 레인을 탭하면 맨 앞 버스가 정류장으로', bodyText(22, '#c9c2f0'))
    g.fillStyle(0x0d0a26, 1)
    g.fillRoundedRect(LANE_MARGIN, LANES_TOP, 720 - LANE_MARGIN * 2, LANES_BOTTOM - LANES_TOP, 18)
    for (let l = 1; l < this.cfg.lanes; l++) {
      const x = LANE_MARGIN + l * this.laneWidth()
      for (let y = LANES_TOP + 10; y < LANES_BOTTOM - 10; y += 34) {
        g.fillStyle(0xffffff, 0.18)
        g.fillRect(x - 2, y, 4, 18)
      }
    }
    g.generateTexture('bs-static', 720, 1080)
    g.destroy()
    this.add.image(0, 0, 'bs-static').setOrigin(0).setDepth(-1)
  }

  // --- View construction -------------------------------------------------

  private makeBus(bus: Bus, w: number, h: number, withPips: boolean, filled = bus.filled): BusView {
    const color = COLORS[bus.color]
    const body = this.add.image(0, 0, 'bs-bus').setDisplaySize(w, h).setTint(color)
    const parts: Phaser.GameObjects.GameObject[] = [body]
    const pips: Phaser.GameObjects.Arc[] = []
    if (withPips) {
      // Seat lights on the roof: one row up to 3 seats, two rows beyond.
      const cols = bus.seats <= 3 ? bus.seats : Math.ceil(bus.seats / 2)
      const rows = Math.ceil(bus.seats / cols)
      const r = 8
      for (let i = 0; i < bus.seats; i++) {
        const c = i % cols
        const row = Math.floor(i / cols)
        const px = (c - (cols - 1) / 2) * 22
        const py = -h * 0.06 + (row - (rows - 1) / 2) * 22
        const pip = this.add.circle(px, py, r, i < filled ? 0xffffff : 0x000000, i < filled ? 1 : 0.45)
        pip.setStrokeStyle(2, 0xffffff, 0.8)
        pips.push(pip)
        parts.push(pip)
      }
    }
    const symbol = this.add
      .text(0, withPips ? h * 0.3 : 4, SYMBOLS[bus.color], displayText(withPips ? 24 : Math.min(34, h * 0.4), '#ffffff', '#00000099', 4))
      .setOrigin(0.5)
    parts.push(symbol)
    const container = this.add.container(0, 0, parts)
    return { busId: bus.id, container, pips, filled }
  }

  private makePassenger(color: number, front: boolean): Phaser.GameObjects.Container {
    const parts: Phaser.GameObjects.GameObject[] = []
    if (front) parts.push(this.add.image(0, 0, 'glow').setTint(COLORS[color]).setBlendMode(Phaser.BlendModes.ADD).setScale(1.3))
    parts.push(this.add.image(0, 0, 'bs-person').setTint(COLORS[color]))
    parts.push(this.add.text(0, 10, SYMBOLS[color], displayText(16, '#ffffff', '#00000099', 3)).setOrigin(0.5))
    return this.add.container(0, 0, parts).setDepth(6).setScale(front ? 1.15 : 1)
  }

  /** Destroys every dynamic view and recreates it from `this.state` (instant). */
  private rebuild() {
    this.animTimers.forEach((t) => t.remove())
    this.animTimers = []
    this.laneViews.flat().forEach((v) => v.destroy())
    this.dockViews.forEach((v) => v?.container.destroy())
    this.queueViews.forEach((v) => v.destroy())

    const s = this.state
    const busW = Math.min(this.laneWidth() - 26, 116)
    this.laneViews = s.lanes.map((lane, l) =>
      lane.map((bus, i) => {
        const v = this.makeBus(bus, busW, this.busH(), false).container
        v.setPosition(this.laneX(l), this.laneBusY(i)).setDepth(3)
        if (i > 0) v.setAlpha(0.6)
        return v
      }),
    )
    this.dockViews = s.dock.map((bus, slot) => {
      if (!bus) return null
      const v = this.makeBus(bus, DOCK_BUS_W, DOCK_BUS_H, true)
      v.container.setPosition(this.dockX(slot), DOCK_Y).setDepth(4)
      return v
    })
    this.queueViews = []
    this.viewQueueIndex = s.queueIndex
    const remaining = s.queue.length - s.queueIndex
    for (let i = 0; i < Math.min(QUEUE_VISIBLE, remaining); i++) {
      const v = this.makePassenger(s.queue[s.queueIndex + i], i === 0)
      v.setPosition(this.queueX(i), QUEUE_Y)
      if (i === 0) this.tweens.add({ targets: v, y: QUEUE_Y - 6, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
      this.queueViews.push(v)
    }
    this.updateMore(remaining)
    this.drawLaneHighlights()
    this.updateHud()
  }

  private updateMore(remaining: number) {
    this.moreText.setText(remaining > QUEUE_VISIBLE ? `+${remaining - QUEUE_VISIBLE}` : '').setX(this.queueX(QUEUE_VISIBLE) - 22)
  }

  /** Paid-hint highlight + a subtle free cue on lanes whose front bus matches the front passenger. */
  private drawLaneHighlights() {
    const g = this.laneGfx
    g.clear()
    const s = this.state
    const front = s.queue[s.queueIndex]
    const w = this.laneWidth()
    for (let l = 0; l < this.cfg.lanes; l++) {
      const x = LANE_MARGIN + l * w
      const match = s.lanes[l][0]?.color === front
      if (this.hintLane === l) {
        g.fillStyle(NEON.yellow, 0.16)
        g.fillRoundedRect(x + 4, LANES_TOP + 4, w - 8, LANES_BOTTOM - LANES_TOP - 8, 14)
        g.lineStyle(6, NEON.yellow, 1)
        g.strokeRoundedRect(x + 4, LANES_TOP + 4, w - 8, LANES_BOTTOM - LANES_TOP - 8, 14)
      } else if (match) {
        g.lineStyle(2, COLORS[front], 0.5)
        g.strokeRoundedRect(x + 6, LANES_TOP + 6, w - 12, this.busH() + 32, 12)
      }
    }
    if (this.hintLane !== null) {
      this.hintArrow.setVisible(true).setX(this.laneX(this.hintLane)).setY(LANES_TOP - 2)
    } else {
      this.hintArrow.setVisible(false)
    }
  }

  private updateHud() {
    const remaining = this.state.queue.length - this.state.queueIndex
    const busesLeft = this.state.lanes.reduce((n, l) => n + l.length, 0) + this.state.dock.filter(Boolean).length
    this.hudText.setText(`🧍 ${remaining}   🚌 ${busesLeft}/${this.totalBuses}`)
    this.tapText.setText(`${this.taps}`)
    this.tapText.setColor(this.taps > this.totalBuses ? hex(NEON.orange) : '#ffffff')
  }

  // --- Input / actions -------------------------------------------------

  private handlePointer(x: number, y: number) {
    if (this.ended) return
    if (this.giveUpButton?.contains(x, y)) {
      this.finish(false)
      return
    }
    if (this.stuckTimer || this.resolving || y < LANES_TOP || y > LANES_BOTTOM) return
    const lane = Math.floor((x - LANE_MARGIN) / this.laneWidth())
    if (lane < 0 || lane >= this.cfg.lanes) return

    this.taps += 1
    // Finish any running animation instantly so rapid taps always stay in sync.
    this.rebuild()
    const before = cloneState(this.state)
    const events = moveLane(this.state, lane)
    if (!events) {
      const empty = this.state.lanes[lane].length === 0
      this.showToast(empty ? '빈 레인이에요' : '정류장이 가득 찼어요!')
      sfx.error()
      if (!empty) this.dockViews.forEach((v) => v && punch(this, v.container, 1.08))
      this.updateHud()
      return
    }
    this.history.push(before)
    this.clearHint()
    this.updateHud()
    const duration = this.animateMove(before, lane, events)

    const status = getStatus(this.state)
    if (status !== 'playing') {
      this.resolving = true
      // Not via after(): rebuild() cancels animation timers, and this one must survive it.
      this.time.delayedCall(duration + 120, () => {
        this.resolving = false
        this.rebuild()
        if (status === 'won') this.finish(true)
        else this.startStuck()
      })
    }
  }

  private after(ms: number, fn: () => void) {
    this.animTimers.push(this.time.delayedCall(ms, fn))
  }

  /** Plays one move's events on top of views that currently show `before`. Returns its duration. */
  private animateMove(before: BusStopState, lane: number, events: MoveEvents): number {
    const busView = this.laneViews[lane].shift()!
    // Swap the lane-sized bus for a dock-sized one that drives up into the bay.
    const dockBus = this.makeBus(findBus(before, lane), DOCK_BUS_W, DOCK_BUS_H, true, 0)
    dockBus.container.setPosition(busView.x, busView.y).setDepth(12).setScale(0.85)
    busView.destroy()
    this.dockViews[events.slot] = dockBus
    sfx.busIn()
    this.tweens.add({
      targets: dockBus.container,
      x: this.dockX(events.slot),
      y: DOCK_Y,
      scale: 1,
      duration: 300,
      ease: 'Cubic.Out',
      onComplete: () => {
        dockBus.container.setDepth(4)
        burst(this, this.dockX(events.slot), DOCK_Y + 60, 0x8a86b8, { count: 8, speed: 160, size: 8, gravity: 100, glow: false })
      },
    })
    // Remaining lane buses roll forward.
    this.laneViews[lane].forEach((v, i) => {
      this.tweens.add({ targets: v, y: this.laneBusY(i), alpha: i === 0 ? 1 : 0.6, duration: 220, delay: 80, ease: 'Quad.Out' })
    })

    // Boarding: each passenger hops from the queue front into their bus.
    const BOARD_START = 320
    const BOARD_STEP = 120
    const departAt = new Map<number, number>()
    events.boarded.forEach((b, i) => {
      const at = BOARD_START + i * BOARD_STEP
      this.after(at, () => this.boardOne(b.slot, b.busId))
      const dep = events.departed.find((d) => d.busId === b.busId)
      if (dep) departAt.set(dep.busId, at + 260)
    })
    events.departed.forEach((d) => {
      this.after(departAt.get(d.busId) ?? BOARD_START, () => this.departBus(d.slot, d.busId))
    })
    const end = Math.max(BOARD_START + events.boarded.length * BOARD_STEP + 300, ...[...departAt.values()].map((t) => t + 500))
    this.after(end, () => this.rebuild())
    return end
  }

  private boardOne(slot: number, busId: number) {
    const token = this.queueViews.shift()
    const view = this.dockViews[slot]
    if (!token) return
    this.tweens.killTweensOf(token)
    const tx = this.dockX(slot)
    const ty = DOCK_Y
    // Arc: x linear, y up-then-down.
    this.tweens.add({ targets: token, x: tx, duration: 240, ease: 'Linear' })
    this.tweens.add({
      targets: token,
      y: { from: token.y, to: ty },
      scale: { from: 1.1, to: 0.4 },
      duration: 240,
      ease: 'Back.In',
      onComplete: () => {
        token.destroy()
        if (!view || view.busId !== busId) return
        const pip = view.pips[view.filled]
        if (pip) {
          pip.setFillStyle(0xffffff, 1)
          this.tweens.add({ targets: pip, scale: { from: 1.8, to: 1 }, duration: 160, ease: 'Back.Out' })
        }
        view.filled += 1
        punch(this, view.container, 1.08, 70)
        sfx.board(view.filled)
        burst(this, tx, ty - 40, 0xffffff, { count: 5, speed: 140, size: 6, gravity: 0, glow: false })
      },
    })
    // Queue shuffles forward; new arrival appears at the back.
    this.queueViews.forEach((v, i) => {
      this.tweens.killTweensOf(v)
      this.tweens.add({ targets: v, x: this.queueX(i), y: QUEUE_Y, scale: i === 0 ? 1.15 : 1, duration: 160, ease: 'Quad.Out' })
    })
    this.viewQueueIndex += 1
    const shownCount = this.queueViews.length
    const newIdx = this.viewQueueIndex + shownCount
    if (shownCount < QUEUE_VISIBLE && newIdx < this.state.queue.length) {
      const v = this.makePassenger(this.state.queue[newIdx], false)
      v.setPosition(this.queueX(shownCount), QUEUE_Y).setScale(0)
      this.tweens.add({ targets: v, scale: 1, duration: 180, ease: 'Back.Out' })
      this.queueViews.push(v)
    }
    this.updateMore(this.state.queue.length - this.viewQueueIndex)
  }

  private departBus(slot: number, busId: number) {
    const view = this.dockViews[slot]
    if (!view || view.busId !== busId) return
    this.dockViews[slot] = null
    const c = view.container
    const x = c.x
    sfx.depart()
    vibrate(20)
    popText(this, x, DOCK_Y - 70, '출발!', { size: 40, color: NEON.green })
    ring(this, x, DOCK_Y, NEON.green, 110, 5)
    burst(this, x, DOCK_Y, 0xffffff, { count: 10, colors: [NEON.green, NEON.yellow, 0xffffff], speed: 260, gravity: 0 })
    this.tweens.add({ targets: c, scaleX: 1.12, scaleY: 0.9, duration: 90, yoyo: true })
    // Exhaust puffs as it pulls away.
    for (let i = 0; i < 4; i++) {
      this.time.delayedCall(120 + i * 70, () => {
        const puff = this.add.circle(c.x + Phaser.Math.Between(-10, 10), c.y + DOCK_BUS_H / 2, 10, 0xaaaacc, 0.5).setDepth(3)
        this.tweens.add({ targets: puff, scale: 2.5, alpha: 0, y: puff.y + 30, duration: 420, onComplete: () => puff.destroy() })
      })
    }
    this.tweens.add({
      targets: c,
      y: -200,
      delay: 160,
      duration: 520,
      ease: 'Cubic.In',
      onComplete: () => c.destroy(),
    })
  }

  private undo(): boolean {
    if (this.ended) return false
    const prev = this.history.pop()
    if (!prev) return false
    this.clearStuck()
    this.clearHint()
    this.resolving = false
    this.state = prev
    this.rebuild()
    sfx.undo()
    flash(this, 120, NEON.cyan, 0.15)
    return true
  }

  /** Paid hint: the first lane of a guaranteed winning line from the current state. */
  private hint(): boolean {
    if (this.ended || this.stuckTimer || this.resolving) return false
    const lane = solve(this.state)
    if (lane === null) {
      this.showToast('해법이 없어요 — 되돌리기를 써보세요')
      return false
    }
    this.clearHint()
    this.hintLane = lane
    sfx.hint()
    const fr = this.laneViews[lane][0]
    if (fr) {
      ring(this, fr.x, fr.y, NEON.yellow, 90, 6)
      punch(this, fr, 1.15, 120)
    }
    this.hintTimer = this.time.delayedCall(4000, () => {
      this.hintLane = null
      this.drawLaneHighlights()
    })
    this.drawLaneHighlights()
    return true
  }

  private clearHint() {
    this.hintTimer?.remove()
    this.hintTimer = null
    this.hintLane = null
    this.drawLaneHighlights()
  }

  private startStuck() {
    sfx.jam()
    vibrate([50, 40, 50])
    shake(this, 260, 0.008)
    this.dockViews.forEach((v) => {
      if (!v) return
      this.tweens.add({ targets: v.container, angle: { from: -4, to: 4 }, duration: 60, yoyo: true, repeat: 3 })
    })
    const cx = 360
    const cy = 640
    const timerBar = this.add.rectangle(cx - 250, cy + 128, 500, 8, NEON.red).setOrigin(0, 0.5).setDepth(81)
    this.drawnStuck = [
      this.add.rectangle(cx, 540, 720, 1080, 0x05040f, 0.5).setDepth(79),
      this.add.rectangle(cx, cy, 600, 300, 0x15113a, 0.97).setStrokeStyle(4, NEON.red).setDepth(80),
      this.add.text(cx, cy - 92, '🚦 교통 정체!', displayText(48, hex(NEON.red))).setOrigin(0.5).setDepth(81),
      this.add.text(cx, cy - 32, '↩️ 되돌리기로 한 수 취소할 수 있어요', bodyText(26, '#ffffff')).setOrigin(0.5).setDepth(81),
      this.add.rectangle(cx, cy + 60, 300, 84, NEON.cyan).setDepth(81),
      this.add.text(cx, cy + 60, '결과 보기', displayText(36, '#04212a', '#00000000', 0)).setOrigin(0.5).setDepth(82),
      timerBar,
    ]
    this.tweens.add({ targets: timerBar, scaleX: 0, duration: STUCK_GRACE_MS })
    this.giveUpButton = new Phaser.Geom.Rectangle(cx - 150, cy + 18, 300, 84)
    this.stuckTimer = this.time.delayedCall(STUCK_GRACE_MS, () => this.finish(false))
  }

  private clearStuck() {
    this.stuckTimer?.remove()
    this.stuckTimer = null
    this.drawnStuck.forEach((o) => o.destroy())
    this.drawnStuck = []
    this.giveUpButton = null
  }

  private showToast(text: string) {
    this.toast.setText(text).setAlpha(1).setScale(0.8)
    this.tweens.killTweensOf(this.toast)
    this.tweens.add({ targets: this.toast, scale: 1, duration: 120, ease: 'Back.Out' })
    this.tweens.add({ targets: this.toast, alpha: 0, delay: 1100, duration: 400 })
  }

  private finish(cleared: boolean) {
    if (this.ended) return
    this.ended = true
    this.clearStuck()
    if (cleared) {
      banner(this, 'CLEAR!', NEON.green, this.taps <= this.totalBuses ? '퍼펙트 탭!' : `${this.taps}탭`)
      confetti(this)
      flash(this, 200, 0xffffff, 0.35)
    } else {
      banner(this, 'JAM!', NEON.red, '교통 정체')
    }

    const base = stageReward(this.stage)
    const stars = starsFromRatio(this.totalBuses / Math.max(1, this.taps), 0.85, 1)
    this.time.delayedCall(1300, () =>
      emitResult(this, {
        cleared,
        stars,
        coinsEarned: base + starBonus(base, stars),
        details: [`레인 탭 ${this.taps}회 / 버스 ${this.totalBuses}대 (같을수록 ★3)`],
      }),
    )
  }
}

function findBus(s: BusStopState, lane: number): Bus {
  return s.lanes[lane][0]
}

function makeTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('bs-bus')) return
  const make = (key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void) => {
    const g = scene.make.graphics({ x: 0, y: 0 }, false)
    draw(g)
    g.generateTexture(key, w, h)
    g.destroy()
  }
  // Top-down bus facing up, drawn in greys so a tint colours it.
  make('bs-bus', 100, 140, (g) => {
    g.fillStyle(0x111111, 1)
    for (const [x, y] of [
      [0, 22],
      [88, 22],
      [0, 98],
      [88, 98],
    ])
      g.fillRoundedRect(x, y, 12, 26, 4)
    g.fillStyle(0x6a6a6a, 1)
    g.fillRoundedRect(6, 6, 88, 132, 18)
    g.fillStyle(0xffffff, 1)
    g.fillRoundedRect(6, 2, 88, 130, 18)
    g.fillStyle(0x10102a, 1)
    g.fillRoundedRect(16, 10, 68, 22, 8)
    g.fillStyle(0xffffff, 0.35)
    g.fillRect(20, 13, 26, 6)
    g.fillStyle(0xd8d8d8, 1)
    g.fillRoundedRect(20, 40, 60, 80, 10)
    g.fillStyle(0x10102a, 0.8)
    for (let i = 0; i < 4; i++) {
      g.fillRect(9, 42 + i * 20, 6, 14)
      g.fillRect(85, 42 + i * 20, 6, 14)
    }
    g.fillStyle(0xfff3a6, 1)
    g.fillCircle(20, 6, 5)
    g.fillCircle(80, 6, 5)
  })
  make('bs-person', 40, 52, (g) => {
    g.fillStyle(0x000000, 0.35)
    g.fillEllipse(20, 49, 30, 6)
    g.fillStyle(0xffffff, 1)
    g.fillCircle(20, 11, 10)
    g.fillRoundedRect(6, 22, 28, 26, { tl: 12, tr: 12, bl: 4, br: 4 })
    g.fillStyle(0x000000, 0.25)
    g.fillRoundedRect(6, 40, 28, 8, { tl: 0, tr: 0, bl: 4, br: 4 })
  })
}
