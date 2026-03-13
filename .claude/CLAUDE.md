# SoundCloud PWA — CLAUDE.md

## Что это за проект

Неофициальный PWA-клиент SoundCloud. Работает без рекламы, доступен из России через Cloudflare Worker прокси. Устанавливается на iPhone/Android с экрана домой, воспроизводит музыку в фоне с управлением на экране блокировки.

Референс: https://github.com/zxcloli666/SoundCloud-Desktop (Tauri desktop app — архитектура отличается, но полезен для понимания SoundCloud API и OAuth flow)

## Стек

| Слой            | Технология                                                |
| --------------- | --------------------------------------------------------- |
| Frontend        | React 19 + Vite + TypeScript                              |
| UI              | shadcn/ui + Tailwind CSS v4                               |
| Server state    | TanStack Query v5 (React Query) — mutations, invalidation |
| Client state    | Jotai v2 — player, queue, UI                              |
| Routing         | React Router v7                                           |
| Proxy / Backend | Cloudflare Worker (единственный "сервер")                 |
| PWA / SW        | Workbox                                                   |
| Audio           | Нативный `<audio>` + Media Session API                    |

## Дизайн

Весь UI разрабатывается через `/frontend-design` скилл.

- **Никаких inline стилей** — только Tailwind классы
- Все компоненты через shadcn/ui, кастомизированные под тёмную тему
- Основной цвет: `#ff5500` (SoundCloud orange)
- Фон: `#121212` (тёмный, OLED-friendly)

## Архитектура

```
[React PWA]
    │  все запросы через прокси
    ▼
[Cloudflare Worker]
    ├── proxy → soundcloud.com (обход блокировки России)
    ├── ad blocking → возвращает 204 для рекламных доменов
    ├── cache → статика 4 дня, аудио-сегменты отдельно
    └── auth callback → OAuth token exchange (хранит client_secret)
    │
    ▼
[SoundCloud API / CDN]
```

## Аутентификация

**Подход: Token extraction через webview (unofficial)**

SoundCloud закрыли публичную регистрацию API приложений в 2021. Используем их собственный web client_id:

1. PWA открывает `window.open('https://soundcloud.com/connect?...')` с SoundCloud web client_id
2. Пользователь логинится нормально на soundcloud.com
3. SoundCloud делает redirect — перехватываем токен
4. Токен сохраняем в localStorage
5. Все API запросы идут с `Authorization: OAuth {token}` через Cloudflare Worker

client_id для API запросов (без auth) — извлекается динамически из JS бандла soundcloud.com.

**Без официальных credentials (client_id + client_secret)** — нельзя зарегистрировать приложение на developers.soundcloud.com.

## SoundCloud API

- Базовый URL: `https://api-v2.soundcloud.com`
- Auth header: `Authorization: OAuth {access_token}`
- Для публичных запросов: `?client_id={extracted_client_id}`
- Стриминг: `/tracks/{urn}/streams` → HLS или progressive MP3

## iOS-специфика (критично)

- **Только нативный `<audio>`** — Web Audio API замерзает в фоне на iOS
- `audio.play()` только в ответ на user gesture
- Service Worker НЕ перехватывает аудио-стримы (`.m4s`, `.ts`)
- Фоновое воспроизведение работает только в installed PWA (standalone mode)

## Структура проекта

```
soundcloud-pwa/
├── CLAUDE.md
├── cloudflare-worker/
│   └── worker.js          # Прокси + ad blocker + auth callback
├── public/
│   ├── manifest.json
│   ├── sw.js
│   └── icons/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── lib/
│   │   ├── api.ts          # SoundCloud API client
│   │   ├── auth.ts         # OAuth flow + token management
│   │   └── player.ts       # Audio + Media Session API
│   ├── stores/             # Jotai atoms
│   │   ├── player.ts       # current track, queue, isPlaying
│   │   └── auth.ts         # user, token
│   ├── components/
│   │   ├── ui/             # shadcn компоненты
│   │   ├── player/
│   │   │   ├── MiniPlayer.tsx
│   │   │   └── NowPlaying.tsx
│   │   └── layout/
│   ├── pages/
│   │   ├── Feed.tsx        # Главная / рекомендации
│   │   ├── Search.tsx
│   │   ├── Library.tsx     # Лайки, плейлисты
│   │   └── Settings.tsx
│   └── hooks/              # usePlayer, useAuth, useQueue
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── package.json
```

## Этапы разработки

### Этап 1 — MVP (текущий)

- [ ] Vite + React + TypeScript + Tailwind + shadcn setup
- [ ] manifest.json + Service Worker (Workbox)
- [ ] Cloudflare Worker: базовый прокси
- [ ] Извлечение client_id из SoundCloud бандла
- [ ] Поиск треков + список результатов
- [ ] Воспроизведение через `<audio>` + Media Session API
- [ ] Mini player (нижняя панель)

### Этап 2 — Auth + библиотека

- [ ] OAuth flow через webview popup
- [ ] Token extraction + хранение
- [ ] Лайки, плейлисты, история
- [ ] Feed / рекомендации (требует auth)

### Этап 3 — Ad blocking + Россия

- [ ] Список блокируемых доменов в Worker
- [ ] Кэширование в Worker
- [ ] Тест доступности из России

### Этап 4 — Полноценный UI

- [ ] Now Playing экран
- [ ] Анимации и переходы
- [ ] Настройки

## Деплой

```bash
# Worker
wrangler deploy cloudflare-worker/worker.js

# PWA
npm run build
wrangler pages deploy dist/
```

URL итогового приложения: `https://soundcloud-pwa.pages.dev`

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
- **Minimat Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
