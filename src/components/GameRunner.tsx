import { useEffect, useState } from 'react'
import type * as Phaser from 'phaser'
import { Link } from 'react-router-dom'
import {
  createSessionBus,
  requestItemUse,
  RESULT_EVENT,
  type GameInitData,
  type GameResult,
  type ItemEvent,
  type SessionBus,
} from '../games/session.ts'
import { sfx } from '../systems/audio/audio.ts'
import { applyGameResult, applySkip, recordAttempt, type AppliedResult } from '../systems/save/gameResult.ts'
import { consumeItem, getItemCount } from '../systems/shop/inventory.ts'
import { ITEM_IDS } from '../systems/shop/shop.ts'
import { loadSave } from '../systems/storage/storage.ts'
import type { GameId } from '../types/save.ts'
import CoinDisplay from './CoinDisplay.tsx'
import PhaserGameContainer from './PhaserGameContainer.tsx'
import ResultOverlay from './ResultOverlay.tsx'
import StarRow from './StarRow.tsx'
import styles from './GameRunner.module.css'

export interface BoosterConfig {
  itemId: string
  label: string
}

/** Icon-first onboarding strip (PRD 9): ~3 steps, minimal text. */
export interface HowToStep {
  icon: string
  text: string
}

export interface InGameItemConfig {
  itemId: string
  event: ItemEvent
  label: string
}

interface Props {
  gameId: GameId
  scene: typeof Phaser.Scene
  rules: string[]
  steps?: HowToStep[]
  maxStage: number
  booster?: BoosterConfig
  inGameItems?: InGameItemConfig[]
  width?: number
  height?: number
}

type Phase =
  | { kind: 'intro' }
  | { kind: 'playing'; init: GameInitData; bus: SessionBus }
  | { kind: 'result'; stage: number; result: GameResult; applied: AppliedResult }
  | { kind: 'skipped'; stage: number }

/** Owns the intro → playing → result session lifecycle shared by all 4 games. */
export default function GameRunner({
  gameId,
  scene,
  rules,
  steps = [],
  maxStage,
  booster,
  inGameItems = [],
  width = 720,
  height = 1080,
}: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' })
  const [attemptId, setAttemptId] = useState(0)
  // Bumped after any save write so the render below re-reads storage (coins, counts, progress).
  const [, setSaveTick] = useState(0)
  const refresh = () => setSaveTick((t) => t + 1)

  const save = loadSave()
  const progress = save.progress[gameId]
  const unlocked = Math.min(progress.bestStage + 1, maxStage)
  const [stage, setStage] = useState(unlocked)
  const [useBooster, setUseBooster] = useState(false)
  const [usedFx, setUsedFx] = useState<{ id: string; n: number } | null>(null)

  const count = (itemId: string) => save.inventory.filter((id) => id === itemId).length
  const boosterOwned = booster ? count(booster.itemId) : 0
  const skipOwned = count(ITEM_IDS.skip)

  useEffect(() => {
    if (phase.kind !== 'playing') return
    const { bus } = phase
    const stageNow = phase.init.stage
    let done = false
    const onResult = (result: GameResult) => {
      if (done) return
      done = true
      const applied = applyGameResult(gameId, stageNow, result)
      refresh()
      setPhase({ kind: 'result', stage: stageNow, result, applied })
    }
    bus.on(RESULT_EVENT, onResult)
    return () => {
      bus.off(RESULT_EVENT, onResult)
    }
  }, [phase, gameId])

  function start(targetStage: number, withBooster: boolean) {
    const boosterActive = !!booster && withBooster && consumeItem(booster.itemId)
    recordAttempt(gameId)
    refresh()
    setStage(targetStage)
    setAttemptId((n) => n + 1)
    setPhase({ kind: 'playing', init: { stage: targetStage, boosterActive }, bus: createSessionBus() })
  }

  function skip(targetStage: number) {
    if (targetStage <= progress.bestStage || !consumeItem(ITEM_IDS.skip)) return
    applySkip(gameId, targetStage)
    sfx.purchase()
    refresh()
    setPhase({ kind: 'skipped', stage: targetStage })
  }

  function activateItem(bus: SessionBus, item: InGameItemConfig) {
    if (getItemCount(item.itemId) <= 0) return
    if (requestItemUse(bus, item.event)) {
      consumeItem(item.itemId)
      setUsedFx((f) => ({ id: item.itemId, n: (f?.n ?? 0) + 1 }))
      refresh()
    } else {
      sfx.error()
    }
  }

  function toIntro(nextStage: number) {
    refresh()
    setStage(Math.min(nextStage, maxStage))
    setPhase({ kind: 'intro' })
  }

  if (phase.kind === 'playing') {
    return (
      <div className={styles.playing}>
        <div className={styles.canvasWrap}>
          <PhaserGameContainer
            key={attemptId}
            scene={scene}
            width={width}
            height={height}
            initData={phase.init}
            bus={phase.bus}
          />
        </div>
        <div className={styles.itemBar}>
          {inGameItems.map((item) => {
            const n = count(item.itemId)
            const fx = usedFx?.id === item.itemId ? usedFx.n : 0
            return (
              <button
                key={`${item.itemId}-${fx}`}
                className={`${styles.itemButton} ${fx ? styles.itemUsed : ''}`}
                disabled={n <= 0}
                onClick={() => activateItem(phase.bus, item)}
              >
                <span>{item.label}</span>
                <span className={styles.itemCount}>{n}</span>
              </button>
            )
          })}
          <button className={styles.quitButton} onClick={() => toIntro(phase.init.stage)}>
            그만하기
          </button>
          <p className={styles.rotateHint}>📱 세로로 돌리면 더 크게 플레이할 수 있어요</p>
        </div>
      </div>
    )
  }

  if (phase.kind === 'result') {
    const canNext = phase.result.cleared && phase.stage < maxStage
    return (
      <ResultOverlay
        result={phase.result}
        applied={phase.applied}
        stage={phase.stage}
        onRetry={() => start(phase.stage, useBooster && boosterOwned > 0)}
        onNext={canNext ? () => start(phase.stage + 1, useBooster && boosterOwned > 0) : undefined}
        onStageSelect={() => toIntro(canNext ? phase.stage + 1 : phase.stage)}
      />
    )
  }

  if (phase.kind === 'skipped') {
    return (
      <div className={`${styles.panel} ${styles.center}`}>
        <div className={styles.skipIcon} aria-hidden="true">
          ⏭️
        </div>
        <h2 className={styles.heading}>스테이지 {phase.stage} 스킵 완료</h2>
        <p className={styles.dim}>1성으로 통과 처리되었습니다. (코인 보상 없음)</p>
        <div className={styles.actions}>
          <button className="btn" onClick={() => toIntro(phase.stage + 1)}>
            계속하기
          </button>
          <Link to="/" className="btn btn-ghost">
            로비로
          </Link>
        </div>
      </div>
    )
  }

  const selected = Math.min(stage, unlocked)
  const selectedCleared = selected <= progress.bestStage
  const firstTime = progress.playCount === 0
  const boosterOn = useBooster && boosterOwned > 0

  return (
    <div className={styles.panel}>
      <div className={styles.introTop}>
        <h2 className={styles.heading}>
          {firstTime && <span className={styles.newTag}>NEW</span>}
          게임 방법
        </h2>
        <CoinDisplay coins={save.coins} />
      </div>

      {steps.length > 0 && (
        <ol className={styles.steps}>
          {steps.map((st, i) => (
            <li key={st.text} className={styles.step} style={{ animationDelay: `${i * 120}ms` }}>
              <span className={styles.stepIcon} style={{ animationDelay: `${i * 0.4}s` }} aria-hidden="true">
                {st.icon}
              </span>
              <span className={styles.stepText}>{st.text}</span>
            </li>
          ))}
        </ol>
      )}

      <details className={styles.rules} open={firstTime}>
        <summary>자세한 규칙</summary>
        <ul>
          {rules.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </details>

      <h3 className={styles.subheading}>스테이지 선택</h3>
      <div className={styles.stageGrid}>
        {Array.from({ length: maxStage }, (_, i) => i + 1).map((n) => {
          const locked = n > unlocked
          const cleared = n <= progress.bestStage
          return (
            <button
              key={n}
              className={`${styles.stageButton} ${n === selected ? styles.stageSelected : ''} ${cleared ? styles.stageCleared : ''}`}
              disabled={locked}
              onClick={() => setStage(n)}
              aria-pressed={n === selected}
              aria-label={locked ? `스테이지 ${n} 잠김` : `스테이지 ${n}`}
            >
              <span className={styles.stageNum}>{locked ? '🔒' : n}</span>
              {!locked && <StarRow stars={progress.stageStars[n] ?? 0} small />}
            </button>
          )
        })}
      </div>

      {booster && (
        <label
          className={`${styles.option} ${boosterOwned <= 0 ? styles.optionDisabled : ''} ${boosterOn ? styles.optionOn : ''}`}
        >
          <input
            type="checkbox"
            checked={boosterOn}
            disabled={boosterOwned <= 0}
            onChange={(e) => setUseBooster(e.target.checked)}
          />
          <span className={styles.toggle} aria-hidden="true" />
          <span className={styles.optionText}>
            <b>⚡ {booster.label} 사용</b>
            <span>
              보유 {boosterOwned}개{boosterOwned <= 0 && <Link to="/shop"> · 상점에서 구매 →</Link>}
            </span>
          </span>
        </label>
      )}

      <div className={styles.actions}>
        <button className={`btn ${styles.startButton}`} onClick={() => start(selected, boosterOn)}>
          ▶ 스테이지 {selected} 시작
        </button>
        {!selectedCleared && skipOwned > 0 && (
          <button className="btn btn-ghost" onClick={() => skip(selected)}>
            ⏭️ 스킵권 사용 (보유 {skipOwned})
          </button>
        )}
      </div>
    </div>
  )
}
