import { useEffect, useRef, useState } from 'react'
import styles from './CoinDisplay.module.css'

/** Gold coin pill. Bumps + counts toward the new value whenever `coins` changes. */
export default function CoinDisplay({ coins, large = false }: { coins: number; large?: boolean }) {
  const [shown, setShown] = useState(coins)
  const [bump, setBump] = useState(0)
  const prev = useRef(coins)

  useEffect(() => {
    const from = prev.current
    prev.current = coins
    if (from === coins) return
    setBump((b) => b + 1)
    const start = performance.now()
    const dur = 450
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur)
      setShown(Math.round(from + (coins - from) * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [coins])

  return (
    <div className={`${styles.coins} ${large ? styles.large : ''}`} aria-label={`보유 코인 ${coins}`}>
      <span className={styles.icon} aria-hidden="true" />
      <span key={bump} className={bump ? styles.bump : undefined}>
        {shown.toLocaleString('ko-KR')}
      </span>
    </div>
  )
}
