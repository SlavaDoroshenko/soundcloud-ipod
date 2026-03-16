/**
 * OAuth callback страница.
 * SoundCloud редиректит сюда после логина.
 * Если это popup — просто рендерим ничего, parent window перехватит URL через поллинг.
 * Если это основное окно — показываем сообщение.
 */
export default function AuthCallbackPage() {
  const isPopup = window.opener !== null

  if (isPopup) {
    // popup — parent window сам считает токен из URL
    return null
  }

  // Не попап — покажем заглушку (не должно случиться в нормальном флоу)
  return (
    <div className="flex items-center justify-center min-h-dvh">
      <p className="text-muted-foreground">Авторизация завершается...</p>
    </div>
  )
}
