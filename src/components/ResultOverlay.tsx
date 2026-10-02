import { useEffect, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { GameResult } from '../games/session.ts'
import { sfx } from '../systems/audio/audio.ts'
import { REPLAY_REWARD_RATE } from '../systems/economy.ts'
import type { AppliedResult } from '../systems/save/gameResult.ts'
import styles from './ResultOverlay.module.css'

interface Props {
  stage: number
  result: GameResult
  applied: AppliedResult
  onRetry: () => void
  onNext?: () => void
  onStageSelect: () => void
}

const STAR_DELAY = 380
const CONFETTI_COLORS = ['#ff2e88', '#00e5ff', '#ffe14d', '#39ff88', '#9b5cff', '#ff8a2b']

/** Result screen shared by every game: 다시하기 / 로비로 / 상점가기 (PRD 6), with reward theatre. */
export default function ResultOverlay({ stage, result, applied, onRetry, onNext, onStageSelect }: Props) {
  const stars = result.cleared ? (result.stars ?? 1) : 0
  const [litStars, setLitStars] = useState(0)
  const [coins, setCoins] = useState(0)
  const [coinsDone, setCoinsDone] = useState(applied.coinsAwarded === 0)

  useEffect(() => {
    const timers: number[] = []
    if (!result.cleared) {
      sfx.fail()
      return
    }
    sfx.clear()
    for (let i = 1; i <= stars; i++) {
      timers.push(
        window.setTimeout(() => {
          setLitStars(i)
          sfx.star(i)
        }, 500 + i * STAR_DELAY),
      )
    }
    // Coins "pour in" after the stars.
    const total = applied.coinsAwarded
    const startAt = 500 + (stars + 1) * STAR_DELAY
    let raf = 0
    timers.push(
      window.setTimeout(() => {
        const t0 = performance.now()
        const dur = Math.min(1400, 500 + total * 8)
        let lastStep = -1
        const tick = (now: number) => {
          const t = Math.min(1, (now - t0) / dur)
          const v = Math.round(total * (1 - Math.pow(1 - t, 3)))
          setCoins(v)
          const step = Math.floor(t * 14)
          if (step !== lastStep) {
            lastStep = step
            sfx.coin(step)
          }
          if (t < 1) raf = requestAnimationFrame(tick)
          else setCoinsDone(true)
        }
        if (total > 0) raf = requestAnimationFrame(tick)
      }, startAt),
    )
    return () => {
      timers.forEach((t) => window.clearTimeout(t))
      cancelAnimationFrame(raf)
    }
  }, [result.cleared, stars, applied.coinsAwarded])

  return (
    <div className={`${styles.wrap} ${result.cleared ? styles.win : styles.lose}`}>
      {result.cleared && (
        <div className={styles.confetti} aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => (
            <span
              key={i}
              style={
                {
                  '--x': `${(i * 37) % 100}%`,
                  '--d': `${(i % 7) * 0.12}s`,
                  '--r': `${(i * 53) % 360}deg`,
                  background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      <div className={styles.card}>
        <p className={styles.stageLabel}>STAGE {stage}</p>
        <h2 className={styles.title}>{result.cleared ? '클리어!' : '실패…'}</h2>
        {!result.cleared && <p className={styles.sub}>괜찮아요, 바로 다시 도전!</p>}

        {result.cleared && (
          <div className={styles.stars} role="img" aria-label={`별 ${stars}개`}>
            {[1, 2, 3].map((n) => (
              <span
                key={n}
                className={`${styles.star} ${n <= litStars ? styles.starOn : ''} ${n === 2 ? styles.starMid : ''}`}
              >
                ★
              </span>
            ))}
          </div>
        )}

        <div className={`${styles.coinBox} ${coinsDone && applied.coinsAwarded > 0 ? styles.coinDone : ''}`}>
          <span className={styles.coinIcon} aria-hidden="true" />
          <span className={styles.coinValue} aria-label={`획득 코인 ${applied.coinsAwarded}`}>
            +{(result.cleared ? coins : 0).toLocaleString('ko-KR')}
          </span>
        </div>
        {result.cleared && applied.isReplay && (
          <p className={styles.note}>재도전 보상 {Math.round(REPLAY_REWARD_RATE * 100)}%</p>
        )}
        {applied.improvedStars && <p className={styles.record}>🏆 별점 기록 갱신!</p>}

        {result.details && result.details.length > 0 && (
          <ul className={styles.details}>
            {result.details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}

        <div className={styles.actions}>
          {onNext && (
            <button className={`btn ${styles.wide}`} onClick={onNext}>
              다음 스테이지 ▶
            </button>
          )}
          <button className={`btn ${onNext ? 'btn-ghost' : 'btn-pink'} ${styles.wide}`} onClick={onRetry}>
            ↻ 다시하기
          </button>
          <button className="btn btn-ghost" onClick={onStageSelect}>
            스테이지 선택
          </button>
          <Link to="/shop" className="btn btn-yellow">
            🛒 상점가기
          </Link>
          <Link to="/" className={`btn btn-ghost ${styles.wide}`}>
            로비로
          </Link>
        </div>
      </div>
    </div>
  )
}
