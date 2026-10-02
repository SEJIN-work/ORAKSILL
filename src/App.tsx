import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import HubPage from './hub/HubPage.tsx'
import ShopPage from './pages/ShopPage.tsx'
import SettingsPage from './pages/SettingsPage.tsx'
import { installAudioUnlock, sfx } from './systems/audio/audio.ts'

// Game screens are lazy-loaded so Phaser is only pulled in when a game route is visited.
const TowerDefenseScreen = lazy(() => import('./games/tower-defense/TowerDefenseScreen.tsx'))
const ColorParkingScreen = lazy(() => import('./games/color-parking/ColorParkingScreen.tsx'))
const StressBreakerScreen = lazy(() => import('./games/stress-breaker/StressBreakerScreen.tsx'))
const MergeNumbersScreen = lazy(() => import('./games/merge-numbers/MergeNumbersScreen.tsx'))

export default function App() {
  const location = useLocation()

  useEffect(() => {
    // Browsers block AudioContext until a user gesture (on mobile: touchend/click, not pointerdown).
    installAudioUnlock()
    // UI click blip for every button/link (canvas taps have their own per-game sounds).
    const click = (e: PointerEvent) => {
      if ((e.target as Element | null)?.closest('button, a, label')) sfx.click()
    }
    window.addEventListener('pointerdown', click)
    return () => {
      window.removeEventListener('pointerdown', click)
    }
  }, [])

  return (
    <Suspense fallback={<div className="loading">LOADING</div>}>
      <div key={location.pathname} className="page-enter">
        <Routes location={location}>
          <Route path="/" element={<HubPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/games/tower-defense" element={<TowerDefenseScreen />} />
          <Route path="/games/color-parking" element={<ColorParkingScreen />} />
          <Route path="/games/stress-breaker" element={<StressBreakerScreen />} />
          <Route path="/games/merge-numbers" element={<MergeNumbersScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Suspense>
  )
}
