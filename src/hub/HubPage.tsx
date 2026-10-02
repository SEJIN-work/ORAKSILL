import { Link } from 'react-router-dom'
import CoinDisplay from '../components/CoinDisplay.tsx'
import { GAME_REGISTRY } from '../games/registry.ts'
import { loadSave } from '../systems/storage/storage.ts'
import GameCard from './GameCard.tsx'
import NoticeBar from './NoticeBar.tsx'
import styles from './HubPage.module.css'

export default function HubPage() {
  const save = loadSave()
  const totalStars = Object.values(save.progress).reduce(
    (sum, p) => sum + Object.values(p.stageStars).reduce((a, b) => a + b, 0),
    0,
  )
  const owned = save.inventory.length

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <p className={styles.kicker}>TIME KILLER ARCADE</p>
          <h1 className={styles.logo}>
            <span className={styles.logoA}>타임킬러</span> <span className={styles.logoB}>오락실</span>
          </h1>
        </div>
        <CoinDisplay coins={save.coins} large />
      </header>

      <section className={styles.ticker} aria-label="내 기록">
        <span>⭐ 모은 별 {totalStars}</span>
        <span className={styles.dot} aria-hidden="true" />
        <span>🎒 보유 아이템 {owned}</span>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.insert}>INSERT COIN · PRESS START</span>
      </section>

      <NoticeBar />

      <main className={styles.main}>
        <section className={styles.grid} aria-label="게임 목록">
          {GAME_REGISTRY.map((game, i) => (
            <GameCard key={game.id} game={game} progress={save.progress[game.id]} index={i} />
          ))}
        </section>

        <nav className={styles.actions}>
          <Link to="/shop" className={`btn btn-pink ${styles.shopButton}`}>
            <span aria-hidden="true">🛒</span> 상점
          </Link>
          <Link to="/settings" className={`btn btn-ghost ${styles.settingsButton}`} aria-label="설정">
            <span aria-hidden="true">⚙️</span> 설정
          </Link>
        </nav>
      </main>

      <footer className={styles.footer}>로그인 없이 이 브라우저에 자동 저장됩니다</footer>
    </div>
  )
}
