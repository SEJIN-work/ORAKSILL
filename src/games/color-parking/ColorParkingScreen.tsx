import GameRunner from '../../components/GameRunner.tsx'
import GameScreenLayout from '../../components/GameScreenLayout.tsx'
import { ITEM_IDS } from '../../systems/shop/shop.ts'
import { USE_HINT_EVENT, USE_UNDO_EVENT } from '../session.ts'
import { getGameMeta } from '../registry.ts'
import ColorParkingScene, { MAX_STAGE } from './ColorParkingScene.ts'

const meta = getGameMeta('color-parking')

const RULES = [
  '레인을 탭하면 그 레인 맨 앞 버스가 탑승장(최대 3대)으로 들어갑니다.',
  '대기 줄 맨 앞 승객부터, 같은 색 버스가 탑승장에 있으면 자동으로 탑승해요.',
  '버스가 꽉 차면 출발하고 자리가 비워집니다. 모든 승객을 태우면 클리어!',
  '탑승장이 가득 찼는데 맨 앞 승객과 같은 색 버스가 없으면 정체로 실패.',
  '★3 = 버스 수만큼만 탭해서 클리어',
]

export default function ColorParkingScreen() {
  return (
    <GameScreenLayout title={meta.title} tagline={meta.tagline} accent={meta.accent} accent2={meta.accent2}>
      <GameRunner
        gameId="color-parking"
        scene={ColorParkingScene}
        rules={RULES}
        steps={[
          { icon: '👆', text: '레인 탭 → 버스가 탑승장으로' },
          { icon: '🧍', text: '같은 색 승객이 자동 탑승' },
          { icon: '🚌', text: '만석 버스 출발! 정체 금지' },
        ]}
        maxStage={MAX_STAGE}
        inGameItems={[
          { itemId: ITEM_IDS.busHint, event: USE_HINT_EVENT, label: '💡 힌트' },
          { itemId: ITEM_IDS.undo, event: USE_UNDO_EVENT, label: '↩️ 되돌리기' },
        ]}
      />
    </GameScreenLayout>
  )
}
