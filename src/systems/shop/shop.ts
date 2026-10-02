import type { GameId } from '../../types/save.ts'
import { updateSave } from '../storage/storage.ts'

/** PRD 8.3: per-game boosters and common items. */
export type ShopItemKind = 'booster' | 'common'

export interface ShopItem {
  id: string
  name: string
  emoji: string
  description: string
  price: number
  kind: ShopItemKind
  /** Game this item applies to; omitted for items usable in several games. */
  gameId?: GameId
}

export const ITEM_IDS = {
  towerGold: 'td-start-gold',
  busHint: 'bus-hint',
  stressTime: 'stress-time',
  mergeWild: 'merge-wild',
  undo: 'undo',
  skip: 'skip-ticket',
} as const

export const SHOP_ITEMS: ShopItem[] = [
  {
    id: ITEM_IDS.towerGold,
    name: '시작 자원 +100',
    emoji: '💰',
    description: '타워디펜스 시작 골드가 100 늘어납니다. (시작 전 사용 선택)',
    price: 120,
    kind: 'booster',
    gameId: 'tower-defense',
  },
  {
    id: ITEM_IDS.busHint,
    name: '힌트',
    emoji: '💡',
    description: '버스 정류장에서 정체 없이 클리어할 수 있는 다음 레인을 알려줍니다.',
    price: 80,
    kind: 'booster',
    gameId: 'color-parking',
  },
  {
    id: ITEM_IDS.stressTime,
    name: '시간 연장 +10초',
    emoji: '⏱️',
    description: '스트레스 브레이커 제한 시간이 10초 늘어납니다. (시작 전 사용 선택)',
    price: 100,
    kind: 'booster',
    gameId: 'stress-breaker',
  },
  {
    id: ITEM_IDS.mergeWild,
    name: '와일드 타일',
    emoji: '⭐',
    description: '어떤 숫자와도 합쳐지는 ★ 타일 1개를 갖고 넘버 머지를 시작합니다. (시작 전 사용 선택)',
    price: 100,
    kind: 'booster',
    gameId: 'merge-numbers',
  },
  {
    id: ITEM_IDS.undo,
    name: '되돌리기',
    emoji: '↩️',
    description: '마지막 한 수를 취소합니다. 버스 정류장 · 넘버 머지에서 사용.',
    price: 90,
    kind: 'common',
  },
  {
    id: ITEM_IDS.skip,
    name: '스테이지 스킵권',
    emoji: '⏭️',
    description: '아직 못 깬 스테이지를 1성으로 통과 처리합니다. (코인 보상 없음, 모든 게임)',
    price: 300,
    kind: 'common',
  },
]

export function getShopItem(id: string): ShopItem | undefined {
  return SHOP_ITEMS.find((i) => i.id === id)
}

export type PurchaseResult = 'ok' | 'insufficient' | 'unknown'

/** Spends coins and adds the item to the inventory in a single save write. */
export function purchaseItem(itemId: string): PurchaseResult {
  const item = getShopItem(itemId)
  if (!item) return 'unknown'
  let result: PurchaseResult = 'insufficient'
  updateSave((s) => {
    if (s.coins >= item.price) {
      s.coins -= item.price
      s.inventory.push(item.id)
      result = 'ok'
    }
  })
  return result
}
