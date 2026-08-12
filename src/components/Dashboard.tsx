import { useCallback, useEffect, useRef, useState } from 'react'
import './Dashboard.css'
import {
  captureVideoFrame,
  type CapturedFrame,
} from '../hooks/useFrameCapture'
import { usePointingOverlay } from '../hooks/usePointingOverlay'
import { useServerConnection } from '../hooks/useServerConnection'
import { useWebcam } from '../hooks/useWebcam'
import {
  getConfiguredFrameIntervalMs,
  LatestFrameBuffer,
  MAX_WEBSOCKET_BUFFERED_AMOUNT,
  SingleFrameGate,
} from '../domain/frameFlowControl'
import {
  buildFramePacket,
  decodeBase64Audio,
  getFrameOutputRejectionReason,
  shouldDropAudioFrameByOrder,
  type CaptionMode,
  type CaptureState,
  type SentFrameMetadata,
  type StreamConfigServerMessage,
  type VisionServerMessage,
} from '../domain/visionProtocol'
import { AudioPlaybackQueue } from '../services/audioPlaybackQueue'

type PendingFrame = {
  frame: CapturedFrame
  mode: CaptionMode
}

const readPositiveNumber = (rawValue: unknown, fallback: number) => {
  const parsedValue = Number(rawValue)
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

const maximumBufferedAmount = Math.min(
  readPositiveNumber(
    import.meta.env.VITE_MAX_SOCKET_BUFFERED_AMOUNT,
    MAX_WEBSOCKET_BUFFERED_AMOUNT,
  ),
  MAX_WEBSOCKET_BUFFERED_AMOUNT,
)
const frameMaxWidth = readPositiveNumber(import.meta.env.VITE_FRAME_MAX_WIDTH, 1280)
const frameMaxHeight = readPositiveNumber(import.meta.env.VITE_FRAME_MAX_HEIGHT, 720)
const jpegQuality = Math.min(
  readPositiveNumber(import.meta.env.VITE_FRAME_JPEG_QUALITY, 0.86),
  1,
)
const sentMetadataRetention = 64

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index))
  }
}

const createSilentWavBlob = () => {
  const sampleRate = 8000
  const durationSeconds = 0.08
  const channels = 1
  const bytesPerSample = 2
  const sampleCount = Math.ceil(sampleRate * durationSeconds)
  const dataSize = sampleCount * channels * bytesPerSample
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * bytesPerSample, true)
  view.setUint16(32, channels * bytesPerSample, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  return new Blob([buffer], { type: 'audio/wav' })
}

export function Dashboard() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioQueueRef = useRef<AudioPlaybackQueue | null>(null)
  const captureActiveRef = useRef(false)
  const captureInProgressRef = useRef(false)
  const captionModeRef = useRef<CaptionMode>('AUTO')
  const frameIdRef = useRef(0)
  const modeChangeCutoffFrameIdRef = useRef(1)
  const lastAudioFrameIdRef = useRef<number | null>(null)
  const sentFrameMetadataRef = useRef<Map<number, SentFrameMetadata>>(new Map())
  const latestDetectionsRef = useRef<unknown[]>([])
  const latestFrameRef = useRef(new LatestFrameBuffer<PendingFrame>())
  const frameGateRef = useRef(new SingleFrameGate())
  const dispatchRetryTimerRef = useRef<number | undefined>(undefined)
  const attemptDispatchRef = useRef<() => void>(() => undefined)
  const serverMessageRef = useRef<(message: VisionServerMessage) => void>(
    () => undefined,
  )
  const serverDisconnectRef = useRef<() => void>(() => undefined)
  const audioUnlockedRef = useRef(false)

  const [captionMode, setCaptionMode] = useState<CaptionMode>('AUTO')
  const [caption, setCaption] = useState('')
  const [isCaptureRunning, setIsCaptureRunning] = useState(false)
  const [inactiveCaptureState, setInactiveCaptureState] =
    useState<CaptureState>('idle')
  const [streamConfig, setStreamConfig] =
    useState<StreamConfigServerMessage | null>(null)
  const [isDescribing, setIsDescribing] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)

  const {
    message: pointingOverlay,
    apply: applyPointingOverlay,
    clear: clearPointingOverlay,
  } = usePointingOverlay()
  const { videoRef, isActive: isWebcamActive, isMirrored, error: webcamError } =
    useWebcam({ enabled: true })

  const getAudioQueue = useCallback(() => {
    if (audioQueueRef.current) return audioQueueRef.current
    const audioElement = audioRef.current
    if (!audioElement) return null

    audioQueueRef.current = new AudioPlaybackQueue({
      audio: audioElement,
      onQueueChange: (pendingItems) => setIsDescribing(pendingItems > 0),
      onPlaybackError: () => {
        setIsDescribing(false)
        setSessionError('Impossibile riprodurre la descrizione audio')
      },
    })
    return audioQueueRef.current
  }, [])

  const stopAudioPlayback = useCallback(() => {
    audioQueueRef.current?.cancel()
    setIsDescribing(false)
    lastAudioFrameIdRef.current = null
  }, [])

  const clearDispatchRetry = useCallback(() => {
    window.clearTimeout(dispatchRetryTimerRef.current)
    dispatchRetryTimerRef.current = undefined
  }, [])

  const resetFrameFlow = useCallback(() => {
    clearDispatchRetry()
    latestFrameRef.current.clear()
    frameGateRef.current.reset()
    captureInProgressRef.current = false
  }, [clearDispatchRetry])

  const handleSocketMessage = useCallback((message: VisionServerMessage) => {
    serverMessageRef.current(message)
  }, [])

  const handleSocketDisconnect = useCallback(() => {
    serverDisconnectRef.current()
  }, [])

  const {
    status: serverConnectionStatus,
    webSocketUrl,
    sendJson,
    getBufferedAmount,
  } = useServerConnection({
    enabled: isCaptureRunning,
    onMessage: handleSocketMessage,
    onDisconnect: handleSocketDisconnect,
  })

  const attemptDispatch = useCallback(() => {
    clearDispatchRetry()
    if (
      !captureActiveRef.current ||
      serverConnectionStatus !== 'open' ||
      !streamConfig
    ) {
      return
    }

    const pendingFrame = latestFrameRef.current.peek()
    if (!pendingFrame || pendingFrame.mode !== captionModeRef.current) return

    const now = Date.now()
    const frameGate = frameGateRef.current
    const blockReason = frameGate.getBlockReason({
      now,
      bufferedAmount: getBufferedAmount(),
      maximumBufferedAmount,
    })

    if (blockReason === 'cooldown') {
      dispatchRetryTimerRef.current = window.setTimeout(
        () => attemptDispatchRef.current(),
        Math.max(1, frameGate.nextAllowedAt - now),
      )
      return
    }
    if (blockReason) return

    const frameId = frameIdRef.current + 1
    const packet = buildFramePacket({
      imageBase64: pendingFrame.frame.imageBase64,
      frameId,
      captionMode: pendingFrame.mode,
    })
    const sendResult = sendJson(packet)
    if (!sendResult.sent) return

    const sentAt = Date.now()
    const frameIntervalMs = getConfiguredFrameIntervalMs(
      streamConfig,
      pendingFrame.mode,
    )
    if (!frameGate.start(frameId, sentAt, frameIntervalMs)) return

    latestFrameRef.current.take()
    frameIdRef.current = frameId
    sentFrameMetadataRef.current.set(frameId, {
      frameId,
      mode: pendingFrame.mode,
      sentAt,
    })

    const oldestRetainedFrameId = frameId - sentMetadataRetention
    for (const sentFrameId of sentFrameMetadataRef.current.keys()) {
      if (sentFrameId < oldestRetainedFrameId) {
        sentFrameMetadataRef.current.delete(sentFrameId)
      }
    }
  }, [clearDispatchRetry, getBufferedAmount, sendJson, serverConnectionStatus, streamConfig])

  useEffect(() => {
    attemptDispatchRef.current = attemptDispatch
  }, [attemptDispatch])

  const captureLatestFrame = useCallback(async () => {
    if (!captureActiveRef.current || captureInProgressRef.current) return
    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    captureInProgressRef.current = true
    try {
      captureCanvasRef.current ??= document.createElement('canvas')
      const frame = await captureVideoFrame(video, captureCanvasRef.current, {
        maxWidth: frameMaxWidth,
        maxHeight: frameMaxHeight,
        jpegQuality,
      })
      if (!captureActiveRef.current) return

      latestFrameRef.current.replace({
        frame,
        mode: captionModeRef.current,
      })
      attemptDispatchRef.current()
    } catch {
      setSessionError('Impossibile acquisire il frame dalla fotocamera')
    } finally {
      captureInProgressRef.current = false
    }
  }, [videoRef])

  useEffect(() => {
    if (
      !isCaptureRunning ||
      !isWebcamActive ||
      serverConnectionStatus !== 'open' ||
      !streamConfig
    ) {
      return
    }

    const intervalMs = getConfiguredFrameIntervalMs(streamConfig, captionMode)
    const initialCaptureTimerId = window.setTimeout(() => {
      void captureLatestFrame()
    }, 0)
    const intervalId = window.setInterval(() => {
      void captureLatestFrame()
    }, intervalMs)
    return () => {
      window.clearTimeout(initialCaptureTimerId)
      window.clearInterval(intervalId)
    }
  }, [
    captionMode,
    captureLatestFrame,
    isCaptureRunning,
    isWebcamActive,
    serverConnectionStatus,
    streamConfig,
  ])

  const getCurrentFrameMetadata = useCallback((frameId: number) => {
    const metadata = sentFrameMetadataRef.current.get(frameId)
    const rejectionReason = getFrameOutputRejectionReason({
      frameId,
      metadata,
      currentMode: captionModeRef.current,
      modeChangeCutoffFrameId: modeChangeCutoffFrameIdRef.current,
    })
    return rejectionReason ? null : metadata ?? null
  }, [])

  const handleServerMessage = useCallback(
    (message: VisionServerMessage) => {
      if (message.type === 'stream_config') {
        setStreamConfig(message)
        frameGateRef.current.allowNowWhenIdle()
        return
      }

      if (message.type === 'frame_done') {
        if (frameGateRef.current.complete(message, Date.now())) {
          attemptDispatchRef.current()
        }
        return
      }

      const metadata = getCurrentFrameMetadata(message.frame_id)
      if (!metadata) return

      if (message.type === 'detections') {
        latestDetectionsRef.current =
          metadata.mode === 'AUTO' ? message.detections : []
        return
      }

      if (message.type === 'pointing_overlay') {
        if (metadata.mode === 'POINTING' && captionModeRef.current === 'POINTING') {
          applyPointingOverlay(message)
        } else {
          clearPointingOverlay()
        }
        return
      }

      if (!captureActiveRef.current) return
      if (shouldDropAudioFrameByOrder(message.frame_id, lastAudioFrameIdRef.current)) {
        return
      }

      try {
        const audioQueue = getAudioQueue()
        if (!audioQueue) throw new Error('Elemento audio non disponibile')

        const audioBlob = decodeBase64Audio(message.audio, message.format)
        lastAudioFrameIdRef.current = Math.max(
          lastAudioFrameIdRef.current ?? message.frame_id,
          message.frame_id,
        )
        setCaption(message.caption)
        audioQueue.enqueue({
          blob: audioBlob,
          caption: message.caption,
          frameId: message.frame_id,
        })
      } catch {
        setSessionError('Descrizione audio non valida')
      }
    },
    [applyPointingOverlay, clearPointingOverlay, getAudioQueue, getCurrentFrameMetadata],
  )

  useEffect(() => {
    serverMessageRef.current = handleServerMessage
  }, [handleServerMessage])

  const handleServerDisconnect = useCallback(() => {
    setStreamConfig(null)
    resetFrameFlow()
    stopAudioPlayback()
    clearPointingOverlay(true)
    latestDetectionsRef.current = []
  }, [clearPointingOverlay, resetFrameFlow, stopAudioPlayback])

  useEffect(() => {
    serverDisconnectRef.current = handleServerDisconnect
  }, [handleServerDisconnect])

  const unlockAudioPlayback = useCallback(async () => {
    if (audioUnlockedRef.current) return true
    const audioElement = audioRef.current
    if (!audioElement) return false

    const silentAudioUrl = URL.createObjectURL(createSilentWavBlob())
    try {
      audioElement.src = silentAudioUrl
      audioElement.load()
      await audioElement.play()
      audioElement.pause()
      audioElement.removeAttribute('src')
      audioElement.load()
      audioUnlockedRef.current = true
      return true
    } catch {
      return false
    } finally {
      URL.revokeObjectURL(silentAudioUrl)
    }
  }, [])

  const stopCapture = useCallback(() => {
    captureActiveRef.current = false
    setIsCaptureRunning(false)
    setInactiveCaptureState('stopped')
    setStreamConfig(null)
    setCaption('')
    setSessionError(null)
    latestDetectionsRef.current = []
    clearPointingOverlay(true)
    stopAudioPlayback()
    resetFrameFlow()
  }, [clearPointingOverlay, resetFrameFlow, stopAudioPlayback])

  const startCapture = useCallback(() => {
    if (!webSocketUrl) {
      setInactiveCaptureState('error')
      setSessionError('Server non configurato')
      return
    }

    void unlockAudioPlayback()
    frameIdRef.current = 0
    modeChangeCutoffFrameIdRef.current = 1
    sentFrameMetadataRef.current.clear()
    lastAudioFrameIdRef.current = null
    latestDetectionsRef.current = []
    clearPointingOverlay(true)
    stopAudioPlayback()
    resetFrameFlow()
    setCaption('')
    setSessionError(null)
    setInactiveCaptureState('idle')
    captureActiveRef.current = true
    setIsCaptureRunning(true)
  }, [
    clearPointingOverlay,
    resetFrameFlow,
    stopAudioPlayback,
    unlockAudioPlayback,
    webSocketUrl,
  ])

  const toggleCapture = useCallback(() => {
    if (isCaptureRunning) stopCapture()
    else startCapture()
  }, [isCaptureRunning, startCapture, stopCapture])

  const handleCaptionModeChange = useCallback(
    (nextMode: CaptionMode) => {
      if (nextMode === captionModeRef.current) return

      captionModeRef.current = nextMode
      modeChangeCutoffFrameIdRef.current = frameIdRef.current + 1
      lastAudioFrameIdRef.current = null
      latestFrameRef.current.clear()
      latestDetectionsRef.current = []
      frameGateRef.current.allowNowWhenIdle()
      clearDispatchRetry()
      clearPointingOverlay(true)
      stopAudioPlayback()
      setCaption('')
      setCaptionMode(nextMode)

      if (captureActiveRef.current) {
        queueMicrotask(() => void captureLatestFrame())
      }
    },
    [captureLatestFrame, clearDispatchRetry, clearPointingOverlay, stopAudioPlayback],
  )

  useEffect(() => {
    const latestFrameBuffer = latestFrameRef.current
    const frameGate = frameGateRef.current
    return () => {
      captureActiveRef.current = false
      clearDispatchRetry()
      audioQueueRef.current?.cancel()
      latestFrameBuffer.clear()
      frameGate.reset()
    }
  }, [clearDispatchRetry])

  const captureState: CaptureState = isCaptureRunning
    ? !webSocketUrl
      ? 'error'
      : serverConnectionStatus === 'open' && streamConfig
        ? 'streaming'
        : 'connecting'
    : inactiveCaptureState
  const hasActivePointing =
    captionMode === 'POINTING' &&
    pointingOverlay?.overlays.some((overlay) => overlay.state === 'ACTIVE')
  const activityLabel = sessionError
    ? sessionError
    : webcamError
      ? 'Fotocamera non disponibile'
      : !isWebcamActive
        ? 'Avvio fotocamera'
        : isCaptureRunning && !streamConfig
          ? 'Connessione al server'
          : isDescribing
            ? 'Descrizione in corso'
            : hasActivePointing
              ? 'Puntamento rilevato'
              : isCaptureRunning
                ? 'Analisi'
                : 'Pronto'
  const serverLabel = !webSocketUrl
    ? 'Non configurato'
    : !isCaptureRunning
      ? 'In attesa'
      : serverConnectionStatus === 'open' && streamConfig
        ? 'Connesso'
        : serverConnectionStatus === 'open'
          ? 'Sincronizzazione'
          : serverConnectionStatus === 'connecting'
            ? 'Connessione'
            : 'Offline'
  const serverTone =
    serverConnectionStatus === 'open' && streamConfig
      ? 'is-online'
      : isCaptureRunning
        ? 'is-pending'
        : 'is-idle'
  const startDisabled = !isWebcamActive || Boolean(webcamError) || !webSocketUrl

  return (
    <div className="vision-app">
      <audio ref={audioRef} className="sr-only" preload="auto" />
      <main className="camera-stage">
        <video
          ref={videoRef}
          className={`camera-preview${isMirrored ? ' is-mirrored' : ''}`}
          autoPlay
          playsInline
          muted
          aria-label="Anteprima fotocamera"
        />

        <div className="camera-scrim camera-scrim-top" aria-hidden="true" />
        <div className="camera-scrim camera-scrim-bottom" aria-hidden="true" />

        <header className="camera-topbar">
          <div className={`server-status ${serverTone}`} role="status" aria-live="polite">
            <span className="server-status-dot" aria-hidden="true" />
            <span className="server-status-copy">
              <strong>Server</strong>
              <span>{serverLabel}</span>
            </span>
          </div>

          <fieldset className="mode-control">
            <legend className="sr-only">Modalità descrizione</legend>
            <label className={captionMode === 'AUTO' ? 'is-selected' : undefined}>
              <input
                type="radio"
                name="caption-mode"
                value="AUTO"
                checked={captionMode === 'AUTO'}
                onChange={() => handleCaptionModeChange('AUTO')}
              />
              Auto
            </label>
            <label className={captionMode === 'POINTING' ? 'is-selected' : undefined}>
              <input
                type="radio"
                name="caption-mode"
                value="POINTING"
                checked={captionMode === 'POINTING'}
                onChange={() => handleCaptionModeChange('POINTING')}
              />
              Punta
            </label>
          </fieldset>
        </header>

        {!isWebcamActive && (
          <div className="camera-empty-state" role="status">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M14.5 6.5 16 4h2l1.5 2.5H21a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h11.5ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
            </svg>
            <p>{webcamError ? 'Controlla i permessi della fotocamera' : 'Avvio fotocamera…'}</p>
          </div>
        )}

        <div
          className={`activity-status${captureState === 'streaming' ? ' is-active' : ''}${sessionError || webcamError ? ' is-error' : ''}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span aria-hidden="true" />
          {activityLabel}
        </div>

        {caption && (
          <p className="caption-text" aria-live="polite" aria-atomic="true">
            {caption}
          </p>
        )}

        <footer className="camera-controls">
          <button
            className={`capture-button${isCaptureRunning ? ' is-running' : ''}`}
            type="button"
            onClick={toggleCapture}
            disabled={startDisabled && !isCaptureRunning}
            aria-pressed={isCaptureRunning}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {isCaptureRunning ? (
                <rect x="7" y="7" width="10" height="10" rx="1.5" />
              ) : (
                <path d="m9 6 9 6-9 6V6Z" />
              )}
            </svg>
            <span>{isCaptureRunning ? 'Arresta' : 'Avvia'}</span>
          </button>
        </footer>
      </main>
    </div>
  )
}

export default Dashboard
