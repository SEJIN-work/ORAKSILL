import * as Phaser from 'phaser'

/** Phaser-side mirror of the CSS tokens in index.css. */
export const NEON = {
  pink: 0xff2e88,
  cyan: 0x00e5ff,
  yellow: 0xffe14d,
  green: 0x39ff88,
  purple: 0x9b5cff,
  orange: 0xff8a2b,
  red: 0xff4d6d,
  white: 0xffffff,
  bg: 0x07061a,
  panel: 0x15113a,
  panel2: 0x221b55,
  line: 0x3a3180,
}

export const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

export const FONT_DISPLAY = '"Black Han Sans", "Noto Sans KR", sans-serif'
export const FONT_BODY = '"Noto Sans KR", sans-serif'

/** Chunky outlined display text, the arcade look used for every in-canvas label. */
export function displayText(size: number, color = '#ffffff', stroke = '#0b0820', strokePx = Math.max(4, size / 7)): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_DISPLAY,
    fontSize: `${size}px`,
    color,
    stroke,
    strokeThickness: strokePx,
  }
}

export function bodyText(size: number, color = '#c9c2f0'): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT_BODY, fontSize: `${size}px`, color, fontStyle: 'bold' }
}

/** Soft radial glow texture shared by particles and halos (white; tint per use). */
export function ensureGlowTexture(scene: Phaser.Scene, key = 'glow', radius = 32): string {
  if (scene.textures.exists(key)) return key
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  const steps = 16
  for (let i = steps; i >= 1; i--) {
    const r = (radius * i) / steps
    g.fillStyle(0xffffff, 0.1 * Math.pow(1 - i / steps, 1.4) + 0.02)
    g.fillCircle(radius, radius, r)
  }
  g.fillStyle(0xffffff, 1)
  g.fillCircle(radius, radius, radius * 0.18)
  g.generateTexture(key, radius * 2, radius * 2)
  g.destroy()
  return key
}

/**
 * Draws static art once into a texture and shows it as a single image. Phaser re-tessellates
 * Graphics every frame, so big static Graphics (grids, roads, frames) cost real FPS on phones —
 * always bake them. Note: baking uses the canvas path, which ignores fillGradientStyle; use
 * vGradient() below instead.
 */
export function bake(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
  depth = 0,
): Phaser.GameObjects.Image {
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false)
    draw(g)
    g.generateTexture(key, width, height)
    g.destroy()
  }
  return scene.add.image(0, 0, key).setOrigin(0).setDepth(depth)
}

/** Vertical gradient as stepped bands (bake-safe replacement for fillGradientStyle). */
export function vGradient(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, top: number, bottom: number, steps = 24): void {
  const a = Phaser.Display.Color.IntegerToColor(top)
  const b = Phaser.Display.Color.IntegerToColor(bottom)
  for (let i = 0; i < steps; i++) {
    const c = Phaser.Display.Color.Interpolate.ColorWithColor(a, b, steps - 1, i)
    g.fillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 1)
    g.fillRect(x, y + Math.floor((h * i) / steps), w, Math.ceil(h / steps) + 1)
  }
}

/** Draws the shared dark backdrop with a faint neon grid (baked). */
export function drawBackdrop(scene: Phaser.Scene, top = 0, accent = NEON.purple): void {
  const { width, height } = scene.scale
  bake(scene, `backdrop-${top}-${accent}`, width, height, (g) => {
    vGradient(g, 0, top, width, height - top, 0x0d0a2a, 0x050414)
    g.lineStyle(1, accent, 0.09)
    for (let x = 0; x <= width; x += 48) g.lineBetween(x, top, x, height)
    for (let y = top; y <= height; y += 48) g.lineBetween(0, y, width, y)
  }, -100)
}

/** Top HUD bar with a neon underline (baked). */
export function drawHudBar(scene: Phaser.Scene, height: number, accent: number): void {
  const { width } = scene.scale
  bake(scene, `hud-${height}-${accent}`, width, height + 8, (g) => {
    vGradient(g, 0, 0, width, height, 0x221b55, 0x120e33, 12)
    g.fillStyle(accent, 1)
    g.fillRect(0, height - 4, width, 4)
    g.fillStyle(accent, 0.25)
    g.fillRect(0, height, width, 8)
  }, 8)
}
