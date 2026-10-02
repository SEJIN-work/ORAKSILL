import * as Phaser from 'phaser'
import { displayText, ensureGlowTexture, hex } from './theme.ts'

/**
 * Shared hit-feedback ("juice") helpers. Defaults are tuned to feel consistent across all
 * 4 games — reuse these instead of hand-rolling tweens. Everything self-destroys.
 */

export interface BurstOpts {
  count?: number
  speed?: number
  size?: number
  life?: number
  gravity?: number
  colors?: number[]
  glow?: boolean
  depth?: number
}

/** Scatter of fading squares (+ optional additive glow sparks): a cheap particle burst. */
export function burst(scene: Phaser.Scene, x: number, y: number, color: number, opts: BurstOpts = {}): void {
  const { count = 14, speed = 340, size = 12, life = 520, gravity = 600, colors = [color], glow = true, depth = 15 } = opts
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2
    const v = speed * (0.45 + Math.random() * 0.75)
    const s = size * (0.5 + Math.random() * 0.8)
    const c = colors[i % colors.length]
    const piece = scene.add.rectangle(x, y, s, s, c).setDepth(depth).setAngle(Math.random() * 360)
    const dx = Math.cos(angle) * v * (life / 1000)
    const dy = Math.sin(angle) * v * (life / 1000)
    scene.tweens.add({
      targets: piece,
      x: x + dx,
      y: y + dy + gravity * Math.pow(life / 1000, 2) * 0.5,
      angle: piece.angle + Phaser.Math.Between(-360, 360),
      scale: 0.2,
      alpha: 0,
      duration: life * (0.7 + Math.random() * 0.5),
      ease: 'Cubic.Out',
      onComplete: () => piece.destroy(),
    })
  }
  if (glow) {
    const key = ensureGlowTexture(scene)
    const halo = scene.add.image(x, y, key).setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(depth).setScale(1.5)
    scene.tweens.add({ targets: halo, scale: 4, alpha: 0, duration: 260, ease: 'Quad.Out', onComplete: () => halo.destroy() })
  }
}

/** Spinning triangular shards (glass / wood splinters). */
export function shards(scene: Phaser.Scene, x: number, y: number, color: number, count = 10, spread = 260): void {
  for (let i = 0; i < count; i++) {
    const s = Phaser.Math.Between(10, 26)
    const tri = scene.add
      .triangle(x, y, 0, 0, s, s * 0.3, s * 0.3, s, color, 0.95)
      .setStrokeStyle(2, 0xffffff, 0.6)
      .setDepth(15)
    const a = Math.random() * Math.PI * 2
    const d = spread * (0.4 + Math.random() * 0.8)
    scene.tweens.add({
      targets: tri,
      x: x + Math.cos(a) * d,
      y: y + Math.sin(a) * d + 160,
      angle: Phaser.Math.Between(-540, 540),
      alpha: 0,
      duration: Phaser.Math.Between(450, 750),
      ease: 'Quad.Out',
      onComplete: () => tri.destroy(),
    })
  }
}

/** Expanding shockwave ring. */
export function ring(scene: Phaser.Scene, x: number, y: number, color: number, radius = 80, width = 6, duration = 320): void {
  const r = scene.add.circle(x, y, radius * 0.25).setStrokeStyle(width, color, 1).setDepth(14)
  scene.tweens.add({ targets: r, radius, alpha: 0, duration, ease: 'Cubic.Out', onComplete: () => r.destroy() })
}

export interface PopTextOpts {
  size?: number
  color?: number
  rise?: number
  duration?: number
  depth?: number
}

/** Floating "+1" / "-3" / "+12G" label with a pop-in. */
export function popText(scene: Phaser.Scene, x: number, y: number, text: string, opts: PopTextOpts = {}): Phaser.GameObjects.Text {
  const { size = 34, color = 0xffffff, rise = 70, duration = 700, depth = 30 } = opts
  const t = scene.add.text(x, y, text, displayText(size, hex(color))).setOrigin(0.5).setDepth(depth).setScale(0.4)
  scene.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.Out' })
  scene.tweens.add({
    targets: t,
    y: y - rise,
    alpha: { from: 1, to: 0 },
    delay: duration * 0.35,
    duration: duration * 0.65,
    ease: 'Quad.In',
    onComplete: () => t.destroy(),
  })
  return t
}

/**
 * Quick scale-up-and-back. Uses explicit from/to so overlapping punches can never leave a
 * target stuck enlarged.
 */
export function punch(scene: Phaser.Scene, target: Phaser.GameObjects.GameObject, amount = 1.15, duration = 90): void {
  scene.tweens.killTweensOf(target)
  scene.tweens.add({ targets: target, scale: { from: 1, to: amount }, duration, yoyo: true, ease: 'Quad.Out' })
}

export function shake(scene: Phaser.Scene, duration = 140, intensity = 0.008): void {
  scene.cameras.main.shake(duration, intensity)
}

export function flash(scene: Phaser.Scene, duration = 90, color = 0xffffff, alpha = 0.35): void {
  // A translucent overlay reads better than camera.flash's full white.
  const { width, height } = scene.scale
  const r = scene.add.rectangle(width / 2, height / 2, width, height, color, alpha).setDepth(90)
  scene.tweens.add({ targets: r, alpha: 0, duration, onComplete: () => r.destroy() })
}

/** Brief camera zoom-in-and-back ("impact frame"). */
export function zoomPunch(scene: Phaser.Scene, amount = 1.04, duration = 70): void {
  const cam = scene.cameras.main
  scene.tweens.killTweensOf(cam)
  cam.setZoom(1)
  scene.tweens.add({ targets: cam, zoom: amount, duration, yoyo: true, ease: 'Quad.Out' })
}

const freezeUntil = new WeakMap<Phaser.Scene, number>()

/**
 * Hit-stop: freezes tweens for `ms` and reports frozen via isFrozen() so the scene can
 * skip its own simulation step — the "impact frame" pause from fighting games.
 */
export function hitStop(scene: Phaser.Scene, ms = 45): void {
  freezeUntil.set(scene, scene.time.now + ms)
  scene.tweens.timeScale = 0.05
  scene.time.delayedCall(ms, () => {
    if ((freezeUntil.get(scene) ?? 0) <= scene.time.now + 1) scene.tweens.timeScale = 1
  })
}

export function isFrozen(scene: Phaser.Scene): boolean {
  return (freezeUntil.get(scene) ?? 0) > scene.time.now
}

/** Full-screen confetti rain for stage clears. */
export function confetti(scene: Phaser.Scene, count = 70): void {
  const { width, height } = scene.scale
  const colors = [0xff2e88, 0x00e5ff, 0xffe14d, 0x39ff88, 0x9b5cff, 0xff8a2b]
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width
    const piece = scene.add
      .rectangle(x, -20 - Math.random() * 200, Phaser.Math.Between(10, 18), Phaser.Math.Between(6, 10), colors[i % colors.length])
      .setDepth(95)
    scene.tweens.add({
      targets: piece,
      y: height + 40,
      x: x + Phaser.Math.Between(-140, 140),
      angle: Phaser.Math.Between(-720, 720),
      duration: Phaser.Math.Between(1400, 2400),
      delay: Math.random() * 400,
      ease: 'Sine.In',
      onComplete: () => piece.destroy(),
    })
  }
}

/** Big centered stage-end banner (CLEAR!/FAIL) that slams in. */
export function banner(scene: Phaser.Scene, text: string, color: number, sub?: string): void {
  const { width, height } = scene.scale
  const cy = height / 2
  const band = scene.add.rectangle(width / 2, cy, width, 190, 0x000000, 0.72).setDepth(96).setScale(1, 0)
  scene.tweens.add({ targets: band, scaleY: 1, duration: 160, ease: 'Back.Out' })
  const t = scene.add
    .text(width / 2, cy - (sub ? 18 : 0), text, displayText(110, hex(color), '#0b0820', 12))
    .setOrigin(0.5)
    .setDepth(97)
    .setScale(2.6)
    .setAlpha(0)
  scene.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' })
  if (sub) {
    const s = scene.add.text(width / 2, cy + 62, sub, displayText(34, '#ffffff')).setOrigin(0.5).setDepth(97).setAlpha(0)
    scene.tweens.add({ targets: s, alpha: 1, delay: 220, duration: 200 })
  }
}

/** Solid white "hit flash" on an image for `ms` (Phaser 4 tint-mode API). */
export function hitFlash(scene: Phaser.Scene, target: Phaser.GameObjects.Image, ms = 55, color = 0xffffff): void {
  target.setTint(color).setTintMode(Phaser.TintModes.FILL)
  scene.time.delayedCall(ms, () => {
    if (target.active) target.clearTint().setTintMode(Phaser.TintModes.MULTIPLY)
  })
}
