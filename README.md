# 타임킬러 오락실 (Time Killer Arcade)

설치·가입 없이 브라우저에서 바로 즐기는 미니게임 아케이드. PC와 모바일 모두 지원합니다.

| 게임 | 장르 | 한 줄 소개 |
|---|---|---|
| 🏰 타워디펜스 | 전략 디펜스 | 타워를 세우고 강화해 몰려오는 적과 보스를 막아라 |
| 🚌 버스 정류장 | 컬러 퍼즐 | 같은 색 버스에 승객을 태워 교통 정체를 풀어라 |
| 💥 스트레스 브레이커 | 액션 타격 | 탭! 스와이프! 제한 시간 안에 전부 박살내라 |
| 🔢 넘버 머지 | 머지 퍼즐 | 같은 숫자를 합쳐 목표 타일을 완성하라 |

모든 게임이 하나의 코인 지갑을 공유하고, 모은 코인으로 상점에서 부스터·힌트·되돌리기·스킵권을 살 수 있습니다. 진행도는 브라우저(localStorage)에 자동 저장됩니다.

## 실행

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 배포용 빌드 → dist/
npm run preview  # 빌드 결과 미리보기
```

## 배포

정적 사이트라 Vercel · Netlify · Cloudflare Pages 등에 저장소를 연결하면 됩니다.

- 빌드 명령: `npm run build`
- 결과 폴더: `dist`
- 새로 고침/직접 접속 시 404 방지 설정이 포함되어 있습니다 (`vercel.json`, `public/_redirects`).

## 기술 스택

Vite · React 19 · TypeScript · Phaser 4 · CSS Modules. 효과음과 배경음악은 Web Audio로 직접 합성하고, 게임 그래픽은 코드로 그려서 이미지·오디오 파일이 없습니다.

## 문서 / QA

- `PRD.md` — 기획서, `PROMPT.md` — 단계별 개발 프롬프트, `CLAUDE.md` — 구조·규칙·난이도 조정 방법
- `qa/` — Playwright 회귀 테스트, PRD 검증, 난이도 시뮬레이션 (`npm run qa:test`, `npm run sim:stress` 등 — 자세한 사용법은 `CLAUDE.md`)
