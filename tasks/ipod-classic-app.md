# SoundCloud iPod Classic — Полный план

> Нативное приложение (Capacitor) с визуалом iPod Classic 7th gen.
> Стриминг SoundCloud через существующий Cloudflare Worker прокси.
> Кросс-платформа: iOS (AltStore) + Android (APK).

---

## Содержание

1. [Концепция](#1-концепция)
2. [Стек и архитектура](#2-стек-и-архитектура)
3. [Полная спецификация визуала](#3-полная-спецификация-визуала)
4. [Все экраны и User Flow](#4-все-экраны-и-user-flow)
5. [Click Wheel — полная механика](#5-click-wheel--полная-механика)
6. [Touch Mode — режим тачскрина](#6-touch-mode--режим-тачскрина)
7. [Cover Flow](#7-cover-flow)
8. [Haptics и звуки](#8-haptics-и-звуки)
9. [Swift-плагины (нативный слой)](#9-swift-плагины-нативный-слой)
10. [Бесконечное фоновое воспроизведение](#10-бесконечное-фоновое-воспроизведение)
11. [Плейлисты и On-The-Go](#11-плейлисты-и-on-the-go)
12. [Загрузки (Downloads)](#12-загрузки-downloads)
13. [Кросс-платформа iOS + Android](#13-кросс-платформа-ios--android)
14. [GitHub Actions — сборка без Mac](#14-github-actions--сборка-без-mac)
15. [Дистрибуция](#15-дистрибуция)
16. [Миграция с текущего PWA](#16-миграция-с-текущего-pwa)
17. [Поэтапный план с трудностями](#17-поэтапный-план-с-трудностями)

---

## 1. Концепция

Приложение визуально воспроизводит iPod Classic 7th generation (2009), но внутри — полноценный SoundCloud стриминг-клиент.

**Почему это работает:**

- Мода на винтаж (iPod, Walkman, ретро-эстетика) на пике
- Уникальный UI, которого нет ни у одного стримингового сервиса
- Решает реальные проблемы PWA: лайк на экране блокировки, бесконечная очередь в фоне
- Работает без App Store через AltStore (iOS) и APK (Android)
- Весь существующий код переиспользуется — меняется только UI-слой

---

## 2. Стек и архитектура

```
┌───────────────────────────────────────────────────────────┐
│                      React (UI Layer)                     │
│   iPod Classic визуал — Tailwind + CSS 3D transforms      │
│   Существующие: Jotai, TanStack Query                     │
│   Новые: Dexie.js (IndexedDB для загрузок)                │
├───────────────────────────────────────────────────────────┤
│                   Capacitor Bridge                        │
│   @capacitor/haptics   @capacitor/app                     │
│   @capacitor/status-bar   @capacitor/filesystem           │
├────────────────────────┬──────────────────────────────────┤
│    iOS Native (Swift)  │    Android Native (Kotlin)       │
│    AudioPlayerPlugin   │    AudioForegroundService         │
│    LockScreenPlugin    │    MediaSessionCompat             │
│    QueueManagerPlugin  │    DownloadManager                │
│    DownloadPlugin      │                                   │
└────────────────────────┴──────────────────────────────────┘
         │                              │
         ▼                              ▼
  AVQueuePlayer                  HTML5 Audio
  AVAudioSession                 Foreground Service
  MPRemoteCommandCenter          Android MediaSession
  URLSession.downloadTask        DownloadManager API
         │                              │
         └──────────────┬───────────────┘
                        ▼
          Cloudflare Worker Proxy
          soundcloud-proxy.lblue1256.workers.dev
                        │
                        ▼
             SoundCloud API v2
```

### Что остаётся без изменений (уже написано)

| Файл                     | Что делает                                            | Статус                           |
| ------------------------ | ----------------------------------------------------- | -------------------------------- |
| `src/lib/api.ts`         | SC API клиент, все методы включая `sc.playlists()`    | ✅ Готово                        |
| `src/lib/auth.ts`        | loginWithToken, logout, fetchCurrentUser              | ✅ Готово                        |
| `src/stores/auth.ts`     | accessTokenAtom, currentUserAtom, isAuthenticatedAtom | ✅ Готово                        |
| `src/stores/player.ts`   | currentTrackAtom, queueAtom, likedTrackIdsAtom и др.  | ✅ Готово                        |
| `src/hooks/usePlayer.ts` | usePlayer, usePlayerSync                              | ✅ Готово (потребует расширения) |
| Cloudflare Worker        | Прокси + ad blocking                                  | ✅ Задеплоен                     |

### Что переписывается полностью

| Файл                | Причина                                                         |
| ------------------- | --------------------------------------------------------------- |
| `src/App.tsx`       | React Router → стековая iPod-навигация                          |
| `src/pages/*`       | Все страницы → iPod экраны                                      |
| `src/components/*`  | BottomNav, RootLayout, MiniPlayer, NowPlaying → iPod компоненты |
| `src/lib/player.ts` | Добавить bridge к Swift плагинам                                |

### Что добавляется новое

| Файл                                               | Что делает                                      |
| -------------------------------------------------- | ----------------------------------------------- |
| `src/lib/downloads.ts`                             | Dexie.js схема + DownloadPlugin bridge          |
| `src/stores/downloads.ts`                          | downloadedTrackIdsAtom, downloadQueueAtom       |
| `src/stores/onthego.ts`                            | onTheGoQueueAtom                                |
| `src/stores/settings.ts`                           | controlModeAtom (`'wheel' \| 'touch'`)          |
| `src/components/ipod/TouchControlBar.tsx`          | Тач-полоса вместо колеса                        |
| `src/components/ipod/TouchNavBar.tsx`              | Верхний бар с кнопкой назад (touch mode)        |
| `src/components/ipod/MiniPlayerBar.tsx`            | Мини-плеер в нижней полосе (touch mode)         |
| `src/components/screens/NowPlayingTouchScreen.tsx` | Now Playing с жестами                           |
| `ios/App/Plugins/*.swift`                          | AudioPlayer, LockScreen, QueueManager, Download |
| `android/app/src/…/AudioService.kt`                | Foreground Service + MediaSession               |
| `.github/workflows/build.yml`                      | GitHub Actions iOS + Android                    |

---

## 3. Полная спецификация визуала

### 3.1 Цвета

```css
/* Основные */
--ipod-bg: #1a1a1a; /* фон экрана */
--ipod-bg-deep: #0d0d0d; /* более тёмные области */
--ipod-text: #ffffff; /* основной текст */
--ipod-text-dim: #8a8a8a; /* вторичный текст (время, подписи) */
--ipod-divider: #2a2a2a; /* разделители строк */

/* Выделение */
--ipod-select-from: #5baef8; /* градиент синего выделения — начало */
--ipod-select-to: #3478c4; /* градиент синего выделения — конец */
--ipod-select-text: #ffffff; /* текст выделенного пункта */

/* Status bar */
--ipod-statusbar: #111111;

/* Click Wheel */
--ipod-wheel-bg: #c8c8c8; /* светло-серый корпус колеса */
--ipod-wheel-inner: #e8e8e8; /* внутренний круг */
--ipod-wheel-center: #d4d4d4; /* центральная кнопка */
--ipod-wheel-press: #b0b0b0; /* нажатое состояние */
--ipod-wheel-button: #333333; /* текст кнопок MENU, ►| и т.д. */

/* Загрузки */
--ipod-download: #34c759; /* зелёный индикатор скачанного */
```

### 3.2 Типографика

```css
font-family:
  "Helvetica Neue",
  -apple-system,
  sans-serif;

--font-menu-item: 17px;
font-weight: 400;
--font-menu-sub: 13px;
font-weight: 400;
--font-time: 13px;
font-weight: 400; /* монопространственный: font-variant-numeric: tabular-nums */
--font-status: 12px;
--font-title: 16px;
font-weight: 600;
letter-spacing: -0.2px;
```

### 3.3 Layout корпуса

```
┌──────────────────────────┐
│     STATUS BAR  12px     │  ← тонкая полоска (батарея, название)
├──────────────────────────┤
│                          │
│                          │
│      SCREEN AREA         │  ← 55% высоты устройства
│   (iPod дисплей)         │
│                          │
│                          │
├──────────────────────────┤
│     BEZEL  ~20px         │  ← тёмная рамка
├──────────────────────────┤
│                          │
│       CLICK WHEEL        │  ← 45% высоты устройства
│    (круговой элемент)    │
│                          │
└──────────────────────────┘
```

Единица масштабирования: `vmin` — сохраняет пропорции на всех моделях iPhone.

### 3.4 Click Wheel — визуал

- Большой круг: `width: 70vmin; height: 70vmin`
- Материал: brushed silver (CSS radial-gradient + noise texture)
- 4 кнопки — touch zones на дуговых секторах (~70° каждая)
- Центральная кнопка: отдельный круг `30%` от диаметра колеса
- Кольцевая зона между кнопками и центром = прокрутка

```css
.click-wheel {
  background:
    repeating-linear-gradient(
      90deg,
      transparent,
      transparent 1px,
      rgba(255, 255, 255, 0.03) 1px,
      rgba(255, 255, 255, 0.03) 2px
    ),
    radial-gradient(
      ellipse at 30% 30%,
      #e0e0e0,
      #b8b8b8 40%,
      #c8c8c8 60%,
      #d0d0d0
    );
  box-shadow:
    0 4px 20px rgba(0, 0, 0, 0.6),
    inset 0 1px 2px rgba(255, 255, 255, 0.4);
}
```

### 3.5 Анимации

| Действие              | Анимация               | Длительность | Easing      |
| --------------------- | ---------------------- | ------------ | ----------- |
| Вход в подменю        | Слайд влево            | 200ms        | ease-out    |
| Назад (MENU)          | Слайд вправо           | 200ms        | ease-out    |
| Синее выделение       | Скользит вверх/вниз    | 80ms         | ease-out    |
| Смена трека (обложка) | Въезжает сбоку         | 300ms        | ease-in-out |
| Cover Flow            | Linked to scroll       | —            | linear      |
| Нажатие CENTER        | scale(0.92) → scale(1) | 80ms + 80ms  | ease        |
| Now Playing           | Слайд снизу            | 300ms        | spring      |
| Скачивание (иконка ⬇) | Пульсирует opacity     | 1000ms       | ease-in-out |

---

## 4. Все экраны и User Flow

### 4.1 Главное меню (Main Menu)

```
┌──────────────────────────────┐
│ ♪  SoundCloud                │
├──────────────────────────────┤
│ > Music                      │
│   Feed                       │
│   Search                     │
│   Settings                   │
└──────────────────────────────┘
```

Split-screen (если трек играет):

```
┌───────────────┬──────────────┐
│ > Music       │  [обложка]   │
│   Feed        │  Track Name  │
│   Search      │  Artist      │
│   Settings    │              │
└───────────────┴──────────────┘
```

### 4.2 Music → подменю (Вариант C)

```
┌──────────────────────────────┐
│ ◄  Music                     │
├──────────────────────────────┤
│ > Cover Flow                 │
│   Playlists                  │
│   Liked Tracks               │
│   Artists                    │
│   Albums                     │
│   Songs                      │
│   Downloads                  │
│   Search                     │
└──────────────────────────────┘
```

### 4.3 Playlists экран

```
┌──────────────────────────────┐
│ ◄  Playlists                 │
├──────────────────────────────┤
│ > On-The-Go           3 ►   │  ← всегда первый
│   Techno Mix       ⬇ 8/23   │  ← скачивается
│   Ambient             ⬇  ►  │  ← полностью скачан
│   Deep House             ►  │  ← не скачан
│   Chill Vibes            ►  │
└──────────────────────────────┘
```

При входе в плейлист:

```
┌──────────────────────────────┐
│ ◄  Techno Mix     ⬇ Download │  ← кнопка Download справа
├──────────────────────────────┤
│ > Floating Points — LesAlpX ⬇│
│   Mount Kimbie — You Took…   │
│   Four Tet — Parallel…    ⬇  │
│   Bicep — Glue               │
└──────────────────────────────┘
```

- `⬇` перед треком = скачан и доступен офлайн
- `⬇ 8/23` у плейлиста = 8 из 23 треков скачаны
- `⬇` без числа = всё скачано

### 4.4 On-The-Go экран

```
┌──────────────────────────────┐
│ ◄  On-The-Go          Clear  │  ← Clear очищает список
├──────────────────────────────┤
│ > Floating Points — LesAlpX  │
│   Four Tet — Parallel…       │
│   Bicep — Glue               │
│                              │
│   [пусто если ничего нет]    │
└──────────────────────────────┘
```

Добавление трека в On-The-Go: CENTER hold на любом треке → контекстное меню.

### 4.5 Downloads экран

```
┌──────────────────────────────┐
│ ◄  Downloads     3,2 GB used │
├──────────────────────────────┤
│ > Techno Mix        23 tracks│
│   Ambient           14 tracks│
│   Four Tet — Parall…  single │
│   Bicep — Glue        single │
│                              │
│   [Delete All Downloads]     │
└──────────────────────────────┘
```

### 4.6 Context Menu (CENTER hold на треке)

```
┌──────────────────────────────┐
│  Four Tet — Parallel         │
├──────────────────────────────┤
│ > Add to On-The-Go           │
│   Download                   │  ← или "Remove Download" если уже скачан
│   Like / Unlike              │
│   Go to Artist               │
│   Go to Album                │
│   Cancel                     │
└──────────────────────────────┘
```

### 4.7 Feed (лента)

```
┌──────────────────────────────┐
│ ◄  Feed                      │
├──────────────────────────────┤
│ > Floating Points — LesAlpX  │
│   Mount Kimbie — You Took…   │
│   ♪ Four Tet — Parallel…     │  ← ♪ = сейчас играет
│   Bicep — Glue               │
│   Jamie xx — In Colour       │
│   ↓ Loading...               │
└──────────────────────────────┘
```

### 4.8 Now Playing экран

```
┌──────────────────────────────┐
│ ◄                  ⇄  ↻  ⬇  │  ← shuffle, repeat, download
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │      ALBUM ART         │  │
│  │   (~70% ширины)        │  │
│  └────────────────────────┘  │
│  Track Name (marquee)        │
│  Artist Name                 │  ← dim
│  Album Name                  │  ← dim, меньше
│                              │
│  ────────────●───────────    │
│  1:23                -3:10   │
└──────────────────────────────┘
```

- Колесо в Now Playing = громкость (volume overlay на 1.5с)
- CENTER hold = контекстное меню (лайк, Add to On-The-Go, Download)

### 4.9 Settings экран

```
┌──────────────────────────────┐
│ ◄  Settings                  │
├──────────────────────────────┤
│   SoundCloud Token      ►    │
│   Shuffle               Off  │
│   Repeat                Off  │
│   Clicker               Both │
│   EQ                    Flat │
│   Volume Limit          Off  │
│   Storage               ►    │  ← показывает Downloads + очистка
│   About                 ►    │
└──────────────────────────────┘
```

### 4.10 Полный User Flow

```
Запуск
  ↓
Токен? → нет → Settings → ввести токен
  ↓ да
Main Menu
  ├── Music
  │   ├── Cover Flow (landscape)
  │   ├── Playlists
  │   │   ├── On-The-Go → воспроизвести/добавить/очистить
  │   │   └── [SC Playlist] → треки → Play / Download / CENTER hold
  │   ├── Liked Tracks → треки → Now Playing
  │   ├── Artists → Artist → Albums → Tracks → Now Playing
  │   ├── Albums → Tracks → Now Playing
  │   ├── Songs → Now Playing
  │   ├── Downloads → Плейлисты/треки (офлайн) → Now Playing
  │   └── Search → Results → Now Playing
  ├── Feed → треки → Now Playing
  └── Settings

CENTER hold на треке (где угодно):
  → Add to On-The-Go
  → Download / Remove Download
  → Like / Unlike
  → Go to Artist / Album
```

---

## 5. Click Wheel — полная механика

### 5.1 Определение жеста вращения

```typescript
interface WheelState {
  isTracking: boolean;
  startAngle: number;
  lastAngle: number;
  totalDelta: number;
  lastEventTime: number;
  velocity: number; // градусов/мс
}

function getAngle(touch: Touch, center: { x: number; y: number }): number {
  return (
    Math.atan2(touch.clientY - center.y, touch.clientX - center.x) *
    (180 / Math.PI)
  );
}
```

### 5.2 Зоны касания

```
         MENU zone (top, ~70°)
        ╱──────────────╲
PREV   │  (кольцевая    │  NEXT
zone   │   прокрутка)   │  zone
(left) │                │  (right)
       │  ┌──────────┐  │
        ╲  │  CENTER  │  ╱
         ╲─┤  button  ├─╱
           └──────────┘
              PLAY zone (bottom, ~70°)
```

### 5.3 Ускорение и momentum

```typescript
function getScrollSteps(velocity: number): number {
  if (velocity < 0.5) return 1;
  if (velocity < 1.5) return 2;
  if (velocity < 3.0) return 4;
  return 8;
}

function startMomentum(velocity: number, direction: 1 | -1) {
  let v = velocity;
  const FRICTION = 0.92;
  function tick() {
    if (Math.abs(v) < 0.1) return;
    scrollBy(direction * getScrollSteps(v));
    v *= FRICTION;
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
```

### 5.4 Граница списка ("стена")

- Haptic: `NotificationType.Warning` (двойной тик)
- Звук: `boundary.wav`
- Визуально: список не двигается, лёгкое "дрожание" (translateX ±3px, 50ms)

### 5.5 Схема событий

```
touchstart на кольце → запомнить startAngle, время
touchmove → delta угла → velocity → каждые ~10° → onStep()
  onStep() → scroll N пунктов + Haptic.Light + tick.wav + анимация 80ms
touchend → если velocity > MIN → startMomentum()

touchstart CENTER → scale(0.92) + Haptic.Medium
touchend CENTER → scale(1) → действие
touchstart CENTER (hold >500ms) → контекстное меню

touchstart BUTTON → highlight + Haptic.Medium
touchend BUTTON → действие
```

---

## 6. Touch Mode — режим тачскрина

### 6.1 Концепция

Вариант B: корпус iPod сохраняется, но вместо колеса внизу — компактная тач-полоса с кнопками. Экран занимает ~85% высоты вместо 55%. Скролл — нативный пальцем.

```
┌──────────────────────────┐
│  STATUS BAR              │
├──────────────────────────┤
│                          │
│                          │
│   SCREEN AREA  (~85%)    │  ← нативный скролл, больше контента
│                          │
│                          │
│                          │
│                          │
├──────────────────────────┤
│ ◄  [art] Track   ▶  ►|  │  ← TOUCH CONTROL BAR (~15%)
└──────────────────────────┘
```

### 6.2 Переключение режима

```typescript
// src/stores/settings.ts
export type ControlMode = "wheel" | "touch";

export const controlModeAtom = atom<ControlMode>(
  (localStorage.getItem("sc_control_mode") as ControlMode) ?? "wheel",
);

// При изменении сохранять:
export const setControlModeAtom = atom(null, (_get, set, mode: ControlMode) => {
  set(controlModeAtom, mode);
  localStorage.setItem("sc_control_mode", mode);
});
```

Переключение в Settings → Control Mode → Click Wheel / Touch.
Применяется мгновенно, без перезапуска.

```
Settings
├── Control Mode
│   ├── ✓ Click Wheel
│   └──   Touch
```

### 6.3 IpodShell — единственная точка расхождения

```typescript
// src/components/ipod/IpodShell.tsx
export function IpodShell() {
  const mode = useAtomValue(controlModeAtom);

  return (
    <div className="ipod-body">
      <StatusBar />
      <ScreenArea heightPercent={mode === 'wheel' ? 55 : 85}>
        <CurrentScreen />   {/* одинаково в обоих режимах */}
      </ScreenArea>
      <Bezel />
      {mode === 'wheel'
        ? <ClickWheel />         // колесо
        : <TouchControlBar />    // тач-полоса
      }
    </div>
  );
}
```

Все экраны (`FeedScreen`, `PlaylistsScreen`, `NowPlayingScreen` и т.д.) — **одинаковые** в обоих режимах. Только лейаут оболочки меняется.

### 6.4 TouchControlBar — визуал и взаимодействие

```
┌──────────────────────────────────────────────────────┐
│  ◄   │  [обложка 40x40]  Track — Artist  │  ▶▶  ►|  │
│ back │     (tap → Now Playing)           │           │
└──────────────────────────────────────────────────────┘
```

- `◄` — назад (pop навигации)
- Обложка + название — tap открывает Now Playing
- `▶▶` — play/pause
- `►|` — следующий трек
- Высота полосы: `~70px` фиксированная

```typescript
// src/components/ipod/TouchControlBar.tsx
export function TouchControlBar() {
  const currentTrack = useAtomValue(currentTrackAtom);
  const isPlaying = useAtomValue(isPlayingAtom);
  const { pop } = useMenuNavigation();
  const { playPause, playNext } = usePlayer();
  const { push } = useMenuNavigation();

  return (
    <div className="touch-control-bar">
      <button onClick={pop}>◄</button>

      <div onClick={() => push({ id: 'now-playing' })}>
        <img src={currentTrack?.artwork_url} />
        <span>{currentTrack?.title} — {currentTrack?.user.username}</span>
      </div>

      <button onClick={playPause}>{isPlaying ? '▶▶' : '▶'}</button>
      <button onClick={playNext}>►|</button>
    </div>
  );
}
```

### 6.5 Навигация в Touch режиме

**Назад:**

- Кнопка `◄` в TouchControlBar (всегда видна)
- Свайп правым краем экрана (системный iOS swipe)

**Выбор пункта:** тап на строке списка.

**Контекстное меню:** long press (500ms) — идентично MENU hold в wheel режиме.

**Скролл списков:** нативный `overflow-y: scroll` с `scrollbar: none`.

```typescript
// В wheel режиме скролл заблокирован, управляется useClickWheel:
// touch-action: none; overflow: hidden;

// В touch режиме — нативный:
// touch-action: pan-y; overflow-y: scroll;
```

### 6.6 Now Playing в Touch режиме

Полноэкранный, как Spotify/Apple Music. Открывается tap на полосе или на треке.

```
┌──────────────────────────┐
│ ╲                    ⋯   │  ← свайп вниз = свернуть
├──────────────────────────┤
│                          │
│      [ALBUM ART]         │  ← свайп влево = следующий трек
│   (квадрат, большой)     │     свайп вправо = предыдущий
│                          │     tap = play/pause
│  Track Name (marquee)    │
│  Artist Name        ♡    │  ← лайк
│                          │
│  ─────────●──────────    │  ← draggable scrubber
│  1:23            -3:10   │
│                          │
│   |◄◄   ▶II   ▶▶|    ↻  │
│  🔈 ──────────────── 🔊  │
└──────────────────────────┘
```

Закрытие: свайп вниз (dismiss gesture) → возврат к предыдущему экрану с TouchControlBar внизу.

```typescript
// src/components/screens/NowPlayingTouchScreen.tsx
const bindCover = useDrag(({ swipe: [swipeX, swipeY] }) => {
  if (swipeX === -1) playNext();
  if (swipeX === 1) playPrev();
  if (swipeY === 1) pop(); // свайп вниз = закрыть
});

const bindProgress = useDrag(({ xy: [x], memo }) => {
  const ratio = (x - barLeft) / barWidth;
  seek(ratio * duration);
  return memo;
});
```

### 6.7 Сравнение режимов

| Аспект            | Wheel режим               | Touch режим                      |
| ----------------- | ------------------------- | -------------------------------- | -------- | ---------------------------------- |
| Высота экрана     | 55%                       | 85%                              |
| Скролл            | useClickWheel (управляем) | Нативный палец                   |
| Назад             | Кнопка MENU на колесе     | `◄` в полосе + свайп             |
| Play/Pause        | ►II кнопка колеса         | Tap на обложке / кнопка в полосе |
| Next/Prev         | ►                         | /                                | ◄ кнопки | Свайп на обложке / кнопка в полосе |
| Контекстное меню  | CENTER hold               | Long press                       |
| Громкость         | Колесо в Now Playing      | Slider в Now Playing             |
| Haptics           | Каждый шаг колеса (Light) | Только key actions (Medium)      |
| Целевая аудитория | Ценители ретро-эстетики   | Все остальные                    |

### 6.8 Зависимость

```bash
npm install @use-gesture/react
```

```typescript
import { useDrag } from "@use-gesture/react";
// Надёжная кросс-платформенная обработка touch/mouse жестов
// Работает в WKWebView и Android WebView без проблем
```

---

## 7. Cover Flow

### 6.1 Активация

- Поворот в landscape → `orientationchange` → анимированный переход 400ms
- В Cover Flow: контент из `sc.playlists()` + Albums из лайков

### 6.2 CSS 3D расположение

```css
.cover.active {
  transform: perspective(600px) rotateY(0deg) translateX(0) scale(1);
  z-index: 10;
}
.cover.prev-1 {
  transform: perspective(600px) rotateY(70deg) translateX(-120%) scale(0.85);
}
.cover.prev-2 {
  transform: perspective(600px) rotateY(70deg) translateX(-200%) scale(0.7);
}
/* next-1, next-2 — зеркально */
```

### 6.3 Отражение

```css
.cover-reflection {
  transform: scaleY(-1);
  opacity: 0.3;
  mask-image: linear-gradient(transparent 30%, black);
}
```

### 6.4 Взаимодействие

- Прокрутка колеса = горизонтальный листинг альбомов
- Snap к центру: 250ms spring easing
- CENTER → track list выезжает снизу (sheet, 300ms)
- `⬇` индикатор на обложках скачанных плейлистов

---

## 7. Haptics и звуки

### 7.1 Таблица событий

| Событие              | iOS (Taptic Engine)        | Android (Vibrator)       |
| -------------------- | -------------------------- | ------------------------ |
| Шаг прокрутки        | `ImpactStyle.Light`        | `vibrate(10)`            |
| Нажатие кнопки       | `ImpactStyle.Medium`       | `vibrate(20)`            |
| Выбор пункта         | `ImpactStyle.Medium`       | `vibrate(20)`            |
| Воспроизведение      | `ImpactStyle.Heavy`        | `vibrate(40)`            |
| Граница списка       | `NotificationType.Warning` | `vibrate([10,30,10])`    |
| Лайк                 | `NotificationType.Success` | `vibrate([10,20,10,20])` |
| Скачивание завершено | `NotificationType.Success` | `vibrate([20,10,20])`    |
| Ошибка               | `NotificationType.Error`   | `vibrate([30,20,30])`    |
| Cover Flow           | `ImpactStyle.Light`        | `vibrate(8)`             |

### 7.2 Звуковые файлы

| Файл                | Когда                | Длительность |
| ------------------- | -------------------- | ------------ |
| `tick.wav`          | Каждый шаг колеса    | ~5ms         |
| `select.wav`        | Выбор пункта, вход   | ~30ms        |
| `back.wav`          | Нажатие MENU         | ~20ms        |
| `boundary.wav`      | Граница списка       | ~40ms        |
| `like.wav`          | Лайк                 | ~100ms       |
| `download-done.wav` | Трек/плейлист скачан | ~200ms       |

Через Web Audio API (не конфликтует с основным аудио).

### 7.3 Настройка Clicker

- **Off** — без звука и вибрации
- **Headphones** — только в наушниках
- **Speaker** — только через динамик
- **Both** (default)

---

## 8. Swift-плагины (нативный слой)

### 8.1 AudioPlayerPlugin

```swift
@objc(AudioPlayerPlugin)
class AudioPlayerPlugin: CAPPlugin {
    static var shared: AudioPlayerPlugin?
    var player: AVQueuePlayer = AVQueuePlayer()

    @objc func play(_ call: CAPPluginCall)         // { url, title, artist, album, artworkUrl }
    @objc func pause(_ call: CAPPluginCall)
    @objc func next(_ call: CAPPluginCall)
    @objc func previous(_ call: CAPPluginCall)
    @objc func setQueue(_ call: CAPPluginCall)     // { tracks: [...], nextHref: String? }
    @objc func appendToQueue(_ call: CAPPluginCall)
    @objc func seek(_ call: CAPPluginCall)         // { position: Double }
    @objc func setVolume(_ call: CAPPluginCall)    // { volume: Float }
    @objc func getState(_ call: CAPPluginCall)     // → { track, position, isPlaying, queue }
    @objc func setCredentials(_ call: CAPPluginCall) // { token, proxyUrl }

    // Events → JS:
    // "trackChanged"  { track: TrackInfo }
    // "playbackState" { isPlaying, position, duration }
    // "queueLow"      { remaining: Int }
}
```

Singleton через `AudioPlayerPlugin.shared` — все три плагина используют один `AVQueuePlayer`.

### 8.2 LockScreenPlugin

```swift
@objc(LockScreenPlugin)
class LockScreenPlugin: CAPPlugin {
    @objc func updateNowPlaying(_ call: CAPPluginCall)   // метаданные + обложка
    @objc func updateProgress(_ call: CAPPluginCall)     // { position, duration, rate }
    @objc func setLikeEnabled(_ call: CAPPluginCall)     // { isLiked: Bool }

    // MPRemoteCommandCenter:
    // play, pause, next, previous → нотифицирует JS
    // changePlaybackPosition → seek
    // likeCommand → "likePressed" event → JS лайкает трек через SC API
}
```

**Кнопка лайка на экране блокировки — главная фича, недостижимая в PWA.**

### 8.3 QueueManagerPlugin (бесконечный фон)

```swift
@objc(QueueManagerPlugin)
class QueueManagerPlugin: CAPPlugin {
    private var accessToken: String = ""
    private var proxyUrl: String = ""
    private var nextHref: String? = nil
    private var isFetching: Bool = false

    @objc func initialize(_ call: CAPPluginCall)
    // { token, proxyUrl, nextHref }

    // Срабатывает когда AVQueuePlayer заканчивает трек:
    @objc private func playerItemDidFinish() {
        let remaining = AudioPlayerPlugin.shared!.player.items().count
        if remaining <= 2 && !isFetching { fetchNextPage() }
    }

    private func fetchNextPage() {
        // URLSession.dataTask → proxyUrl/stream?next_href=...
        // Парсит JSON → processTracks() → resolveStreamUrl() → AVQueuePlayer.insert()
        // Всё нативно, JS заморожен — не участвует
    }
}
```

### 8.4 DownloadPlugin

```swift
@objc(DownloadPlugin)
class DownloadPlugin: CAPPlugin {

    @objc func downloadTrack(_ call: CAPPluginCall)
    // { trackId, streamUrl, title, artist, artworkUrl }
    // → URLSession.downloadTask → Documents/downloads/track_{id}.mp3

    @objc func deleteTrack(_ call: CAPPluginCall)
    // { trackId } → удаляет файл

    @objc func getDownloadedTracks(_ call: CAPPluginCall)
    // → [{ trackId, filePath, fileSize }]

    @objc func getStorageUsed(_ call: CAPPluginCall)
    // → { bytes: Int64 }

    // Events → JS:
    // "downloadProgress"  { trackId, progress: Float (0-1) }
    // "downloadComplete"  { trackId, filePath }
    // "downloadError"     { trackId, error }
}
```

**URLSession.downloadTask** — скачивает в фоне даже при заблокированном экране.
После скачивания JS записывает метаданные в Dexie.js (IndexedDB).

---

## 9. Бесконечное фоновое воспроизведение

### 9.1 Проблема PWA

```
Экран заблокирован → WKWebView JS заморожен
→ последний трек заканчивается
→ JS не может fetch() следующую страницу
→ воспроизведение останавливается
```

### 9.2 Решение через QueueManagerPlugin

```
[AVQueuePlayer] трек N заканчивается → N+1
[AVQueuePlayer] трек N+1, в очереди остался 1 трек
  ↓
[QueueManagerPlugin.playerItemDidFinish()]
  remaining <= 2 → fetchNextPage()
  ↓
[URLSession.dataTask] → proxy/stream?next_href=X   ← НАТИВНЫЙ HTTP
  ↓
[processTracks()] → resolveStreamUrl() → AVQueuePlayer.insert()
  ↓
Воспроизведение продолжается бесконечно
JS не участвует
```

### 9.3 Синхронизация при разблокировке

```typescript
// JS просыпается → синхронизирует состояние
const state = await AudioPlayerPlugin.getState();
store.set(currentTrackAtom, state.track);
store.set(progressAtom, state.position);
store.set(queueAtom, state.queue);
```

### 9.4 Info.plist

```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
    <string>fetch</string>
</array>
```

---

## 10. Плейлисты и On-The-Go

### 10.1 SoundCloud плейлисты

Уже есть `sc.playlists()` в `api.ts` → `GET /me/playlists`.
Для треков плейлиста: `GET /playlists/{id}?representation=full` (все треки сразу, до 200).

```typescript
// Новый метод в api.ts
playlistTracks: (id: number) =>
  apiGet<ScPlaylist>(`/playlists/${id}`, {
    params: { representation: "full" },
  });
```

### 10.2 On-The-Go плейлист

**Jotai атом:**

```typescript
// src/stores/onthego.ts
export const onTheGoQueueAtom = atom<ScTrack[]>(
  JSON.parse(localStorage.getItem("sc_otg_queue") ?? "[]"),
);

// При изменении — сохранять в localStorage
export const onTheGoQueueWriteAtom = atom(
  null,
  (get, set, tracks: ScTrack[]) => {
    set(onTheGoQueueAtom, tracks);
    localStorage.setItem("sc_otg_queue", JSON.stringify(tracks));
  },
);
```

**Добавление трека** (CENTER hold → "Add to On-The-Go"):

```typescript
const addToOnTheGo = useCallback((track: ScTrack) => {
  setOnTheGoQueue((prev) => [...prev, track]);
  // Haptic Success + звук select.wav
}, []);
```

**Воспроизведение On-The-Go:**

- Выбрать On-The-Go в Playlists → play все треки очереди
- Трек внутри On-The-Go → START с этого трека
- MENU-кнопка "Clear" → очищает весь список

**Сохранение в localStorage** — On-The-Go переживает перезапуск приложения.

### 10.3 Статусы загрузки плейлистов

```typescript
type PlaylistDownloadStatus = {
  playlistId: number;
  totalTracks: number;
  downloadedCount: number;
  isDownloading: boolean;
};

// Derived atom
export const playlistDownloadStatusAtom = atom((get) => {
  const downloadedIds = get(downloadedTrackIdsAtom); // Set<number>
  // computed per playlist
});
```

---

## 11. Загрузки (Downloads)

### 11.1 Хранилище

**Два уровня:**

```
IndexedDB (Dexie.js)              @capacitor/filesystem
─────────────────────             ──────────────────────
src/lib/downloads.ts              Нативная файловая система
                                  /Documents/downloads/
DownloadedTrack:                    track_12345.mp3
  trackId: number                   track_67890.mp3
  title: string
  artist: string
  artworkUrl: string
  filePath: string     ──────────► путь к файлу
  downloadedAt: Date
  duration: number
  fileSize: number

DownloadedPlaylist:
  playlistId: number
  name: string
  trackIds: number[]   ──────────► какие треки скачаны
  downloadedAt: Date
```

### 11.2 Dexie.js схема

```typescript
// src/lib/downloads.ts
import Dexie, { type Table } from "dexie";

interface DownloadedTrack {
  trackId: number;
  title: string;
  artist: string;
  artworkUrl: string;
  filePath: string; // путь в @capacitor/filesystem
  downloadedAt: Date;
  duration: number; // секунды
  fileSize: number; // байты
}

interface DownloadedPlaylist {
  playlistId: number;
  name: string;
  artworkUrl: string;
  trackIds: number[];
  downloadedAt: Date;
}

class DownloadsDB extends Dexie {
  tracks!: Table<DownloadedTrack>;
  playlists!: Table<DownloadedPlaylist>;

  constructor() {
    super("SoundCloudPodDownloads");
    this.version(1).stores({
      tracks: "trackId, downloadedAt",
      playlists: "playlistId, downloadedAt",
    });
  }
}

export const db = new DownloadsDB();
```

### 11.3 Jotai атомы загрузок

```typescript
// src/stores/downloads.ts
export const downloadedTrackIdsAtom = atom<Set<number>>(new Set());
// Загружается при старте из Dexie: db.tracks.toArray() → ids

export const downloadQueueAtom = atom<DownloadJob[]>([]);
// Текущие активные загрузки с прогрессом

export const activeDownloadCountAtom = atom(
  (get) =>
    get(downloadQueueAtom).filter((j) => j.status === "downloading").length,
);
```

### 11.4 Поток загрузки одного трека

```typescript
async function downloadTrack(track: ScTrack) {
  // 1. Добавить в очередь
  addToQueue({ trackId: track.id, status: 'pending' });

  // 2. Разрезолвить stream URL (успевает до истечения 5 мин)
  const transcoding = sc.streams(track);
  const streamUrl = await sc.resolveStreamUrl(transcoding!);

  // 3. Передать в нативный плагин для фоновой загрузки
  await DownloadPlugin.downloadTrack({
    trackId: track.id,
    streamUrl,
    title: track.title,
    artist: track.user.username,
    artworkUrl: track.artwork_url ?? '',
  });

  // 4. Слушать progress events от плагина
  DownloadPlugin.addListener('downloadProgress', ({ trackId, progress }) => {
    updateQueueItem(trackId, { progress });
  });

  // 5. По завершении — записать метаданные в Dexie
  DownloadPlugin.addListener('downloadComplete', async ({ trackId, filePath }) => {
    await db.tracks.put({ trackId, filePath, title: track.title, ... });
    addToDownloadedIds(trackId);
    removeFromQueue(trackId);
    // Haptic Success + download-done.wav
  });
}
```

### 11.5 Загрузка всего плейлиста

```typescript
async function downloadPlaylist(playlist: ScPlaylist) {
  // Загружаем треки по одному (не параллельно — щадим батарею)
  for (const track of playlist.tracks) {
    if (downloadedTrackIds.has(track.id)) continue; // уже скачан
    await downloadTrack(track);
    await delay(500); // небольшая пауза между треками
  }

  // Записать плейлист в Dexie
  await db.playlists.put({
    playlistId: playlist.id,
    name: playlist.title,
    trackIds: playlist.tracks.map((t) => t.id),
  });
}
```

### 11.6 Офлайн воспроизведение

```typescript
async function resolvePlaybackUrl(track: ScTrack): Promise<string> {
  // Проверить есть ли локальный файл
  const downloaded = await db.tracks.get(track.id);
  if (downloaded) {
    // Конвертировать filesystem path в воспроизводимый URI
    return Capacitor.convertFileSrc(downloaded.filePath);
  }
  // Иначе — резолвить через SC API
  const transcoding = sc.streams(track);
  return sc.resolveStreamUrl(transcoding!);
}
```

### 11.7 Состояния в UI

| Состояние   | Иконка         | Поведение                             |
| ----------- | -------------- | ------------------------------------- |
| Не скачан   | (нет)          | Стрим при воспроизведении             |
| Скачивается | `⬇` пульсирует | Прогресс в Download очереди           |
| Скачан      | `⬇` статичная  | Воспроизводится локально              |
| Ошибка      | `⚠`            | Retry доступен через контекстное меню |

---

## 12. Кросс-платформа iOS + Android

### 12.1 iOS

| Фича                | Реализация                                         |
| ------------------- | -------------------------------------------------- |
| Фоновое аудио       | `AVAudioSession.Category.playback`                 |
| Экран блокировки    | `MPRemoteCommandCenter` + `MPNowPlayingInfoCenter` |
| Кнопка лайка        | `MPRemoteCommandCenter.likeCommand`                |
| Бесконечная очередь | QueueManagerPlugin (Swift, URLSession)             |
| Загрузки            | DownloadPlugin (Swift, URLSession.downloadTask)    |
| Haptics             | `@capacitor/haptics` → Taptic Engine               |
| Установка           | AltStore Classic                                   |

### 12.2 Android

| Фича             | Реализация                                |
| ---------------- | ----------------------------------------- |
| Фоновое аудио    | Foreground Service + уведомление          |
| Экран блокировки | `MediaSessionCompat` в Foreground Service |
| Кнопка лайка     | Custom Action в MediaSession notification |
| Загрузки         | Android `DownloadManager` API             |
| Haptics          | `@capacitor/haptics` → `Vibrator`         |
| Установка        | APK с GitHub Releases                     |

```kotlin
// AudioService.kt — Foreground Service
class AudioService : Service() {
    private lateinit var mediaSession: MediaSessionCompat

    override fun onCreate() {
        setupMediaSession()
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    private fun setupMediaSession() {
        mediaSession = MediaSessionCompat(this, "SoundCloudPod")
        mediaSession.setCallback(object : MediaSessionCompat.Callback() {
            override fun onPlay() { /* resume */ }
            override fun onPause() { /* pause */ }
            override fun onSkipToNext() { /* next */ }
            override fun onSkipToPrevious() { /* prev */ }
            override fun onCustomAction(action: String, extras: Bundle?) {
                if (action == "LIKE") { /* → JS via Capacitor bridge */ }
            }
        })
    }
}
```

### 12.3 Один UI для обеих платформ

```typescript
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

// Одинаковый вызов, разная реализация:
await Haptics.impact({ style: ImpactStyle.Light });

// Платформо-специфичная логика только там где нужно:
if (Capacitor.getPlatform() === "ios") {
  await AudioPlayerPlugin.setCredentials({ token, proxyUrl });
} else {
  // Android: credentials передаются через Capacitor bridge в AudioService
}
```

---

## 13. GitHub Actions — сборка без Mac

### 13.1 Единовременная настройка (нужен Mac ~30 мин)

1. MacInCloud ($1–2) / Mac друга
2. Xcode → Accounts → добавить Apple ID
3. Создать Development Certificate
4. Keychain → экспорт → `.p12` с паролем
5. Скачать Provisioning Profile
6. `base64 -i certificate.p12 | pbcopy` → GitHub Secret
7. Добавить secrets: `SIGNING_CERTIFICATE_P12_DATA`, `SIGNING_CERTIFICATE_PASSWORD`, `PROVISIONING_PROFILE_DATA`, `APPLE_TEAM_ID`

### 13.2 Workflow (iOS + Android)

```yaml
name: Build

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }

      - run: npm ci
      - run: npm run build
      - run: npx cap sync ios

      - uses: actions/cache@v4
        with:
          path: ios/Pods
          key: ${{ runner.os }}-pods-${{ hashFiles('ios/Podfile.lock') }}

      - run: cd ios && pod install

      - name: Import certificate
        env:
          P12_DATA: ${{ secrets.SIGNING_CERTIFICATE_P12_DATA }}
          P12_PASSWORD: ${{ secrets.SIGNING_CERTIFICATE_PASSWORD }}
        run: |
          echo "$P12_DATA" | base64 --decode > certificate.p12
          security create-keychain -p "temp" build.keychain
          security set-keychain-settings -lut 21600 build.keychain
          security unlock-keychain -p "temp" build.keychain
          security import certificate.p12 -k build.keychain -P "$P12_PASSWORD" -T /usr/bin/codesign
          security list-keychains -d user -s build.keychain
          security set-key-partition-list -S apple-tool:,apple: -k "temp" build.keychain

      - name: Import provisioning profile
        env:
          PROFILE_DATA: ${{ secrets.PROVISIONING_PROFILE_DATA }}
        run: |
          mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
          echo "$PROFILE_DATA" | base64 --decode > ~/Library/MobileDevice/Provisioning\ Profiles/profile.mobileprovision

      - name: Build & Archive
        run: |
          xcodebuild -workspace ios/App/App.xcworkspace \
            -scheme App -configuration Release \
            -destination generic/platform=iOS \
            -archivePath $RUNNER_TEMP/App.xcarchive \
            CODE_SIGN_STYLE=Manual \
            DEVELOPMENT_TEAM=${{ secrets.APPLE_TEAM_ID }} \
            archive

      - name: Export IPA
        run: |
          xcodebuild -exportArchive \
            -archivePath $RUNNER_TEMP/App.xcarchive \
            -exportPath $RUNNER_TEMP/ipa \
            -exportOptionsPlist ios/ExportOptions.plist

      - name: Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: build-${{ github.run_number }}
          files: ${{ runner.temp }}/ipa/*.ipa
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: "npm" }
      - uses: actions/setup-java@v4
        with: { distribution: "temurin", java-version: "17" }
      - run: npm ci && npm run build && npx cap sync android
      - run: cd android && ./gradlew assembleRelease
      - uses: actions/upload-artifact@v4
        with:
          name: app-release.apk
          path: android/app/build/outputs/apk/release/*.apk
```

---

## 14. Дистрибуция

### 14.1 iOS — AltStore Classic

1. Скачать AltServer (Windows) с altstore.io
2. iTunes + iCloud из Microsoft Store
3. AltServer в трее → Install AltStore → iPhone
4. Доверять Apple ID в Settings → General → VPN & Device Management
5. Открыть `.ipa` с GitHub Releases на iPhone → "Открыть в AltStore" → Install
6. AltServer в трее обновляет сертификат каждые 7 дней автоматически

**AltStore Source** для обновлений:

```json
{
  "name": "SoundCloud iPod",
  "apps": [
    {
      "name": "SoundCloud iPod",
      "bundleIdentifier": "com.yourname.soundcloudpod",
      "versions": [
        {
          "version": "1.0.0",
          "date": "2026-03-15",
          "downloadURL": "https://github.com/yourname/repo/releases/download/build-42/App.ipa",
          "size": 15000000,
          "minOSVersion": "16.0"
        }
      ]
    }
  ]
}
```

### 14.2 Android

1. GitHub Releases → скачать `.apk` в Chrome
2. Разрешить установку из браузера → Install

---

## 15. Миграция с текущего PWA

### 15.1 Что есть сейчас

```
src/
├── lib/
│   ├── api.ts          ✅ Переиспользуется полностью
│   │                      ScTrack, ScPlaylist, ScUser, sc.*, apiGet/Put/Delete
│   │                      sc.playlists() уже есть
│   ├── auth.ts         ✅ Переиспользуется полностью
│   ├── player.ts       ⚠️  Расширить: добавить Capacitor bridge
│   └── utils.ts        ✅ Переиспользуется
├── stores/
│   ├── auth.ts         ✅ Переиспользуется (accessTokenAtom, currentUserAtom)
│   └── player.ts       ⚠️  Расширить: добавить downloadQueueAtom, onTheGoQueueAtom
├── hooks/
│   └── usePlayer.ts    ⚠️  Расширить: синхронизация с нативным плагином
├── pages/
│   ├── Feed.tsx        🔄 Переписать под iPod MenuScreen
│   ├── Search.tsx      🔄 Переписать под iPod MenuScreen
│   ├── Library.tsx     🔄 Переписать → Liked Tracks экран
│   ├── Settings.tsx    🔄 Переписать под iPod Settings
│   └── AuthResult.tsx  🗑️  Убрать (ручной токен → Settings)
├── components/
│   ├── layout/
│   │   ├── RootLayout.tsx   🔄 → IpodShell.tsx
│   │   └── BottomNav.tsx    🗑️  Убрать (навигация через Click Wheel)
│   └── player/
│       ├── MiniPlayer.tsx   🗑️  Убрать (Now Playing встроен в iPod UI)
│       └── NowPlaying.tsx   🔄 → NowPlayingScreen.tsx (iPod стиль)
└── App.tsx             🔄 Новая стековая навигация вместо React Router
```

### 15.2 Новые файлы

```
src/
├── lib/
│   └── downloads.ts         🆕 Dexie.js схема + DownloadPlugin bridge
├── stores/
│   ├── downloads.ts         🆕 downloadedTrackIdsAtom, downloadQueueAtom
│   └── onthego.ts           🆕 onTheGoQueueAtom
├── hooks/
│   └── useClickWheel.ts     🆕 детекция вращения, momentum
├── components/
│   ├── ipod/
│   │   ├── IpodShell.tsx    🆕 корпус (экран + колесо)
│   │   ├── ClickWheel.tsx   🆕 визуал + touch зоны
│   │   ├── StatusBar.tsx    🆕 верхняя полоска
│   │   ├── MenuScreen.tsx   🆕 список с выделением + анимации
│   │   └── CoverFlow.tsx    🆕 3D карусель
│   └── screens/
│       ├── MainMenu.tsx     🆕
│       ├── MusicMenu.tsx    🆕
│       ├── FeedScreen.tsx   🆕
│       ├── PlaylistsScreen.tsx 🆕
│       ├── OnTheGoScreen.tsx   🆕
│       ├── LikedScreen.tsx  🆕
│       ├── SongsScreen.tsx  🆕
│       ├── ArtistsScreen.tsx 🆕
│       ├── AlbumsScreen.tsx 🆕
│       ├── DownloadsScreen.tsx 🆕
│       ├── SearchScreen.tsx 🆕
│       ├── NowPlayingScreen.tsx 🆕
│       ├── SettingsScreen.tsx 🆕
│       └── ContextMenu.tsx  🆕
ios/App/Plugins/
│   ├── AudioPlayerPlugin.swift 🆕
│   ├── LockScreenPlugin.swift  🆕
│   ├── QueueManagerPlugin.swift 🆕
│   └── DownloadPlugin.swift    🆕
android/app/src/main/java/.../
│   └── AudioService.kt         🆕
.github/workflows/
│   └── build.yml               🆕
```

### 15.3 Стратегия миграции роутинга

Текущий React Router заменяется стековой навигацией:

```typescript
// Вместо <Routes><Route path="/feed"> ...
// Используем стек экранов:

type Screen =
  | { id: "main" }
  | { id: "music" }
  | { id: "feed" }
  | { id: "playlists" }
  | { id: "playlist-detail"; playlistId: number }
  | { id: "on-the-go" }
  | { id: "liked" }
  | { id: "artists" }
  | { id: "artist-detail"; artistId: number }
  | { id: "albums" }
  | { id: "album-detail"; albumId: number }
  | { id: "songs" }
  | { id: "downloads" }
  | { id: "search" }
  | { id: "now-playing" }
  | { id: "settings" }
  | { id: "context-menu"; track: ScTrack };

const navigationStackAtom = atom<Screen[]>([{ id: "main" }]);

// Push: CENTER нажат
const push = (screen: Screen) => setStack((s) => [...s, screen]);

// Pop: MENU нажат
const pop = () => setStack((s) => s.slice(0, -1));

// Текущий экран:
const currentScreen = stack[stack.length - 1];
```

---

## 16. Поэтапный план с трудностями

---

### Этап 0: Capacitor + проект ✅ ВЫПОЛНЕНО

**Задачи:**

- [x] `npm install @capacitor/core @capacitor/ios @capacitor/android @capacitor/haptics @capacitor/filesystem @capacitor/status-bar`
- [x] `npx cap add ios && npx cap add android`
- [x] Настроить `capacitor.config.ts` (webDir: 'dist', androidScheme: 'https')
- [x] Убрать VitePWA плагин из `vite.config.ts`
- [x] `npm run build && npx cap sync` — выполнено успешно
- [x] GitHub Actions `build.yml` — iOS (без подписи, CODE_SIGNING_ALLOWED=NO) + Android APK debug
- [x] `npm install dexie` — для IndexedDB

**Трудности:**

- **CocoaPods версии.** На свежем macOS может стоять старый CocoaPods, несовместимый с Capacitor 6. Решение: `sudo gem install cocoapods` перед `pod install`
- **Xcode workspace vs xcodeproj.** Capacitor генерирует `.xcworkspace` — нужно открывать именно его, не `.xcodeproj`. Иначе CocoaPods-зависимости не подключаются
- **Вersionы Capacitor.** Capacitor 6 требует iOS 13+ и Xcode 15+. Проверить совместимость
- **`capacitor.config.ts` vs `capacitor.config.json`.** Ts-версия не поддерживается в некоторых CLI командах — использовать `.json` для production
- **Windows путь в wsl/git bash.** При `npx cap sync` могут быть проблемы с путями на Windows — использовать Git Bash или WSL

---

### Этап 1: iPod Layout и навигация (4–5 дней)

**Задачи:**

- [ ] `IpodShell.tsx` — корпус (экран сверху, bezel, колесо снизу)
- [ ] `StatusBar.tsx` — батарея, название, иконка трека
- [ ] `MenuScreen.tsx` — список с анимацией выделения
- [ ] `useMenuNavigation.ts` — стек экранов, push/pop
- [ ] Анимации слайда (200ms) между экранами
- [ ] Подключить Feed, Search, Settings как экраны
- [ ] `src/stores/settings.ts` — `controlModeAtom` ('wheel' | 'touch'), используется IpodShell для рендера нужного контрола

**Трудности:**

- **Dynamic Island / notch / старые iPhone.** Safe area insets разные на каждой модели. `IpodShell` должен учитывать `env(safe-area-inset-top)`. Иначе экран будет обрезан под Dynamic Island
- **Высота экрана.** iPhone SE (маленький) vs iPhone 16 Pro Max (огромный). Использование `vmin` может давать слишком маленькое колесо на маленьких экранах. Нужны min/max размеры
- **Анимация слайда.** Если анимация (200ms) запускается слишком часто (быстрое нажатие MENU), стек навигации может рассинхронизироваться с анимацией. Нужна блокировка input на время анимации
- **Виртуализация длинных списков.** `Songs` может содержать 1000+ лайкнутых треков. Обычный map → render всего DOM = лаг. Нужна виртуализация (только видимые строки в DOM). Использовать `@tanstack/react-virtual`
- **Клавиатура в Search.** При открытии нативной клавиатуры Capacitor resize-ит WebView. Нужно обработать `window.visualViewport` чтобы Search input оставался видимым

---

### Этап 2: Click Wheel (4–6 дней)

> ⚠️ Зависит от Этапа 1 — `IpodShell.tsx` и навигационный стек должны существовать до реализации колеса.

**Задачи:**

- [ ] `ClickWheel.tsx` — SVG или div с CSS зонами касания
- [ ] `useClickWheel.ts` — touchstart/move/end, угол, velocity, momentum
- [ ] Подключить к `useMenuNavigation` (вращение = scroll, CENTER = select, MENU = pop)
- [ ] Haptics (`@capacitor/haptics`) — тест на реальном iPhone
- [ ] Звуки (Web Audio API) — загрузить tick.wav, select.wav и др.
- [ ] Визуал колеса — brushed metal CSS
- [ ] Тест ускорения и momentum на устройстве

**Трудности:**

- **Точность определения зон.** Граница между "кольцом прокрутки" и "кнопочной дугой" сложно калибруется. Пальцы не всегда точно попадают. Решение: увеличить кнопочные зоны, уменьшить порог срабатывания
- **Ложные срабатывания.** При медленном начале движения система может интерпретировать прокрутку как нажатие кнопки. Нужен минимальный порог delta (~8–10px от начала) прежде чем считать это прокруткой
- **Momentum на WKWebView.** `requestAnimationFrame` внутри WKWebView может тормозить при одновременном воспроизведении аудио. Нужно профилировать
- **iOS Safari touch events.** WKWebView иногда "глотает" touchstart если элемент находится рядом с краем экрана (gesture-конфликт с system swipe). Решение: `overscroll-behavior: none` на body
- **Haptics только в Capacitor.** В браузере (при разработке через `npm run dev`) `@capacitor/haptics` не работает — нужен Capacitor context. Для dev: graceful fallback без haptics

---

### Этап 3: Now Playing (3–4 дня)

> ℹ️ На этом этапе аудио-бэкенд — существующий HTML5 `<audio>` из `src/lib/player.ts`. Swift-плагины (AVQueuePlayer) подключаются в Этапе 4. UI строится независимо от платформы.

**Задачи:**

- [ ] `NowPlayingScreen.tsx` — обложка, метаданные, прогресс
- [ ] Marquee (бегущая строка) для длинных названий
- [ ] Volume overlay при прокрутке колеса (зависит от Этапа 2 — Click Wheel должен существовать)
- [ ] Анимация смены трека (обложка въезжает сбоку)
- [ ] Контекстное меню (CENTER hold 500ms)
- [ ] Иконки shuffle/repeat/download в header

**Трудности:**

- **Marquee производительность.** CSS `animation: marquee linear infinite` создаёт layout thrashing на слабых устройствах. Решение: `transform: translateX()` вместо `left`, использовать `will-change: transform`
- **Прогресс-бар точность.** Обновление каждую секунду через `currentTimeAtom` вызывает re-render. Нужен локальный ref для анимации прогресса, не через глобальный atom
- **Обложки без artwork.** SC возвращает `artwork_url: null` для некоторых треков. Нужен fallback (генери��ованный градиент по цвету жанра или дефолтная иконка)
- **Volume overlay конфликт.** Когда пользователь прокручивает колесо в Now Playing, громкость меняется. Но если треки заканчиваются и QueueManager фетчит новые — нельзя допустить конфликт между scroll-volume и scroll-navigate. Нужно блокировать navigate-intent в режиме Now Playing

---

### Этап 4: Swift плагины iOS (7–10 дней)

**Задачи:**

- [ ] Создать Capacitor plugin template в Xcode для каждого плагина
- [ ] `AudioPlayerPlugin.swift` — AVQueuePlayer, singleton, AVAudioSession
- [ ] `LockScreenPlugin.swift` — MPRemoteCommandCenter + MPNowPlayingInfoCenter
- [ ] Добавить кнопку лайка: `likeCommand`
- [ ] `QueueManagerPlugin.swift` — наблюдатель очереди + URLSession fetch
- [ ] `DownloadPlugin.swift` — URLSession.downloadTask + Documents directory
- [ ] Зарегистрировать плагины в `AppDelegate.swift`
- [ ] Обновить `src/lib/player.ts` — вызывать AudioPlayerPlugin вместо HTML5 audio
- [ ] Тест бесконечного воспроизведения (заблокировать экран на 1 час)

**Трудности:**

- **Singleton AVQueuePlayer.** Все три плагина (Audio, LockScreen, QueueManager) должны использовать один инстанс `AVQueuePlayer`. Паттерн: `AudioPlayerPlugin.shared?.player`. Если `shared` == nil (плагин не инициализировался) — crash. Нужна защита
- **Регистрация плагинов.** Capacitor требует регистрировать плагины в `AppDelegate.swift` через `CAPBridgeViewController`. Если забыть — плагин есть в Swift, но JS его не видит (никакой ошибки, просто undefined)
- **MPRemoteCommandCenter likeCommand.** Документация Apple скудная. `likeCommand` появляется на экране блокировки только если `MPNowPlayingInfoPropertyDefaultPlaybackRate` установлен. Нужно обязательно передавать rate = 1.0 при каждом обновлении nowPlayingInfo
- **URLSession и proxy.** QueueManagerPlugin делает запросы через Cloudflare Worker. Нужно убедиться что в строке запроса есть `client_id` — иначе SC вернёт 401. А client_id нужно передать из JS при инициализации плагина
- **SC stream URL redirect.** SC отдаёт redirect (302) на реальный CDN URL. URLSession по умолчанию следует за redirect. Но иногда redirect требует тех же headers (Authorization) — нужно `URLSessionDelegate.urlSession(_:task:willPerformHTTPRedirection:)` чтобы добавить headers к redirect
- **Межплагинная коммуникация.** `QueueManagerPlugin` вызывает `AudioPlayerPlugin.shared!.player.insert()`. Это работает только если оба плагина в одном таргете. Убедиться что все Swift файлы в одном `App` таргете Xcode
- **DownloadPlugin путь к файлу.** `FileManager.default.urls(for: .documentDirectory)` возвращает путь который `@capacitor/filesystem` понимает как `DOCUMENTS`. Нужно конвертировать через `Capacitor.convertFileSrc()` на стороне JS для воспроизведения

---

### Этап 5: Плейлисты, On-The-Go, Downloads (5–7 дней)

**Задачи:**

- [ ] `PlaylistsScreen.tsx` — список SC плейлистов со статусом загрузки
- [ ] `OnTheGoScreen.tsx` — временный плейлист, Clear кнопка
- [ ] `ContextMenu.tsx` — Add to On-The-Go, Download, Like
- [ ] `src/lib/downloads.ts` — Dexie.js схема
- [ ] `src/stores/downloads.ts` — атомы
- [ ] `src/stores/onthego.ts` — On-The-Go атом с localStorage
- [ ] `DownloadsScreen.tsx` — список скачанного + Storage info
- [ ] Тест офлайн воспроизведения (airplane mode)
- [ ] Тест загрузки плейлиста из 50 треков

**Трудности:**

- **SC stream URL истекает за 5 мин.** Между вызовом `resolveStreamUrl()` и началом реальной загрузки должно пройти минимум времени. Если плейлист большой и предыдущие треки медленно скачиваются — URL последних треков протухнет. Решение: резолвить URL непосредственно перед скачиванием каждого трека, а не всех сразу
- **Dexie.js и Capacitor.** Dexie работает через IndexedDB браузера внутри WKWebView. На iOS 15 есть баг где IndexedDB quota может быть занижена. На iOS 16+ это исправлено. Минимальная версия iOS — 16.0
- **Большие плейлисты (200+ треков).** `GET /playlists/{id}?representation=full` возвращает все треки. Но SC ограничивает до ~50 треков в ответе — нужна пагинация. Проверить реальное поведение API
- **Concurrent downloads.** Если пользователь начинает скачивать несколько плейлистов одновременно — `URLSession.downloadTask` справится, но IndexedDB writes могут конфликтовать. Нужна очередь с mutex
- **Файловая система iOS.** Documents directory доступен пользователю через Files app. Это значит пользователь может случайно удалить скачанный трек. При следующем запуске приложения — нужно верифицировать что файлы из Dexie действительно существуют

---

### Этап 5.5: Touch Mode (3–4 дня)

**Задачи:**

- [ ] `npm install @use-gesture/react`
- [ ] `src/stores/settings.ts` — `controlModeAtom` с localStorage
- [ ] `IpodShell.tsx` — условный рендер `<ClickWheel>` vs `<TouchControlBar>`
- [ ] `TouchControlBar.tsx` — полоса с `◄`, мини-плеером, `▶`, `►|`
- [ ] Списки в touch режиме — включить `overflow-y: scroll`, убрать `touch-action: none`
- [ ] `NowPlayingTouchScreen.tsx` — свайп жесты на обложке, draggable scrubber, dismiss вниз
- [ ] Settings → Control Mode переключатель
- [ ] Тест обоих режимов на устройстве

**Трудности:**

- **`touch-action` конфликт.** В wheel режиме всему body стоит `touch-action: none` чтобы блокировать нативный скролл. В touch режиме нужно `touch-action: pan-y` для списков. Переключение должно происходить атомарно — иначе список будет одновременно и нативно скроллиться, и обрабатываться колесом

- **iOS swipe-back жест.** Системный свайп с левого края (iOS back gesture) конфликтует с `useDrag` если WKWebView перехватывает touch. Нужно разрешить системный жест через `WKWebView.allowsBackForwardNavigationGestures = false` + реализовать свой в JS (зона 20px от левого края)

- **Анимация dismiss Now Playing.** Свайп вниз чтобы закрыть Now Playing должен быть плавным (как iOS sheets). `useDrag` даёт raw координаты — нужно самому имплементировать spring-анимацию через CSS transition + transform. При половинном свайпе — snap обратно

- **Draggable scrubber точность.** `useDrag` возвращает координаты экрана, а нужны координаты относительно progress bar. Нужно `useRef` на bar-элементе + `getBoundingClientRect()` при начале drag, не при каждом move

- **Мини-плеер переполнение текста.** Название трека в TouchControlBar ограничено ~60% ширины между кнопками. Длинные названия нужно обрезать через `text-overflow: ellipsis`, а не marquee (marquee в такой маленькой полосе выглядит плохо)

- **Высота экрана при смене режима.** При переключении wheel → touch экран "прыгает" с 55% до 85%. Нужна анимация: `transition: height 300ms ease-in-out`. Но height в % плохо анимируется. Решение: анимировать через `max-height` или CSS grid row

---

### Этап 6: Cover Flow (4–5 дней)

**Задачи:**

- [ ] `CoverFlowScreen.tsx` — 3D карусель
- [ ] CSS transforms (rotateY, perspective, scale)
- [ ] Отражение (CSS reflection)
- [ ] Landscape detection + анимация перехода
- [ ] Snap к альбому
- [ ] Track list sheet снизу

**Трудности:**

- **Производительность с 50+ обложками.** Рендерить все обложки одновременно нельзя (память, GPU). Нужна виртуализация: только центральная ± 3 соседних в DOM. Остальные — заглушки
- **Загрузка изображений.** SC artwork URLs — внешние CDN. При быстром листании изображения не успевают загружаться. Нужен preload следующих 2-3 обложек
- **orientationchange ненадёжен на iOS.** Event иногда не стреляет или стреляет с задержкой. Альтернатива: `window.screen.orientation.angle` или `matchMedia('(orientation: landscape)')`
- **3D transform z-fighting.** При rotateY(70deg) и соседней обложке с rotateY(70deg) — z-order конфликт (две обложки "мигают"). Решение: явно указывать `z-index` для каждой позиции
- **Reflection на Android.** `-webkit-box-reflect` работает только в WebKit. На Android (Chromium-based WebView) — не работает. Нужна CSS-имитация через pseudo-element с `scaleY(-1)` + gradient mask

---

### Этап 7: Android (4–6 дней)

**Задачи:**

- [ ] `AudioService.kt` — Foreground Service
- [ ] `MediaSessionCompat` + notification с кнопками
- [ ] Custom Action "LIKE" в notification
- [ ] Android DownloadManager для загрузки треков
- [ ] Haptics тест на Android устройстве
- [ ] APK билд в GitHub Actions
- [ ] Тест фонового воспроизведения на Android

**Трудности:**

- **Foreground Service на Android 14+.** С Android 14 Google ужесточил требования — нужно объявить тип Foreground Service (`FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK`) в `AndroidManifest.xml`. Иначе сервис не запустится
- **Notification channels (Android 8+).** Уведомление Foreground Service должно принадлежать каналу. Канал нужно создать при первом запуске. Без канала — уведомление не появится (и сервис упадёт)
- **MediaSession на разных Android версиях.** `MediaSessionCompat` ведёт себя по-разному на Android 8, 10, 13. Особенно custom actions в notification — на Samsung иногда не показываются кастомные кнопки
- **DownloadManager vs URLSession.** Android DownloadManager не поддерживает кастомные headers напрямую в некоторых версиях. Нужно использовать `DownloadManager.Request.addRequestHeader()` для `Authorization: OAuth`
- **Capacitor bridge на Android.** Kotlin плагины регистрируются иначе чем Swift — через `@CapacitorPlugin` аннотацию и `MainActivity.registerPlugin()`. Документация Capacitor скудная для Kotlin

---

### Этап 8: GitHub Actions + Дистрибуция (2–3 дня)

**Задачи:**

- [ ] Получить Mac (MacInCloud) → сертификат → .p12 → GitHub Secrets
- [ ] Настроить ExportOptions.plist
- [ ] Полный pipeline: build → sign → release
- [ ] apps.json для AltStore Source
- [ ] GitHub Pages для apps.json
- [ ] Тест установки через AltStore на чистом iPhone

**Трудности:**

- **Бесплатный Apple ID — 3 app лимит.** С бесплатным аккаунтом одновременно можно установить только 3 sideloaded приложения на устройство. Если уже есть 3 других — нужно удалить одно
- **Provisioning Profile — только конкретные устройства.** Development provisioning profile работает только для UDID зарегистрированных в нём устройств. Бесплатный аккаунт не позволяет добавлять UDID через портал — только через Xcode при прямом подключении. Для каждого нового пользователя — нужен новый profile с его UDID
- **apps.json версии.** AltStore кэширует apps.json. После обновления — пользователь должен вручную нажать Refresh в Sources. Автоматического push нет
- **xcodebuild CODE_SIGN_STYLE.** В GitHub Actions нет интерактивного Xcode — нужно явно передать `CODE_SIGN_STYLE=Manual`, `PROVISIONING_PROFILE_SPECIFIER`, `CODE_SIGN_IDENTITY`. Иначе xcodebuild пытается автоматически выбрать профиль → fail

---

### Этап 9: Полировка (ongoing)

**Задачи:**

- [ ] Helvetica Neue в bundled шрифтах (права на шрифт — только системный)
- [ ] 60fps везде — профилировать в Safari DevTools
- [ ] Кэш обложек (Service Worker или IndexedDB blob store)
- [ ] Восстановление состояния после kill приложения (последний трек, позиция)
- [ ] Иконка в стиле iPod для AltStore

**Трудности:**

- **Helvetica Neue.** На iOS системный шрифт — SF Pro, не Helvetica Neue. Bundling Helvetica Neue нарушает лицензию Linotype. Решение: использовать `-apple-system` (SF Pro) — визуально очень близко
- **Кэш обложек vs памятью.** 1000 обложек × 300KB = 300MB памяти. Нужен LRU cache на 50–100 обложек
- **Восстановление позиции.** AVQueuePlayer после kill приложения теряет состояние. Нужно сохранять `currentTrackId + position` в UserDefaults (Swift) при каждом обновлении прогресса

---

## Технические зависимости (npm)

```json
{
  "@capacitor/core": "^6.0.0",
  "@capacitor/ios": "^6.0.0",
  "@capacitor/android": "^6.0.0",
  "@capacitor/haptics": "^6.0.0",
  "@capacitor/filesystem": "^6.0.0",
  "@capacitor/status-bar": "^6.0.0",
  "@capacitor/app": "^6.0.0",
  "dexie": "^4.0.0",
  "@tanstack/react-virtual": "^3.0.0",
  "@use-gesture/react": "^10.0.0"
}
```

```
iOS (встроены в iOS SDK):
  AVFoundation — аудио воспроизведение
  MediaPlayer  — экран блокировки
  Foundation   — URLSession, FileManager

Android:
  androidx.media:media:1.7.0
  androidx.core:core-ktx:1.12.0
```

---

## Итоговая схема всего

```
Пользователь прокручивает колесо
  → useClickWheel: угол → velocity → шаг
  → Haptic.Light + tick.wav
  → MenuScreen: синяя полоска скользит вниз
  → CENTER: выбрать трек
  → ContextMenu (hold): Add to On-The-Go / Download / Like

Воспроизведение:
  → resolvePlaybackUrl(): Dexie? → локальный файл : SC stream
  → AudioPlayerPlugin.play() → AVQueuePlayer
  → LockScreenPlugin.updateNowPlaying() → экран блокировки
  → MPRemoteCommandCenter.likeCommand → JS → sc.like()

Экран заблокирован:
  → JS заморожен
  → AVQueuePlayer продолжает
  → QueueManagerPlugin: remaining ≤ 2 → URLSession → /stream
  → парсит треки → AVQueuePlayer.insert() → бесконечно

Загрузка плейлиста:
  → sc.playlistTracks(id) → треки
  → для каждого: resolveStreamUrl → DownloadPlugin.downloadTrack()
  → URLSession.downloadTask → Documents/track_{id}.mp3
  → progress events → UI обновляется
  → complete → Dexie.tracks.put() → downloadedTrackIdsAtom.add()

Офлайн воспроизведение:
  → Dexie.tracks.get(trackId) → filePath
  → Capacitor.convertFileSrc(filePath) → local:// URI
  → AVQueuePlayer воспроизводит локальный файл без сети
```
