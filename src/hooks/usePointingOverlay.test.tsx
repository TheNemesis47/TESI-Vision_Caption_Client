import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PointingOverlayMessage } from '../domain/visionProtocol'
import {
  POINTING_OVERLAY_TTL_MS,
  usePointingOverlay,
} from './usePointingOverlay'

const createMessage = (
  frameId: number,
  hasOverlay = true,
): PointingOverlayMessage => ({
  type: 'pointing_overlay',
  frame_id: frameId,
  overlays: hasOverlay
    ? [
        {
          handedness: 'RIGHT',
          state: 'CANDIDATE',
          confirmation_progress: 0.62,
          ray: {
            start: { x: 0.2, y: 0.5 },
            end: { x: 0.8, y: 0.5 },
          },
        },
      ]
    : [],
  corridor: {
    coordinate_space: 'normalized',
    width_reference: 'short_side',
    start_half_width_ratio: 0.008,
    min_end_half_width_ratio: 0.03,
    expansion_ratio: 0.04,
    fill_alpha: 0.14,
    color: '#FFFF00',
    line_width_px: 2,
  },
})

describe('usePointingOverlay', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('scarta frame vecchi e cancella subito con overlays vuoto', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePointingOverlay())

    act(() => {
      expect(result.current.apply(createMessage(10))).toBe(true)
    })
    expect(result.current.message?.frame_id).toBe(10)

    act(() => {
      expect(result.current.apply(createMessage(9))).toBe(false)
    })
    expect(result.current.message?.frame_id).toBe(10)

    act(() => {
      expect(result.current.apply(createMessage(11, false))).toBe(true)
    })
    expect(result.current.message).toBeNull()
  })

  it('nasconde il cono dopo 750ms e riappare al messaggio successivo', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePointingOverlay())

    act(() => {
      result.current.apply(createMessage(20))
      vi.advanceTimersByTime(POINTING_OVERLAY_TTL_MS - 1)
    })
    expect(result.current.message?.frame_id).toBe(20)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current.message).toBeNull()

    act(() => {
      result.current.apply(createMessage(21))
    })
    expect(result.current.message?.frame_id).toBe(21)
  })

  it('resetta l’ordine dei frame per una nuova sessione', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePointingOverlay())

    act(() => {
      result.current.apply(createMessage(50))
      result.current.clear(true)
    })
    act(() => {
      expect(result.current.apply(createMessage(1))).toBe(true)
    })
    expect(result.current.message?.frame_id).toBe(1)
  })
})
