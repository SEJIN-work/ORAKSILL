import { loadSave } from '../storage/storage.ts'

/**
 * Every sound here is synthesized from Web Audio oscillators/noise — no audio files
 * (bundle size + no asset licensing). Each sfx call re-checks settings.soundEnabled
 * (cached for 250ms) so the Settings toggle applies immediately.
 */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let sfxBus: GainNode | null = null
let musicBus: GainNode | null = null
let noiseBuffer: AudioBuffer | null = null

let cachedEnabled = true
let cachedAt = -Infinity
function soundEnabled(): boolean {
  const now = performance.now()
  if (now - cachedAt > 250) {
    cachedEnabled = loadSave().settings.soundEnabled
    cachedAt = now
  }
  return cachedEnabled
}

/** Forces the next sfx call to re-read settings (call after toggling). */
export function invalidateSoundSetting(): void {
  cachedAt = -Infinity
}

function ensureContext(): AudioContext | null {
  if (ctx) return ctx
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  ctx = new Ctor()
  const comp = ctx.createDynamicsCompressor()
  comp.threshold.value = -14
  comp.ratio.value = 6
  master = ctx.createGain()
  master.gain.value = 0.8
  sfxBus = ctx.createGain()
  sfxBus.gain.value = 0.9
  musicBus = ctx.createGain()
  musicBus.gain.value = 0.22
  sfxBus.connect(master)
  musicBus.connect(master)
  master.connect(comp)
  comp.connect(ctx.destination)

  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
  const data = noiseBuffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  return ctx
}

/**
 * Events that count as a user activation for audio on every browser. iOS Safari does NOT count
 * touchstart / pointerdown (finger down) — only finger up (touchend), click and keys. Creating or
 * resuming the AudioContext from a non-activating event is what kept iPhones silent.
 */
const ACTIVATING_EVENTS = ['touchend', 'click', 'keydown', 'mousedown'] as const

let failedUnlocks = 0

/**
 * Creates (if needed) and resumes the AudioContext. Must run synchronously inside an
 * activating gesture handler (see ACTIVATING_EVENTS).
 */
export function unlockAudio(): void {
  // A context that already failed to start inside a real gesture is replaced with a fresh one
  // created inside this gesture (iOS can leave a context created too early permanently silent).
  if (ctx && ctx.state !== 'running' && failedUnlocks > 0) {
    void ctx.close().catch(() => {})
    ctx = null
  }
  const c = ensureContext()
  if (!c || c.state === 'running') return
  // 'interrupted' is iOS's state after a call / app switch; resume() works for it too.
  void c.resume().then(
    () => { if (c.state === 'running') failedUnlocks = 0 },
    () => {},
  )
  // Classic iOS unlock: start a 1-sample silent buffer inside the gesture.
  const src = c.createBufferSource()
  src.buffer = c.createBuffer(1, 1, c.sampleRate)
  src.connect(c.destination)
  src.start(0)
  // If it still isn't running shortly after, the next gesture recreates the context.
  window.setTimeout(() => { if (ctx === c && c.state !== 'running') failedUnlocks++ }, 300)
}

let unlockInstalled = false

/**
 * Keeps trying to unlock on every activating gesture, forever: iOS re-suspends audio after
 * calls/app switches. Once running, each handler is a cheap state check. Also starts the BGM loop.
 */
export function installAudioUnlock(): void {
  if (unlockInstalled) return
  unlockInstalled = true
  const onGesture = () => {
    if (ctx?.state === 'running') return
    unlockAudio()
    startBgm()
  }
  for (const type of ACTIVATING_EVENTS) document.addEventListener(type, onGesture, { capture: true, passive: true })
  // Coming back to the tab: some browsers allow resume without a new gesture.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ctx && ctx.state !== 'running') void ctx.resume().catch(() => {})
  })
}

export type AudioStatus = 'unsupported' | 'not-started' | 'running' | 'suspended' | 'interrupted' | 'closed'

/** For the Settings "소리 테스트" readout. */
export function getAudioStatus(): AudioStatus {
  const has = typeof window !== 'undefined' && (window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext)
  if (!has) return 'unsupported'
  if (!ctx) return 'not-started'
  return ctx.state as AudioStatus
}

function ready(): AudioContext | null {
  if (!soundEnabled()) return null
  // Never create the context here: a sound may fire from a non-activating event (e.g. pointerdown),
  // and on iOS a context created outside a real gesture can stay silent. Only gestures create it.
  if (!ctx || ctx.state !== 'running') return null
  return ctx
}

const lastPlayed = new Map<string, number>()
/** Drops a sound if the same key fired within `minMs` (keeps rapid-fire towers from clipping). */
function throttle(key: string, minMs: number): boolean {
  const now = performance.now()
  if (now - (lastPlayed.get(key) ?? -Infinity) < minMs) return false
  lastPlayed.set(key, now)
  return true
}

interface ToneOpts {
  freq: number
  to?: number
  dur: number
  type?: OscillatorType
  vol?: number
  delay?: number
  attack?: number
  bus?: GainNode | null
}

function tone({ freq, to, dur, type = 'square', vol = 0.2, delay = 0, attack = 0.005, bus }: ToneOpts) {
  const c = ctx!
  const t = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g)
  g.connect(bus ?? sfxBus!)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

interface NoiseOpts {
  dur: number
  vol?: number
  filter?: BiquadFilterType
  freq?: number
  to?: number
  q?: number
  delay?: number
  bus?: GainNode | null
}

function noise({ dur, vol = 0.3, filter = 'lowpass', freq = 2000, to, q = 1, delay = 0, bus }: NoiseOpts) {
  const c = ctx!
  const t = c.currentTime + delay
  const src = c.createBufferSource()
  src.buffer = noiseBuffer
  const f = c.createBiquadFilter()
  f.type = filter
  f.frequency.setValueAtTime(freq, t)
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur)
  f.Q.value = q
  const g = c.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f)
  f.connect(g)
  g.connect(bus ?? sfxBus!)
  src.start(t, Math.random() * 0.5)
  src.stop(t + dur + 0.02)
}

const semitone = (base: number, n: number) => base * Math.pow(2, n / 12)

export const sfx = {
  /** UI button press. */
  click() {
    if (!ready() || !throttle('click', 30)) return
    tone({ freq: 880, to: 1320, dur: 0.06, type: 'square', vol: 0.08 })
  },
  error() {
    if (!ready() || !throttle('error', 80)) return
    tone({ freq: 220, to: 160, dur: 0.16, type: 'sawtooth', vol: 0.12 })
    tone({ freq: 233, to: 170, dur: 0.16, type: 'square', vol: 0.06 })
  },
  coin(step = 0) {
    if (!ready() || !throttle('coin', 35)) return
    const f = semitone(988, Math.min(step, 12))
    tone({ freq: f, dur: 0.07, type: 'square', vol: 0.1 })
    tone({ freq: f * 1.335, dur: 0.18, type: 'square', vol: 0.1, delay: 0.06 })
  },
  purchase() {
    if (!ready()) return
    ;[0, 4, 7, 12].forEach((n, i) => tone({ freq: semitone(659, n), dur: 0.12, type: 'triangle', vol: 0.18, delay: i * 0.06 }))
    noise({ dur: 0.25, filter: 'highpass', freq: 6000, vol: 0.08, delay: 0.2 })
  },
  star(i: number) {
    if (!ready()) return
    tone({ freq: semitone(784, i * 4), dur: 0.3, type: 'triangle', vol: 0.22 })
    tone({ freq: semitone(1568, i * 4), dur: 0.2, type: 'sine', vol: 0.08, delay: 0.02 })
  },
  clear() {
    if (!ready()) return
    const notes = [0, 4, 7, 12, 7, 12, 16]
    notes.forEach((n, i) => tone({ freq: semitone(523, n), dur: i === notes.length - 1 ? 0.5 : 0.13, type: 'square', vol: 0.12, delay: i * 0.09 }))
    notes.forEach((n, i) => tone({ freq: semitone(262, n), dur: 0.12, type: 'triangle', vol: 0.12, delay: i * 0.09 }))
  },
  fail() {
    if (!ready()) return
    ;[0, -3, -6, -10].forEach((n, i) => tone({ freq: semitone(392, n), dur: 0.26, type: 'sawtooth', vol: 0.1, delay: i * 0.17 }))
  },
  countTick() {
    if (!ready() || !throttle('tick', 50)) return
    tone({ freq: 1200, dur: 0.04, type: 'square', vol: 0.06 })
  },

  // --- Stress Breaker ---
  /** Breaking an object; pitch climbs with the combo. */
  smash(combo: number, kind: 'box' | 'glass' | 'balloon' | 'bonus') {
    if (!ready()) return
    const lift = Math.min(combo, 24)
    if (kind === 'glass') {
      noise({ dur: 0.35, filter: 'highpass', freq: 3500, vol: 0.35 })
      for (let i = 0; i < 4; i++) tone({ freq: 2400 + Math.random() * 2400, dur: 0.12, type: 'sine', vol: 0.06, delay: i * 0.03 })
    } else if (kind === 'balloon') {
      noise({ dur: 0.12, filter: 'bandpass', freq: 1200, q: 0.7, vol: 0.5 })
      tone({ freq: 300, to: 80, dur: 0.1, type: 'sine', vol: 0.3 })
    } else {
      noise({ dur: 0.22, filter: 'lowpass', freq: 1800, to: 300, vol: 0.45 })
      tone({ freq: 140, to: 50, dur: 0.18, type: 'sine', vol: 0.5 })
    }
    // Rising combo "ding" layered on top.
    tone({ freq: semitone(523, lift), dur: 0.12, type: 'square', vol: 0.07 })
    if (kind === 'bonus') this.coin(lift)
  },
  thud() {
    if (!ready() || !throttle('thud', 30)) return
    tone({ freq: 180, to: 90, dur: 0.08, type: 'sine', vol: 0.35 })
    noise({ dur: 0.05, freq: 900, vol: 0.2 })
  },
  bomb() {
    if (!ready()) return
    noise({ dur: 0.8, filter: 'lowpass', freq: 1200, to: 60, vol: 0.8 })
    tone({ freq: 90, to: 30, dur: 0.6, type: 'sine', vol: 0.8 })
  },
  whoosh() {
    if (!ready() || !throttle('whoosh', 120)) return
    noise({ dur: 0.18, filter: 'bandpass', freq: 600, to: 2400, q: 1.5, vol: 0.12 })
  },

  // --- Tower Defense ---
  shoot(kind: 'mg' | 'sniper' | 'cannon') {
    if (!ready()) return
    if (kind === 'mg') {
      if (!throttle('mg', 45)) return
      noise({ dur: 0.05, filter: 'bandpass', freq: 2500, q: 2, vol: 0.12 })
      tone({ freq: 700, to: 300, dur: 0.04, type: 'square', vol: 0.04 })
    } else if (kind === 'sniper') {
      if (!throttle('sniper', 60)) return
      noise({ dur: 0.25, filter: 'highpass', freq: 1500, vol: 0.25 })
      tone({ freq: 1800, to: 200, dur: 0.2, type: 'sawtooth', vol: 0.08 })
    } else {
      if (!throttle('cannon', 60)) return
      noise({ dur: 0.3, filter: 'lowpass', freq: 700, to: 100, vol: 0.4 })
      tone({ freq: 110, to: 45, dur: 0.25, type: 'sine', vol: 0.4 })
    }
  },
  explode() {
    if (!ready() || !throttle('explode', 50)) return
    noise({ dur: 0.45, filter: 'lowpass', freq: 1500, to: 80, vol: 0.4 })
  },
  enemyDie() {
    if (!ready() || !throttle('die', 35)) return
    tone({ freq: 600, to: 120, dur: 0.12, type: 'square', vol: 0.08 })
    noise({ dur: 0.1, freq: 3000, vol: 0.12 })
  },
  build() {
    if (!ready()) return
    tone({ freq: 196, dur: 0.08, type: 'square', vol: 0.12 })
    tone({ freq: 294, dur: 0.12, type: 'square', vol: 0.12, delay: 0.07 })
    noise({ dur: 0.08, freq: 1200, vol: 0.2 })
  },
  upgrade(level: number) {
    if (!ready()) return
    ;[0, 4, 7, 12].forEach((n, i) => tone({ freq: semitone(392 + level * 60, n), dur: 0.1, type: 'square', vol: 0.1, delay: i * 0.05 }))
  },
  leak() {
    if (!ready()) return
    tone({ freq: 300, to: 120, dur: 0.3, type: 'sawtooth', vol: 0.15 })
  },
  bossWarn() {
    if (!ready()) return
    for (let i = 0; i < 3; i++) {
      tone({ freq: 440, to: 660, dur: 0.25, type: 'sawtooth', vol: 0.14, delay: i * 0.5 })
      tone({ freq: 660, to: 440, dur: 0.25, type: 'sawtooth', vol: 0.14, delay: i * 0.5 + 0.25 })
    }
    tone({ freq: 55, dur: 1.5, type: 'sine', vol: 0.4, attack: 0.3 })
  },
  bossDie() {
    if (!ready()) return
    noise({ dur: 1.4, filter: 'lowpass', freq: 2000, to: 40, vol: 0.9 })
    tone({ freq: 80, to: 25, dur: 1.2, type: 'sine', vol: 0.8 })
    ;[0, 4, 7, 12, 16].forEach((n, i) => tone({ freq: semitone(523, n), dur: 0.2, type: 'square', vol: 0.08, delay: 0.4 + i * 0.08 }))
  },

  // --- Bus Stop ---
  busIn() {
    if (!ready()) return
    tone({ freq: 160, to: 260, dur: 0.22, type: 'sawtooth', vol: 0.08 })
    noise({ dur: 0.2, filter: 'bandpass', freq: 500, to: 1500, vol: 0.12 })
  },
  board(seat: number) {
    if (!ready() || !throttle('board', 30)) return
    tone({ freq: semitone(660, seat * 2), dur: 0.08, type: 'square', vol: 0.09 })
  },
  depart() {
    if (!ready()) return
    tone({ freq: 392, dur: 0.14, type: 'square', vol: 0.12 })
    tone({ freq: 494, dur: 0.14, type: 'square', vol: 0.1 })
    tone({ freq: 392, dur: 0.22, type: 'square', vol: 0.12, delay: 0.17 })
    tone({ freq: 494, dur: 0.22, type: 'square', vol: 0.1, delay: 0.17 })
    noise({ dur: 0.5, filter: 'bandpass', freq: 300, to: 1800, vol: 0.12, delay: 0.1 })
  },
  hint() {
    if (!ready()) return
    ;[0, 7, 12].forEach((n, i) => tone({ freq: semitone(880, n), dur: 0.18, type: 'sine', vol: 0.15, delay: i * 0.07 }))
  },
  undo() {
    if (!ready()) return
    tone({ freq: 900, to: 300, dur: 0.18, type: 'triangle', vol: 0.15 })
  },
  jam() {
    if (!ready()) return
    for (let i = 0; i < 3; i++) tone({ freq: 330, dur: 0.12, type: 'square', vol: 0.12, delay: i * 0.16 })
  },

  // --- Merge ---
  slide() {
    if (!ready() || !throttle('slide', 50)) return
    noise({ dur: 0.08, filter: 'bandpass', freq: 900, to: 400, vol: 0.12 })
  },
  /** Pitch rises with the merged tile's value (2 → 2048). */
  merge(value: number) {
    if (!ready() || !throttle('merge', 25)) return
    const step = Math.log2(Math.max(2, value)) - 1
    const f = semitone(330, step * 2)
    tone({ freq: f, dur: 0.12, type: 'triangle', vol: 0.22 })
    tone({ freq: f * 2, dur: 0.09, type: 'square', vol: 0.06, delay: 0.02 })
    noise({ dur: 0.06, filter: 'highpass', freq: 4000, vol: 0.08 })
  },
}

// ---------------------------------------------------------------------------
// Ambient BGM: a small synthwave loop (bass + arpeggio + hats), lookahead-scheduled.
// Module-scope so it keeps playing seamlessly across route changes.

const BPM = 104
const STEP = 60 / BPM / 4
// i–VI–III–VII in A minor (Am, F, C, G), one bar each.
const CHORDS = [
  [57, 60, 64],
  [53, 57, 60],
  [48, 52, 55],
  [55, 59, 62],
]
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)

let bgmTimer: number | null = null
let nextTime = 0
let step = 0

function scheduleStep(t: number) {
  const c = ctx!
  const chord = CHORDS[Math.floor(step / 16) % CHORDS.length]
  const s = step % 16
  const voice = (freq: number, dur: number, type: OscillatorType, vol: number) => {
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g)
    g.connect(musicBus!)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }
  if (s % 4 === 0) voice(midi(chord[0] - 24), STEP * 3.5, 'sawtooth', 0.32)
  if (s % 2 === 0) voice(midi(chord[(s / 2) % 3] + 12), STEP * 1.6, 'square', 0.07)
  if (s % 4 === 2) {
    const src = c.createBufferSource()
    src.buffer = noiseBuffer
    const f = c.createBiquadFilter()
    f.type = 'highpass'
    f.frequency.value = 8000
    const g = c.createGain()
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05)
    src.connect(f)
    f.connect(g)
    g.connect(musicBus!)
    src.start(t)
    src.stop(t + 0.06)
  }
}

function bgmTick() {
  if (!ctx || ctx.state !== 'running' || !soundEnabled()) {
    nextTime = 0
    return
  }
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05
  while (nextTime < ctx.currentTime + 0.2) {
    scheduleStep(nextTime)
    nextTime += STEP
    step++
  }
}

/** Idempotent: starts the ambient loop once; it silently idles while sound is off. */
export function startBgm(): void {
  if (bgmTimer !== null) return
  bgmTimer = window.setInterval(bgmTick, 50)
}
