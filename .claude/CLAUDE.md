# SoundCloud iPod Classic — CLAUDE.md

## Workflow Orchestration

### 1. Plan Node Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project
- When user points out a project-specific convention or quirk — immediately add it to CLAUDE.md so it persists across sessions

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Task Management

1. **Plan First**: Write plan to `tasks/todo.md` with checkable items
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Mark items complete as you go
4. **Explain Changes**: High-level summary at each step
5. **Document Results**: Add review section to `tasks/todo.md`
6. **Capture Lessons**: Update `tasks/lessons.md` after corrections

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Что это за проект

Нативное мобильное приложение (Capacitor + React) с визуалом **iPod Classic 7th gen** и стримингом SoundCloud. Работает без рекламы, доступен из России через Cloudflare Worker прокси. Устанавливается через AltStore (iOS) и APK (Android) — без App Store.

**Полный план**: `tasks/ipod-classic-app.md` — читать обязательно перед началом работы.

### Концепция UI

Весь интерфейс воспроизводит iPod Classic: click wheel, иерархическое меню, Cover Flow, Now Playing с обложкой. Два режима управления:
- **Wheel mode** — click wheel (55% экран + 45% колесо)
- **Touch mode** — тачскрин (85% экран + тач-полоса внизу)

Переключение: Settings → Control Mode.

---

## Стек

| Слой | Технология |
|------|-----------|
| Frontend | React 19 + Vite + TypeScript |
| UI | Tailwind CSS v4 (без shadcn — iPod кастомный UI) |
| Client state | Jotai v2 |
| Server state | TanStack Query v5 |
| Навигация | Стековая (не React Router) — `navigationStackAtom` |
| Нативный слой | Capacitor 6 |
| Жесты (touch mode) | @use-gesture/react |
| Офлайн хранилище | Dexie.js (IndexedDB) |
| Виртуализация | @tanstack/virtual |
| Proxy / Backend | Cloudflare Worker |
| Аудио (iOS) | AVQueuePlayer через Swift плагин |
| Аудио (Android) | HTML5 Audio + Foreground Service |

---

## Архитектура

```
[React UI — iPod визуал]
    │
    ├── Wheel mode: useClickWheel → навигационный стек
    └── Touch mode: @use-gesture/react + нативный скролл
    │
    ▼
[Capacitor Bridge]
    ├── AudioPlayerPlugin.swift  — AVQueuePlayer
    ├── LockScreenPlugin.swift   — MPRemoteCommandCenter (кнопка лайка!)
    ├── QueueManagerPlugin.swift — URLSession фоновый fetch треков
    └── DownloadPlugin.swift     — URLSession.downloadTask
    │
    ▼
[Cloudflare Worker] — soundcloud-proxy.lblue1256.workers.dev
    │
    ▼
[SoundCloud API v2]
```

---

## Навигация (важно — не React Router)

Используется стековая навигация через Jotai атом:

```typescript
type Screen =
  | { id: 'main' } | { id: 'music' } | { id: 'feed' }
  | { id: 'playlists' } | { id: 'playlist-detail', playlistId: number }
  | { id: 'on-the-go' } | { id: 'liked' } | { id: 'artists' }
  | { id: 'artist-detail', artistId: number } | { id: 'albums' }
  | { id: 'album-detail', albumId: number } | { id: 'songs' }
  | { id: 'downloads' } | { id: 'search' } | { id: 'now-playing' }
  | { id: 'settings' } | { id: 'context-menu', track: ScTrack }

const navigationStackAtom = atom<Screen[]>([{ id: 'main' }]);
```

MENU кнопка (wheel) или `◄` (touch) → `pop()`. CENTER / tap → `push(screen)`.

---

## Меню (Music submenu — Вариант C)

```
Main Menu
├── Music
│   ├── Cover Flow        ← landscape ориентация
│   ├── Playlists         ← SC плейлисты + On-The-Go, со статусом загрузки
│   ├── Liked Tracks
│   ├── Artists
│   ├── Albums
│   ├── Songs
│   ├── Downloads         ← только офлайн треки
│   └── Search
├── Feed                  ← SC лента (/stream)
└── Settings
```

---

## Аутентификация

Ручной ввод токена (OAuth автоматический невозможен без официальных credentials).

1. Пользователь логинится на soundcloud.com → DevTools Console:
   ```js
   localStorage.getItem("oauth_token")
   ```
2. Копирует токен → Settings в приложении
3. Токен в `localStorage['sc_access_token']`
4. Все запросы: `Authorization: OAuth {token}` через прокси

---

## SoundCloud API

- Базовый URL: `https://api-v2.soundcloud.com` (через прокси)
- Auth: `Authorization: OAuth {access_token}`
- Публичные: `?client_id={extracted_client_id}`
- Лайки: `GET /users/{userId}/track_likes?limit=24&linked_partitioning=1`
- Feed: `GET /stream`
- Плейлисты: `GET /me/playlists`
- Треки плейлиста: `GET /playlists/{id}?representation=full`
- Стриминг: `media.transcodings` → `progressive` + `audio/mpeg`, fallback HLS

---

## Jotai — критические правила

**НЕ использовать `atomWithStorage`** для токена — сериализует через JSON.stringify → кавычки в localStorage → 401.

```typescript
// ПРАВИЛЬНО:
export const accessTokenAtom = atom<string | null>(getAccessToken());
export const currentUserAtom = atom<ScUser | null>(loadCachedUser());
```

---

## iOS-специфика (критично)

- **Swift плагины** вместо нативного `<audio>` — `AVQueuePlayer` не замерзает в фоне
- `AVAudioSession.Category.playback` — обязательно для фонового воспроизведения
- `MPRemoteCommandCenter.likeCommand` — кнопка лайка на экране блокировки
- Service Worker НЕ перехватывает аудио (`.m4s`, `.ts`)
- WKWebView JS замерзает при заблокированном экране → фоновый fetch треков только в Swift (QueueManagerPlugin)

---

## Что уже написано и переиспользуется

| Файл | Статус | Примечание |
|------|--------|-----------|
| `src/lib/api.ts` | ✅ Готово | Все SC методы, sc.playlists() уже есть |
| `src/lib/auth.ts` | ✅ Готово | loginWithToken, logout |
| `src/stores/auth.ts` | ✅ Готово | accessTokenAtom, currentUserAtom |
| `src/stores/player.ts` | ✅ Готово | currentTrackAtom, queueAtom, likedTrackIdsAtom |
| `src/hooks/usePlayer.ts` | ⚠️ Расширить | Добавить bridge к AudioPlayerPlugin |
| `src/lib/player.ts` | ⚠️ Расширить | Добавить Capacitor bridge |
| `src/pages/*` | 🔄 Переписать | Под iPod экраны |
| `src/components/*` | 🔄 Переписать | Под iPod компоненты |
| `src/App.tsx` | 🔄 Переписать | Стековая навигация |

---

## Что нужно создать

```
src/
├── stores/
│   ├── settings.ts          controlModeAtom ('wheel'|'touch')
│   ├── downloads.ts         downloadedTrackIdsAtom, downloadQueueAtom
│   └── onthego.ts           onTheGoQueueAtom (localStorage)
├── lib/
│   └── downloads.ts         Dexie.js схема + DownloadPlugin bridge
├── hooks/
│   └── useClickWheel.ts     детекция вращения, velocity, momentum
├── components/ipod/
│   ├── IpodShell.tsx        корпус — условный рендер wheel vs touch
│   ├── ClickWheel.tsx       визуал + touch зоны
│   ├── TouchControlBar.tsx  ◄ + мини-плеер + ▶ + ►| (touch mode)
│   ├── StatusBar.tsx
│   ├── MenuScreen.tsx       список + выделение + slide анимации
│   └── CoverFlow.tsx        3D карусель (landscape)
└── components/screens/
    ├── MainMenu.tsx, MusicMenu.tsx, FeedScreen.tsx
    ├── PlaylistsScreen.tsx, OnTheGoScreen.tsx
    ├── LikedScreen.tsx, SongsScreen.tsx, ArtistsScreen.tsx
    ├── AlbumsScreen.tsx, DownloadsScreen.tsx, SearchScreen.tsx
    ├── NowPlayingScreen.tsx (wheel mode)
    ├── NowPlayingTouchScreen.tsx (touch mode, swipe жесты)
    ├── SettingsScreen.tsx
    └── ContextMenu.tsx      (CENTER hold / long press)

ios/App/Plugins/
├── AudioPlayerPlugin.swift  AVQueuePlayer singleton
├── LockScreenPlugin.swift   MPRemoteCommandCenter + likeCommand
├── QueueManagerPlugin.swift URLSession фоновый fetch
└── DownloadPlugin.swift     URLSession.downloadTask

android/app/src/main/java/.../
└── AudioService.kt          Foreground Service + MediaSession

.github/workflows/
└── build.yml                iOS IPA + Android APK
```

---

## Загрузки (офлайн)

- **IndexedDB** (Dexie.js) — метаданные треков и плейлистов
- **@capacitor/filesystem** — аудио файлы в Documents/downloads/
- **DownloadPlugin** (Swift/Kotlin) — фоновая загрузка через URLSession.downloadTask
- Офлайн воспроизведение: `Capacitor.convertFileSrc(filePath)` → local:// URI

```typescript
// Резолвинг URL воспроизведения:
async function resolvePlaybackUrl(track: ScTrack): Promise<string> {
  const downloaded = await db.tracks.get(track.id);
  if (downloaded) return Capacitor.convertFileSrc(downloaded.filePath);
  return sc.resolveStreamUrl(sc.streams(track)!);
}
```

---

## On-The-Go Playlist

Временный плейлист, собирается прямо в приложении. CENTER hold → "Add to On-The-Go".
Сохраняется в localStorage (`sc_otg_queue`), переживает перезапуск.
Отображается первым в Playlists. Кнопка "Clear" очищает список.

---

## Дизайн (iPod Classic)

- Фон: `#1a1a1a`, текст `#ffffff`, dim `#8a8a8a`
- Выделение: градиент `#5BAEF8 → #3478C4`
- Шрифт: `Helvetica Neue, -apple-system` (НЕ bundling Helvetica — нарушение лицензии)
- Колесо: brushed silver CSS (radial-gradient + noise texture)
- **Никаких inline стилей** — только Tailwind классы
- **Никакого shadcn** — весь UI кастомный под iPod

---

## Сборка и дистрибуция

```bash
# Разработка
npm run dev

# Сборка web assets
npm run build

# Синхронизация с нативными проектами
npx cap sync

# iOS (в GitHub Actions, macOS runner)
cd ios && pod install
xcodebuild -workspace App.xcworkspace -scheme App ... archive
xcodebuild -exportArchive ... → App.ipa

# Android
cd android && ./gradlew assembleRelease → app-release.apk
```

- **iOS**: AltStore Classic (бесплатный Apple ID, 7-дневный автообновляемый сертификат)
- **Android**: APK прямо с GitHub Releases
- **Cloudflare Worker**: `wrangler deploy cloudflare-worker/worker.js`

---

## Текущее состояние

### Сделано ✓ (PWA-основа)

- React + Vite + TypeScript + Tailwind v4
- Cloudflare Worker прокси (задеплоен)
- SC API client (`src/lib/api.ts`) — все методы включая playlists
- Аутентификация через токен
- Поиск, Feed, Library (лайки), Settings
- Базовый плеер с Media Session API
- Лайки: `likedTrackIdsAtom`, DataDome retry

### Следующие шаги (порядок этапов)

- [x] **Этап 0**: Capacitor + ios/ + android/ + GitHub Actions. Первый билд ✅
- [ ] **Этап 1**: `IpodShell.tsx` + `MenuScreen.tsx` + стековая навигация + `controlModeAtom`
- [ ] **Этап 2**: `ClickWheel.tsx` + `useClickWheel.ts` + haptics + звуки (зависит от Этапа 1)
- [ ] **Этап 3**: `NowPlayingScreen.tsx` + marquee + volume overlay (HTML5 audio, не Swift)
- [ ] **Этап 4**: Swift плагины (AudioPlayer, LockScreen, QueueManager, Download)
- [ ] **Этап 5**: Playlists + On-The-Go + Downloads (Dexie + DownloadPlugin)
- [ ] **Этап 5.5**: Touch mode (`TouchControlBar`, `NowPlayingTouchScreen`, жесты)
- [ ] **Этап 6**: Cover Flow (3D, landscape, reflection)
- [ ] **Этап 7**: Android (Foreground Service, MediaSession, DownloadManager)
- [ ] **Этап 8**: GitHub Actions + AltStore дистрибуция
- [ ] **Этап 9**: Полировка (60fps, кэш обложек, восстановление состояния)

---

## Правила разработки

- **Никаких inline стилей** — только Tailwind классы
- **Никакого shadcn** — iPod UI кастомный
- **Не использовать `atomWithStorage`** для токена (см. Jotai выше)
- **Не использовать Web Audio API** — замерзает в фоне на iOS
- **Не использовать React Router** — стековая навигация через Jotai
- **Swift плагины** — все нативные операции только там
- При добавлении API методов — проверять эндпоинты через network tab (SC v2 не задокументирован)
- Весь новый UI через `/frontend-design` скилл