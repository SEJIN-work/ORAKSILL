import { useEffect, useState } from 'react'
import BackToHubButton from '../components/BackToHubButton.tsx'
import { NOTICES, type Notice } from '../data/notices.ts'
import { hasUnseenNotice, markNoticesSeen } from '../systems/notices.ts'
import pageStyles from './SimplePage.module.css'
import styles from './NoticesPage.module.css'

const TAG_CLASS: Record<Notice['tag'], string> = {
  신규: styles.tagNew,
  개선: styles.tagImprove,
  수정: styles.tagFix,
  공지: styles.tagNotice,
}

/** Full update history, newest first. Visiting marks the latest notice as seen. */
export default function NoticesPage() {
  // Read before marking so the newest entry still shows its NEW badge on this visit.
  const [wasUnseen] = useState(hasUnseenNotice)

  useEffect(() => {
    markNoticesSeen()
  }, [])

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.header}>
        <BackToHubButton />
        <h1 className={pageStyles.title}>
          <span aria-hidden="true">📢</span> 공지사항
        </h1>
      </header>

      <ol className={styles.list}>
        {NOTICES.map((n, i) => (
          <li key={n.id} className={`${styles.card} ${i === 0 ? styles.latest : ''}`}>
            <div className={styles.meta}>
              <span className={`${styles.tag} ${TAG_CLASS[n.tag]}`}>{n.tag}</span>
              <span className={styles.version}>{n.version}</span>
              <time className={styles.date} dateTime={n.date}>
                {n.date.replaceAll('-', '.')}
              </time>
              {i === 0 && wasUnseen && <span className={styles.new}>NEW</span>}
            </div>
            <h2 className={styles.title}>{n.title}</h2>
            <ul className={styles.items}>
              {n.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
