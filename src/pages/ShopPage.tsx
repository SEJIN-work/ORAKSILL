import { useEffect, useState, type CSSProperties } from 'react'
import BackToHubButton from '../components/BackToHubButton.tsx'
import CoinDisplay from '../components/CoinDisplay.tsx'
import { getGameMeta } from '../games/registry.ts'
import { sfx } from '../systems/audio/audio.ts'
import { purchaseItem, SHOP_ITEMS, type ShopItem } from '../systems/shop/shop.ts'
import { loadSave } from '../systems/storage/storage.ts'
import pageStyles from './SimplePage.module.css'
import styles from './ShopPage.module.css'

interface Toast {
  id: number
  text: string
  ok: boolean
}

export default function ShopPage() {
  const [, setTick] = useState(0)
  const [toast, setToast] = useState<Toast | null>(null)
  const [bought, setBought] = useState<{ id: string; n: number } | null>(null)
  const save = loadSave()
  const owned = (id: string) => save.inventory.filter((x) => x === id).length

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(t)
  }, [toast])

  function buy(item: ShopItem) {
    const result = purchaseItem(item.id)
    if (result === 'ok') {
      sfx.purchase()
      setBought((b) => ({ id: item.id, n: (b?.n ?? 0) + 1 }))
    } else {
      sfx.error()
    }
    setToast((prev) => ({
      id: (prev?.id ?? 0) + 1,
      ok: result === 'ok',
      text: result === 'ok' ? `${item.emoji} ${item.name} 구매 완료! (-${item.price} 코인)` : `코인이 부족해요 (${item.price} 코인 필요)`,
    }))
    setTick((t) => t + 1)
  }

  const groups: { title: string; sub: string; items: ShopItem[] }[] = [
    { title: '공통 아이템', sub: '여러 게임에서 사용', items: SHOP_ITEMS.filter((i) => !i.gameId) },
    { title: '게임별 부스터', sub: '해당 게임 전용', items: SHOP_ITEMS.filter((i) => i.gameId) },
  ]

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.header}>
        <BackToHubButton />
        <h1 className={`${pageStyles.title} ${styles.shopTitle}`}>
          <span aria-hidden="true">🛒</span> 상점
        </h1>
        <CoinDisplay coins={save.coins} />
      </header>

      <p className={styles.intro}>스테이지를 클리어해서 모은 코인으로 아이템을 사세요.</p>

      {groups.map((group) => (
        <section key={group.title} className={styles.group}>
          <h2 className={styles.groupTitle}>
            {group.title} <span>{group.sub}</span>
          </h2>
          <ul className={styles.list}>
            {group.items.map((item, i) => {
              const affordable = save.coins >= item.price
              const meta = item.gameId ? getGameMeta(item.gameId) : null
              const flash = bought?.id === item.id ? bought.n : 0
              const style = { '--accent': meta?.accent ?? '#00e5ff', animationDelay: `${i * 60}ms` } as CSSProperties
              return (
                <li key={`${item.id}-${flash}`} className={`${styles.item} ${flash ? styles.justBought : ''}`} style={style}>
                  <span className={styles.emoji} aria-hidden="true">
                    {item.emoji}
                  </span>
                  <div className={styles.info}>
                    <h3 className={styles.name}>
                      {item.name}
                      {meta && <span className={styles.tag}>{meta.title}</span>}
                    </h3>
                    <p className={styles.description}>{item.description}</p>
                    <p className={styles.owned}>
                      보유 <b>{owned(item.id)}</b>개
                    </p>
                  </div>
                  <button
                    className={`btn btn-yellow ${styles.buy}`}
                    onClick={() => buy(item)}
                    aria-disabled={!affordable}
                    aria-label={`${item.name} ${item.price}코인에 구매`}
                  >
                    <span className={styles.coin} aria-hidden="true" />
                    {item.price}
                  </button>
                  {flash > 0 && (
                    <span className={styles.plusOne} aria-hidden="true">
                      +1
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <div className={styles.toastArea} role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`${styles.toast} ${toast.ok ? styles.ok : styles.fail}`}>
            {toast.text}
          </div>
        )}
      </div>
    </div>
  )
}
