import GameRunner from '../../components/GameRunner.tsx'
import GameScreenLayout from '../../components/GameScreenLayout.tsx'
import { ITEM_IDS } from '../../systems/shop/shop.ts'
import { USE_UNDO_EVENT } from '../session.ts'
import { getGameMeta } from '../registry.ts'
import MergeNumbersScene, { MAX_STAGE } from './MergeNumbersScene.ts'

const meta = getGameMeta('merge-numbers')

const RULES = [
  '방향키(PC) 또는 스와이프(모바일)로 모든 타일을 한쪽으로 밉니다.',
  '같은 숫자끼리 부딪히면 합쳐져요. 목표 타일을 만들면 클리어!',
  '✖ 칸은 장애물 — 타일이 지나갈 수 없어요.',
  '이동 횟수 제한이 있어요. 다 쓰거나 더 움직일 수 없으면 실패.',
  '★ = 남은 이동이 많을수록 (남은 이동만큼 보너스 코인)',
]

export default function MergeNumbersScreen() {
  return (
    <GameScreenLayout title={meta.title} tagline={meta.tagline} accent={meta.accent} accent2={meta.accent2}>
      <GameRunner
        gameId="merge-numbers"
        scene={MergeNumbersScene}
        rules={RULES}
        steps={[
          { icon: '👉', text: '스와이프 · 방향키로 밀기' },
          { icon: '➕', text: '같은 숫자끼리 합체' },
          { icon: '🎯', text: '목표 타일을 완성하기' },
        ]}
        maxStage={MAX_STAGE}
        booster={{ itemId: ITEM_IDS.mergeWild, label: '★ 와일드 타일' }}
        inGameItems={[{ itemId: ITEM_IDS.undo, event: USE_UNDO_EVENT, label: '↩️ 되돌리기' }]}
      />
    </GameScreenLayout>
  )
}
