import type {
  CaptionMode,
  FrameDoneServerMessage,
  StreamConfigServerMessage,
} from './visionProtocol'

export const MAX_WEBSOCKET_BUFFERED_AMOUNT = 256 * 1024

export const getConfiguredFrameIntervalMs = (
  config: StreamConfigServerMessage,
  mode: CaptionMode,
) => {
  const fps = mode === 'AUTO' ? config.auto_fps : config.pointing_fps
  return Math.max(1, Math.ceil(1000 / fps))
}

export class LatestFrameBuffer<T> {
  private value: T | null = null

  replace(value: T) {
    this.value = value
  }

  peek() {
    return this.value
  }

  take() {
    const value = this.value
    this.value = null
    return value
  }

  clear() {
    this.value = null
  }
}

export type DispatchBlockReason =
  | 'in-flight'
  | 'cooldown'
  | 'socket-backpressure'
  | null

/**
 * Client-side hard stop for a single frame in flight. The server can advertise a
 * lower capacity, but the browser never opens a second slot.
 */
export class SingleFrameGate {
  private activeFrameId: number | null = null
  private allowedAfter = 0

  get inFlightFrameId() {
    return this.activeFrameId
  }

  get nextAllowedAt() {
    return this.allowedAfter
  }

  getBlockReason({
    now,
    bufferedAmount,
    maximumBufferedAmount = MAX_WEBSOCKET_BUFFERED_AMOUNT,
  }: {
    now: number
    bufferedAmount: number
    maximumBufferedAmount?: number
  }): DispatchBlockReason {
    if (this.activeFrameId !== null) return 'in-flight'
    if (now < this.allowedAfter) return 'cooldown'
    if (bufferedAmount > maximumBufferedAmount) return 'socket-backpressure'
    return null
  }

  start(frameId: number, sentAt: number, minimumIntervalMs: number) {
    if (this.activeFrameId !== null) return false
    this.activeFrameId = frameId
    this.allowedAfter = Math.max(this.allowedAfter, sentAt + minimumIntervalMs)
    return true
  }

  complete(message: FrameDoneServerMessage, receivedAt: number) {
    if (message.frame_id !== this.activeFrameId) return false
    this.activeFrameId = null
    this.allowedAfter = Math.max(
      this.allowedAfter,
      receivedAt + message.next_frame_after_ms,
    )
    return true
  }

  allowNowWhenIdle() {
    if (this.activeFrameId === null) this.allowedAfter = 0
  }

  reset() {
    this.activeFrameId = null
    this.allowedAfter = 0
  }
}
