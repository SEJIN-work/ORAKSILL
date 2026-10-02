import { useEffect, useRef } from 'react'
import * as Phaser from 'phaser'
import { REGISTRY_BUS, REGISTRY_INIT, type GameInitData, type SessionBus } from '../games/session.ts'
import styles from './PhaserGameContainer.module.css'

interface Props {
  scene: typeof Phaser.Scene
  width: number
  height: number
  initData: GameInitData
  bus: SessionBus
  backgroundColor?: string
}

/**
 * The single owner of the Phaser.Game lifecycle — don't instantiate Phaser.Game anywhere else.
 * Created in an effect and destroyed in its cleanup, so React StrictMode's dev double-invoke
 * just creates → destroys → creates again. GameRunner remounts this (key={attemptId}) for
 * every attempt, so initData/bus are read once at mount.
 */
export default function PhaserGameContainer({ scene, width, height, initData, bus, backgroundColor = '#11112a' }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef({ initData, bus })

  useEffect(() => {
    const parent = parentRef.current
    if (!parent) return
    let cancelled = false
    let cleanup = () => {}

    // Canvas text can't fall back once drawn, so wait (briefly) for the web fonts first.
    const fontsReady = Promise.race([
      Promise.all([
        document.fonts.load('40px "Black Han Sans"'),
        document.fonts.load('bold 40px "Noto Sans KR"'),
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]).catch(() => undefined)

    void fontsReady.then(() => {
      if (cancelled) return
      cleanup = boot({ parent, scene, width, height, backgroundColor, ...sessionRef.current })
    })

    return () => {
      cancelled = true
      cleanup()
    }
  }, [scene, width, height, backgroundColor])

  // overflow:hidden on this wrapper is load-bearing: see CLAUDE.md (Phaser CENTER_BOTH margin feedback loop).
  return <div ref={parentRef} className={styles.container} />
}

interface BootOptions {
  parent: HTMLDivElement
  scene: typeof Phaser.Scene
  width: number
  height: number
  backgroundColor: string
  initData: GameInitData
  bus: SessionBus
}

function boot({ parent, scene, width, height, backgroundColor, initData, bus }: BootOptions): () => void {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 3 },
    scene,
    render: { antialias: true },
  })
  // The registry exists from construction; scenes only boot later, so this is set in time.
  game.registry.set(REGISTRY_INIT, initData)
  game.registry.set(REGISTRY_BUS, bus)
  // Dev-only handle for browser-driven testing (stripped from production builds).
  if (import.meta.env.DEV) (window as unknown as { __tkaGame?: Phaser.Game }).__tkaGame = game

  // Phaser only polls its parent size every 500ms; until then pointer coordinates are mapped
  // against stale canvas bounds. Refresh immediately whenever the wrapper's size changes.
  const observer = new ResizeObserver(() => game.scale?.refresh())
  observer.observe(parent)
  // Phaser caches the canvas's page position at boot. React can move it afterwards without a
  // resize (e.g. the intro panel's scroll position collapsing on mount), which left every tap
  // mapped ~400px off. Re-measure in the capture phase, before Phaser's canvas handlers run.
  const syncBounds = () => game.scale?.updateBounds()
  const pressEvents = ['pointerdown', 'mousedown', 'touchstart'] as const
  for (const type of pressEvents) parent.addEventListener(type, syncBounds, { capture: true, passive: true })

  return () => {
    observer.disconnect()
    for (const type of pressEvents) parent.removeEventListener(type, syncBounds, { capture: true })
    game.destroy(true)
  }
}
