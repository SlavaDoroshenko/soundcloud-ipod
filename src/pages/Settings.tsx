import { useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { isAuthenticatedAtom, currentUserAtom, accessTokenAtom, saveUserCache } from '@/stores/auth'
import { loginWithToken, logout, fetchCurrentUser } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LogOut, User, Copy, Check, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

const TOKEN_SNIPPET = `(()=>{const t=localStorage.getItem('oauth_token');if(t){console.log('%c✓ Твой токен (скопируй всё ниже):','color:#ff5500;font-weight:bold;font-size:14px');console.log(t);}else{console.warn('oauth_token не найден. Убедись что ты залогинен на soundcloud.com');}})();`

const DD_SNIPPET = `(()=>{const ls=localStorage.getItem('datadome');const ck=document.cookie.match(/(?:^|;\\s*)datadome=([^;]*)/)?.[1];const v=ls||ck;if(v){console.log('%c✓ DataDome токен (скопируй):','color:#ff8800;font-weight:bold;font-size:14px');console.log(v);}else{console.warn('datadome не найден. Убедись что ты на soundcloud.com и залогинен.');}})();`

const STEPS = [
  { text: 'Открой', link: { href: 'https://soundcloud.com', label: 'soundcloud.com' }, suffix: ' и войди в аккаунт' },
  { text: 'Нажми F12 → вкладка Console' },
  { text: 'Вставь скрипт ниже и нажми Enter' },
  { text: 'Скопируй токен из вывода консоли' },
  { text: 'Вставь токен в поле ниже' },
]

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
      {children}
    </p>
  )
}

export default function SettingsPage() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const currentUser     = useAtomValue(currentUserAtom)
  const setToken        = useSetAtom(accessTokenAtom)
  const setUser         = useSetAtom(currentUserAtom)

  const [tokenInput, setTokenInput] = useState('')
  const [isLoading, setIsLoading]   = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)
  const [ddInput, setDdInput]       = useState('')
  const [ddCopied, setDdCopied]     = useState(false)
  const [ddSaved, setDdSaved]       = useState(() => !!localStorage.getItem('sc_dd_clientid'))

  async function handleLogin() {
    const token = tokenInput.trim()
    if (!token) return
    setIsLoading(true)
    setError(null)
    const result = await loginWithToken(token)
    if (result.success) {
      setToken(token)
      try { const u = await fetchCurrentUser(); setUser(u); saveUserCache(u) } catch { /* ok */ }
      setTokenInput('')
    } else {
      setError(result.error)
    }
    setIsLoading(false)
  }

  async function handleLogout() {
    await logout()
    setToken(null)
    setUser(null)
    saveUserCache(null)
  }

  function copySnippet() {
    navigator.clipboard.writeText(TOKEN_SNIPPET).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function copyDdSnippet() {
    navigator.clipboard.writeText(DD_SNIPPET).then(() => {
      setDdCopied(true)
      setTimeout(() => setDdCopied(false), 2000)
    })
  }

  function saveDdToken() {
    const val = ddInput.trim()
    if (!val) return
    localStorage.setItem('sc_dd_clientid', val)
    setDdInput('')
    setDdSaved(true)
  }

  return (
    <div className="px-4 pt-6 pb-6">
      <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-1">Профиль</p>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Настройки</h1>

      {/* Account */}
      <div className="mb-4">
        <SectionLabel>Аккаунт</SectionLabel>

        {isAuthenticated ? (
          <div className={cn(
            'rounded-2xl border border-border/50 p-4',
            'bg-card/60 backdrop-blur-sm',
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {currentUser?.avatar_url ? (
                  <img
                    src={currentUser.avatar_url}
                    alt={currentUser.username}
                    className="w-12 h-12 rounded-xl object-cover ring-1 ring-white/10"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center ring-1 ring-white/5">
                    <User className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold">{currentUser?.username ?? 'Пользователь'}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    <p className="text-xs text-muted-foreground">Авторизован</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors px-3 py-2 rounded-xl hover:bg-destructive/10"
              >
                <LogOut className="w-3.5 h-3.5" />
                Выйти
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Steps */}
            <div className="rounded-2xl border border-border/50 bg-card/60 p-4 space-y-3">
              {STEPS.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-xs font-bold text-primary shrink-0 w-4 mt-0.5">{i + 1}</span>
                  <span className="text-sm text-muted-foreground leading-relaxed">
                    {step.text}
                    {step.link && (
                      <a
                        href={step.link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary mx-1 hover:underline"
                      >
                        {step.link.label}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {step.suffix}
                  </span>
                </div>
              ))}
            </div>

            {/* Snippet */}
            <div className="rounded-2xl border border-border/50 bg-secondary/40 p-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-muted-foreground tracking-wide">Скрипт для консоли</span>
                <button
                  onClick={copySnippet}
                  className={cn(
                    'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all',
                    copied
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                  )}
                >
                  {copied
                    ? <><Check className="w-3 h-3" /> Скопировано</>
                    : <><Copy className="w-3 h-3" /> Копировать</>}
                </button>
              </div>
              <p className="font-mono text-xs text-muted-foreground/70 break-all leading-relaxed line-clamp-2">
                {TOKEN_SNIPPET}
              </p>
            </div>

            {/* Token input */}
            <div className="space-y-2">
              <Input
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder="Вставь токен сюда..."
                className="bg-secondary/60 border-0 h-11 rounded-xl font-mono text-xs focus-visible:ring-1 focus-visible:ring-primary/60"
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
              />
              <Button
                onClick={handleLogin}
                disabled={isLoading || !tokenInput.trim()}
                className="w-full h-11 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-white transition-all active:scale-[0.98]"
              >
                {isLoading ? 'Проверяю...' : 'Войти'}
              </Button>
              {error && (
                <p className="text-xs text-destructive px-1">{error}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* DataDome token — only when authenticated */}
      {isAuthenticated && (
        <div className="mb-4">
          <SectionLabel>Лайки (DataDome)</SectionLabel>
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/50 bg-card/60 p-4 space-y-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                SoundCloud требует специальный токен для лайков. Открой{' '}
                <a href="https://soundcloud.com" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
                  soundcloud.com <ExternalLink className="w-3 h-3" />
                </a>
                , вставь скрипт в консоль (F12), затем лайкни любой трек — токен появится в консоли.
              </p>
              {ddSaved && (
                <div className="flex items-center gap-1.5 text-xs text-primary">
                  <Check className="w-3 h-3" /> Токен сохранён
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border/50 bg-secondary/40 p-4">
              <div className="flex items-center justify-between mb-2.5">
                <span className="text-xs font-semibold text-muted-foreground tracking-wide">Скрипт для консоли</span>
                <button
                  onClick={copyDdSnippet}
                  className={cn(
                    'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg transition-all',
                    ddCopied
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary',
                  )}
                >
                  {ddCopied
                    ? <><Check className="w-3 h-3" /> Скопировано</>
                    : <><Copy className="w-3 h-3" /> Копировать</>}
                </button>
              </div>
              <p className="font-mono text-xs text-muted-foreground/70 break-all leading-relaxed line-clamp-2">
                {DD_SNIPPET}
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                value={ddInput}
                onChange={e => setDdInput(e.target.value)}
                placeholder="Вставь DataDome токен сюда..."
                className="bg-secondary/60 border-0 h-11 rounded-xl font-mono text-xs focus-visible:ring-1 focus-visible:ring-primary/60"
                onKeyDown={e => e.key === 'Enter' && saveDdToken()}
              />
              <Button
                onClick={saveDdToken}
                disabled={!ddInput.trim()}
                className="h-11 px-4 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-white shrink-0 transition-all active:scale-[0.98]"
              >
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* About */}
      <div>
        <SectionLabel>О приложении</SectionLabel>
        <div className="rounded-2xl border border-border/50 bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">SoundCloud PWA</p>
              <p className="text-xs text-muted-foreground mt-0.5">Неофициальный клиент · v0.1.0</p>
            </div>
            <div className="w-8 h-8 rounded-xl bg-linear-to-br from-primary to-orange-400 flex items-center justify-center">
              <span className="text-white font-black text-xs">SC</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
