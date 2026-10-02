import GameRunner from '../../components/GameRunner.tsx'
import GameScreenLayout from '../../components/GameScreenLayout.tsx'
import { ITEM_IDS } from '../../systems/shop/shop.ts'
import { getGameMeta } from '../registry.ts'
import StressBreakerScene, { BOOSTER_SECONDS, MAX_STAGE } from './StressBreakerScene.ts'

const meta = getGameMeta('stress-breaker')

const RULES = [
  '나타나는 상자 · 유리 · 풍선을 탭(클릭)하거나 스와이프(드래그)로 부수세요.',
  '제한 시간 안에 목표 수량을 부수면 클리어!',
  '💣 폭탄을 건드리면 파괴 수 -3, 콤보 초기화. 💰는 추가 코인.',
  '흰 테두리 상자는 두 번 쳐야 부서져요. 빠르게 연속 파괴하면 콤보 보너스.',
  '★ = 남은 시간이 많을수록',
]

export default function StressBreakerScreen() {
  return (
    <GameScreenLayout title={meta.title} tagline={meta.tagline} accent={meta.accent} accent2={meta.accent2}>
      <GameRunner
        gameId="stress-breaker"
        scene={StressBreakerScene}
        rules={RULES}
        steps={[
          { icon: '👊', text: '탭해서 부수기' },
          { icon: '⚡', text: '스와이프로 한 번에 여러 개' },
          { icon: '💣', text: '폭탄은 피하기!' },
        ]}
        maxStage={MAX_STAGE}
        booster={{ itemId: ITEM_IDS.stressTime, label: `시간 연장 +${BOOSTER_SECONDS}초` }}
      />
    </GameScreenLayout>
  )
}
