import { useState } from 'react'
import BackToHubButton from '../components/BackToHubButton.tsx'
import { invalidateSoundSetting, sfx } from '../systems/audio/audio.ts'
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

export default function SettingsPage() {
  const [settings, setSettings] = useState(getSettings)
  const [resetDone, setResetDone] = useState(false)

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
