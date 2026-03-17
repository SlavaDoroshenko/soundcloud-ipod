/**
 * SoundCloud PWA — Cloudflare Worker
 *
 * Маршруты:
 *   GET  /auth/start    — генерирует PKCE, редиректит на SC authorize
 *   GET  /auth/callback — принимает code от SC, меняет на token, редиректит в PWA
 *   GET  /__sc_home     — проксирует soundcloud.com для client_id extraction
 *   *    /*             — проксирует api-v2.soundcloud.com + ad blocking
 *
 * Secrets (wrangler secret put):
 *   SOUNDCLOUD_CLIENT_ID
 *   SOUNDCLOUD_CLIENT_SECRET
 *   PWA_ORIGIN  (например https://soundcloud-pwa.pages.dev)
 */

const SOUNDCLOUD_ORIGIN = 'https://soundcloud.com'
const SOUNDCLOUD_API    = 'https://api-v2.soundcloud.com'
const SOUNDCLOUD_AUTH   = 'https://secure.soundcloud.com'

// ─── Ad block list ─────────────────────────────────────────────────────────

const BLOCKED_DOMAINS = [
  'googletagmanager.com', 'google-analytics.com', 'doubleclick.net',
  'quantserve.com', 'taboola.com', 'scorecardresearch.com', 'moatads.com',
  'facebook.net', 'ads.twitter.com', 'advertising.com', 'criteo.com',
  'amazon-adsystem.com', 'adsrvr.org', 'demdex.net', 'bluekai.com',
  'krxd.net', 'pubmatic.com', 'rubiconproject.com', 'openx.net',
  'rlcdn.com', 'adnxs.com', 'outbrain.com', 'zemanta.com',
  'nr-data.net', 'newrelic.com', 'sentry.io', 'bugsnag.com',
  'segment.io', 'segment.com', 'mixpanel.com', 'amplitude.com',
  'hotjar.com', 'fullstory.com', 'logrocket.com', 'intercom.io',
  'iovation.com', 'chartbeat.com', 'parsely.com', 'branch.io',
]

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range, x-datadome-id',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, x-datadome-id',
}

// ─── PKCE helpers ──────────────────────────────────────────────────────────

function generateRandom(length = 32) {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function sha256base64url(plain) {
  const encoder = new TextEncoder()
  const data = encoder.encode(plain)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCharCode(...new Uint8Array(hash)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

// ─── KV-less ephemeral state: encode verifier in state param ───────────────
// Кодируем verifier прямо в state (base64url), подписываем HMAC.
// Не нужен KV storage — Worker stateless.

async function signState(verifier, clientSecret) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(clientSecret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(verifier))
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  // state = base64url(verifier) + '.' + signature
  const verB64 = btoa(verifier).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
  return `${verB64}.${sigB64}`
}

async function verifyState(state, clientSecret) {
  const [verB64, sig] = state.split('.')
  if (!verB64 || !sig) return null
  const verifier = atob(verB64.replace(/-/g, '+').replace(/_/g, '/'))
  const expected = await signState(verifier, clientSecret)
  if (expected !== state) return null
  return verifier
}

// ─── Auth routes ───────────────────────────────────────────────────────────

async function handleAuthStart(url, env) {
  if (!env.SOUNDCLOUD_CLIENT_ID) {
    return new Response('SOUNDCLOUD_CLIENT_ID not configured', { status: 500 })
  }

  const verifier = generateRandom(43)
  const challenge = await sha256base64url(verifier)
  const state = await signState(verifier, env.SOUNDCLOUD_CLIENT_SECRET ?? 'no-secret')

  const redirectUri = `${new URL(url).origin}/auth/callback`
  const pwaOrigin = env.PWA_ORIGIN ?? url.origin

  const authUrl = new URL(`${SOUNDCLOUD_AUTH}/authorize`)
  authUrl.searchParams.set('client_id', env.SOUNDCLOUD_CLIENT_ID)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('scope', 'upload')

  // Сохраняем pwa_origin в state через дополнительный параметр
  authUrl.searchParams.set('display', 'popup')

  return Response.redirect(authUrl.toString(), 302)
}

async function handleAuthCallback(url, env) {
  const code  = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const pwaOrigin = env.PWA_ORIGIN ?? url.origin
  const redirectUri = `${new URL(url).origin}/auth/callback`

  if (error) {
    return Response.redirect(`${pwaOrigin}/auth/result?error=${encodeURIComponent(error)}`, 302)
  }

  if (!code || !state) {
    return Response.redirect(`${pwaOrigin}/auth/result?error=missing_params`, 302)
  }

  // Верифицируем state и достаём verifier
  const verifier = await verifyState(state, env.SOUNDCLOUD_CLIENT_SECRET ?? 'no-secret')
  if (!verifier) {
    return Response.redirect(`${pwaOrigin}/auth/result?error=invalid_state`, 302)
  }

  // Меняем code на token
  const tokenRes = await fetch(`${SOUNDCLOUD_AUTH}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     env.SOUNDCLOUD_CLIENT_ID,
      client_secret: env.SOUNDCLOUD_CLIENT_SECRET,
      code,
      redirect_uri:  redirectUri,
      code_verifier: verifier,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    console.error('Token exchange failed:', tokenRes.status, text)
    return Response.redirect(`${pwaOrigin}/auth/result?error=token_exchange_failed`, 302)
  }

  const { access_token } = await tokenRes.json()

  // Редиректим в PWA с токеном в hash (не в query string — не логируется в серверах)
  return Response.redirect(`${pwaOrigin}/auth/result#token=${encodeURIComponent(access_token)}`, 302)
}

// ─── Main handler ──────────────────────────────────────────────────────────

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // OAuth routes
  if (url.pathname === '/auth/start')    return handleAuthStart(url.toString(), env)
  if (url.pathname === '/auth/callback') return handleAuthCallback(url, env)

  // SC homepage proxy (для client_id extraction)
  if (url.pathname === '/__sc_home') {
    return proxyTo(SOUNDCLOUD_ORIGIN + '/', request, ctx)
  }

  // API proxy
  const targetUrl = SOUNDCLOUD_API + url.pathname + url.search
  const targetUrlObj = new URL(targetUrl)

  if (BLOCKED_DOMAINS.some(d => targetUrlObj.hostname.includes(d))) {
    return new Response('', { status: 204, headers: CORS_HEADERS })
  }

  return proxyTo(targetUrl, request, ctx)
}

async function proxyTo(targetUrl, originalRequest, ctx) {
  const url = new URL(targetUrl)
  const cache = caches.default

  const isAudio = /\.(m4s|ts|aac|mp3)(\?|$)/.test(url.pathname) ||
    url.hostname.includes('cf-media.sndcdn.com') ||
    url.hostname.includes('media.sndcdn.com')

  const isStatic = /\.(js|css|png|jpg|jpeg|webp|svg|woff2)(\?|$)/.test(url.pathname)

  const cacheKey = isAudio
    ? new Request(`${url.origin}${url.pathname}`, { method: 'GET' })
    : new Request(targetUrl, { method: 'GET' })

  if (originalRequest.method === 'GET') {
    const cached = await cache.match(cacheKey)
    if (cached) {
      const r = new Response(cached.body, cached)
      Object.entries(CORS_HEADERS).forEach(([k, v]) => r.headers.set(k, v))
      return r
    }
  }

  const FORWARD_HEADERS = [
    'authorization', 'range', 'content-type', 'accept', 'accept-language',
    'sec-gpc', 'dnt',
  ]
  const headers = new Headers()
  for (const [k, v] of originalRequest.headers.entries()) {
    if (FORWARD_HEADERS.includes(k.toLowerCase())) headers.set(k, v)
  }
  headers.set('Origin', SOUNDCLOUD_ORIGIN)
  headers.set('Referer', SOUNDCLOUD_ORIGIN + '/')
  // Always use a fixed desktop Chrome UA so DataDome sees consistent fingerprint
  // for both GET (cookie acquisition) and PUT/DELETE (write ops). iOS WKWebView UA
  // passes GET requests but DataDome blocks write ops from non-desktop UAs.
  headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
  // Forward real client IP so DataDome can correlate with the browser session
  const clientIP = originalRequest.headers.get('CF-Connecting-IP')
  if (clientIP) {
    headers.set('X-Forwarded-For', clientIP)
    headers.set('True-Client-IP', clientIP)
  }

  // Пробрасываем DataDome clientid если клиент его прислал
  const ddId = originalRequest.headers.get('x-datadome-id')
  if (ddId) {
    headers.set('x-datadome-clientid', ddId)
    headers.set('Cookie', `datadome=${ddId}`)
  }

  let response
  try {
    response = await fetch(new Request(targetUrl, {
      method: originalRequest.method,
      headers,
      body: ['GET', 'HEAD'].includes(originalRequest.method) ? undefined : originalRequest.body,
      redirect: 'follow',
    }))
  } catch (err) {
    return new Response(`Proxy error: ${err.message}`, { status: 502, headers: CORS_HEADERS })
  }

  const resHeaders = new Headers(response.headers)
  Object.entries(CORS_HEADERS).forEach(([k, v]) => resHeaders.set(k, v))

  // Извлекаем DataDome cookie из ответа SC и отдаём клиенту как заголовок
  const xSetCookie = response.headers.get('x-set-cookie') || ''
  const ddMatch = xSetCookie.match(/datadome=([^;]+)/)
  if (ddMatch) {
    resHeaders.set('x-datadome-id', ddMatch[1])
    resHeaders.set('Access-Control-Expose-Headers',
      'Content-Range, Content-Length, Accept-Ranges, x-datadome-id')
  }

  if (isAudio)  resHeaders.set('Cache-Control', 'public, max-age=86400')
  if (isStatic) resHeaders.set('Cache-Control', 'public, max-age=345600')

  const proxied = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: resHeaders,
  })

  if (originalRequest.method === 'GET' && response.status === 200) {
    ctx.waitUntil(cache.put(cacheKey, proxied.clone()))
  }

  return proxied
}

export default { fetch: handleRequest }
