import { useCallback, useState } from 'react'

interface State<T> {
  past: T[]
  present: T
  future: T[]
}

const LIMIT = 100

export function useHistory<T>(initial: () => T) {
  const [state, setState] = useState<State<T>>(() => ({ past: [], present: initial(), future: [] }))

  /** Modificare înregistrată în istoric (undo) */
  const commit = useCallback((fn: (p: T) => T) => {
    setState((s) => {
      const next = fn(s.present)
      if (next === s.present) return s
      return { past: [...s.past, s.present].slice(-LIMIT), present: next, future: [] }
    })
  }, [])

  /** Modificare fără înregistrare (ex. în timpul tragerii) */
  const update = useCallback((fn: (p: T) => T) => {
    setState((s) => ({ ...s, present: fn(s.present) }))
  }, [])

  /** Salvează starea curentă în istoric (ex. la începutul tragerii) */
  const checkpoint = useCallback(() => {
    setState((s) => ({ past: [...s.past, s.present].slice(-LIMIT), present: s.present, future: [] }))
  }, [])

  const undo = useCallback(() => {
    setState((s) =>
      s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s,
    )
  }, [])

  const redo = useCallback(() => {
    setState((s) =>
      s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s,
    )
  }, [])

  const reset = useCallback((v: T) => setState({ past: [], present: v, future: [] }), [])

  return {
    value: state.present,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    commit,
    update,
    checkpoint,
    undo,
    redo,
    reset,
  }
}
