import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildWebSocketUrl, useServerConnection } from './useServerConnection'

class FakeWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static instances: FakeWebSocket[] = []

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  bufferedAmount = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onerror: (() => void) | null = null
  onclose:
    | ((event: { code: number; reason: string; wasClean: boolean }) => void)
    | null = null

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  receive(payload: unknown) {
    this.onmessage?.({ data: payload })
  }

  close(code = 1000, reason = '') {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code, reason, wasClean: code === 1000 })
  }
}

describe('buildWebSocketUrl', () => {
  it('usa lo stesso host della pagina quando non è configurato un endpoint', () => {
    expect(buildWebSocketUrl('', 'https:', 'vision.example.test')).toBe(
      'wss://vision.example.test/ws/vision',
    )
  })

  it('usa ws same-origin durante lo sviluppo HTTP', () => {
    expect(buildWebSocketUrl('', 'http:', 'localhost:5173')).toBe(
      'ws://localhost:5173/ws/vision',
    )
  })

  it('usa wss su pagina HTTPS e forza /ws/vision', () => {
    expect(buildWebSocketUrl('http://example.test:8765/old?token=x', 'https:')).toBe(
      'wss://example.test:8765/ws/vision',
    )
  })

  it('usa ws su pagina HTTP con endpoint non sicuro', () => {
    expect(buildWebSocketUrl('http://example.test:8765', 'http:')).toBe(
      'ws://example.test:8765/ws/vision',
    )
  })

  it('rifiuta un override configurato ma non valido', () => {
    expect(buildWebSocketUrl('non è un URL', 'https:', 'vision.example.test')).toBeNull()
  })
})

describe('useServerConnection con WebSocket finto', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubEnv('VITE_VISION_WS_URL', 'http://example.test:8765')
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('apre solo quando la sessione è attiva e chiude allo stop', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useServerConnection({ enabled }),
      { initialProps: { enabled: false } },
    )
    expect(FakeWebSocket.instances).toHaveLength(0)

    rerender({ enabled: true })
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    act(() => FakeWebSocket.instances[0].open())
    expect(result.current.status).toBe('open')

    rerender({ enabled: false })
    expect(FakeWebSocket.instances[0].readyState).toBe(FakeWebSocket.CLOSED)
    expect(result.current.status).toBe('closed')
  })

  it('parsa audio e pointing_overlay sullo stesso WebSocket', async () => {
    const onMessage = vi.fn()
    const { result } = renderHook(() =>
      useServerConnection({ enabled: true, onMessage }),
    )
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    const socket = FakeWebSocket.instances[0]
    act(() => socket.open())

    act(() => {
      const autoSendResult = result.current.sendJson({
        image: 'jpeg',
        frame_id: 1,
        caption_mode: 'AUTO',
        pointing_coordinates: null,
      })
      const pointingSendResult = result.current.sendJson({
        image: 'jpeg',
        frame_id: 2,
        caption_mode: 'POINTING',
        pointing_coordinates: null,
      })
      expect(autoSendResult.sent).toBe(true)
      expect(pointingSendResult.sent).toBe(true)
      socket.receive(
        JSON.stringify({
          type: 'audio',
          frame_id: 2,
          caption: 'Oggetto indicato',
          audio: 'YQ==',
          duration: 1,
          format: 'opus',
        }),
      )
      socket.receive(
        JSON.stringify({
          type: 'pointing_overlay',
          frame_id: 2,
          overlays: [
            {
              handedness: 'RIGHT',
              state: 'CANDIDATE',
              confirmation_progress: 0.62,
              ray: {
                start: { x: 0.42, y: 0.61 },
                end: { x: 1, y: 0.34 },
              },
            },
          ],
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
        }),
      )
    })

    expect(FakeWebSocket.instances).toHaveLength(1)
    expect(socket.sent.map((payload) => JSON.parse(payload).caption_mode)).toEqual([
      'AUTO',
      'POINTING',
    ])
    expect(JSON.parse(socket.sent[1])).toMatchObject({
      frame_id: 2,
      caption_mode: 'POINTING',
    })
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'audio', frame_id: 2, format: 'opus' }),
    )
    expect(onMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pointing_overlay', frame_id: 2 }),
    )
  })

  it('ignora JSON invalido e tipi sconosciuti senza crash', async () => {
    const onMessage = vi.fn()
    const onLog = vi.fn()
    renderHook(() =>
      useServerConnection({ enabled: true, onMessage, onLog }),
    )
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    const socket = FakeWebSocket.instances[0]
    act(() => {
      socket.open()
      socket.receive('{')
      socket.receive(JSON.stringify({ type: 'diagnostic' }))
    })

    expect(onMessage).not.toHaveBeenCalled()
    expect(onLog).toHaveBeenCalledWith(
      expect.stringContaining('Messaggio ignorato'),
      'warning',
    )
    expect(onLog).toHaveBeenCalledWith(
      expect.stringContaining('Tipo messaggio sconosciuto'),
      'warning',
    )
  })

  it('riconnette con backoff solo mentre la sessione resta attiva', async () => {
    renderHook(() => useServerConnection({ enabled: true }))
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1))
    vi.useFakeTimers()
    const firstSocket = FakeWebSocket.instances[0]
    act(() => {
      firstSocket.open()
      firstSocket.close(1006)
      vi.advanceTimersByTime(1000)
    })

    expect(FakeWebSocket.instances).toHaveLength(2)
  })
})
