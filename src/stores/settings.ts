import { atom } from 'jotai'

export type ControlMode = 'wheel' | 'touch'

function loadControlMode(): ControlMode {
  const stored = localStorage.getItem('sc_control_mode')
  return stored === 'touch' ? 'touch' : 'wheel'
}

const _controlModeAtom = atom<ControlMode>(loadControlMode())

export const controlModeAtom = atom(
  (get) => get(_controlModeAtom),
  (_get, set, mode: ControlMode) => {
    set(_controlModeAtom, mode)
    localStorage.setItem('sc_control_mode', mode)
  },
)
