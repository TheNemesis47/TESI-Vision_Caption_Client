import { useCallback, useEffect, useRef, useState } from 'react'
import './Dashboard.css'
import {
  captureVideoFrame,
  type CapturedFrame,
} from '../hooks/useFrameCapture'
import {
  DEFAULT_FACING,
  clampZoom,
  type CameraFacing,
} from '../domain/cameraControls'
import CameraControls from './CameraControls'
import { announceMode } from '../services/modeAnnouncement'
import { usePointingOverlay } from '../hooks/usePointingOverlay'
import { useServerConnection } from '../hooks/useServerConnection'
import { useWebcam } from '../hooks/useWebcam'
import {
  resolveAvailableCameraId,
  useCameraDevices,
} from '../hooks/useCameraDevices'
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
import {
  isDiagnosticOverlayEnabled,
  toOverlayBoxes,
  type OverlayBox,
} from '../domain/detectionOverlay'
import { calculatePreviewContentRect } from './pointingOverlayGeometry'
import HandLandmarksLayer from './HandLandmarksLayer'
import TutorialOverlay from './TutorialOverlay'
import { useTutorial } from '../hooks/useTutorial'
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
const showDiagnosticOverlays = isDiagnosticOverlayEnabled()
const frameMaxWidth = readPositiveNumber(import.meta.env.VITE_FRAME_MAX_WIDTH, 1280)
const frameMaxHeight = readPositiveNumber(import.meta.env.VITE_FRAME_MAX_HEIGHT, 720)
const jpegQuality = Math.min(
  readPositiveNumber(import.meta.env.VITE_FRAME_JPEG_QUALITY, 0.86),
  1,
)
const sentMetadataRetention = 64
const streamConfigTimeoutMs = 5000

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
  const latestFrameRef = useRef(new LatestFrameBuffer<PendingFrame>())
  const frameGateRef = useRef(new SingleFrameGate())
  const dispatchRetryTimerRef = useRef<number | undefined>(undefined)
  const attemptDispatchRef = useRef<() => void>(() => undefined)
  // Il gesto a V arriva dal server mentre handleCaptionModeChange è ancora
  // più in basso in questo file: la ref evita il riferimento in avanti.
  const applyModeChangeRef = useRef<(mode: CaptionMode) => void>(() => undefined)
  const serverMessageRef = useRef<(message: VisionServerMessage) => void>(
    () => undefined,
  )
  const serverDisconnectRef = useRef<() => void>(() => undefined)
  const audioUnlockedRef = useRef(false)

  const [captionMode, setCaptionMode] = useState<CaptionMode>('AUTO')
  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [facing, setFacing] = useState<CameraFacing>(DEFAULT_FACING)
  const [zoom, setZoom] = useState(1)
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
  const {
    videoRef,
    isActive: isWebcamActive,
    isMirrored,
    activeDeviceId,
    error: webcamError,
    zoomRange,
    applyZoom,
  } = useWebcam({
    deviceId: selectedDeviceId || undefined,
    enabled: true,
    facing,
  })
  const stageRef = useRef<HTMLElement>(null)
  const [overlayBoxes, setOverlayBoxes] = useState<OverlayBox[]>([])
  const [previewRect, setPreviewRect] = useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  })
  const { devices: cameraDevices, error: cameraDevicesError } =
    useCameraDevices(isWebcamActive)
  const tutorial = useTutorial()

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
      width: pendingFrame.frame.width,
      height: pendingFrame.frame.height,
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

  // `.camera-preview` è in object-fit: contain, quindi l'immagine occupa solo
  // una parte del palco. I box vanno posati su quella parte, non sul palco.
  const updatePreviewRect = useCallback(() => {
    const stage = stageRef.current
    const video = videoRef.current
    if (!stage || !video) return

    const { width, height } = stage.getBoundingClientRect()
    setPreviewRect(
      calculatePreviewContentRect({
        containerWidth: width,
        containerHeight: height,
        imageWidth: video.videoWidth,
        imageHeight: video.videoHeight,
        objectFit: 'contain',
      }),
    )
  }, [videoRef])

  useEffect(() => {
    const stage = stageRef.current
    const video = videoRef.current
    if (!stage || !video) return

    updatePreviewRect()
    video.addEventListener('loadedmetadata', updatePreviewRect)
    video.addEventListener('resize', updatePreviewRect)
    window.addEventListener('orientationchange', updatePreviewRect)

    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updatePreviewRect)
    observer?.observe(stage)

    return () => {
      video.removeEventListener('loadedmetadata', updatePreviewRect)
      video.removeEventListener('resize', updatePreviewRect)
      window.removeEventListener('orientationchange', updatePreviewRect)
      observer?.disconnect()
    }
  }, [updatePreviewRect, videoRef])

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
        setSessionError(null)
        setStreamConfig(message)
        frameGateRef.current.allowNowWhenIdle()
        return
      }

      if (message.type === 'stop_audio') {
        // Vale qualunque sia il frame: chi alza la mano vuole silenzio subito.
        stopAudioPlayback()
        navigator.vibrate?.(60)
        return
      }

      if (message.type === 'mode_switch') {
        // Il gesto a V: chi non vede non cerca un pulsante sullo schermo.
        // La conferma è una vibrazione e una voce, perché il cambio non si
        // vede e senza riscontro non si sa se il gesto è stato capito.
        if (message.mode !== captionModeRef.current) {
          applyModeChangeRef.current(message.mode)
          navigator.vibrate?.([40, 60, 40])
          announceMode(message.mode)
        }
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
        if (!showDiagnosticOverlays) return
        setOverlayBoxes(
          metadata.mode === 'AUTO'
            ? toOverlayBoxes(message.detections, metadata.width, metadata.height)
            : [],
        )
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
    [
      applyPointingOverlay,
      clearPointingOverlay,
      getAudioQueue,
      getCurrentFrameMetadata,
      stopAudioPlayback,
    ],
  )

  useEffect(() => {
    serverMessageRef.current = handleServerMessage
  }, [handleServerMessage])

  const handleServerDisconnect = useCallback(() => {
    setSessionError(null)
    setStreamConfig(null)
    resetFrameFlow()
    stopAudioPlayback()
    clearPointingOverlay(true)
    setOverlayBoxes([])
  }, [clearPointingOverlay, resetFrameFlow, stopAudioPlayback])

  useEffect(() => {
    serverDisconnectRef.current = handleServerDisconnect
  }, [handleServerDisconnect])

  useEffect(() => {
    if (
      !isCaptureRunning ||
      serverConnectionStatus !== 'open' ||
      streamConfig
    ) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setSessionError('Configurazione server non compatibile')
    }, streamConfigTimeoutMs)
    return () => window.clearTimeout(timeoutId)
  }, [isCaptureRunning, serverConnectionStatus, streamConfig])

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
    setOverlayBoxes([])
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
    setOverlayBoxes([])
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
      setOverlayBoxes([])
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
    applyModeChangeRef.current = handleCaptionModeChange
  }, [handleCaptionModeChange])

  // Lo zoom segue la fotocamera: cambiando obiettivo la corsa cambia, e il
  // valore della vecchia non significa niente sulla nuova. Si ricava qui
  // invece di inseguirlo con un effetto, che lo mostrerebbe fuori corsa per
  // un fotogramma.
  const effectiveZoom = zoomRange ? clampZoom(zoom, zoomRange) : 1

  const handleFacingChange = useCallback(
    (nextFacingValue: CameraFacing) => {
      if (isCaptureRunning) return
      // Una fotocamera scelta a mano vincerebbe sul verso: si libera.
      setSelectedDeviceId('')
      setFacing(nextFacingValue)
    },
    [isCaptureRunning],
  )

  const handleZoomChange = useCallback(
    (value: number) => {
      if (!zoomRange) return
      const wanted = clampZoom(value, zoomRange)
      setZoom(wanted)
      void applyZoom(wanted)
    },
    [applyZoom, zoomRange],
  )

  const handleCameraDeviceChange = useCallback(
    (deviceId: string) => {
      if (isCaptureRunning || !deviceId) return
      setCaption('')
      setSessionError(null)
      setSelectedDeviceId(deviceId)
    },
    [isCaptureRunning],
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
        : serverConnectionStatus === 'closed'
          ? 'error'
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
        : isCaptureRunning && serverConnectionStatus === 'closed'
          ? 'Disconnesso'
          : isCaptureRunning && serverConnectionStatus === 'connecting'
            ? 'Connessione al server'
            : isCaptureRunning && !streamConfig
              ? 'Sincronizzazione'
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
      : isCaptureRunning && serverConnectionStatus === 'closed'
        ? 'is-offline'
      : isCaptureRunning
        ? 'is-pending'
        : 'is-idle'
  const startDisabled = !isWebcamActive || Boolean(webcamError) || !webSocketUrl
  const selectedCameraId = resolveAvailableCameraId(
    cameraDevices,
    selectedDeviceId,
    activeDeviceId,
  )

  return (
    <div className="vision-app">
      <audio ref={audioRef} className="sr-only" preload="auto" />
      <main className="camera-stage" ref={stageRef}>
        <video
          ref={videoRef}
          className={`camera-preview${isMirrored ? ' is-mirrored' : ''}`}
          autoPlay
          playsInline
          muted
          aria-label="Anteprima fotocamera"
        />

        {showDiagnosticOverlays && captionMode === 'POINTING' && pointingOverlay && (
          <div
            className="hand-landmarks-stage"
            aria-hidden="true"
            style={{
              left: `${previewRect.left}px`,
              top: `${previewRect.top}px`,
              width: `${previewRect.width}px`,
              height: `${previewRect.height}px`,
            }}
          >
            <HandLandmarksLayer
              hands={pointingOverlay.hands}
              width={previewRect.width}
              height={previewRect.height}
              mirrored={isMirrored}
            />
          </div>
        )}

        {showDiagnosticOverlays && overlayBoxes.length > 0 && (
          <div
            className="detections-layer"
            aria-hidden="true"
            style={{
              left: `${previewRect.left}px`,
              top: `${previewRect.top}px`,
              width: `${previewRect.width}px`,
              height: `${previewRect.height}px`,
            }}
          >
            {overlayBoxes.map((box, index) => (
              <div
                className="bounding-box"
                key={`${box.label}-${index}`}
                style={{
                  left: `${(isMirrored ? 1 - box.left - box.width : box.left) * 100}%`,
                  top: `${box.top * 100}%`,
                  width: `${box.width * 100}%`,
                  height: `${box.height * 100}%`,
                }}
              >
                <span className="detection-label">{box.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="camera-scrim camera-scrim-top" aria-hidden="true" />
        <div className="camera-scrim camera-scrim-bottom" aria-hidden="true" />

        <header className="camera-topbar">
          <div className="camera-status-stack">
            <div className={`server-status ${serverTone}`} role="status" aria-live="polite">
              <span className="server-status-dot" aria-hidden="true" />
              <span className="server-status-copy">
                <strong>Server</strong>
                <span>{serverLabel}</span>
              </span>
            </div>

            <CameraControls
              facing={facing}
              onFacingChange={handleFacingChange}
              zoom={effectiveZoom}
              zoomRange={zoomRange}
              onZoomChange={handleZoomChange}
              disabled={isCaptureRunning}
            />

            <div className="camera-device-control">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M14.5 6.5 16 4h2l1.5 2.5H21a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h11.5ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
              </svg>
              <label className="sr-only" htmlFor="camera-device">
                Altri obiettivi della fotocamera
              </label>
              <select
                id="camera-device"
                value={selectedCameraId}
                onChange={(event) => handleCameraDeviceChange(event.target.value)}
                disabled={isCaptureRunning || cameraDevices.length === 0}
                aria-describedby={cameraDevicesError ? 'camera-device-error' : undefined}
              >
                {cameraDevices.length === 0 ? (
                  <option value="">
                    {cameraDevicesError
                      ? 'Selezione non disponibile'
                      : 'Ricerca fotocamere…'}
                  </option>
                ) : (
                  cameraDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))
                )}
              </select>
            </div>
            {cameraDevicesError && (
              <span className="sr-only" id="camera-device-error">
                {cameraDevicesError}
              </span>
            )}

            {/* La guida parla: riaprirla durante l'analisi si sovrapporrebbe
                alle descrizioni, quindi il pulsante c'è solo da fermi. */}
            {!isCaptureRunning && !tutorial.isOpen && (
              <button
                className="guide-button"
                type="button"
                onClick={tutorial.open}
                aria-label="Rivedi la guida"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 2h11a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm0 2a1 1 0 0 0-1 1v11.17A2.98 2.98 0 0 1 6 16h11V4H6Zm0 14a1 1 0 1 0 0 2h11v-2H6Z" />
                </svg>
              </button>
            )}
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
          className={`activity-status${captureState === 'streaming' ? ' is-active' : ''}${captureState === 'error' || sessionError || webcamError ? ' is-error' : ''}`}
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

        {tutorial.isOpen && (
          <TutorialOverlay
            step={tutorial.step}
            stepIndex={tutorial.stepIndex}
            stepCount={tutorial.stepCount}
            isVoiceEnabled={tutorial.isVoiceEnabled}
            cameraDevices={cameraDevices}
            selectedCameraId={selectedCameraId}
            captionMode={captionMode}
            onCameraChange={handleCameraDeviceChange}
            onModeChange={handleCaptionModeChange}
            onNext={tutorial.next}
            onSkip={tutorial.close}
            onRepeat={tutorial.repeat}
            onToggleVoice={tutorial.toggleVoice}
          />
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
