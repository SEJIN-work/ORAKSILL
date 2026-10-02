import GameRunner from '../../components/GameRunner.tsx'
import GameScreenLayout from '../../components/GameScreenLayout.tsx'
import { ITEM_IDS } from '../../systems/shop/shop.ts'
import { getGameMeta } from '../registry.ts'
import TowerDefenseScene, { BOOSTER_GOLD, MAX_STAGE } from './TowerDefenseScene.ts'

const meta = getGameMeta('tower-defense')

const RULES = [
  '위쪽 툴바에서 타워(기관총 · 저격 · 대포)를 고른 뒤 빈 칸을 탭해 건설하세요.',
  '세워진 타워를 다시 탭하면 골드로 업그레이드 (최대 3레벨).',
  '적을 처치할 때마다 골드가 바로 들어옵니다. 3웨이브 뒤엔 보스가 등장!',
  '🛡 장갑 적(탱커 · 장갑병)은 기관총이 튕겨 나가요 → 저격으로 뚫으세요.',
  '🔥 꼬마 떼는 우르르 몰려와요 → 대포 범위 공격이 효과적이에요.',
  '적이 끝까지 가면 생명이 줄어요. 생명이 0이 되면 실패.',
  '★3 = 노데미지 클리어 (보너스 코인)',
]

export default function TowerDefenseScreen() {
  return (
    <GameScreenLayout title={meta.title} tagline={meta.tagline} accent={meta.accent} accent2={meta.accent2}>
      <GameRunner
        gameId="tower-defense"
        scene={TowerDefenseScene}
        rules={RULES}
        steps={[
          { icon: '🛠️', text: '툴바에서 타워 고르기' },
          { icon: '👆', text: '빈 칸 탭 = 건설 · 다시 탭 = 강화' },
          { icon: '🛡', text: '장갑 적은 저격 · 떼는 대포로!' },
        ]}
        maxStage={MAX_STAGE}
        booster={{ itemId: ITEM_IDS.towerGold, label: `시작 골드 +${BOOSTER_GOLD}` }}
      />
    </GameScreenLayout>
  )
}
