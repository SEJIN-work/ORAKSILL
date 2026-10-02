import { Link } from 'react-router-dom'
import styles from './BackToHubButton.module.css'

export default function BackToHubButton() {
  return (
    <Link to="/" className={styles.button} aria-label="로비로 돌아가기">
      ← 로비
    </Link>
  )
}
