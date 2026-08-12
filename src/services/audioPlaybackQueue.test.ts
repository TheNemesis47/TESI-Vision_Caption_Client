import { describe, expect, it, vi } from 'vitest'
import { AudioPlaybackQueue } from './audioPlaybackQueue'

const flushPromises = () =>
  new Promise<void>((resolve) => {
    queueMicrotask(() => resolve())
  })

const createAudioHarness = () => {
  const audio = {
    src: '',
    onended: null as (() => void) | null,
    onerror: null as (() => void) | null,
    pause: vi.fn(),
    play: vi.fn(() => Promise.resolve()),
    load: vi.fn(),
    removeAttribute: vi.fn(),
  }
  const objectUrlApi = {
    createObjectURL: vi
      .fn()
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second'),
    revokeObjectURL: vi.fn(),
  }
  return { audio, objectUrlApi }
}

describe('AudioPlaybackQueue', () => {
  it('riproduce due chunk serialmente, anche con lo stesso frame_id', async () => {
    const { audio, objectUrlApi } = createAudioHarness()
    const queue = new AudioPlaybackQueue({
      audio,
      objectUrlApi,
    })

    queue.enqueue({ blob: new Blob(['a']), caption: 'uno', frameId: 10 })
    queue.enqueue({ blob: new Blob(['b']), caption: 'due', frameId: 10 })
    await flushPromises()

    expect(audio.play).toHaveBeenCalledTimes(1)
    expect(audio.src).toBe('blob:first')

    audio.onended?.()
    await flushPromises()

    expect(audio.play).toHaveBeenCalledTimes(2)
    expect(audio.src).toBe('blob:second')
    expect(objectUrlApi.revokeObjectURL).toHaveBeenCalledWith('blob:first')
  })

  it('cancel ferma audio, svuota coda e revoca l’object URL', async () => {
    const { audio, objectUrlApi } = createAudioHarness()
    const queue = new AudioPlaybackQueue({ audio, objectUrlApi })

    queue.enqueue({ blob: new Blob(['a']), caption: 'uno', frameId: 1 })
    queue.enqueue({ blob: new Blob(['b']), caption: 'due', frameId: 2 })
    await flushPromises()
    queue.cancel()

    expect(queue.pendingCount).toBe(0)
    expect(audio.pause).toHaveBeenCalledOnce()
    expect(audio.removeAttribute).toHaveBeenCalledWith('src')
    expect(objectUrlApi.revokeObjectURL).toHaveBeenCalledWith('blob:first')
  })

  it('prosegue col chunk successivo dopo un errore di play', async () => {
    const { audio, objectUrlApi } = createAudioHarness()
    audio.play
      .mockRejectedValueOnce(new Error('autoplay'))
      .mockResolvedValueOnce(undefined)
    const onPlaybackError = vi.fn()
    const queue = new AudioPlaybackQueue({
      audio,
      objectUrlApi,
      onPlaybackError,
    })

    queue.enqueue({ blob: new Blob(['a']), caption: 'uno', frameId: 1 })
    queue.enqueue({ blob: new Blob(['b']), caption: 'due', frameId: 2 })
    await flushPromises()
    await flushPromises()

    expect(onPlaybackError).toHaveBeenCalledOnce()
    expect(audio.play).toHaveBeenCalledTimes(2)
  })
})
