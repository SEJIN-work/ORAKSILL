import type { CSSProperties, ReactNode } from 'react'
import BackToHubButton from './BackToHubButton.tsx'
import styles from './GameScreenLayout.module.css'

interface Props {
  title: string
  tagline?: string
  accent?: string
  accent2?: string
  children: ReactNode
}

/**
 * Every game screen is drawn as an arcade cabinet: bezel (with corner bolts) → gradient
 * marquee → dark glass well holding whatever GameRunner shows. Purely visual — per-screen
 * chrome that depends on game state belongs in GameRunner's children.
 */
export default function GameScreenLayout({ title, tagline, accent = '#00e5ff', accent2 = '#ff2e88', children }: Props) {
  const style = { '--accent': accent, '--accent2': accent2 } as CSSProperties
  return (
    <div className={styles.screen} style={style}>
      <div className={styles.cabinet}>
        <span className={`${styles.bolt} ${styles.tl}`} aria-hidden="true" />
        <span className={`${styles.bolt} ${styles.tr}`} aria-hidden="true" />
        <span className={`${styles.bolt} ${styles.bl}`} aria-hidden="true" />
        <span className={`${styles.bolt} ${styles.br}`} aria-hidden="true" />
        <header className={styles.marquee}>
          <BackToHubButton />
          <div className={styles.titleWrap}>
            <h1 className={styles.title}>{title}</h1>
            {tagline && <span className={styles.tagline}>{tagline}</span>}
          </div>
        </header>
        <main className={styles.glass}>{children}</main>
      </div>
    </div>
  )
}
