import { useEffect, useState } from 'react'
import BackToHubButton from '../components/BackToHubButton.tsx'
import { getAudioStatus, invalidateSoundSetting, sfx, unlockAudio, type AudioStatus } from '../systems/audio/audio.ts'
import { vibrate } from '../systems/haptics.ts'
import { getSettings, setSetting } from '../systems/settings.ts'
import { resetSave } from '../systems/storage/storage.ts'
import type { Settings } from '../types/save.ts'
import pageStyles from './SimplePage.module.css'
import styles from './SettingsPage.module.css'

const TOGGLES: { key: keyof Settings; icon: string; label: string; hint: string }[] = [
  { key: 'soundEnabled', icon: '🔊', label: '사운드', hint: '효과음 · 배경음악' },
  { key: 'vibrationEnabled', icon: '📳', label: '진동', hint: '지원되는 모바일 기기에서만 동작' },
]

const AUDIO_STATUS_LABEL: Record<AudioStatus, string> = {
  running: '✅ 켜짐',
  suspended: '⏸ 대기 중 — 화면을 한 번 탭하세요',
  interrupted: '⏸ 중단됨 — 다시 탭하세요',
  'not-started': '아직 시작 안 됨 — 아래 버튼을 눌러보세요',
  closed: '⏹ 닫힘 — 아래 버튼을 눌러보세요',
  unsupported: '❌ 이 브라우저는 웹 오디오를 지원하지 않아요',
}

export default function SettingsPage() {
  const [settings, setSettings] = useState(getSettings)
  const [resetDone, setResetDone] = useState(false)
  const [audioStatus, setAudioStatus] = useState<AudioStatus>(getAudioStatus)

  useEffect(() => {
    const id = window.setInterval(() => setAudioStatus(getAudioStatus()), 400)
    return () => window.clearInterval(id)
  }, [])

  function testSound() {
    // A click is an activating gesture everywhere (incl. iOS Safari), so this can always unlock.
    unlockAudio()
    window.setTimeout(() => {
      sfx.coin(6)
      setAudioStatus(getAudioStatus())
    }, 150)
  }

  function toggle(key: keyof Settings, value: boolean) {
    setSettings(setSetting(key, value))
    invalidateSoundSetting()
    if (value && key === 'soundEnabled') sfx.coin(4)
    if (value && key === 'vibrationEnabled') vibrate(40)
  }

  function reset() {
    if (!window.confirm('코인, 진행도, 보유 아이템이 모두 삭제됩니다. 초기화할까요?')) return
    resetSave()
    invalidateSoundSetting()
    setSettings(getSettings())
    setResetDone(true)
  }

  return (
    <div className={pageStyles.page}>
      <header className={pageStyles.header}>
        <BackToHubButton />
        <h1 className={pageStyles.title}>
          <span aria-hidden="true">⚙️</span> 설정
        </h1>
      </header>

      <ul className={styles.list}>
        {TOGGLES.map((t) => (
          <li key={t.key}>
            <label className={`${styles.row} ${settings[t.key] ? styles.on : ''}`}>
              <span className={styles.icon} aria-hidden="true">
                {t.icon}
              </span>
              <span className={styles.text}>
                <span className={styles.label}>{t.label}</span>
                <span className={styles.hint}>{t.hint}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className={styles.input}
                checked={settings[t.key]}
                onChange={(e) => toggle(t.key, e.target.checked)}
              />
              <span className={styles.switch} aria-hidden="true">
                <span>{settings[t.key] ? 'ON' : 'OFF'}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <section className={styles.audioTest}>
        <p className={styles.hint}>
          오디오 상태: <b className={styles.audioStatus}>{settings.soundEnabled ? AUDIO_STATUS_LABEL[audioStatus] : '🔇 사운드 꺼짐 (위에서 켜세요)'}</b>
        </p>
        <button className={`btn btn-ghost ${styles.testButton}`} onClick={testSound} disabled={!settings.soundEnabled}>
          🔊 소리 테스트
        </button>
        <p className={styles.hint}>iPhone은 옆면 무음 스위치가 켜져 있으면 소리가 나지 않아요.</p>
      </section>

      <section className={styles.danger}>
        <h2 className={styles.dangerTitle}>데이터</h2>
        <p className={styles.hint}>진행도는 이 브라우저에만 저장됩니다. 브라우저 데이터를 지우면 사라질 수 있어요.</p>
        <button className={`btn btn-ghost ${styles.resetButton}`} onClick={reset}>
          데이터 초기화
        </button>
        {resetDone && <p className={styles.done}>초기화했습니다.</p>}
      </section>
    </div>
  )
}
