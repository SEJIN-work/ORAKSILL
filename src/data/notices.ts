/**
 * Update notes shown on the hub's notice bar and the /notices page.
 * When shipping a user-visible change, ADD A NEW ENTRY AT THE TOP (newest first) with a new,
 * unique `id` — the hub's NEW badge compares against the newest id the player has seen.
 */
export interface Notice {
  /** Unique, never reused (e.g. the version string). */
  id: string
  version: string
  /** YYYY-MM-DD */
  date: string
  title: string
  tag: '신규' | '개선' | '수정' | '공지'
  items: string[]
}

export const NOTICES: Notice[] = [
  {
    id: '1.2.0',
    version: 'v1.2.0',
    date: '2026-10-02',
    title: '스테이지 3배 확장 + 새로운 적 등장!',
    tag: '신규',
    items: [
      '스테이지가 크게 늘었어요: 타워디펜스 · 스트레스 브레이커 30개, 버스 정류장 · 넘버 머지 24개',
      '타워디펜스: 기관총이 튕겨 나가는 🛡 장갑 적(탱커 · 장갑병)과 우르르 몰려오는 꼬마 떼가 나와요. 저격 · 대포를 섞어야 막을 수 있어요.',
      '버스 정류장: 버스가 최대 49대, 승객이 300명 가까이로 늘고 색도 8가지가 됐어요. 같은 색 레인 중 어디서 빼느냐가 승부!',
      '모든 게임의 난이도가 스테이지를 따라 조금씩 올라가요.',
    ],
  },
  {
    id: '1.1.0',
    version: 'v1.1.0',
    date: '2026-10-02',
    title: '공지사항 기능이 추가됐어요',
    tag: '신규',
    items: ['로비에서 최신 소식을 확인하고, 지난 업데이트 내역도 볼 수 있어요.'],
  },
  {
    id: '1.0.2',
    version: 'v1.0.2',
    date: '2026-10-02',
    title: 'iPhone · 모바일 소리 문제 수정',
    tag: '수정',
    items: [
      '모바일, 특히 iPhone Safari에서 소리가 나지 않던 문제를 고쳤어요.',
      '설정에 🔊 소리 테스트 버튼과 오디오 상태 표시를 추가했어요.',
      'iPhone은 무음 모드에서는 소리가 나지 않아요. 벨소리 모드에서 즐겨 주세요.',
    ],
  },
  {
    id: '1.0.1',
    version: 'v1.0.1',
    date: '2026-10-02',
    title: '난이도 조정 및 가로 화면 개선',
    tag: '개선',
    items: [
      '스트레스 브레이커: 후반 스테이지도 클리어할 수 있도록 조정, 별 3개 조건 완화',
      '타워디펜스: 스테이지가 오를수록 시작 골드가 늘고, 적 체력 증가가 완만해졌어요.',
      '버스 정류장 · 넘버 머지: 후반 난이도를 완만하게, 한 판이 3분을 넘지 않게 조정',
      '휴대폰 가로 화면에서 게임 화면이 더 크게 보여요.',
      '첫 화면 로딩이 빨라졌어요.',
    ],
  },
  {
    id: '1.0.0',
    version: 'v1.0.0',
    date: '2026-10-02',
    title: '타임킬러 오락실 오픈!',
    tag: '공지',
    items: [
      '타워디펜스 · 버스 정류장 · 스트레스 브레이커 · 넘버 머지 4종 게임을 즐길 수 있어요.',
      '모든 게임이 코인을 함께 쓰고, 상점에서 부스터와 아이템을 살 수 있어요.',
      '로그인 없이 이 브라우저에 진행도가 자동 저장돼요.',
    ],
  },
]
