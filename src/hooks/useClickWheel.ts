import { useRef, useCallback, useEffect } from 'react'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { triggerCenterAction } from '@/stores/navigation'

// --- Audio context for click sounds ---
let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch { return null }
  }
  return audioCtx
}

function playTickSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 1100
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.012)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.012)
  } catch { /* ignore */ }
}

function playSelectSound() {
  const ctx = getAudioCtx()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 900
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.05)
  } catch { /* ignore */ }
}

async function hapticTick() {
  try { await Haptics.impact({ style: ImpactStyle.Light }) } catch { /* browser */ }
}

async function hapticSelect() {
  try { await Haptics.impact({ style: ImpactStyle.Medium }) } catch { /* browser */ }
}

// --- Wheel zones ---
const DEG_PER_TICK = 15  // ~24 ticks per full rotation (less sensitive)
const SCROLL_THRESHOLD_PX = 12  // arc delta before we decide it's a scroll

type WheelButton = 'menu' | 'play' | 'next' | 'prev' | 'center'

function getAngleDeg(cx: number, cy: number, px: number, py: number): number {
  return Math.atan2(py - cy, px - cx) * (180 / Math.PI)
}

function getButtonZone(angleDeg: number, rRatio: number): WheelButton | null {
  if (rRatio < 0.34) return 'center'
  // normalize to 0..360
  const a = ((angleDeg % 360) + 360) % 360
  // MENU=top (270°, zone 225–315), NEXT=right (0°, zone 315–45),
  // PLAY=bottom (90°, zone 45–135), PREV=left (180°, zone 135–225)
  if (a >= 225 && a < 315) return 'menu'
  if (a >= 315 || a < 45) return 'next'
  if (a >= 45 && a < 135) return 'play'
  return 'prev'
}

export type ClickWheelCallbacks = {
  onScroll: (delta: number) => void  // +1 вниз, -1 вверх
  onMenu: () => void
  onPlay: () => void
  onNext: () => void
  onPrev: () => void
  // CENTER обрабатывается через triggerCenterAction()
  onCenterHold?: () => void  // 500ms hold on center button
  onButtonPress?: (button: WheelButton) => void  // visual feedback
  onButtonRelease?: () => void
}

export function useClickWheel(
  wheelRef: React.RefObject<HTMLElement | null>,
  callbacks: ClickWheelCallbacks,
) {
  const state = useRef({
    active: false,
    startX: 0,
    startY: 0,
    startAngle: 0,
    lastAngle: 0,
    accAngle: 0,       // accumulated angle since last tick
    isScrolling: false,
    startArcLen: 0,
    centerX: 0,
    centerY: 0,
    radius: 0,
    // momentum
    velocity: 0,       // deg/ms
    lastTime: 0,
    lastDeltaAngle: 0,
    rafId: 0,
    // hold
    holdTimer: 0 as ReturnType<typeof setTimeout> | 0,
    holdFired: false,
  })

  const cbRef = useRef(callbacks)
  cbRef.current = callbacks

  const fireTick = useCallback((delta: number) => {
    cbRef.current.onScroll(delta)
    playTickSound()
    hapticTick()
  }, [])

  const stopMomentum = useCallback(() => {
    if (state.current.rafId) {
      cancelAnimationFrame(state.current.rafId)
      state.current.rafId = 0
    }
  }, [])

  const startMomentum = useCallback((initialVelocity: number) => {
    stopMomentum()
    let vel = initialVelocity
    let acc = 0
    let lastTs = performance.now()

    function loop(ts: number) {
      const dt = ts - lastTs
      lastTs = ts
      vel *= Math.pow(0.88, dt / 16)  // faster decay = shorter coast
      if (Math.abs(vel) < 0.05) return  // stop

      acc += vel * dt
      const ticks = Math.trunc(acc / DEG_PER_TICK)
      if (ticks !== 0) {
        acc -= ticks * DEG_PER_TICK
        fireTick(ticks > 0 ? 1 : -1)
      }
      state.current.rafId = requestAnimationFrame(loop)
    }
    state.current.rafId = requestAnimationFrame(loop)
  }, [fireTick, stopMomentum])

  useEffect(() => {
    const el = wheelRef.current
    if (!el) return

    function onPointerDown(e: PointerEvent) {
      e.preventDefault()
      stopMomentum()

      const rect = el!.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const radius = rect.width / 2

      const angle = getAngleDeg(cx, cy, e.clientX, e.clientY)

      const dx0 = e.clientX - cx
      const dy0 = e.clientY - cy
      const r0 = Math.sqrt(dx0 * dx0 + dy0 * dy0)
      const rRatio0 = r0 / radius
      const isCenter = rRatio0 < 0.34

      // Hold timer: 500ms press on center triggers onCenterHold
      let holdTimer: ReturnType<typeof setTimeout> | 0 = 0
      if (isCenter) {
        holdTimer = setTimeout(() => {
          state.current.holdFired = true
          cbRef.current.onCenterHold?.()
        }, 500)
      }

      state.current = {
        ...state.current,
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        startAngle: angle,
        lastAngle: angle,
        accAngle: 0,
        isScrolling: false,
        startArcLen: 0,
        centerX: cx,
        centerY: cy,
        radius,
        velocity: 0,
        lastTime: performance.now(),
        lastDeltaAngle: 0,
        holdTimer,
        holdFired: false,
      }

      el!.setPointerCapture(e.pointerId)
    }

    function onPointerMove(e: PointerEvent) {
      if (!state.current.active) return
      e.preventDefault()

      const { centerX, centerY, lastAngle, isScrolling } = state.current

      // Arc distance from start to detect scroll intent
      const dx = e.clientX - state.current.startX
      const dy = e.clientY - state.current.startY
      const arcLen = Math.sqrt(dx * dx + dy * dy)

      if (!isScrolling && arcLen > SCROLL_THRESHOLD_PX) {
        state.current.isScrolling = true
        // Cancel hold if user started scrolling
        if (state.current.holdTimer) {
          clearTimeout(state.current.holdTimer)
          state.current.holdTimer = 0
        }
      }

      if (!state.current.isScrolling) return

      const angle = getAngleDeg(centerX, centerY, e.clientX, e.clientY)

      // Calculate delta, handle 180°/-180° wraparound
      let delta = angle - lastAngle
      if (delta > 180) delta -= 360
      if (delta < -180) delta += 360

      const now = performance.now()
      const dt = now - state.current.lastTime
      if (dt > 0) {
        state.current.velocity = delta / dt  // deg/ms
        state.current.lastDeltaAngle = delta
        state.current.lastTime = now
      }

      state.current.lastAngle = angle
      state.current.accAngle += delta

      // Fire ticks
      const ticks = Math.trunc(state.current.accAngle / DEG_PER_TICK)
      if (ticks !== 0) {
        state.current.accAngle -= ticks * DEG_PER_TICK
        fireTick(ticks > 0 ? 1 : -1)
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (!state.current.active) return
      e.preventDefault()

      const { isScrolling, velocity, centerX, centerY, radius, holdTimer, holdFired } = state.current
      state.current.active = false

      // Cancel hold timer
      if (holdTimer) {
        clearTimeout(holdTimer)
        state.current.holdTimer = 0
      }

      // If hold already fired, don't also fire tap
      if (holdFired) return

      if (!isScrolling) {
        // It's a button press — determine which zone
        const dx = e.clientX - centerX
        const dy = e.clientY - centerY
        const r = Math.sqrt(dx * dx + dy * dy)
        const rRatio = r / radius
        const angle = getAngleDeg(centerX, centerY, e.clientX, e.clientY)
        const zone = getButtonZone(angle, rRatio)

        if (zone) {
          cbRef.current.onButtonRelease?.()
          playSelectSound()
          hapticSelect()

          switch (zone) {
            case 'center': triggerCenterAction(); break
            case 'menu':   cbRef.current.onMenu(); break
            case 'play':   cbRef.current.onPlay(); break
            case 'next':   cbRef.current.onNext(); break
            case 'prev':   cbRef.current.onPrev(); break
          }
        }
      } else if (Math.abs(velocity) > 0.5) {
        // Start momentum with velocity cap to avoid flying through menus
        const cappedVelocity = Math.sign(velocity) * Math.min(Math.abs(velocity), 3)
        startMomentum(cappedVelocity)
      }
    }

    function onPointerCancel() {
      state.current.active = false
      if (state.current.holdTimer) {
        clearTimeout(state.current.holdTimer)
        state.current.holdTimer = 0
      }
    }

    el.addEventListener('pointerdown', onPointerDown, { passive: false })
    el.addEventListener('pointermove', onPointerMove, { passive: false })
    el.addEventListener('pointerup', onPointerUp, { passive: false })
    el.addEventListener('pointercancel', onPointerCancel)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', onPointerUp)
      el.removeEventListener('pointercancel', onPointerCancel)
      stopMomentum()
    }
  }, [wheelRef, fireTick, startMomentum, stopMomentum])
}
