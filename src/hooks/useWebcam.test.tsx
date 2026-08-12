import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useWebcam } from './useWebcam'

function WebcamHarness({ enabled }: { enabled: boolean }) {
  const { videoRef, isMirrored } = useWebcam({ deviceId: 'camera-1', enabled })
  return <video ref={videoRef} data-mirrored={isMirrored} />
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
