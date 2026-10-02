import * as Phaser from 'phaser'
import { sfx } from '../../systems/audio/audio.ts'
import { stageReward, starBonus, starsFromRatio } from '../../systems/economy.ts'
import { vibrate } from '../../systems/haptics.ts'
import { banner, burst, confetti, flash, popText, punch, ring, shake } from '../effects.ts'
import { emitResult, getInitData, onItemUse, USE_UNDO_EVENT } from '../session.ts'
import { bodyText, displayText, drawBackdrop, drawHudBar, ensureGlowTexture, hex, NEON } from '../theme.ts'
import {
  canAnyMove,
  cloneBoard,
  createBoard,
  EMPTY,
  maxTile,
  move,
  OBSTACLE,
  spawnTile,
  STAGES,
  WILD,
  type Board,
  type Direction,
  type MergeEvent,
  type StageConfig,
} from './mergeLogic.ts'

export const MAX_STAGE = STAGES.length

const HUD_H = 150
const BOARD_PX = 664
const BOARD_TOP = 230
const SWIPE_MIN = 40
const STUCK_GRACE_MS = 3000
const SLIDE_MS = 95

/** Neon ramp: each doubling shifts hue; ≥128 tiles also glow. */
const TILE_COLORS: Record<number, [number, number]> = {
  2: [0x3b3470, 0xd8d0ff],
  4: [0x4a3c96, 0xffffff],
  8: [0x7b3fe4, 0xffffff],
  16: [0xb03fe4, 0xffffff],
  32: [0xe43fb6, 0xffffff],
  64: [0xff2e6e, 0xffffff],
  128: [0xff6b2b, 0xffffff],
  256: [0xffa62b, 0x2a1400],
  512: [0xffe14d, 0x2a1d00],
  1024: [0x39ff88, 0x002a12],
  2048: [0x00e5ff, 0x00202a],
}

export default class MergeNumbersScene extends Phaser.Scene {
  private cfg!: StageConfig
  private stage = 1
  private board: Board = []
  private movesLeft = 0
  private history: { board: Board; movesLeft: number }[] = []
  private ended = false
  private stuckTimer: Phaser.Time.TimerEvent | null = null
  private stuckUi: Phaser.GameObjects.GameObject[] = []
  private tiles = new Map<string, Phaser.GameObjects.Container>()
  private animating = false
  private pending: (() => void) | null = null
  private swipeStart: { x: number; y: number } | null = null
  private giveUpButton: Phaser.Geom.Rectangle | null = null
  private movesText!: Phaser.GameObjects.Text
  private bestText!: Phaser.GameObjects.Text
  private hudBars!: Phaser.GameObjects.Graphics
  private cell = 0
  private gap = 12

  constructor() {
    super('MergeNumbersScene')
  }

  create() {
    const init = getInitData(this)
    this.stage = init.stage
    this.cfg = STAGES[Math.min(this.stage, MAX_STAGE) - 1]
    this.board = createBoard(this.cfg, Math.random, init.boosterActive)
    this.movesLeft = this.cfg.moves
    this.history = []
    this.ended = false
    this.tiles = new Map()
    const size = this.cfg.size
    this.gap = size >= 6 ? 9 : 12
    this.cell = (BOARD_PX - this.gap * (size + 1)) / size

    ensureGlowTexture(this)
    drawBackdrop(this, HUD_H, NEON.purple)
    drawHudBar(this, HUD_H, NEON.purple)
    this.buildHud()
    this.drawBoardFrame()

    this.add
      .text(360, BOARD_TOP + BOARD_PX + 50, 'PC  ← ↑ → ↓ / 드래그     모바일  스와이프', bodyText(24, '#8e86c2'))
      .setOrigin(0.5)

    // Phaser can dispatch the same KeyboardEvent twice when several keys land in one frame — dedupe.
    const seen = new WeakSet<KeyboardEvent>()
    this.input.keyboard?.on('keydown', (e: KeyboardEvent) => {
      if (seen.has(e)) return
      seen.add(e)
      const dir = KEY_DIRECTIONS[e.key]
      if (dir) {
        e.preventDefault()
        this.tryMove(dir)
      }
    })

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.giveUpButton?.contains(p.x, p.y)) {
        this.finish(false)
        return
      }
      this.swipeStart = { x: p.x, y: p.y }
    })
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.swipeStart) return
      const dx = p.x - this.swipeStart.x
      const dy = p.y - this.swipeStart.y
      this.swipeStart = null
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return
      this.tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
    })

    onItemUse(this, USE_UNDO_EVENT, () => this.undo())

    this.renderAll()
    // Opening deal: tiles drop in one by one.
    let i = 0
    for (const t of this.tiles.values()) {
      t.setScale(0)
      this.tweens.add({ targets: t, scale: 1, delay: 120 + i++ * 90, duration: 220, ease: 'Back.Out' })
    }
    this.updateHud()
  }

  private buildHud() {
    // Goal tile badge (left), moves (centre), best tile (right).
    const goal = this.makeTile(this.cfg.target, 96)
    goal.setPosition(78, 74).setDepth(9)
    this.tweens.add({ targets: goal, scale: { from: 1, to: 1.06 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' })
    this.add.text(78, 128, 'GOAL', displayText(20, hex(NEON.purple))).setOrigin(0.5).setDepth(9)
    this.add.text(360, 16, 'MOVES', displayText(22, hex(NEON.purple))).setOrigin(0.5, 0).setDepth(9)
    this.movesText = this.add.text(360, 40, '', displayText(56)).setOrigin(0.5, 0).setDepth(9)
    this.add.text(650, 16, 'BEST', displayText(22, hex(NEON.purple))).setOrigin(0.5, 0).setDepth(9)
    this.bestText = this.add.text(650, 40, '', displayText(56)).setOrigin(0.5, 0).setDepth(9)
    this.hudBars = this.add.graphics().setDepth(9)
  }

  private drawBoardFrame() {
    const left = (720 - BOARD_PX) / 2
    // Baked once: static Graphics are re-tessellated every frame otherwise (see theme.bake).
    const g = this.make.graphics({ x: 0, y: 0 }, false)
    g.fillStyle(NEON.purple, 0.2)
    g.fillRoundedRect(left - 10, BOARD_TOP - 10, BOARD_PX + 20, BOARD_PX + 20, 30)
    g.fillStyle(0x120d33, 1)
    g.fillRoundedRect(left, BOARD_TOP, BOARD_PX, BOARD_PX, 24)
    g.lineStyle(3, NEON.purple, 0.8)
    g.strokeRoundedRect(left, BOARD_TOP, BOARD_PX, BOARD_PX, 24)
    for (let r = 0; r < this.cfg.size; r++) {
      for (let c = 0; c < this.cfg.size; c++) {
        const { x, y } = this.cellPos(r, c)
        if (this.board[r][c] === OBSTACLE) {
          // Hazard-striped stone block.
          g.fillStyle(0x0a0816, 1)
          g.fillRoundedRect(x - this.cell / 2, y - this.cell / 2, this.cell, this.cell, 14)
          g.lineStyle(6, 0x3a3060, 1)
          for (let k = -2; k <= 2; k++) {
            const o = (k * this.cell) / 3
            g.lineBetween(x - this.cell / 2 + 10 + o, y + this.cell / 2 - 10, x + this.cell / 2 - 10 + o, y - this.cell / 2 + 10)
          }
          g.lineStyle(3, NEON.red, 0.5)
          g.strokeRoundedRect(x - this.cell / 2, y - this.cell / 2, this.cell, this.cell, 14)
        } else {
          g.fillStyle(0x1f1950, 1)
          g.fillRoundedRect(x - this.cell / 2, y - this.cell / 2, this.cell, this.cell, 14)
        }
      }
    }
    g.generateTexture('mn-frame', 720, 1080)
    g.destroy()
    this.add.image(0, 0, 'mn-frame').setOrigin(0).setDepth(-1)
  }

  private cellPos(r: number, c: number) {
    const left = (720 - BOARD_PX) / 2
    return {
      x: left + this.gap + c * (this.cell + this.gap) + this.cell / 2,
      y: BOARD_TOP + this.gap + r * (this.cell + this.gap) + this.cell / 2,
    }
  }

  /** A tile as a container: glow (big values) + body + bevel + number. */
  private makeTile(v: number, size = this.cell): Phaser.GameObjects.Container {
    const parts: Phaser.GameObjects.GameObject[] = []
    const [bg, fg] = v === WILD ? [NEON.yellow, 0x2a1d00] : (TILE_COLORS[v] ?? [NEON.cyan, 0x00202a])
    if (v >= 128 || v === WILD) {
      parts.push(this.add.image(0, 0, 'glow').setTint(bg).setBlendMode(Phaser.BlendModes.ADD).setScale((size / 64) * 2.2).setAlpha(0.55))
    }
    const g = this.add.graphics()
    const h = size / 2
    g.fillStyle(Phaser.Display.Color.IntegerToColor(bg).darken(35).color, 1)
    g.fillRoundedRect(-h, -h + 5, size, size, 14)
    g.fillStyle(bg, 1)
    g.fillRoundedRect(-h, -h, size, size - 4, 14)
    g.fillStyle(0xffffff, 0.18)
    g.fillRoundedRect(-h + 6, -h + 5, size - 12, size * 0.32, 10)
    parts.push(g)
    const label = v === WILD ? '★' : String(v)
    const fontSize = Math.round(size * (label.length >= 4 ? 0.3 : label.length === 3 ? 0.38 : 0.48))
    parts.push(this.add.text(0, -2, label, displayText(fontSize, hex(fg), '#00000055', 3)).setOrigin(0.5))
    const container = this.add.container(0, 0, parts).setDepth(5)
    if (v === WILD) this.tweens.add({ targets: container, angle: { from: -4, to: 4 }, duration: 500, yoyo: true, repeat: -1 })
    return container
  }

  private key(r: number, c: number) {
    return `${r},${c}`
  }

  /** Rebuilds every tile view from `this.board` (instant, no animation). */
  private renderAll() {
    this.tiles.forEach((t) => t.destroy())
    this.tiles.clear()
    this.board.forEach((row, r) =>
      row.forEach((v, c) => {
        if (v === EMPTY || v === OBSTACLE) return
        const t = this.makeTile(v)
        const { x, y } = this.cellPos(r, c)
        t.setPosition(x, y)
        this.tiles.set(this.key(r, c), t)
      }),
    )
  }

  private tryMove(dir: Direction) {
    if (this.ended || this.stuckTimer) return
    if (this.animating) {
      // Finish the running slide instantly so fast swipes never get dropped.
      this.pending?.()
    }
    const result = move(this.board, dir)
    if (!result.moved) {
      // Bump the board toward the blocked direction.
      const dx = dir === 'left' ? -8 : dir === 'right' ? 8 : 0
      const dy = dir === 'up' ? -8 : dir === 'down' ? 8 : 0
      this.cameras.main.setScroll(-dx, -dy)
      this.tweens.add({ targets: this.cameras.main, scrollX: 0, scrollY: 0, duration: 120, ease: 'Back.Out' })
      return
    }
    this.history.push({ board: cloneBoard(this.board), movesLeft: this.movesLeft })
    this.board = result.board
    this.movesLeft -= 1
    const spawned = spawnTile(this.board)
    sfx.slide()

    // Slide existing tile views to their destinations.
    this.animating = true
    for (const m of result.moves) {
      const view = this.tiles.get(this.key(m.from[0], m.from[1]))
      if (!view) continue
      const { x, y } = this.cellPos(m.to[0], m.to[1])
      this.tweens.add({ targets: view, x, y, duration: SLIDE_MS, ease: 'Quad.Out' })
    }
    let settled = false
    const settle = () => {
      if (settled) return
      settled = true
      this.pending = null
      this.animating = false
      this.tweens.killTweensOf([...this.tiles.values()])
      this.renderAll()
      this.afterMove(result.merges, spawned)
    }
    this.pending = settle
    this.time.delayedCall(SLIDE_MS + 5, settle)
    this.updateHud()
  }

  private afterMove(merges: MergeEvent[], spawned: [number, number] | null) {
    const biggest = merges.reduce((m, e) => Math.max(m, e.value), 0)
    merges.forEach((e, i) => {
      const view = this.tiles.get(this.key(e.row, e.col))
      if (view) {
        view.setScale(1)
        this.tweens.add({ targets: view, scale: { from: 1.28, to: 1 }, duration: 160, ease: 'Back.Out' })
      }
      const { x, y } = this.cellPos(e.row, e.col)
      const [color] = TILE_COLORS[e.value] ?? [NEON.cyan]
      burst(this, x, y, color, { count: 8 + Math.min(14, Math.log2(e.value) * 1.5), speed: 260, size: 10, gravity: 200 })
      if (e.value >= 32) ring(this, x, y, color, this.cell * 0.9, 5)
      this.time.delayedCall(i * 35, () => sfx.merge(e.value))
    })
    if (biggest >= 128) {
      shake(this, 120, 0.004 + Math.min(0.012, biggest / 40000))
      vibrate(20)
    }
    if (merges.length >= 3) {
      const { x, y } = this.cellPos(merges[0].row, merges[0].col)
      popText(this, x, y - 40, `${merges.length} MERGE!`, { size: 40, color: NEON.yellow })
    }
    if (spawned) {
      const view = this.tiles.get(this.key(spawned[0], spawned[1]))
      if (view) {
        view.setScale(0)
        this.tweens.add({ targets: view, scale: 1, delay: 40, duration: 160, ease: 'Back.Out' })
      }
    }
    this.updateHud()
    if (biggest > 0) punch(this, this.bestText, 1.25)

    if (maxTile(this.board) >= this.cfg.target) this.finish(true)
    else if (this.movesLeft <= 0 || !canAnyMove(this.board)) this.startStuck()
  }

  private undo(): boolean {
    if (this.ended) return false
    this.pending?.()
    const prev = this.history.pop()
    if (!prev) return false
    this.clearStuck()
    this.board = prev.board
    this.movesLeft = prev.movesLeft
    this.renderAll()
    sfx.undo()
    flash(this, 120, NEON.cyan, 0.15)
    this.updateHud()
    return true
  }

  /** Out of moves / no legal move: short grace period so an undo can still save the run. */
  private startStuck() {
    const reason = this.movesLeft <= 0 ? '이동 횟수를 모두 썼어요' : '더 이상 움직일 수 없어요'
    sfx.jam()
    vibrate([40, 40, 40])
    shake(this, 200, 0.006)
    const cx = 360
    const cy = 560
    const timerBar = this.add.rectangle(cx - 250, cy + 128, 500, 8, NEON.red).setOrigin(0, 0.5).setDepth(81)
    this.stuckUi = [
      this.add.rectangle(cx, cy, 720, 1080, 0x05040f, 0.55).setDepth(79),
      this.add.rectangle(cx, cy, 580, 300, 0x15113a, 0.97).setStrokeStyle(4, NEON.red).setDepth(80),
      this.add.text(cx, cy - 90, reason, displayText(40, hex(NEON.red))).setOrigin(0.5).setDepth(81),
      this.add.text(cx, cy - 30, '↩️ 되돌리기로 한 수 취소할 수 있어요', bodyText(26, '#ffffff')).setOrigin(0.5).setDepth(81),
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
    this.stuckUi.forEach((o) => o.destroy())
    this.stuckUi = []
    this.giveUpButton = null
  }

  private updateHud() {
    this.movesText.setText(String(this.movesLeft))
    this.movesText.setColor(this.movesLeft <= Math.max(5, this.cfg.moves * 0.1) ? hex(NEON.red) : '#ffffff')
    this.bestText.setText(String(Math.max(0, maxTile(this.board))))
    const g = this.hudBars
    g.clear()
    g.fillStyle(0x000000, 0.5)
    g.fillRoundedRect(200, 116, 320, 12, 6)
    g.fillStyle(NEON.purple, 1)
    g.fillRoundedRect(200, 116, Math.max(12, (320 * this.movesLeft) / this.cfg.moves), 12, 6)
  }

  private finish(cleared: boolean) {
    if (this.ended) return
    this.ended = true
    this.pending?.()
    this.clearStuck()
    if (cleared) {
      // Celebrate on the goal tile itself first.
      for (const [k, view] of this.tiles) {
        const [r, c] = k.split(',').map(Number)
        if (this.board[r][c] >= this.cfg.target) {
          this.tweens.add({ targets: view, scale: 1.4, angle: 360, duration: 500, ease: 'Back.Out' })
          burst(this, view.x, view.y, NEON.yellow, { count: 30, speed: 520, colors: [NEON.yellow, NEON.pink, NEON.cyan] })
          ring(this, view.x, view.y, NEON.yellow, 260, 10, 500)
        }
      }
      flash(this, 200, 0xffffff, 0.4)
      shake(this, 250, 0.01)
      vibrate([30, 40, 60])
      this.time.delayedCall(350, () => {
        banner(this, 'CLEAR!', NEON.green, `${this.cfg.target} 완성!`)
        confetti(this)
      })
    } else {
      banner(this, 'GAME OVER', NEON.red)
    }

    const base = stageReward(this.stage)
    const stars = starsFromRatio(this.movesLeft / this.cfg.moves, 0.1, 0.2)
    const moveBonus = Math.floor(this.movesLeft / 2)
    this.time.delayedCall(cleared ? 1700 : 1200, () =>
      emitResult(this, {
        cleared,
        stars,
        coinsEarned: base + starBonus(base, stars) + moveBonus,
        details: [
          `최고 타일 ${maxTile(this.board)} / 목표 ${this.cfg.target}`,
          `남은 이동 ${this.movesLeft}회 (보너스 +${moveBonus})`,
        ],
      }),
    )
  }
}

const KEY_DIRECTIONS: Record<string, Direction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
}
