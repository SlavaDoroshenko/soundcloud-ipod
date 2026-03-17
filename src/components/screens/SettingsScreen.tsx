import { useState } from 'react'
import { useAtomValue, useSetAtom, useAtom } from 'jotai'
import { isAuthenticatedAtom, currentUserAtom, accessTokenAtom, saveUserCache } from '@/stores/auth'
import { controlModeAtom, type ControlMode } from '@/stores/settings'
import { loginWithToken, logout, fetchCurrentUser } from '@/lib/auth'
import { refreshDataDomeCookie } from '@/lib/api'

const TOKEN_SNIPPET = `(()=>{const t=localStorage.getItem('oauth_token');if(t){console.log(t);}else{console.warn('oauth_token не найден');}})();`

const DD_SNIPPET = `(()=>{const ls=localStorage.getItem('datadome');const ck=document.cookie.match(/(?:^|;\\s*)datadome=([^;]*)/)?.[1];const v=ls||ck;if(v){console.log(v);}else{console.warn('datadome не найден');}})();`

type RowProps = {
  label: string
  value?: string
  onTap?: () => void
  destructive?: boolean
  children?: React.ReactNode
}
function Row({ label, value, onTap, destructive, children }: RowProps) {
  return (
    <div
      onPointerDown={onTap}
      className={onTap ? 'active:opacity-60 cursor-pointer' : ''}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 12px',
        minHeight: '36px',
        borderBottom: '1px solid #1e1e1e',
      }}
    >
      <span style={{ fontSize: '14px', color: destructive ? '#ff453a' : '#fff' }}>
        {label}
      </span>
      {value && (
        <span style={{ fontSize: '13px', color: '#8a8a8a' }}>{value}</span>
      )}
      {children}
    </div>
  )
}

type SectionHeaderProps = { label: string }
function SectionHeader({ label }: SectionHeaderProps) {
  return (
    <div style={{
      padding: '6px 12px 3px',
      fontSize: '11px',
      fontWeight: 700,
      color: '#8a8a8a',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      background: '#0a0a0a',
      borderBottom: '1px solid #1e1e1e',
    }}>
      {label}
    </div>
  )
}

export default function SettingsScreen() {
  const isAuthenticated = useAtomValue(isAuthenticatedAtom)
  const currentUser = useAtomValue(currentUserAtom)
  const setToken = useSetAtom(accessTokenAtom)
  const setUser = useSetAtom(currentUserAtom)
  const [controlMode, setControlMode] = useAtom(controlModeAtom)

  const [tokenInput, setTokenInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [showInput, setShowInput] = useState(false)

  const [ddInput, setDdInput] = useState('')
  const [ddCopied, setDdCopied] = useState(false)
  const [showDdInput, setShowDdInput] = useState(false)
  const [ddSaved, setDdSaved] = useState(() => !!localStorage.getItem('sc_dd_clientid'))
  const [ddAutoLoading, setDdAutoLoading] = useState(false)
  const [ddAutoStatus, setDdAutoStatus] = useState<string | null>(null)

  async function handleLogin() {
    const token = tokenInput.trim()
    if (!token) return
    setIsLoading(true)
    setError(null)
    const result = await loginWithToken(token)
    if (result.success) {
      setToken(token)
      try {
        const u = await fetchCurrentUser()
        setUser(u)
        saveUserCache(u)
      } catch { /* ok */ }
      setTokenInput('')
      setShowInput(false)
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
    const token = ddInput.trim()
    if (!token) return
    localStorage.setItem('sc_dd_clientid', token)
    setDdInput('')
    setShowDdInput(false)
    setDdSaved(true)
  }

  function clearDdToken() {
    localStorage.removeItem('sc_dd_clientid')
    setDdSaved(false)
    setDdAutoStatus(null)
  }

  async function autoDetectDdCookie() {
    setDdAutoLoading(true)
    setDdAutoStatus(null)
    const ok = await refreshDataDomeCookie()
    setDdAutoLoading(false)
    if (ok) {
      setDdSaved(true)
      setDdAutoStatus('Cookie получен автоматически ✓')
    } else {
      setDdAutoStatus('Не удалось — введите вручную ↓')
    }
  }

  function toggleMode(mode: ControlMode) {
    setControlMode(mode)
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: '#000' }}>

      {/* Account */}
      <SectionHeader label="Account" />
      {isAuthenticated ? (
        <>
          <Row label={currentUser?.username ?? 'Logged In'} value="●" />
          <Row label="Sign Out" destructive onTap={handleLogout} />
        </>
      ) : (
        <>
          <Row
            label="Copy Token Script"
            value={copied ? '✓' : 'Copy'}
            onTap={copySnippet}
          />
          <Row
            label="Enter Token"
            onTap={() => setShowInput(v => !v)}
          />
          {showInput && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e1e1e' }}>
              <input
                autoFocus
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Paste token here..."
                style={{
                  width: '100%',
                  background: '#1a1a1a',
                  border: '1px solid #3a3a3a',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                }}
              />
              <button
                onPointerDown={handleLogin}
                disabled={isLoading || !tokenInput.trim()}
                style={{
                  marginTop: '6px',
                  width: '100%',
                  padding: '6px',
                  background: isLoading ? '#2a2a2a' : '#3478c4',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isLoading ? 'Verifying...' : 'Sign In'}
              </button>
              {error && (
                <p style={{ color: '#ff453a', fontSize: '12px', marginTop: '4px' }}>{error}</p>
              )}
            </div>
          )}
          <div style={{
            padding: '8px 12px',
            fontSize: '11px',
            color: '#8a8a8a',
            lineHeight: 1.5,
            borderBottom: '1px solid #1e1e1e',
          }}>
            1. Open soundcloud.com → F12 → Console{'\n'}
            2. Paste the copied script → press Enter{'\n'}
            3. Copy the token → Enter Token above
          </div>
        </>
      )}

      {/* DataDome — required for liking tracks */}
      <SectionHeader label="DataDome Token" />
      {ddSaved ? (
        <>
          <Row label="Cookie активен ✓" value="Сбросить" onTap={clearDdToken} />
          <Row
            label={ddAutoLoading ? 'Загрузка...' : 'Обновить автоматически'}
            onTap={ddAutoLoading ? undefined : autoDetectDdCookie}
          />
          {ddAutoStatus && (
            <div style={{ padding: '6px 12px', fontSize: '11px', color: '#8a8a8a', borderBottom: '1px solid #1e1e1e' }}>
              {ddAutoStatus}
            </div>
          )}
        </>
      ) : (
        <>
          <Row
            label={ddAutoLoading ? 'Загрузка soundcloud.com...' : 'Получить автоматически'}
            onTap={ddAutoLoading ? undefined : autoDetectDdCookie}
          />
          {ddAutoStatus && (
            <div style={{ padding: '6px 12px', fontSize: '11px', color: '#8a8a8a', borderBottom: '1px solid #1e1e1e' }}>
              {ddAutoStatus}
            </div>
          )}
          <Row
            label="Copy Script"
            value={ddCopied ? '✓' : 'Copy'}
            onTap={copyDdSnippet}
          />
          <Row
            label="Ввести вручную"
            onTap={() => setShowDdInput(v => !v)}
          />
          {showDdInput && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #1e1e1e' }}>
              <input
                autoFocus
                value={ddInput}
                onChange={e => setDdInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveDdToken()}
                placeholder="Вставить datadome cookie..."
                style={{
                  width: '100%',
                  background: '#1a1a1a',
                  border: '1px solid #3a3a3a',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  color: '#fff',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  outline: 'none',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                }}
              />
              <button
                onPointerDown={saveDdToken}
                disabled={!ddInput.trim()}
                style={{
                  marginTop: '6px',
                  width: '100%',
                  padding: '6px',
                  background: !ddInput.trim() ? '#2a2a2a' : '#3478c4',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Сохранить
              </button>
            </div>
          )}
          <div style={{
            padding: '8px 12px',
            fontSize: '11px',
            color: '#8a8a8a',
            lineHeight: 1.5,
            borderBottom: '1px solid #1e1e1e',
          }}>
            Нужен для лайков. Попробуй «Получить автоматически» — откроется soundcloud.com в фоне.
            Если не сработает: Safari → soundcloud.com → запусти скрипт → скопируй токен.
          </div>
        </>
      )}

      {/* Control Mode */}
      <SectionHeader label="Control Mode" />
      <Row
        label="Wheel"
        value={controlMode === 'wheel' ? '✓' : ''}
        onTap={() => toggleMode('wheel')}
      />
      <Row
        label="Touch"
        value={controlMode === 'touch' ? '✓' : ''}
        onTap={() => toggleMode('touch')}
      />

      {/* About */}
      <SectionHeader label="About" />
      <Row label="SoundCloud iPod" value="v0.1" />
    </div>
  )
}
