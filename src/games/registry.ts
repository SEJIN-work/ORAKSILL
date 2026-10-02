import type { GameId } from '../types/save.ts'

/**
 * Hub card metadata only. Must NOT import Screen components — that would pull
 * Phaser into the hub bundle. Route → Screen wiring lives in App.tsx (lazy).
 */
export interface GameMeta {
  id: GameId
  path: string
  title: string
  /** Short English sub-title shown on the card/marquee. */
  tagline: string
  emoji: string
  description: string
  /** Neon accent (CSS color) used for the card, marquee and glow. */
  accent: string
  /** Second gradient stop for the card art. */
  accent2: string
  genre: string
}

export const GAME_REGISTRY: GameMeta[] = [
  {
    id: 'tower-defense',
    path: '/games/tower-defense',
    title: '타워디펜스',
    tagline: 'TOWER RUSH',
    emoji: '🏰',
    description: '타워를 세우고 강화해 몰려오는 적과 보스를 막아라',
    accent: '#39ff88',
    accent2: '#00b3ff',
    genre: '전략 디펜스',
  },
  {
    id: 'color-parking',
    path: '/games/color-parking',
    title: '버스 정류장',
    tagline: 'BUS STOP',
    emoji: '🚌',
    description: '같은 색 버스에 승객을 태워 교통 정체를 풀어라',
    accent: '#ffe14d',
    accent2: '#ff8a2b',
    genre: '컬러 퍼즐',
  },
  {
    id: 'stress-breaker',
    path: '/games/stress-breaker',
    title: '스트레스 브레이커',
    tagline: 'STRESS BREAKER',
    emoji: '💥',
    description: '탭! 스와이프! 제한 시간 안에 전부 박살내라',
    accent: '#ff2e88',
    accent2: '#ff8a2b',
    genre: '액션 타격',
  },
  {
    id: 'merge-numbers',
    path: '/games/merge-numbers',
    title: '넘버 머지',
    tagline: 'MERGE NUMBERS',
    emoji: '🔢',
    description: '같은 숫자를 합쳐 목표 타일을 완성하라',
    accent: '#9b5cff',
    accent2: '#00e5ff',
    genre: '머지 퍼즐',
  },
]

export function getGameMeta(id: GameId): GameMeta {
  return GAME_REGISTRY.find((g) => g.id === id)!
}
