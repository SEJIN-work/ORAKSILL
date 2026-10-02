import styles from './StarRow.module.css'

export default function StarRow({ stars, small = false }: { stars: number; small?: boolean }) {
  return (
    <span className={`${styles.row} ${small ? styles.small : ''}`} aria-label={`별 ${stars}개`}>
      {[1, 2, 3].map((n) => (
        <span key={n} className={n <= stars ? styles.on : styles.off} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  )
}
