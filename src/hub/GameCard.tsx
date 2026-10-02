import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import type { GameMeta } from '../games/registry.ts'
import type { GameProgress } from '../types/save.ts'
import styles from './GameCard.module.css'

interface Props {
  game: GameMeta
  progress: GameProgress
  index: number
}

export default function GameCard({ game, progress, index }: Props) {
  const totalStars = Object.values(progress.stageStars).reduce((sum, n) => sum + n, 0)
  const style = { '--accent': game.accent, '--accent2': game.accent2, animationDelay: `${index * 70}ms` } as CSSProperties

  return (
    <Link to={game.path} className={styles.card} style={style} aria-label={`${game.title} 플레이`}>
      <div className={`${styles.art} ${styles[game.id] ?? ''}`} aria-hidden="true">
        <span className={styles.genre}>{game.genre}</span>
        <span className={styles.emoji}>{game.emoji}</span>
        <span className={styles.tagline}>{game.tagline}</span>
      </div>
      <div className={styles.body}>
        <h2 className={styles.title}>{game.title}</h2>
        <p className={styles.description}>{game.description}</p>
        <div className={styles.footer}>
          <span className={styles.progress}>
            {progress.bestStage > 0 ? (
              <>
                STAGE <b>{progress.bestStage}</b> · <span className={styles.star}>★</span> {totalStars}
              </>
            ) : (
              <span className={styles.newBadge}>NEW</span>
            )}
          </span>
          <span className={styles.play}>PLAY ▶</span>
        </div>
      </div>
    </Link>
  )
}
