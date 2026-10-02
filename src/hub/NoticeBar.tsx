import { Link } from 'react-router-dom'
import { hasUnseenNotice, latestNotice } from '../systems/notices.ts'
import styles from './NoticeBar.module.css'

/** One-line latest-notice strip on the hub; opens the full update history. */
export default function NoticeBar() {
  const notice = latestNotice()
  if (!notice) return null
  const unseen = hasUnseenNotice()

  return (
    <Link to="/notices" className={styles.bar} aria-label={`공지사항: ${notice.title}${unseen ? ' (새 소식)' : ''}`}>
      <span className={styles.label} aria-hidden="true">
        📢 공지
      </span>
      {unseen && <span className={styles.new}>NEW</span>}
      <span className={styles.title}>{notice.title}</span>
      <span className={styles.more} aria-hidden="true">
        전체 ›
      </span>
    </Link>
  )
}
