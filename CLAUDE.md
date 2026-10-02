# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Planning documents (read first)

- `PRD.md` — product requirements for "타임킬러 오락실" (Time Killer Arcade): a web-based arcade of 4 short, addictive casual games, playable without login on both PC and mobile, with a shared coin/reward economy and an in-game shop.
- `PROMPT.md` — the 4-stage build plan this project follows, with the exact prompt text used for each stage. Each stage explicitly excludes work that belongs to a later one. (Its "project root" says `Desktop\GAME` — this repo is the rebuild in `Desktop\TIMEATTACK`; its stack line says Phaser 3 — this repo uses Phaser 4.)

## Build stage status

All 4 stages are done (2026-10-02). New work is post-MVP polish/maintenance: keep the rules in this file, re-run the `qa/` suites after changes, and **for every user-visible change add a release note at the top of `src/data/notices.ts`** (see "Notices"). Deployed at https://oraksill.vercel.app from `SEJIN-work/ORAKSILL` (`main` auto-deploys on Vercel).

1. ✅ **Skeleton** — Vite 8 + React 19 + TS 6 + Phaser 4.2 + react-router-dom 7; hub, Shop/Settings pages, 4 game routes (lazy), save/currency/shop modules.
2. ✅ **Core gameplay & systems** — real save, coins, shop + item effects, `GameRunner` session flow, all 4 games playable start-to-finish with 1-3★.
3. ✅ **UI design** — neon arcade design system, per-game "타격감" (particles, hit-stop, shake, combo pitch-up, haptics), synthesized SFX/BGM, reward animations, colour-blind symbols on Bus Stop.
4. ✅ **QA / verification** — Playwright PRD check on 6 viewports, edge cases, production load timing, FPS under CPU throttle, and difficulty simulations with player-model bots. Fixes applied with the user's approval: all 4 difficulty tables re-tuned, Stress Breaker 3★ rule, landscape-phone layout, non-blocking web fonts. Remaining open items: see **Known open issues**.

## Commands

```
npm run dev        # Vite dev server (default :5173 — see Environment notes)
npm run build      # tsc -b (project-wide typecheck) then vite build
npm run preview    # serve the production build (:4173)
npm run lint       # oxlint (also lints qa/)
npx tsc -b         # typecheck only

# Browser QA (needs a running dev server; system Chrome via playwright-core — no browser download)
npm run qa:test            # 42 regression checks: every game end-to-end, shop, items, skip, mobile touch
npm run qa:prd             # PRD checks: 6 viewports + layout, edge cases, per-game features, load timing
npm run qa:shots           # screenshots of every screen → qa/output/  (add `-- mobile` for 390×844)
npm run qa:perf            # FPS under 4× CPU throttle (Stress spam + heavy TD scene)
npm run qa:bus-guarantee   # Bus Stop: every generated puzzle winnable + hint bot 100%  (Node only)

# Difficulty simulations (see "Difficulty tuning")
npm run sim:stress         # Node; human-model bots vs. Stress Breaker spawn rules
npm run sim:puzzles        # Node; bots vs. the real Bus Stop + Merge rule modules
npm run sim:td             # real TowerDefenseScene stepped headlessly in Chrome (needs dev server)
```

QA env vars: `QA_BASE` (dev server, default `http://localhost:5173`), `QA_PREVIEW` (production preview, default `http://localhost:4173`, used by `qa.mjs load`). Run a single section with `node qa/qa.mjs <hub|edge|features|load>` or `node qa/tests.mjs <stress|shop|merge|bus|td|skip|mobile>`. There is no unit-test runner; the pure rule modules are exercised by `qa/bus-guarantee.ts` and `qa/sim-puzzles.ts` (`node file.ts` works on Node 24 via type stripping).

## Tech stack

- **Vite + React 19 + TypeScript**, strict compiler options (`noUnusedLocals`, `noUnusedParameters` are on — unused params fail `npm run build`; prefix with `_` if a param must stay)
- **react-router-dom** for routing between the hub and each game screen
- **Phaser 4** for gameplay rendering — one `Phaser.Scene` subclass per game, 720×1080 portrait, `Scale.FIT`
- **CSS Modules** per component; shared neon tokens, `.btn`/`.btn-pink`/`.btn-yellow`/`.btn-ghost` button classes and shared `@keyframes` live in `src/index.css`. Phaser mirrors the palette in `src/games/theme.ts` (`NEON`, `displayText()`, `bodyText()`) — no CSS-in-JS, no Tailwind
- **Fonts**: 'Black Han Sans' (`--font-display`, headings/buttons/canvas display text) + 'Noto Sans KR' (`--font-body`, weights **400/700 only**) from Google Fonts, loaded **non-render-blocking** (`rel=preload` + onload swap in `index.html`) — the blocking stylesheet cost ~0.8s of first paint. Deliberately not system-ui (an all-system-font pass read as "no design"). Both have full Hangul coverage; don't swap in a Latin-only display font without solving Korean headings.
- **Browser `localStorage`** only, no backend — no-login MVP
- **playwright-core** (devDependency) for `qa/` only

## Architecture

**Shared currency/progress, not per-game state.** All 4 games read/write one `PlayerSave` (`src/types/save.ts`) via `src/systems/storage/storage.ts` (`loadSave`/`saveSave`/`updateSave`/`resetSave`, localStorage key `tka:save:v1`). The save carries `version` (`SAVE_VERSION`); `normalizeSave()` merges stored data field-by-field onto a fresh default, so older/corrupt saves load safely (verified: garbage JSON, wrong types, negative coins all load as a clean save) — when changing the `PlayerSave` shape, bump `SAVE_VERSION` and extend `normalizeSave()`. Coins are a single economy across all games — never give a game its own wallet. `currency.ts` has `getCoins`/`addCoins`/`spendCoins`; `shop/shop.ts` (catalog + `purchaseItem`) and `shop/inventory.ts` (flat `string[]` of item ids — duplicates = quantity); `save/gameResult.ts#applyGameResult` is the one place a finished attempt's reward + `bestStage` + per-stage stars (`progress[id].stageStars`) gets merged into the save; `recordAttempt` counts plays; `applySkip` handles the skip ticket. `settings.ts` reads/writes sound/vibration.

**Game module layout**: each game lives in `src/games/<game-id>/` as `<Game>Scene.ts` (Phaser logic, difficulty table, win/lose detection) + `<Game>Screen.tsx` (configures `<GameRunner>` with scene, rules text, 3 icon `steps`, `maxStage`, booster/in-game items, and passes `tagline`/`accent`/`accent2` to `GameScreenLayout`). Bus Stop and Merge keep their rules in Phaser-free modules (`busStopLogic.ts`, `mergeLogic.ts`) so Node can simulate them — keep it that way. `src/games/registry.ts` holds **metadata only** (id/path/title/tagline/emoji/description/accent/accent2/genre) — it must not import Screens, or Phaser lands in the hub bundle. Routes are wired in `src/App.tsx` via `React.lazy()` (hub JS ≈ 90KB gzip; Phaser is a separate ≈ 360KB gzip chunk loaded on first game visit).

**`GameRunner`** (`src/components/GameRunner.tsx`) owns the intro → playing → result lifecycle for all 4 games: intro panel (3-step icon onboarding, collapsible rules — expanded on first visit, unlocked-stage picker 1..bestStage+1 with per-stage ★, booster toggle, skip ticket only on uncleared stages) → `PhaserGameContainer` + in-game item bar + 그만하기 → `ResultOverlay` (다음 스테이지 / 다시하기 / 스테이지 선택 / 상점가기 / 로비로). A Scene reads `getInitData(this)` → `{ stage, boosterActive }` and calls `emitResult(this, { cleared, coinsEarned, stars?, details? })` once — `coinsEarned` must be 0 on failure (`emitResult` also enforces it). In-game items (hint, undo) are bus events (`USE_HINT_EVENT`/`USE_UNDO_EVENT`); a Scene registers `onItemUse(this, EVENT, () => boolean)` and returns whether the item did something — `GameRunner` only consumes the item on `true`. Leaving mid-game (로비 / 그만하기) applies no result; a booster is consumed when the attempt starts.

**`PhaserGameContainer`** (`src/components/PhaserGameContainer.tsx`) is the only place a `Phaser.Game` is created/destroyed. It waits (≤1.5s) on `document.fonts.load` before booting (canvas text can't re-render after a font arrives), pushes `initData`/`bus` into `game.registry`, and survives StrictMode's double effect. `GameRunner` remounts it per attempt (`key={attemptId}`). In dev it exposes `window.__tkaGame` (stripped from production builds). **The wrapper's `overflow: hidden` is load-bearing**: `Scale.CENTER_BOTH`'s inline margin otherwise inflates the parent and feedback-loops the canvas off its real position, so taps miss. A second cause of the same "taps don't land" symptom: Phaser caches the canvas page position at boot and React can move the canvas later without a resize (seen as every tap ~400px off after starting from a scrolled intro). So the container calls `game.scale.updateBounds()` in capture-phase `pointerdown`/`mousedown`/`touchstart` on the wrapper and `scale.refresh()` from a `ResizeObserver` — keep both. `onItemUse` unsubscribes on the scene's `DESTROY` as well as `SHUTDOWN` (`game.destroy()` only fires DESTROY; without it a discarded StrictMode game's handler threw on use).

**`GameScreenLayout`** draws every game screen as an arcade cabinet: bezel with corner bolts → gradient marquee (back button, title, tagline) → dark glass well holding whatever `GameRunner` shows. Purely visual; per-screen chrome that depends on game state belongs in `GameRunner`. **Landscape phones** (`orientation: landscape` and `max-height: 520px`): the marquee becomes a left sidebar and the item bar a right column with a "세로로 돌리면 더 크게" hint (in both modules' CSS), because every game is portrait — this took the canvas from 136×204 to 241×362 on an 844×390 screen.

**Hit-testing**: don't use `setInteractive()` + per-object handlers (unreliable for circles). Every Scene keeps its own array of hittable things and does one scene-wide `this.input.on('pointerdown', …)` with manual distance/AABB checks (`TowerDefenseScene#handlePointerDown`, `StressBreakerScene#hitAlong` — which also handles swipe strokes, one hit per target per stroke). Phaser processes queued DOM input on its next frame.

**Keyboard**: Phaser can dispatch the same `KeyboardEvent` twice when several keys land in one frame; dedupe by event object (the `WeakSet` in `MergeNumbersScene.create()`).

**Adding a 5th game**: new `src/games/<id>/` with Scene + Screen, a `GAME_REGISTRY` entry, a lazy route in `App.tsx`, a `GameId` union member + `GAME_IDS` entry in `src/types/save.ts` (`createDefaultSave()` builds per-game progress from `GAME_IDS`).

### Notices (update history)

- `src/data/notices.ts#NOTICES` is the single source of release notes, **newest first**: `{ id, version, date, title, tag: '신규'|'개선'|'수정'|'공지', items[] }`. To announce an update, prepend an entry with a new, never-reused `id` (use the version, e.g. `1.1.1`) and bump the version semantically (fix → patch, feature → minor). Write items in plain player-facing Korean, not dev jargon.
- The hub shows `NoticeBar` (one line: latest title + NEW badge, links to `/notices`); `pages/NoticesPage.tsx` lists all entries and marks the newest as seen on visit.
- "Seen" lives in its own localStorage key `tka:notice-seen` (= newest seen `id`), deliberately **not** in `PlayerSave`: it's UI state, so no `SAVE_VERSION` bump and 데이터 초기화 leaves it alone.

### Economy & shop (`systems/economy.ts`, `systems/shop/shop.ts`)

- Clear reward = `stageReward(stage)` = 20 + 10·stage, + `starBonus` (★2 +20%, ★3 +50%), + per-game bonus: Stress — ⌊maxCombo/5⌋·3 combo bonus + 5 coins per 💰 object; Merge — ⌊movesLeft/2⌋; TD — +50% of base for a no-damage clear; Bus — stars only. Failure pays 0 (including coins collected mid-run).
- Re-clearing an already-cleared stage pays `REPLAY_REWARD_RATE` = 50% (keeps the shop meaningful, PRD 13). Stars are kept as the best per stage.
- Stars via `starsFromRatio(ratio, two, three)`: TD lives left (0.5 / 1.0 → ★3 = no damage), Bus `buses/taps` (0.85 / 1.0 — every tap counts, including invalid/undone ones), Stress time left (**0.08 / 0.2**), Merge moves left (0.1 / 0.2).
- Catalog (`ITEM_IDS`): `td-start-gold` 120 (TD +100 starting gold, pre-start booster), `bus-hint` 80 (in-game, Bus), `stress-time` 100 (+10s, pre-start), `merge-wild` 100 (start with a ★ tile that merges with any number, pre-start), `undo` 90 (in-game, Bus + Merge only — meaningless in real-time games), `skip-ticket` 300 (marks an uncleared stage cleared at ★1, **no coins**, so it can't be farmed). `purchaseItem` deducts and adds in one save write; buying with too few coins is refused with a toast (rapid-click tested: 10 clicks with 250 coins → exactly 2 purchases).
- Merge and Bus Stop show a 3-second "stuck/교통 정체" overlay before failing so 되돌리기 can rescue the position.

### Difficulty tables (v1.2.0: 30 / 24 / 30 / 24 stages, re-tuned 2026-10-02 — see "Difficulty tuning")

- **Stress Breaker** `stageConfig(stage)` — 30 stages on a smooth curve k = (stage−1)/29: time 30s; target round(18 + 32·k^0.75) (18→50); spawn every 820−440k ms; maxAlive 4+round(7k); lifetime 2700−1150k ms; bombs from stage 2 (5→18%), 2-hit crates from stage 3 (4→32%), 💰 bonus 7%. **Total spawns must stay well above `target`** (the original 10-stage table spawned fewer breakables than the target from stage 6 — unwinnable). 3 targets are spawned at the start. `qa/sim-stress.mjs#current()` mirrors this formula.
- **Tower Defense** — 30 stages via `stageTuning(stage)`: start gold 120 + 22·(s−1) (+100 booster); HP × (1 + 0.045·(s−1)); `armorBonus` +1 every 6 stages; boss armor ⌊(s−1)/4⌋ (0 early, because early players only afford MGs); 3 waves of `countBase` = 6 + round(0.45·stage) (+2 per wave) at max(420, 900−16·stage) ms, then the boss (800 HP) as wave 4. **Armor**: every hit loses a flat `armor` (min 15% of raw damage, `MIN_DAMAGE_RATIO`) — MG bullets (5-13 dmg) bounce off armored targets while 저격 (45+) and 대포 (22+, splash) don't, and a "🛡 튕김!" popup teaches it. Enemies: grunt, runner (st 2+), **armored tank** (armor 5, st 4+), **장갑병 knight** (armor 9, st 8+, extra weight from 10/16/22), **꼬마 떼 swarm** (packs of 5 tiny fast enemies, st 12+ — cannon food). This exists because an MG-only build used to clear everything; sim check: an MG-only bot now loses from ~stage 10. 10 lives; leaks cost 1 (tank/knight 2, boss 5). Towers: 기관총 50G, 저격 110G, 대포 130G (lobbed shell — damage lands where the target was), upgrades to Lv3 (×0.8 then ×1.3 of cost). A whole stage only funds ~5 towers, so tower choice matters.
- **Bus Stop** `STAGES` (24): 3L×2 buses/2 colours/3 seats → 7L×7 (49 buses, ~290 passengers)/8 colours/6 seats; dock always 3 (PRD). `StageConfig.bury` = generator's chance to dig another bus while the dock has room. **Bigger boards get a lower `bury` (0.12 → 0)** so they stay fair: with many buses the thinking is choosing WHICH same-coloured lane to pull (the bus behind it matters), which a player can see. Random lane choice falls below 10% late, a player who checks the next bus/queue gets ~20-33%, 2-move look-ahead ~50-67%. Scene `COLORS`/`SYMBOLS` have 8 entries — the max colours.
- **Merge** `STAGES` (24): mixes board size (4/5/6), target (64/128/256), obstacles (0-6) and move budget; **ordered by measured difficulty**, not by a single knob (a 4×4→256 with no obstacles plays easier than a 5×5→256 with 3). Targets capped at 256 (512 needed ~300 swipes ≈ 4.7 min, past the PRD round length); rounds ≤ ~2m45s. Stage 24 (6×6→256, 6 obstacles, 185 moves) is the "boss" board.

### Bus Stop specifics

- **Guaranteed winnable** (load-bearing): `busStopLogic.ts#generate()` writes the passenger queue while simulating a playthrough under the *real* boarding rule (earliest-arrived matching bus), so replaying its recorded lane order always wins (the real game can only board earlier than the sim, never later). Random lanes + random queue can produce puzzles with no winning line. The paid hint calls `solve()` (DFS with dead-state memo) from the *current* state. Rules live only in `busStopLogic.ts`; after touching them run `npm run qa:bus-guarantee` (must be 100% replay / 100% hint-bot on all stages).
- **Animated, not re-rendered**: the logic updates instantly on a tap; views catch up — the bus drives lane → dock, `boardOne()` flies the exact passenger into its bus and fills a seat light, the queue slides forward, a full bus honks and drives off. Timers go through `after()`; `rebuild()` hard-syncs views to state and cancels those timers (a tap mid-animation just snaps). **Anything that must survive a rebuild (the won/jammed resolution) must use `this.time.delayedCall` directly** — via `after()` the end-of-animation rebuild cancelled it and the game froze right before the result. `viewQueueIndex` tracks which passenger the queue views show while logic is ahead.
- Colour-blind support: every bus and passenger also carries a symbol (●▲■◆★✚♥♣, PRD 11). The free cue is only a thin outline on lanes whose front bus matches the front passenger (not a solver). The hint solver stays fast on 49-bus boards (a few ms per call; `qa:bus-guarantee` reports 100% solver success on all 24 stages).

### Sound, haptics, juice

- **Sound is fully synthesized** — `src/systems/audio/audio.ts` builds every effect (`sfx.click/coin/purchase/star/clear/fail/smash/bomb/shoot/explode/build/upgrade/bossWarn/bossDie/busIn/board/depart/merge/slide/undo/hint/jam/…`) and a lookahead-scheduled synthwave BGM from Web Audio oscillators/noise. No audio files; don't add any without discussing (bundle size + licensing). Rapid-fire sounds are throttled per key. Each call re-checks `settings.soundEnabled` (cached 250ms; `invalidateSoundSetting()` after toggling). **Mobile unlock (load-bearing):** `App.tsx` calls `installAudioUnlock()`, which retries `unlockAudio()` + `startBgm()` on every *activating* gesture (`ACTIVATING_EVENTS` = touchend/click/keydown/mousedown, document capture listeners) until the context is `running`, forever (iOS re-suspends to `interrupted` after calls/app switches), and tries `resume()` on `visibilitychange`. Rules, from two shipped bugs ("no sound on mobile", then "no sound on iPhone Safari only" — Android was fine): (1) iOS Safari does **not** treat touchstart/pointerdown (finger down) as a user activation — only finger up/click/keys; (2) the AudioContext is **only ever created inside an activating gesture** — `ready()` never creates it (an sfx can fire from pointerdown), and `startBgm()` doesn't either; (3) if a context still isn't running ~300ms after an unlock attempt, the next gesture closes it and creates a fresh one inside that gesture; (4) `unlockAudio()` also starts a 1-sample silent buffer (iOS trick). The silent switch is intentionally respected (no `navigator.audioSession` override): muted on silent, audible with the ringer on — the user asked for exactly this. Settings has a **🔊 소리 테스트** button plus a live `getAudioStatus()` readout (running/suspended/interrupted/not-started/closed/unsupported) for diagnosing a phone without devtools. Phaser's own sound manager is disabled (`audio: { noAudio: true }` in `PhaserGameContainer`) — it made and closed an extra AudioContext every attempt, which can interrupt ours on iOS; there must be exactly one AudioContext. On iPhones the ring/silent switch mutes Web Audio (platform behaviour). Neither headless Chrome mobile emulation nor Playwright's Windows WebKit build (it has no `AudioContext` at all) reproduces these iOS rules — confirm audio on a real iPhone. `App.tsx` also plays `sfx.click()` for any button/link press. BGM lives at module scope, so it continues across routes.
- **`systems/haptics.ts#vibrate()`** wraps `navigator.vibrate`, gated on `settings.vibrationEnabled`, safe to call anywhere. Used in all 4 games (hits, builds, departures, bombs, boss).
- **`src/games/effects.ts`** — shared juice, tuned to feel consistent: `burst`, `shards`, `ring`, `popText`, `punch` (explicit `{from:1,to}` so overlapping punches can't stick), `shake`, `flash` (overlay, not camera.flash), `zoomPunch`, `hitStop` + `isFrozen` (scene skips its own sim while frozen), `hitFlash`, `confetti`, `banner`. Reuse these instead of hand-rolling tweens.
- **`src/games/theme.ts`** — `NEON` palette, text styles, `ensureGlowTexture` (soft additive glow sprite), `bake`/`vGradient`, `drawBackdrop`, `drawHudBar`.

### Performance rules (Phaser)

- **Bake static art.** Phaser re-tessellates every `Graphics` object every frame; large static Graphics (grids, roads, slot outlines, board frames) dropped TD to ~23fps under 4× CPU throttle. Use `theme.ts#bake()` (draw once → `generateTexture` → one Image) and pooled sprites for moving decorations (`TowerDefenseScene#moveDashes`). Baking uses the canvas renderer, which ignores `fillGradientStyle` → use `vGradient()`. A baked layer added after labels in the same method covers them — give it a lower depth.
- Object art is procedural (`makeTextures()` in each scene: crates/glass/balloons/bombs, turrets/enemies/coins, buses/passengers) — no image assets.
- Measured after fixes (4× CPU throttle): idle 55-59fps in every game, Stress combo spam ~55fps, heaviest TD scene (18 towers + 40 enemies) 44-52fps.

### Phaser 4 API notes

- `setTintFill()` is gone → `effects.ts#hitFlash()` (`setTint(c).setTintMode(Phaser.TintModes.FILL)`, restore with `MULTIPLY`).
- `game.headlessStep(time, delta)` after `game.loop.sleep()` steps the full game (tweens, timers) without rendering — `qa/sim-td.mjs` relies on it.

## Difficulty tuning

Targets used (common casual-game curve + PRD KPIs): stage 1 ≈ everyone clears (PRD: stage-1 clear ≥70%), middle stages 60-80%, final stage 30-50% for a casual player (beatable with boosters/retries), **no stage mathematically unwinnable**, every round 30s-3min.

Process — **re-run the sims, don't eyeball numbers**:
1. Try a proposal without editing the game: `node qa/sim-stress.mjs proposal.json` (array of 10 `stageConfig` objects), `node qa/sim-puzzles.ts bus 300 busTable.json` / `MERGE_TABLE=merge.json node qa/sim-puzzles.ts merge 300`, `node qa/sim-td.mjs 8 1,5,10 tuning.json` (keys: startGold, goldPerStage, hpGrowth, count0, countPerStage, countPerWave, interval0, intervalStep, minInterval, bossHp, goldMul — patched into the live scene at runtime).
2. Apply to the game, then re-run without a proposal file to measure the shipped values; for Bus Stop also `npm run qa:bus-guarantee`.
3. `qa/sim-stress.mjs` duplicates `stageConfig()` (the scene imports Phaser, so Node can't) — **update both together**.

Player models: Stress casual 0.55s/hit + 5% bomb slips, skilled 0.38s/hit + occasional 2-object swipes; Bus casual (match front passenger → reinforce a docked colour → random; ties broken randomly), average (same, but among matching lanes picks the one whose NEXT bus is needed soonest in the 12 visible passengers), skilled (average + 2-move look-ahead that avoids instant jams); Merge casual greedy (max empty cells), skilled 2-ply expectation; TD casual (acts every 1.5s, 60/25/15 MG/cannon/sniper, random top-25 coverage slot, 25% upgrades), skilled (acts every 0.5s, reads the field + next 15 spawns: snipers for armored, cannons for swarms, cheapest upgrade once it has 5 towers), mgonly (MG only, upgrades included — the "spam machine guns" player).

Results after the v1.2.0 re-tune (stage 1 → last): Stress casual 100% (1-10) → 90% (20) → 67% (25) → 23% (30), skilled ~99%; Bus average player 100% → ~60% (9) → 20-33% (19-24), random-choice player <10% late, skilled 100% → 50-67%; Merge casual 98% → ~50% (mid) → 13% (24), skilled 100% → 51%, rounds ≤ ~2m45s; TD skilled bot 100% to stage 12 → ~50-75% (14-22) → ~25-50% late, **MG-only bot 100% to stage 6 → 1/4 at 8 → 0% from 10**, casual bot ~100% → <20% late (4-6 runs/stage ⇒ ±20-25% noise — confirm with real players). History: the first 10/8-stage tables had Stress 6-10 and TD 4-10 unwinnable; the first 30-stage TD draft was unwinnable from 12 and an early boss armor punished MG-only openings at stage 1 (hence boss armor starts at 0).

## QA suite (`qa/`)

- `e2e.mjs` — shared helpers (`newPage`, `start(page, gameId, stage)`, `waitScene`, `scene(page, key, fn)` to read scene state, `tapCanvas` with game→client coordinate mapping, `save`/`setSave`). Output → `qa/output/` (gitignored).
- `tests.mjs` (regression), `qa.mjs` (PRD checks), `shots.mjs`, `perf.mjs`, `bus-guarantee.ts`, `sim-stress.mjs`, `sim-puzzles.ts`, `sim-td.mjs`.
- Testing tips: wait ~1 frame after a synthetic tap before reading state; visually hidden inputs (booster toggle, settings switches, `aria-disabled` buy buttons) need `{ force: true }`; Merge/Bus results resolve after their animations, so wait for the result heading instead of reading state immediately; coin pills animate, so read their `aria-label`, not their text.

## Known open issues

- Load on **Fast 3G + 4× CPU** (low-end phone): hub first paint ~3.6s vs. the PRD's 3s target. 4G mid-range passes (hub 1.35s, first game ~1.7s, other games ~0.7s). The remainder is mostly React bundle parse/execute.
- TD difficulty curve shape is unconfirmed (bot noise); every stage is beatable.
- Real audio output and phone vibration weren't verifiable in the headless test environment (only that they run without errors).
- A booster is consumed at attempt start and not refunded if the player quits mid-run (intentional, but undocumented in UI).

## Environment notes

- On this machine the older `Desktop\GAME` build's dev server may already own port **5173**; run `npm run dev -- --port 5180 --strictPort` and set `QA_BASE=http://localhost:5180` (and `QA_PREVIEW` for `npx vite preview --port 5181`).
- Stopping a background `npm run dev` can leave the `vite` child running and holding the port — check the port owner before restarting.
- The Playwright MCP browser window is throttled to ~2fps when unfocused (game clocks crawl); the `qa/` scripts use their own headless Chrome and don't have this problem.
