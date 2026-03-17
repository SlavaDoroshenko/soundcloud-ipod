# Backlog

## Лайки на iOS — СТАТУС: НЕ РЕШЕНО (v1.0.38–v1.0.41)

Три попытки, ни одна не сработала стабильно:

1. **v1.0.38** — JSON обрезался до 400 символов → parseCaptchaUrl не мог распарсить → капча не открывалась. Исправлено.
2. **v1.0.39** — Убрана обрезка, но Worker делал первый запрос → challenge для IP воркера → retry с IP устройства → разные IP → 403.
3. **v1.0.40** — Первый запрос через NativeAPIPlugin (URLSession, IP устройства) → challenge для устройства → капча решена → retry URLSession → СНОВА 403. Причина: DataDome блокирует URLSession по TLS/HTTP fingerprint.
4. **v1.0.41** — NativeAPIPlugin переписан на WKWebView (браузерный fingerprint). Технически должно работать, но не проверено — пользователь переключился на другую задачу.

**Что попробовать дальше если понадобится:**
- Проверить v1.0.41 (WKWebView подход) — возможно работает
- Если нет: сохранять datadome cookie после solve и forcefully устанавливать его через httpCookieStore для .soundcloud.com перед WKWebView запросом
- Альтернатива: открывать soundcloud.com в SFSafariViewController (не WKWebView) — имеет общий cookie jar с Safari



## Дизайн

- [x] **NowPlayingScreen — аутентичный вид iPod Classic**
  - Убрать кнопки prev/play/next с экрана (управление только через колесо)
  - Убрать shuffle/repeat с экрана (или в отдельное меню)
  - Увеличить обложку (~70% высоты экрана)
  - Тонкая полоска с названием + исполнителем под обложкой
  - Минималистичный прогресс-бар без лишних элементов
- [x] **Click Wheel — уменьшить чувствительность**
  - DEG_PER_TICK: 9 → 15 (~24 тиков на оборот)
  - Threshold прокрутки: 8px → 12px
  - Momentum decay: 0.92 → 0.88 (быстрее затухает)
  - Momentum threshold: 0.3 → 0.5 deg/ms
  - Velocity cap: 3 deg/ms макс
