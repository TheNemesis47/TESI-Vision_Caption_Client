import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointingOverlayMessage } from '../domain/visionProtocol'
import { shouldApplyPointingOverlayFrame } from '../components/pointingOverlayGeometry'

export const POINTING_OVERLAY_TTL_MS = 750

export function usePointingOverlay(timeoutMs = POINTING_OVERLAY_TTL_MS) {
  const [message, setMessage] = useState<PointingOverlayMessage | null>(null)
  const lastAppliedFrameIdRef = useRef<number | null>(null)
  const expiryTimerRef = useRef<number | undefined>(undefined)

  const clear = useCallback((resetFrameOrder = false) => {
    window.clearTimeout(expiryTimerRef.current)
    expiryTimerRef.current = undefined
    if (resetFrameOrder) {
      lastAppliedFrameIdRef.current = null
    }
    setMessage(null)
  }, [])

  const apply = useCallback(
    (nextMessage: PointingOverlayMessage) => {
      if (
        !shouldApplyPointingOverlayFrame(
          nextMessage.frame_id,
          lastAppliedFrameIdRef.current,
        )
      ) {
        return false
      }

      lastAppliedFrameIdRef.current = nextMessage.frame_id
      window.clearTimeout(expiryTimerRef.current)
      expiryTimerRef.current = undefined

      if (nextMessage.overlays.length === 0) {
        setMessage(null)
        return true
      }

      setMessage(nextMessage)
      expiryTimerRef.current = window.setTimeout(() => {
        setMessage(null)
        expiryTimerRef.current = undefined
      }, timeoutMs)
      return true
    },
    [timeoutMs],
  )

  useEffect(() => {
    return () => {
      window.clearTimeout(expiryTimerRef.current)
    }
  }, [])

  return {
    message,
    apply,
    clear,
  }
}
