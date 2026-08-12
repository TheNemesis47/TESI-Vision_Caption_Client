import { describe, expect, it } from 'vitest'
import {
  getConfiguredFrameIntervalMs,
  LatestFrameBuffer,
  MAX_WEBSOCKET_BUFFERED_AMOUNT,
  SingleFrameGate,
} from './frameFlowControl'

const config = {
  type: 'stream_config' as const,
  auto_fps: 2,
  pointing_fps: 10,
  max_in_flight: 1,
}

describe('frame flow control', () => {
  it('usa le cadenze AUTO e POINTING configurate dal server', () => {
    expect(getConfiguredFrameIntervalMs(config, 'AUTO')).toBe(500)
    expect(getConfiguredFrameIntervalMs(config, 'POINTING')).toBe(100)
  })

  it('conserva soltanto il frame locale più recente', () => {
    const buffer = new LatestFrameBuffer<string>()
    buffer.replace('frame-1')
    buffer.replace('frame-2')

    expect(buffer.take()).toBe('frame-2')
    expect(buffer.take()).toBeNull()
  })

  it('mantiene un solo frame in flight fino al frame_done corrispondente', () => {
    const gate = new SingleFrameGate()
    expect(gate.start(12, 1_000, 500)).toBe(true)
    expect(gate.start(13, 1_001, 500)).toBe(false)
    expect(
      gate.complete(
        {
          type: 'frame_done',
          frame_id: 11,
          outcome: 'completed',
          next_frame_after_ms: 500,
        },
        1_200,
      ),
    ).toBe(false)
    expect(gate.inFlightFrameId).toBe(12)

    expect(
      gate.complete(
        {
          type: 'frame_done',
          frame_id: 12,
          outcome: 'completed',
          next_frame_after_ms: 500,
        },
        1_200,
      ),
    ).toBe(true)
    expect(gate.inFlightFrameId).toBeNull()
    expect(gate.nextAllowedAt).toBe(1_700)
  })

  it('dopo l’ACK espone l’ultimo frame catturato, non quelli intermedi', () => {
    const buffer = new LatestFrameBuffer<string>()
    const gate = new SingleFrameGate()

    buffer.replace('frame-inviato')
    expect(buffer.take()).toBe('frame-inviato')
    gate.start(1, 0, 100)

    buffer.replace('frame-intermedio')
    buffer.replace('frame-piu-recente')
    gate.complete(
      {
        type: 'frame_done',
        frame_id: 1,
        outcome: 'completed',
        next_frame_after_ms: 0,
      },
      100,
    )

    expect(buffer.take()).toBe('frame-piu-recente')
  })

  it('blocca l’invio oltre 256 KiB e durante il cooldown', () => {
    const gate = new SingleFrameGate()
    expect(
      gate.getBlockReason({
        now: 1_000,
        bufferedAmount: MAX_WEBSOCKET_BUFFERED_AMOUNT + 1,
      }),
    ).toBe('socket-backpressure')

    gate.start(1, 1_000, 500)
    gate.complete(
      {
        type: 'frame_done',
        frame_id: 1,
        outcome: 'failed',
        next_frame_after_ms: 0,
      },
      1_100,
    )
    expect(gate.getBlockReason({ now: 1_499, bufferedAmount: 0 })).toBe('cooldown')
    expect(gate.getBlockReason({ now: 1_500, bufferedAmount: 0 })).toBeNull()
  })
})
