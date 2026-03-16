# Миграция на Capacitor — Детальный план

## Архитектура решения

```
┌─────────────────────────────────────────────┐
│              iOS App (Swift)                │
│                                             │
│  ┌─────────────────────────────────────┐   │
│  │           WKWebView                 │   │
│  │                                     │   │
│  │  React + Jotai + TanStack Query     │   │
│  │  shadcn/ui + Tailwind               │   │
│  │  src/lib/api.ts (без изменений)     │   │
│  │  src/lib/auth.ts (без изменений)    │   │
│  │  src/stores/* (без изменений)       │   │
│  │  Все страницы (без изменений)       │   │
│  │                                     │   │
│  │  src/lib/player.ts → ПЕРЕПИСАТЬ    │   │
│  │  (делегирует в NativeAudioPlugin)   │   │
│  └──────────────┬──────────────────────┘   │
│                 │ Capacitor Bridge          │
│  ┌──────────────▼──────────────────────┐   │
│  │         Swift Plugins               │   │
│  │                                     │   │
│  │  NativeAudioPlugin                  │   │
│  │  → AVPlayer (фоновое воспроизв.)    │   │
│  │  → MPNowPlayingInfoCenter           │   │
│  │  → MPRemoteCommandCenter            │   │
│  │    (play/pause/skip/like)           │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## Что сохраняется, что меняется

| Файл / Слой | Статус | Примечание |
|-------------|--------|-----------|
| `src/lib/api.ts` | ✅ Без изменений | fetch() работает в WKWebView |
| `src/lib/auth.ts` | ✅ Без изменений | localStorage сохраняется между запусками |
| `src/stores/auth.ts` | ✅ Без изменений | localStorage в Capacitor персистентен |
| `src/stores/player.ts` | ✅ Без изменений | Чистые Jotai atoms |
| `src/hooks/usePlayer.ts` | 🔧 Адаптировать | Подключить к новому player.ts |
| `src/lib/player.ts` | ❌ Переписать | Делегировать в нативный плагин |
| Все страницы и компоненты | ✅ Без изменений | UI не трогаем |
| Cloudflare Worker | ✅ Без изменений | CORS: `*` — подходит для Capacitor |

### Почему localStorage работает в Capacitor

В обычном Safari PWA iOS может очистить localStorage при нехватке места.
В Capacitor WKWebView данные хранятся в контейнере приложения — iOS их не трогает.
Текущий подход с `localStorage` для токена и кэша пользователя работает без изменений.

---

## Ключевой нюанс: JS замерзает при заблокированном экране

**Это самое важное во всём плане.**

WKWebView запускает JS в отдельном процессе. Когда экран блокируется — iOS
приостанавливает этот процесс. Даже с `UIBackgroundModes = audio`.

```
Экран открыт:   [JS работает] → [AVPlayer играет]
Экран заблокирован: [JS ЗАМОРОЖЕН] → [AVPlayer играет]
```

**Следствие:** когда экран заблокирован, JS не может:
- Делать fetch() для получения URL следующего трека
- Обрабатывать события (trackEnded и т.д.)
- Обновлять состояние

**Решение — двухшаговая стратегия:**

1. Пока экран открыт и трек играет — JS заранее получает URL следующего трека
   и передаёт его нативному плагину через bridge
2. Нативный плагин (Swift/AVPlayer) хранит очередь и автоматически переключает
   треки без участия JS

```
Экран открыт, трек играет:
  JS: "следующий трек — url X" → передаёт Swift-плагину
  Swift: сохраняет url X в очереди

Экран заблокировался, трек закончился:
  Swift: [автоматически] воспроизводит url X из очереди
  JS: заморожен, но это не важно — Swift сам справился

Экран разблокировался:
  JS: получает событие "сейчас играет трек X" → синхронизирует Jotai atoms
```

---

## Фаза 0: Подготовка проекта (Windows)

### 0.1 Установить Capacitor в существующий проект

```bash
# В корне soundcloud-pwa
npm install @capacitor/core @capacitor/cli

# Инициализировать (bundle ID — придумай свой, например com.yourname.soundcloud)
npx cap init "SoundCloud" "com.yourname.soundcloud" --web-dir dist

# Добавить iOS платформу
npm install @capacitor/ios
npx cap add ios
```

### 0.2 Проверить capacitor.config.ts

```typescript
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.yourname.soundcloud',
  appName: 'SoundCloud',
  webDir: 'dist',           // Vite output directory
  server: {
    // Для live reload во время разработки (только если есть Mac):
    // url: 'http://192.168.1.X:5173',
    // cleartext: true,
  },
  ios: {
    contentInset: 'always', // safe area на iPhone
  },
}

export default config
```

### 0.3 Синхронизировать с iOS проектом

```bash
npm run build        # собрать React → dist/
npx cap sync ios     # скопировать dist/ в ios/App/public/
```

> **Важно:** `npx cap sync` нужно запускать после каждого `npm run build`.
> Это единственная команда, которая нужна на Windows. Компилируется уже на Mac/GitHub Actions.

---

## Фаза 1: Зависимости

```bash
# Нативный аудио плагин (основной)
npm install @mediagrid/capacitor-native-audio

# Preferences (для опциональных настроек, если понадобится)
npm install @capacitor/preferences

# Синхронизировать с iOS
npx cap sync ios
```

---

## Фаза 2: Нативная iOS конфигурация (один раз на Mac)

Эти файлы создаются/редактируются на Windows, но чтобы CocoaPods подтянул
зависимости — нужен Mac (или GitHub Actions).

### 2.1 Фоновые режимы — ios/App/App/Info.plist

Найти файл `ios/App/App/Info.plist` и добавить перед закрывающим `</dict>`:

```xml
<!-- Фоновое воспроизведение аудио -->
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>

<!-- Разрешение HTTP (если нужно для локальной разработки) -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
</dict>
```

### 2.2 AVAudioSession — ios/App/App/AppDelegate.swift

Настройка аудио-сессии должна происходить при запуске приложения, до любого
воспроизведения. Иначе iOS не даст фоновое воспроизведение.

```swift
import UIKit
import Capacitor
import AVFoundation  // ← добавить

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {

    // ← Добавить этот блок:
    do {
      try AVAudioSession.sharedInstance().setCategory(
        .playback,              // позволяет играть в фоне
        mode: .default,
        options: [.mixWithOthers]  // убрать если не нужно микширование
      )
      try AVAudioSession.sharedInstance().setActive(true)
    } catch {
      print("AVAudioSession setup failed: \(error)")
    }

    return true
  }

  // ... остальные методы без изменений
}
```

---

## Фаза 3: Swift-плагин для кнопки лайка

Это единственный Swift-код, который нужно написать. ~80 строк.

### 3.1 Создать файл плагина

Создать `ios/App/App/MediaCommandsPlugin.swift`:

```swift
import Capacitor
import MediaPlayer

@objc(MediaCommandsPlugin)
public class MediaCommandsPlugin: CAPPlugin {

  private let commandCenter = MPRemoteCommandCenter.shared()
  private var likeTarget: Any?

  // Вызывается из JS при старте плеера
  @objc func setup(_ call: CAPPluginCall) {
    // Кнопка лайка
    commandCenter.likeCommand.isEnabled = true
    commandCenter.likeCommand.localizedTitle = "Like"

    likeTarget = commandCenter.likeCommand.addTarget { [weak self] event in
      // Отправляем событие в JS
      self?.notifyListeners("likePressed", data: [:])
      return .success
    }

    call.resolve()
  }

  // Обновить состояние кнопки лайка (активна / не активна)
  @objc func setLiked(_ call: CAPPluginCall) {
    let isLiked = call.getBool("isLiked") ?? false
    commandCenter.likeCommand.isActive = isLiked
    call.resolve()
  }

  // Убрать все обработчики (при размонтировании)
  @objc func teardown(_ call: CAPPluginCall) {
    if let target = likeTarget {
      commandCenter.likeCommand.removeTarget(target)
    }
    commandCenter.likeCommand.isEnabled = false
    call.resolve()
  }
}
```

### 3.2 Зарегистрировать плагин в AppDelegate.swift

```swift
// В конце application(_:didFinishLaunchingWithOptions:) перед return true:
NotificationCenter.default.addObserver(
  forName: NSNotification.Name("CAPBridgeDidLoad"),
  object: nil,
  queue: .main
) { [weak self] notification in
  if let bridge = notification.object as? CAPBridgeProtocol {
    bridge.registerPluginInstance(MediaCommandsPlugin())
  }
}
```

### 3.3 Создать TypeScript обёртку

Создать `src/lib/mediaCommands.ts`:

```typescript
import { registerPlugin } from '@capacitor/core'

export interface MediaCommandsPlugin {
  setup(): Promise<void>
  setLiked(options: { isLiked: boolean }): Promise<void>
  teardown(): Promise<void>
  addListener(
    eventName: 'likePressed',
    listenerFunc: () => void
  ): Promise<{ remove: () => void }>
}

export const MediaCommands = registerPlugin<MediaCommandsPlugin>('MediaCommandsPlugin')
```

---

## Фаза 4: Переписать player.ts

Это главное изменение. Весь `src/lib/player.ts` заменяется на работу
через `@mediagrid/capacitor-native-audio`.

Логика из старого player.ts:
- Blob-preload → **не нужен** (нативный плагин сам буферизует)
- 2-секундное переключение до конца трека → **не нужен** (нативный плагин не замерзает)
- `new Audio()` → **заменяется** на NativeAudio.*
- Media Session API → **убирается** (плагин сам управляет lock screen)
- Очередь → **сохраняется в JS** для переключения между треками

> Проверить точный API в README плагина: https://github.com/mediagrid/capacitor-native-audio
> Ниже — ориентировочная структура, названия методов могут отличаться.

```typescript
// src/lib/player.ts (новая версия)
import { NativeAudio } from '@mediagrid/capacitor-native-audio'
import { MediaCommands } from './mediaCommands'
import type { ScTrack } from './api'

// ─── State ───────────────────────────────────────────────────────────────────

type PlayerListener = () => void
const listeners = new Set<PlayerListener>()
export function subscribePlayer(fn: PlayerListener) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
function notify() { listeners.forEach(fn => fn()) }

export type PlayerState = {
  track: ScTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  isLoading: boolean
  error: string | null
}

let state: PlayerState = {
  track: null, isPlaying: false,
  currentTime: 0, duration: 0,
  isLoading: false, error: null,
}
export function getPlayerState(): PlayerState { return state }
function setState(patch: Partial<PlayerState>) {
  state = { ...state, ...patch }
  notify()
}

// ─── Queue ────────────────────────────────────────────────────────────────────

let _queue: ScTrack[] = []
let _queueIndex = -1
let _nextUrl: string | null = null  // URL следующего трека, передан в нативный плагин

export function setPlayerQueue(tracks: ScTrack[], index: number) {
  _queue = tracks
  _queueIndex = index
}

type AutoAdvanceCallback = (track: ScTrack, idx: number) => void
let _onAutoAdvance: AutoAdvanceCallback | null = null
export function setAutoAdvanceCallback(fn: AutoAdvanceCallback | null) {
  _onAutoAdvance = fn
}

// ─── Инициализация ────────────────────────────────────────────────────────────

let _initialized = false
let _likeListener: { remove: () => void } | null = null

export async function initPlayer() {
  if (_initialized) return
  _initialized = true

  // Настроить кнопку лайка на экране блокировки
  await MediaCommands.setup()

  _likeListener = await MediaCommands.addListener('likePressed', async () => {
    const track = state.track
    if (!track) return
    // Импортировать sc здесь чтобы избежать циклических зависимостей
    const { sc } = await import('./api')
    const { setLikedAtom } = await import('../stores/player')
    // Лайк через API
    await sc.like(track.id)
    // Обновить кнопку на экране блокировки
    await MediaCommands.setLiked({ isLiked: true })
    // Уведомить Jotai (импорт store через getDefaultStore)
    notify()
  })

  // Слушать события нативного плеера
  await NativeAudio.addListener('complete', () => {
    // Трек закончился — JS получил событие (экран открыт или только что открылся)
    _handleTrackEnd()
  })

  await NativeAudio.addListener('timeUpdate', (data: { currentTime: number; duration: number }) => {
    setState({ currentTime: data.currentTime, duration: data.duration })

    // Когда остаётся ~30 секунд — заранее получаем URL следующего трека
    // (пока JS ещё не заморожен, экран открыт)
    if (data.duration > 0 && (data.duration - data.currentTime) < 30) {
      _prepareNextTrack()
    }
  })
}

// ─── Подготовка следующего трека ──────────────────────────────────────────────

let _isPreparing = false

async function _prepareNextTrack() {
  if (_isPreparing || _nextUrl) return
  const next = _queue[_queueIndex + 1]
  if (!next) return

  _isPreparing = true
  try {
    const { sc } = await import('./api')
    const transcoding = sc.streams(next)
    if (!transcoding) return
    const url = await sc.resolveStreamUrl(transcoding)
    _nextUrl = url

    // Передаём URL нативному плагину — он загрузит в буфер заранее
    await NativeAudio.setNextTrack({
      url,
      title: next.title,
      artist: next.user.username,
      artwork: next.artwork_url?.replace('-large', '-t500x500') ?? '',
    })
  } catch (e) {
    // ignore
  } finally {
    _isPreparing = false
  }
}

function _handleTrackEnd() {
  const nextIndex = _queueIndex + 1
  const nextTrack = _queue[nextIndex]

  if (!nextTrack) {
    setState({ isPlaying: false, currentTime: 0 })
    return
  }

  _queueIndex = nextIndex
  _nextUrl = null
  _isPreparing = false
  setState({ track: nextTrack, isLoading: true, currentTime: 0, duration: 0 })
  _onAutoAdvance?.(nextTrack, nextIndex)

  // Запросить подготовку трека после следующего
  setTimeout(() => _prepareNextTrack(), 1000)
}

// ─── Управление плеером ───────────────────────────────────────────────────────

export async function loadTrack(track: ScTrack, streamUrl: string) {
  _nextUrl = null
  _isPreparing = false

  setState({ track, isLoading: true, error: null, currentTime: 0, duration: 0 })

  await NativeAudio.play({
    url: streamUrl,
    title: track.title,
    artist: track.user.username,
    artwork: track.artwork_url?.replace('-large', '-t500x500') ?? '',
    duration: track.duration / 1000,
  })

  // Сбросить кнопку лайка
  await MediaCommands.setLiked({ isLiked: false })
}

export async function play() {
  await NativeAudio.resume()
  setState({ isPlaying: true })
}

export async function pause() {
  await NativeAudio.pause()
  setState({ isPlaying: false })
}

export function togglePlay() {
  if (state.isPlaying) pause()
  else play()
}

export async function seek(time: number) {
  await NativeAudio.seekTo({ time })
}

// Backward compat — setMediaSessionCallbacks не нужен (плагин сам)
export function setMediaSessionCallbacks(_prev: () => void, _next: () => void) {}
export function preloadNextTrack(_url: string) {}
```

---

## Фаза 5: Адаптация хранилища (если нужно)

**localStorage в Capacitor работает без изменений.** Данные хранятся в контейнере
приложения и не очищаются iOS.

Текущий код в `src/stores/auth.ts`:
```typescript
// Это уже работает в Capacitor — менять не нужно:
export const accessTokenAtom = atom<string | null>(getAccessToken())
export const currentUserAtom = atom<ScUser | null>(loadCachedUser())
```

Единственное изменение — вызов `initPlayer()` при старте приложения.

**src/App.tsx** — добавить инициализацию:

```typescript
import { initPlayer } from './lib/player'

// В компоненте App, один раз:
useEffect(() => {
  initPlayer()
}, [])
```

---

## Фаза 6: GitHub Actions для сборки IPA

### 6.1 Получить сертификат (один раз на Mac)

```bash
# На Mac — открыть Xcode → Settings → Accounts → добавить Apple ID
# Manage Certificates → + → Apple Development
#
# Экспортировать сертификат:
# Keychain Access → найти "Apple Development: твой@email.com"
# → правая кнопка → Export → certificate.p12 → задать пароль
#
# Конвертировать в base64:
base64 -i certificate.p12 | pbcopy
# → вставить в GitHub Secret: SIGNING_CERTIFICATE_P12_DATA

# Provisioning profile:
# Xcode → открыть ios/App/App.xcworkspace
# → Signing & Capabilities → Team: выбрать аккаунт → Automatically manage signing
# → Xcode сам скачает профиль
# ~/Library/MobileDevice/Provisioning Profiles/*.mobileprovision
base64 -i ~/Library/MobileDevice/Provisioning\ Profiles/*.mobileprovision | pbcopy
# → вставить в GitHub Secret: PROVISIONING_PROFILE_DATA
```

**GitHub → Settings → Secrets → Actions → New repository secret:**
- `SIGNING_CERTIFICATE_P12_DATA` — base64 от certificate.p12
- `SIGNING_CERTIFICATE_PASSWORD` — пароль от .p12
- `PROVISIONING_PROFILE_DATA` — base64 от .mobileprovision

### 6.2 Workflow файл

Создать `.github/workflows/build-ios.yml`:

```yaml
name: Build iOS IPA

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: macos-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install JS dependencies
        run: npm ci

      - name: Build web app
        run: npm run build

      - name: Cache CocoaPods
        uses: actions/cache@v4
        with:
          path: ios/App/Pods
          key: ${{ runner.os }}-pods-${{ hashFiles('ios/App/Podfile.lock') }}
          restore-keys: ${{ runner.os }}-pods-

      - name: Install CocoaPods
        run: cd ios/App && pod install

      - name: Sync Capacitor
        run: npx cap sync ios

      - name: Import signing certificate
        env:
          P12_BASE64: ${{ secrets.SIGNING_CERTIFICATE_P12_DATA }}
          P12_PASSWORD: ${{ secrets.SIGNING_CERTIFICATE_PASSWORD }}
          KEYCHAIN_PASSWORD: temp_keychain
        run: |
          security create-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          security set-keychain-settings -lut 21600 build.keychain
          security unlock-keychain -p "$KEYCHAIN_PASSWORD" build.keychain
          echo "$P12_BASE64" | base64 --decode > cert.p12
          security import cert.p12 -k build.keychain -P "$P12_PASSWORD" -T /usr/bin/codesign
          security list-keychains -d user -s build.keychain
          security set-key-partition-list -S apple-tool:,apple: -k "$KEYCHAIN_PASSWORD" build.keychain

      - name: Import provisioning profile
        env:
          PROFILE_BASE64: ${{ secrets.PROVISIONING_PROFILE_DATA }}
        run: |
          mkdir -p ~/Library/MobileDevice/Provisioning\ Profiles
          echo "$PROFILE_BASE64" | base64 --decode \
            > ~/Library/MobileDevice/Provisioning\ Profiles/profile.mobileprovision

      - name: Build archive
        run: |
          xcodebuild \
            -workspace ios/App/App.xcworkspace \
            -scheme App \
            -configuration Release \
            -destination "generic/platform=iOS" \
            -archivePath $RUNNER_TEMP/App.xcarchive \
            CODE_SIGN_STYLE=Manual \
            archive

      - name: Export IPA
        run: |
          xcodebuild -exportArchive \
            -archivePath $RUNNER_TEMP/App.xcarchive \
            -exportPath $RUNNER_TEMP/ipa \
            -exportOptionsPlist ExportOptions.plist

      - name: Upload IPA artifact
        uses: actions/upload-artifact@v4
        with:
          name: SoundCloud-${{ github.run_number }}.ipa
          path: ${{ runner.temp }}/ipa/*.ipa
          retention-days: 30

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          tag_name: build-${{ github.run_number }}
          name: Build ${{ github.run_number }}
          files: ${{ runner.temp }}/ipa/*.ipa
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**ExportOptions.plist** (в корне проекта):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>development</string>
    <key>compileBitcode</key>
    <false/>
    <key>signingStyle</key>
    <string>manual</string>
    <key>stripSwiftSymbols</key>
    <true/>
</dict>
</plist>
```

---

## Фаза 7: AltStore Classic

AltStore PAL из России недоступен без сложных обходов.
**AltStore Classic работает везде, включая Россию.**

### 7.1 Установить AltServer на Windows

1. Скачать AltServer с [altstore.io](https://altstore.io) → Windows версия
2. Установить iTunes и iCloud (не из Microsoft Store — из apple.com напрямую)
3. Запустить AltServer — появится иконка в трее

### 7.2 Установить AltStore на iPhone

1. Подключить iPhone кабелем к компьютеру
2. В трее AltServer → Install AltStore → выбрать iPhone
3. На iPhone: Настройки → Основные → VPN и управление устройством → доверять сертификату

### 7.3 Установить своё приложение

**Вариант А — через файл (для первого раза):**
1. Скачать IPA из GitHub Actions Artifacts на Windows
2. Загрузить в iCloud Drive или Google Drive
3. На iPhone открыть файл → "Открыть в AltStore"
4. AltStore подпишет и установит

**Вариант Б — через AltStore Source (для обновлений):**
1. Создать отдельный публичный репозиторий `soundcloud-altstore-source`
2. Включить GitHub Pages
3. Создать `apps.json`:

```json
{
  "name": "SoundCloud",
  "identifier": "com.yourname.soundcloud",
  "apps": [
    {
      "name": "SoundCloud",
      "bundleIdentifier": "com.yourname.soundcloud",
      "developerName": "Your Name",
      "version": "1.0.0",
      "versionDate": "2025-01-01",
      "downloadURL": "https://github.com/yourname/SoundCloud/releases/download/build-1/App.ipa",
      "localizedDescription": "SoundCloud без рекламы. Лайк на экране блокировки.",
      "iconURL": "https://raw.githubusercontent.com/yourname/soundcloud-altstore-source/main/icon.png",
      "tintColor": "FF5500",
      "size": 15000000
    }
  ],
  "news": []
}
```

4. На iPhone: AltStore → Browse → Sources → + → `https://yourname.github.io/soundcloud-altstore-source/apps.json`

### 7.4 Автообновление сертификата

AltServer в трее + iPhone в одной сети (LAN + WiFi — оба подключены к роутеру) →
AltStore сам обновляет сертификат каждые 7 дней. Вручную ничего делать не нужно.

---

## Рабочий цикл разработки (Windows)

```
1. Пишешь код в VS Code (Windows)
   ↓
2. npm run build
   npx cap sync ios
   git push
   ↓
3. GitHub Actions запускается (~20-25 мин)
   ↓
4. Скачиваешь IPA из Artifacts
   ↓
5. Загружаешь в iCloud/Google Drive
   Открываешь на iPhone → AltStore устанавливает
   ↓
6. Тестируешь
```

**Для быстрой итерации по UI** (без пересборки нативного кода):
Можно временно настроить `server.url` в `capacitor.config.ts` на Vite dev server —
тогда изменения JS видны без пересборки IPA. Но это требует Mac для `npx cap run ios`.

---

## Нюансы и потенциальные проблемы

### CORS с Cloudflare Worker
Воркер использует `Access-Control-Allow-Origin: *` — работает с Capacitor без изменений.

### Аудио URL из SC CDN протухают
URL аудио-стримов SC живут ~5 минут. Текущий подход в player.ts (обновлять за 90с до конца)
нужно сохранить в новой версии через `_prepareNextTrack()`.

### @mediagrid/capacitor-native-audio: проверить API
Точные названия методов (`play`, `resume`, `seekTo`, `setNextTrack`) уточнить в README:
https://github.com/mediagrid/capacitor-native-audio
Если плагин не поддерживает `setNextTrack` — очередью управляет JS через `complete`-событие
(работает когда экран открыт; для заблокированного экрана нужен fallback).

### Если нативный плагин не поддерживает очередь
Запасной вариант: написать свой Swift-плагин с AVQueuePlayer.
Это ~150 строк Swift и решает проблему раз и навсегда.

### Safe Area на iPhone с чёлкой
В `index.html` добавить:
```html
<meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1">
```
В CSS добавить отступы через `env(safe-area-inset-*)` где нужно.

### Splash screen и иконка
```bash
npm install @capacitor/splash-screen @capacitor/app
npx cap sync ios
```
Иконки добавляются через Xcode → Assets.xcassets (нужен Mac один раз).

---

## Фаза 8: Swift-плагин для бесконечного фонового воспроизведения

Это ключевая фаза. Плагин заменяет и `@mediagrid/capacitor-native-audio`, и
`MediaCommandsPlugin` из Фазы 3 — всё в одном файле.

### Почему нужен собственный плагин

Когда экран заблокирован — JS заморожен. Готовые плагины не умеют сами фетчить
следующую страницу треков из SC API. Наш плагин умеет:

```
Экран заблокирован, в очереди остался 1 трек:

  [NativePlayerPlugin — Swift, NOT frozen]
      ↓ maybeExtendQueue() срабатывает
      ↓ URLSession.dataTask → proxyUrl/stream?next_href=...
      ↓ Парсит JSON, извлекает треки
      ↓ Добавляет в очередь tracks[]
      ↓ Резолвит URL следующего трека
      ↓ AVPlayer.replaceCurrentItem(with: nextItem)
      ↓ AVPlayer.play()

  Воспроизведение продолжается бесконечно без участия JS
```

### 8.1 Swift-плагин — ios/App/App/NativePlayerPlugin.swift

Создать файл (~400 строк, полная реализация):

```swift
import Capacitor
import AVFoundation
import MediaPlayer

// ─── Модель трека ─────────────────────────────────────────────────────────────

struct PlayerTrack {
    let id: Int
    let title: String
    let artist: String
    let artwork: String
    let transcodingUrl: String  // SC API URL (через прокси) — для резолва
    var resolvedUrl: String?    // Реальный CDN URL (кешируется)
    var resolvedAt: Date?       // Когда закешировали (TTL 4.5 мин)
}

// ─── Плагин ───────────────────────────────────────────────────────────────────

@objc(NativePlayerPlugin)
public class NativePlayerPlugin: CAPPlugin {

    // MARK: - Свойства

    private var player: AVPlayer?
    private var timeObserver: Any?

    private var tracks: [PlayerTrack] = []
    private var currentIndex: Int = -1
    private var nextHref: String?           // для пагинации SC API

    private var accessToken: String = ""
    private var proxyUrl: String = ""
    private var clientId: String = ""

    private var isFetchingNextPage = false
    private let workQueue = DispatchQueue(label: "com.soundcloud.player", qos: .userInitiated)

    // MARK: - JS API: инициализация

    /// Вызывается один раз при старте приложения.
    /// Передаёт credentials для нативных API-запросов.
    @objc func setup(_ call: CAPPluginCall) {
        accessToken = call.getString("accessToken") ?? ""
        proxyUrl    = call.getString("proxyUrl")    ?? ""
        clientId    = call.getString("clientId")    ?? ""

        setupAudioSession()
        setupPlayer()
        setupRemoteCommandCenter()

        call.resolve()
    }

    /// Загружает очередь треков и начинает воспроизведение.
    @objc func loadQueue(_ call: CAPPluginCall) {
        guard let raw = call.getArray("tracks") as? [[String: Any]] else {
            call.reject("tracks array required"); return
        }
        let startIndex = call.getInt("startIndex") ?? 0
        nextHref = call.getString("nextHref")

        let parsed = raw.compactMap { parseTrack($0) }
        guard !parsed.isEmpty else { call.reject("no valid tracks"); return }

        workQueue.async { [weak self] in
            self?.tracks = parsed
            self?.startPlayback(at: startIndex)
        }
        call.resolve()
    }

    /// Добавляет треки в конец очереди (JS вызывает проактивно пока экран открыт).
    @objc func appendTracks(_ call: CAPPluginCall) {
        guard let raw = call.getArray("tracks") as? [[String: Any]] else {
            call.reject("tracks required"); return
        }
        if let href = call.getString("nextHref") { nextHref = href }
        let parsed = raw.compactMap { parseTrack($0) }

        workQueue.async { [weak self] in
            self?.tracks.append(contentsOf: parsed)
        }
        call.resolve()
    }

    /// Обновляет credentials (например после re-login).
    @objc func updateCredentials(_ call: CAPPluginCall) {
        if let t = call.getString("accessToken") { accessToken = t }
        if let c = call.getString("clientId")    { clientId = c }
        call.resolve()
    }

    /// Обновляет активность кнопки лайка на экране блокировки.
    @objc func setLiked(_ call: CAPPluginCall) {
        let isLiked = call.getBool("isLiked") ?? false
        DispatchQueue.main.async {
            MPRemoteCommandCenter.shared().likeCommand.isActive = isLiked
        }
        call.resolve()
    }

    // MARK: - JS API: управление плеером

    @objc func play(_ call: CAPPluginCall) {
        player?.play(); call.resolve()
    }

    @objc func pause(_ call: CAPPluginCall) {
        player?.pause(); call.resolve()
    }

    @objc func seekTo(_ call: CAPPluginCall) {
        let s = call.getDouble("time") ?? 0
        player?.seek(to: CMTime(seconds: s, preferredTimescale: 600))
        call.resolve()
    }

    @objc func skipToNext(_ call: CAPPluginCall? = nil) {
        workQueue.async { [weak self] in
            guard let self else { return }
            if self.currentIndex + 1 < self.tracks.count {
                self.startPlayback(at: self.currentIndex + 1)
            }
        }
        call?.resolve()
    }

    @objc func skipToPrevious(_ call: CAPPluginCall? = nil) {
        let t = CMTimeGetSeconds(player?.currentTime() ?? .zero)
        if t > 3 {
            player?.seek(to: .zero)
        } else {
            workQueue.async { [weak self] in
                guard let self else { return }
                self.startPlayback(at: max(0, self.currentIndex - 1))
            }
        }
        call?.resolve()
    }

    /// Возвращает текущее состояние плеера — вызывается когда экран разблокируется,
    /// чтобы синхронизировать Jotai atoms в JS.
    @objc func getState(_ call: CAPPluginCall) {
        let time     = CMTimeGetSeconds(player?.currentTime() ?? .zero)
        let dur      = player?.currentItem?.duration
        let duration = (dur?.isNumeric == true) ? CMTimeGetSeconds(dur!) : 0.0
        let isPlaying = (player?.rate ?? 0) > 0

        var result: [String: Any] = [
            "isPlaying":    isPlaying,
            "currentTime":  time,
            "duration":     duration,
            "currentIndex": currentIndex,
            "queueLength":  tracks.count,
            "nextHref":     nextHref ?? "",
        ]
        if currentIndex >= 0 && currentIndex < tracks.count {
            let t = tracks[currentIndex]
            result["track"] = ["id": t.id, "title": t.title, "artist": t.artist, "artwork": t.artwork]
        }
        call.resolve(result)
    }

    // MARK: - Настройка AVAudioSession

    private func setupAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[NativePlayer] AVAudioSession: \(error)")
        }
    }

    // MARK: - Настройка AVPlayer

    private func setupPlayer() {
        player = AVPlayer()
        player?.automaticallyWaitsToMinimizeStalling = true

        // Обновление прогресса — каждую секунду
        let interval = CMTime(seconds: 1, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            self?.handleTimeUpdate(time: time)
        }

        // Конец трека
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerItemDidEnd),
            name: .AVPlayerItemDidPlayToEndTime,
            object: nil
        )
    }

    // MARK: - Настройка экрана блокировки (MPRemoteCommandCenter)

    private func setupRemoteCommandCenter() {
        let cc = MPRemoteCommandCenter.shared()

        cc.playCommand.isEnabled = true
        cc.playCommand.addTarget { [weak self] _ in self?.player?.play(); return .success }

        cc.pauseCommand.isEnabled = true
        cc.pauseCommand.addTarget { [weak self] _ in self?.player?.pause(); return .success }

        cc.nextTrackCommand.isEnabled = true
        cc.nextTrackCommand.addTarget { [weak self] _ in self?.skipToNext(); return .success }

        cc.previousTrackCommand.isEnabled = true
        cc.previousTrackCommand.addTarget { [weak self] _ in self?.skipToPrevious(); return .success }

        // Кнопка лайка — уведомляет JS, JS делает API-запрос когда проснётся
        cc.likeCommand.isEnabled = true
        cc.likeCommand.localizedTitle = "Like"
        cc.likeCommand.addTarget { [weak self] _ in
            self?.notifyListeners("likePressed", data: [:])
            return .success
        }

        cc.changePlaybackPositionCommand.isEnabled = true
        cc.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            self?.player?.seek(to: CMTime(seconds: e.positionTime, preferredTimescale: 600))
            return .success
        }
    }

    // MARK: - Воспроизведение

    private func startPlayback(at index: Int) {
        guard index >= 0 && index < tracks.count else { return }
        currentIndex = index

        // Уведомить JS о смене трека (получит когда экран разблокируется)
        notifyListeners("trackChanged", data: [
            "index": index,
            "track": [
                "id": tracks[index].id,
                "title": tracks[index].title,
                "artist": tracks[index].artist,
                "artwork": tracks[index].artwork,
            ]
        ])

        // Проверить нужно ли расширять очередь
        maybeExtendQueue()

        // Заранее резолвим URL следующего трека
        preloadUrl(at: index + 1)

        // Резолвим текущий трек и начинаем воспроизведение
        resolveUrl(at: index) { [weak self] url in
            guard let url, let playerUrl = URL(string: url) else {
                self?.notifyListeners("error", data: ["message": "Failed to resolve stream URL"])
                return
            }
            let item = AVPlayerItem(url: playerUrl)
            DispatchQueue.main.async {
                self?.player?.replaceCurrentItem(with: item)
                self?.player?.play()
                self?.updateNowPlaying(at: index)
            }
        }
    }

    // MARK: - Резолв URL (SC transcodingUrl → реальный CDN URL)

    /// TTL кеша: 4.5 минуты (SC CDN URL живут ~5 мин).
    private func resolveUrl(at index: Int, force: Bool = false, completion: @escaping (String?) -> Void) {
        guard index >= 0 && index < tracks.count else { completion(nil); return }
        let track = tracks[index]

        // Вернуть из кеша если свежий
        if !force,
           let cached = track.resolvedUrl,
           let cachedAt = track.resolvedAt,
           Date().timeIntervalSince(cachedAt) < 270 {
            completion(cached)
            return
        }

        // Заменяем SC API origin на прокси
        let proxied = track.transcodingUrl
            .replacingOccurrences(of: "https://api-v2.soundcloud.com", with: proxyUrl)
        let urlStr = "\(proxied)?client_id=\(clientId)"
        guard let url = URL(string: urlStr) else { completion(nil); return }

        var req = URLRequest(url: url, timeoutInterval: 10)
        req.setValue("OAuth \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: req) { [weak self] data, _, _ in
            guard let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let streamUrl = json["url"] as? String else {
                completion(nil); return
            }
            // Кешируем
            self?.workQueue.async {
                guard let self, index < self.tracks.count else { return }
                self.tracks[index].resolvedUrl = streamUrl
                self.tracks[index].resolvedAt  = Date()
            }
            completion(streamUrl)
        }.resume()
    }

    private func preloadUrl(at index: Int) {
        guard index >= 0 && index < tracks.count,
              tracks[index].resolvedUrl == nil else { return }
        resolveUrl(at: index) { _ in /* просто кешируем */ }
    }

    // MARK: - Расширение очереди (бесконечное воспроизведение)

    /// Вызывается когда в очереди остаётся ≤ 3 треков.
    /// Работает НАТИВНО — не требует JS.
    private func maybeExtendQueue() {
        let remaining = tracks.count - currentIndex
        guard remaining <= 3,
              !isFetchingNextPage,
              let href = nextHref, !href.isEmpty else { return }

        isFetchingNextPage = true
        fetchNextPage(href: href)
    }

    private func fetchNextPage(href: String) {
        let proxied = href.replacingOccurrences(
            of: "https://api-v2.soundcloud.com", with: proxyUrl
        )
        guard let url = URL(string: proxied) else {
            isFetchingNextPage = false; return
        }

        var req = URLRequest(url: url, timeoutInterval: 15)
        req.setValue("OAuth \(accessToken)", forHTTPHeaderField: "Authorization")

        URLSession.shared.dataTask(with: req) { [weak self] data, _, error in
            guard let self else { return }
            defer { self.isFetchingNextPage = false }

            guard let data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                print("[NativePlayer] fetchNextPage error: \(error?.localizedDescription ?? "?")")
                return
            }

            let newNextHref = json["next_href"] as? String
            let collection  = json["collection"] as? [[String: Any]] ?? []

            // Feed: элементы обёрнуты {type: "track", track: {...}}
            let newTracks = collection.compactMap { item -> PlayerTrack? in
                let trackData = item["track"] as? [String: Any] ?? item
                return self.parseTrack(trackData)
            }

            self.workQueue.async {
                self.nextHref = newNextHref
                self.tracks.append(contentsOf: newTracks)
                self.preloadUrl(at: self.currentIndex + 1)

                // Уведомить JS — он обновит Jotai когда экран разблокируется
                let dicts = newTracks.map { t -> [String: Any] in
                    ["id": t.id, "title": t.title, "artist": t.artist, "artwork": t.artwork]
                }
                self.notifyListeners("queueExtended", data: [
                    "tracks":   dicts,
                    "nextHref": newNextHref ?? "",
                ])
            }
        }.resume()
    }

    // MARK: - Обработчики событий плеера

    @objc private func playerItemDidEnd(_ notification: Notification) {
        workQueue.async { [weak self] in
            guard let self else { return }
            let next = self.currentIndex + 1

            if next < self.tracks.count {
                // Следующий трек уже в очереди — переключаем немедленно
                self.startPlayback(at: next)
            } else if self.nextHref != nil {
                // Очередь пуста но есть ещё страницы.
                // fetchNextPage уже запущен из maybeExtendQueue().
                // Ждём 2 секунды и пробуем снова.
                DispatchQueue.global().asyncAfter(deadline: .now() + 2) {
                    self.workQueue.async {
                        if next < self.tracks.count {
                            self.startPlayback(at: next)
                        } else {
                            self.notifyListeners("queueEmpty", data: [:])
                        }
                    }
                }
            } else {
                self.notifyListeners("queueEmpty", data: [:])
            }
        }
    }

    private func handleTimeUpdate(time: CMTime) {
        guard let item = player?.currentItem, item.duration.isNumeric else { return }

        let current   = CMTimeGetSeconds(time)
        let duration  = CMTimeGetSeconds(item.duration)
        let remaining = duration - current

        // Обновить прогресс в Now Playing
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = current
        info[MPNowPlayingInfoPropertyPlaybackRate]        = player?.rate ?? 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo   = info

        // Уведомить JS (получит только когда экран открыт — нормально)
        notifyListeners("timeUpdate", data: ["currentTime": current, "duration": duration])

        // За 90 секунд до конца — принудительно обновляем URL следующего трека
        // SC CDN URL живут ~5 мин, но трек может играть дольше паузы
        if remaining < 90 && remaining > 0 {
            workQueue.async { [weak self] in
                guard let self else { return }
                let nextIdx = self.currentIndex + 1
                if nextIdx < self.tracks.count {
                    self.resolveUrl(at: nextIdx, force: true) { _ in }
                }
            }
        }

        // Проверить нужно ли расширять очередь
        workQueue.async { [weak self] in self?.maybeExtendQueue() }
    }

    // MARK: - Now Playing (метаданные на экране блокировки)

    private func updateNowPlaying(at index: Int) {
        guard index >= 0 && index < tracks.count else { return }
        let track = tracks[index]

        var info: [String: Any] = [
            MPMediaItemPropertyTitle:                track.title,
            MPMediaItemPropertyArtist:               track.artist,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: 0,
            MPNowPlayingInfoPropertyPlaybackRate:    1.0,
        ]
        if let dur = player?.currentItem?.duration, dur.isNumeric {
            info[MPMediaItemPropertyPlaybackDuration] = CMTimeGetSeconds(dur)
        }
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info

        // Обложка — асинхронно
        guard !track.artwork.isEmpty, let artUrl = URL(string: track.artwork) else { return }
        URLSession.shared.dataTask(with: artUrl) { data, _, _ in
            guard let data, let image = UIImage(data: data) else { return }
            var updated = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
            updated[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(
                boundsSize: CGSize(width: 300, height: 300)
            ) { _ in image }
            DispatchQueue.main.async {
                MPNowPlayingInfoCenter.default().nowPlayingInfo = updated
            }
        }.resume()
    }

    // MARK: - Парсинг треков из SC API JSON

    private func parseTrack(_ data: [String: Any]) -> PlayerTrack? {
        guard let id    = data["id"]    as? Int,
              let title = data["title"] as? String else { return nil }

        let user   = data["user"] as? [String: Any]
        let artist = user?["username"] as? String ?? "Unknown"

        let rawArt = data["artwork_url"] as? String
                  ?? user?["avatar_url"] as? String
                  ?? ""
        let artwork = rawArt.replacingOccurrences(of: "-large", with: "-t300x300")

        // Предпочитаем progressive/audio/mpeg, fallback — любой progressive
        let transcodings = (data["media"] as? [String: Any])?["transcodings"] as? [[String: Any]] ?? []

        let best = transcodings.first { t in
            let f = t["format"] as? [String: Any]
            return f?["protocol"] as? String == "progressive"
                && f?["mime_type"] as? String == "audio/mpeg"
        } ?? transcodings.first { t in
            (t["format"] as? [String: Any])?["protocol"] as? String == "progressive"
        } ?? transcodings.first

        guard let transcodingUrl = best?["url"] as? String else { return nil }

        return PlayerTrack(
            id: id, title: title, artist: artist, artwork: artwork,
            transcodingUrl: transcodingUrl, resolvedUrl: nil, resolvedAt: nil
        )
    }
}
```

### 8.2 Регистрация плагина — AppDelegate.swift

```swift
import UIKit
import Capacitor
import AVFoundation

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {

    // AVAudioSession — обязательно до любого воспроизведения
    do {
      try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
      try AVAudioSession.sharedInstance().setActive(true)
    } catch { print("AVAudioSession: \(error)") }

    // Регистрация плагина
    NotificationCenter.default.addObserver(
      forName: NSNotification.Name("CAPBridgeDidLoad"),
      object: nil, queue: .main
    ) { notification in
      if let bridge = notification.object as? CAPBridgeProtocol {
        bridge.registerPluginInstance(NativePlayerPlugin())
      }
    }

    return true
  }
}
```

### 8.3 TypeScript обёртка — src/lib/nativePlayer.ts

```typescript
import { registerPlugin } from '@capacitor/core'
import type { ScTrack } from './api'

// ─── Типы ─────────────────────────────────────────────────────────────────────

export interface TrackPayload {
  id: number
  title: string
  artist: string
  artwork: string
  transcodingUrl: string  // SC API URL (через прокси), плагин сам резолвит
}

export interface NativePlayerPlugin {
  setup(opts: { accessToken: string; proxyUrl: string; clientId: string }): Promise<void>
  loadQueue(opts: { tracks: TrackPayload[]; startIndex: number; nextHref?: string }): Promise<void>
  appendTracks(opts: { tracks: TrackPayload[]; nextHref?: string }): Promise<void>
  updateCredentials(opts: { accessToken?: string; clientId?: string }): Promise<void>
  setLiked(opts: { isLiked: boolean }): Promise<void>
  play(): Promise<void>
  pause(): Promise<void>
  seekTo(opts: { time: number }): Promise<void>
  skipToNext(): Promise<void>
  skipToPrevious(): Promise<void>
  getState(): Promise<{
    isPlaying: boolean
    currentTime: number
    duration: number
    currentIndex: number
    queueLength: number
    nextHref: string
    track?: { id: number; title: string; artist: string; artwork: string }
  }>
  addListener(event: 'trackChanged', fn: (data: {
    index: number
    track: { id: number; title: string; artist: string; artwork: string }
  }) => void): Promise<{ remove(): void }>
  addListener(event: 'timeUpdate', fn: (data: { currentTime: number; duration: number }) => void): Promise<{ remove(): void }>
  addListener(event: 'likePressed', fn: () => void): Promise<{ remove(): void }>
  addListener(event: 'queueExtended', fn: (data: {
    tracks: TrackPayload[]
    nextHref: string
  }) => void): Promise<{ remove(): void }>
  addListener(event: 'queueEmpty', fn: () => void): Promise<{ remove(): void }>
  addListener(event: 'error', fn: (data: { message: string }) => void): Promise<{ remove(): void }>
}

export const NativePlayer = registerPlugin<NativePlayerPlugin>('NativePlayerPlugin')

// ─── Хелпер: конвертировать ScTrack → TrackPayload ───────────────────────────

export function toPayload(track: ScTrack, proxyUrl: string): TrackPayload | null {
  // Найти лучший transcoding: progressive/audio/mpeg
  const transcodings = track.media?.transcodings ?? []
  const best = transcodings.find(t =>
    t.format?.protocol === 'progressive' && t.format?.mime_type === 'audio/mpeg'
  ) ?? transcodings.find(t =>
    t.format?.protocol === 'progressive'
  ) ?? transcodings[0]

  if (!best?.url) return null

  // Заменить SC API origin на прокси
  const transcodingUrl = best.url.replace('https://api-v2.soundcloud.com', proxyUrl)

  return {
    id: track.id,
    title: track.title,
    artist: track.user.username,
    artwork: (track.artwork_url ?? track.user.avatar_url ?? '').replace('-large', '-t300x300'),
    transcodingUrl,
  }
}
```

### 8.4 Новый player.ts — src/lib/player.ts

Теперь player.ts — тонкая обёртка вокруг нативного плагина:

```typescript
import { NativePlayer, toPayload } from './nativePlayer'
import type { ScTrack } from './api'

const PROXY_URL = import.meta.env.VITE_PROXY_URL as string

// ─── State ────────────────────────────────────────────────────────────────────

type PlayerListener = () => void
const listeners = new Set<PlayerListener>()
export const subscribePlayer = (fn: PlayerListener) => { listeners.add(fn); return () => listeners.delete(fn) }
const notify = () => listeners.forEach(fn => fn())

export type PlayerState = {
  track: ScTrack | null
  isPlaying: boolean
  currentTime: number
  duration: number
  isLoading: boolean
  error: string | null
}

let state: PlayerState = { track: null, isPlaying: false, currentTime: 0, duration: 0, isLoading: false, error: null }
export const getPlayerState = (): PlayerState => state
const setState = (patch: Partial<PlayerState>) => { state = { ...state, ...patch }; notify() }

// ─── Queue (зеркало нативной очереди) ────────────────────────────────────────

let _scTracks: ScTrack[] = []          // для маппинга index → ScTrack в событиях
let _onAutoAdvance: ((t: ScTrack, i: number) => void) | null = null
let _onQueueExtended: ((tracks: ScTrack[]) => void) | null = null

export const setAutoAdvanceCallback = (fn: typeof _onAutoAdvance) => { _onAutoAdvance = fn }
export const setQueueExtendedCallback = (fn: typeof _onQueueExtended) => { _onQueueExtended = fn }

// ─── Инициализация ────────────────────────────────────────────────────────────

let _initialized = false

export async function initPlayer(accessToken: string, clientId: string) {
  if (_initialized) return
  _initialized = true

  await NativePlayer.setup({ accessToken, proxyUrl: PROXY_URL, clientId })

  // Смена трека (работает и при заблокированном экране — уведомление в очередь)
  await NativePlayer.addListener('trackChanged', ({ index, track }) => {
    const scTrack = _scTracks[index]
    if (scTrack) {
      setState({ track: scTrack, isLoading: false, currentTime: 0, duration: 0, error: null })
      _onAutoAdvance?.(scTrack, index)
    }
  })

  // Прогресс воспроизведения (только когда экран открыт)
  await NativePlayer.addListener('timeUpdate', ({ currentTime, duration }) => {
    setState({ currentTime, duration, isPlaying: true, isLoading: false })
  })

  // Очередь расширена нативным плагином пока экран был заблокирован
  await NativePlayer.addListener('queueExtended', ({ tracks: payloads }) => {
    // Восстановить ScTrack объекты из кеша или создать минимальные
    // В реальном приложении здесь синхронизируем с Feed store
    _onQueueExtended?.(payloads as unknown as ScTrack[])
  })

  await NativePlayer.addListener('likePressed', async () => {
    if (!state.track) return
    const { sc } = await import('./api')
    await sc.like(state.track.id)
    await NativePlayer.setLiked({ isLiked: true })
    notify()
  })

  await NativePlayer.addListener('queueEmpty', () => {
    setState({ isPlaying: false })
  })

  await NativePlayer.addListener('error', ({ message }) => {
    setState({ error: message, isLoading: false, isPlaying: false })
  })
}

// ─── Загрузка очереди ─────────────────────────────────────────────────────────

export async function loadQueue(tracks: ScTrack[], startIndex: number, nextHref?: string) {
  _scTracks = tracks

  const payloads = tracks.map(t => toPayload(t, PROXY_URL)).filter(Boolean) as ReturnType<typeof toPayload>[]

  const startTrack = tracks[startIndex]
  if (startTrack) setState({ track: startTrack, isLoading: true, error: null })

  await NativePlayer.loadQueue({
    tracks: payloads as any,
    startIndex,
    nextHref,
  })
}

// ─── Управление ───────────────────────────────────────────────────────────────

export const play           = () => NativePlayer.play()
export const pause          = () => NativePlayer.pause()
export const togglePlay     = () => state.isPlaying ? pause() : play()
export const seek           = (t: number) => NativePlayer.seekTo({ time: t })
export const skipToNext     = () => NativePlayer.skipToNext()
export const skipToPrevious = () => NativePlayer.skipToPrevious()

// Синхронизация когда экран разблокируется (вызывать из App.tsx на visibilitychange)
export async function syncFromNative() {
  const s = await NativePlayer.getState()
  const track = s.track ? _scTracks[s.currentIndex] ?? null : null
  setState({ isPlaying: s.isPlaying, currentTime: s.currentTime, duration: s.duration, track })
}

// Обновить credentials после логина
export const updateCredentials = (accessToken: string, clientId: string) =>
  NativePlayer.updateCredentials({ accessToken, clientId })
```

### 8.5 Синхронизация при разблокировке — App.tsx

```typescript
import { syncFromNative } from './lib/player'

// Когда экран разблокируется — JS просыпается и синхронизирует состояние
useEffect(() => {
  const handler = () => {
    if (document.visibilityState === 'visible') {
      syncFromNative()
    }
  }
  document.addEventListener('visibilitychange', handler)
  return () => document.removeEventListener('visibilitychange', handler)
}, [])
```

---

## Трудоёмкость

| Фаза | Сложность | Примечание |
|------|----------|-----------|
| Установка Capacitor + конфиг | Низкая | 1–2 ч |
| Info.plist + AppDelegate.swift | Низкая | 30 мин |
| Swift-плагин NativePlayerPlugin | Средняя | 4–6 ч |
| Новый player.ts + nativePlayer.ts | Средняя | 2–4 ч |
| GitHub Actions workflow | Средняя | 1–2 ч |
| Сертификат (один раз на Mac) | Средняя | 30–60 мин |
| AltStore Classic установка | Низкая | 30 мин |
| **Итого** | | **~2–3 рабочих дня** |

**Ключевое преимущество перед React Native:** весь UI, все страницы, shadcn, Tailwind,
Jotai, TanStack Query, API-клиент — не трогаешь. Только player.ts (~100 строк) + ~400 строк Swift.
