import { render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebcam } from './useWebcam'

function WebcamHarness({ enabled }: { enabled: boolean }) {
  const { videoRef, isMirrored } = useWebcam({ deviceId: 'camera-1', enabled })
  return <video ref={videoRef} data-mirrored={isMirrored} />
}

function DefaultCameraHarness() {
  const { videoRef } = useWebcam()
  return <video ref={videoRef} />
}

describe('useWebcam lifecycle', () => {
  const stopTrack = vi.fn()
  const stream = {
    id: 'stream-1',
    getTracks: () => [{ stop: stopTrack }],
    getVideoTracks: () => [{ stop: stopTrack }],
    getAudioTracks: () => [],
  } as unknown as MediaStream
  const getUserMedia = vi.fn(() => Promise.resolve(stream))
  let originalMediaDevices: MediaDevices | undefined

  beforeEach(() => {
    stopTrack.mockClear()
    getUserMedia.mockClear()
    originalMediaDevices = navigator.mediaDevices
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  })

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    })
  })

  it('non apre la camera prima dell’avvio della sessione', () => {
    render(<WebcamHarness enabled={false} />)
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('preferisce la fotocamera posteriore quando non è stato scelto un dispositivo', async () => {
    render(<DefaultCameraHarness />)

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce())
    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { exact: 'environment' } },
    })
  })

  it('usa la fotocamera disponibile se quella posteriore non è supportata', async () => {
    const constraintError = new Error('Fotocamera posteriore non disponibile')
    constraintError.name = 'OverconstrainedError'
    getUserMedia.mockRejectedValueOnce(constraintError)

    render(<DefaultCameraHarness />)

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2))
    expect(getUserMedia).toHaveBeenNthCalledWith(1, {
      video: { facingMode: { exact: 'environment' } },
    })
    expect(getUserMedia).toHaveBeenNthCalledWith(2, { video: true })
  })

  it('ferma tutte le media track allo stop', async () => {
    const { rerender } = render(<WebcamHarness enabled />)
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce())

    rerender(<WebcamHarness enabled={false} />)
    expect(stopTrack).toHaveBeenCalled()
  })

  it('ferma tutte le media track allo smontaggio', async () => {
    const { unmount } = render(<WebcamHarness enabled />)
    await waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce())

    unmount()
    expect(stopTrack).toHaveBeenCalled()
  })

  it('segnala come specchiata la camera frontale', async () => {
    const userFacingTrack = {
      stop: stopTrack,
      getSettings: () => ({ facingMode: 'user' }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    getUserMedia.mockResolvedValueOnce({
      id: 'front-stream',
      getTracks: () => [userFacingTrack],
      getVideoTracks: () => [userFacingTrack],
      getAudioTracks: () => [],
    } as unknown as MediaStream)

    const { container } = render(<WebcamHarness enabled />)

    await waitFor(() => {
      expect(container.querySelector('video')).toHaveAttribute(
        'data-mirrored',
        'true',
      )
    })
  })
})

type TracciaFinta = {
  stop: ReturnType<typeof vi.fn>
  addEventListener: ReturnType<typeof vi.fn>
  getSettings: () => { deviceId: string; facingMode: string }
}

const ordine: string[] = []

const flussoFinto = (deviceId: string) => {
  const track: TracciaFinta = {
    stop: vi.fn(() => ordine.push(`stop:${deviceId}`)),
    addEventListener: vi.fn(),
    getSettings: () => ({ deviceId, facingMode: 'environment' }),
  }
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    track,
  }
}

const installaFotocamera = () => {
  const flussi = new Map<string, ReturnType<typeof flussoFinto>>()
  const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
    const video = constraints.video as { deviceId?: { exact: string } }
    const id = video?.deviceId?.exact ?? 'predefinita'
    ordine.push(`apri:${id}`)
    const flusso = flussoFinto(id)
    flussi.set(id, flusso)
    return flusso as unknown as MediaStream
  })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia, enumerateDevices: vi.fn(async () => []) },
  })
  return { getUserMedia, flussi }
}

afterEach(() => {
  ordine.length = 0
  vi.restoreAllMocks()
})

describe('cambio di obiettivo', () => {
  it('accende il nuovo prima di spegnere il vecchio, per non richiedere di nuovo il permesso', async () => {
    // Su Safari, spegnendo tutte le tracce il permesso torna da chiedere: a
    // ogni pressione del pulsante ricompariva il pop-up della fotocamera.
    const { getUserMedia, flussi } = installaFotocamera()
    const { result, rerender } = renderHook(
      ({ deviceId }: { deviceId: string }) => useWebcam({ deviceId, enabled: true }),
      { initialProps: { deviceId: 'ultra' } },
    )

    await waitFor(() => expect(result.current.activeDeviceId).toBe('ultra'))
    expect(flussi.get('ultra')?.track.stop).not.toHaveBeenCalled()

    rerender({ deviceId: 'tele' })

    await waitFor(() => expect(result.current.activeDeviceId).toBe('tele'))
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(ordine).toEqual(['apri:ultra', 'apri:tele', 'stop:ultra'])
  })

  it('alla chiusura la fotocamera si spegne davvero', async () => {
    const { flussi } = installaFotocamera()
    const { result, unmount } = renderHook(() =>
      useWebcam({ deviceId: 'wide', enabled: true }),
    )

    await waitFor(() => expect(result.current.isActive).toBe(true))
    unmount()

    expect(flussi.get('wide')?.track.stop).toHaveBeenCalled()
  })
})
