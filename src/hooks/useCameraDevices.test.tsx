import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAvailableCameraId, useCameraDevices } from './useCameraDevices'

describe('useCameraDevices', () => {
  const enumerateDevices = vi.fn()
  const addEventListener = vi.fn()
  const removeEventListener = vi.fn()
  let originalMediaDevices: MediaDevices | undefined

  beforeEach(() => {
    originalMediaDevices = navigator.mediaDevices
    enumerateDevices.mockResolvedValue([
      { kind: 'videoinput', deviceId: 'back', label: 'Camera posteriore' },
      { kind: 'audioinput', deviceId: 'microphone', label: 'Microfono' },
      { kind: 'videoinput', deviceId: 'front', label: '' },
    ])
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { enumerateDevices, addEventListener, removeEventListener },
    })
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    })
    vi.clearAllMocks()
  })

  it('elenca soltanto gli ingressi video e assegna un nome di fallback', async () => {
    const { result } = renderHook(() => useCameraDevices(true))

    await waitFor(() => expect(result.current.devices).toHaveLength(2))
    expect(result.current.devices).toEqual([
      { deviceId: 'back', label: 'Camera posteriore' },
      { deviceId: 'front', label: 'Fotocamera 2' },
    ])
  })

  it('mantiene sempre il selettore associato a una fotocamera disponibile', () => {
    const devices = [
      { deviceId: 'back', label: 'Camera posteriore' },
      { deviceId: 'front', label: 'Camera anteriore' },
    ]

    expect(resolveAvailableCameraId(devices, '', undefined)).toBe('back')
    expect(resolveAvailableCameraId(devices, 'missing', 'front')).toBe('front')
    expect(resolveAvailableCameraId([], 'missing')).toBe('')
  })

  it('aggiorna l’elenco su devicechange', async () => {
    const { result } = renderHook(() => useCameraDevices(true))
    await waitFor(() => expect(addEventListener).toHaveBeenCalled())
    const deviceChangeHandler = addEventListener.mock.calls[0][1]

    enumerateDevices.mockResolvedValueOnce([
      { kind: 'videoinput', deviceId: 'external', label: 'Camera USB' },
    ])
    await act(async () => deviceChangeHandler())

    expect(result.current.devices).toEqual([
      { deviceId: 'external', label: 'Camera USB' },
    ])
  })
})
