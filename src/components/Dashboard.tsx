import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './Dashboard.css'
import Sidebar from './Sidebar'
import VideoPanel from './VideoPanel'
import LogPanel from './LogPanel'
import type { LogEntry } from './LogPanel'
import { useWebcam } from '../hooks/useWebcam'
import {
  captureVideoFrame,
  shouldSkipFrameForBackpressure,
  type FrameDimensions,
} from '../hooks/useFrameCapture'
import { useServerConnection } from '../hooks/useServerConnection'
import { usePointingOverlay } from '../hooks/usePointingOverlay'
import {
  buildFramePacket,
  decodeBase64Audio,
  getAudioFreshnessLimit,
  getFrameOutputRejectionReason,
  shouldDropAudioFrameByOrder,
  type CaptionMode,
  type CaptureState,
  type DetectionPayload,
  type SentFrameMetadata,
  type VisionServerMessage,
} from '../domain/visionProtocol'
import { AudioPlaybackQueue } from '../services/audioPlaybackQueue'

export type Detection = {
  class_name: string
  confidence: number
  bbox: {
    x_min: number
    y_min: number
    x_max: number
    y_max: number
  }
}

const readPositiveNumber = (rawValue: unknown, fallback: number) => {
  const parsedValue = Number(rawValue)
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

const frameIntervalMs = readPositiveNumber(import.meta.env.VITE_FRAME_INTERVAL_MS, 100)
const detectionsTtlMs = readPositiveNumber(import.meta.env.VITE_DETECTIONS_TTL_MS, 3000)
const autoAudioMaxLatencyMs = readPositiveNumber(
  import.meta.env.VITE_AUTO_AUDIO_MAX_LATENCY_MS ?? import.meta.env.VITE_AUDIO_MAX_LATENCY_MS,
  2500,
)
const pointingAudioMaxLatencyMs = readPositiveNumber(
  import.meta.env.VITE_POINTING_AUDIO_MAX_LATENCY_MS,
  12000,
)
const maxSocketBufferedAmount = readPositiveNumber(
  import.meta.env.VITE_MAX_SOCKET_BUFFERED_AMOUNT,
  1_000_000,
)
const frameMaxWidth = readPositiveNumber(import.meta.env.VITE_FRAME_MAX_WIDTH, 1280)
const frameMaxHeight = readPositiveNumber(import.meta.env.VITE_FRAME_MAX_HEIGHT, 720)
const jpegQuality = Math.min(
  readPositiveNumber(import.meta.env.VITE_FRAME_JPEG_QUALITY, 0.86),
  1,
)
const sentMetadataRetention = 240

const clamp = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max)
}

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value)
}

const toFiniteNumber = (value: unknown) => {
  if (isFiniteNumber(value)) return value
  if (typeof value !== 'string') return null
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

const getRecordValue = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (key in record) return record[key]
  }
  return null
}

const normalizeCoordinate = (value: number, axisSize: number) => {
  if (value <= 1) return value
  return axisSize > 0 ? value / axisSize : value
}

const normalizeDetection = (
  detection: DetectionPayload,
  frameSize: FrameDimensions,
): Detection | null => {
  const bbox = detection.bbox ?? detection.bounding_box ?? detection.box ?? detection
  if (!bbox || typeof bbox !== 'object') return null

  const bboxRecord = bbox as Record<string, unknown>
  const bboxArray = Array.isArray(bbox) ? bbox : null
  const xMinValue = toFiniteNumber(
    bboxArray?.[0] ?? getRecordValue(bboxRecord, ['x_min', 'xmin', 'x1', 'left']),
  )
  const yMinValue = toFiniteNumber(
    bboxArray?.[1] ?? getRecordValue(bboxRecord, ['y_min', 'ymin', 'y1', 'top']),
  )
  const xMaxValue = toFiniteNumber(
    bboxArray?.[2] ?? getRecordValue(bboxRecord, ['x_max', 'xmax', 'x2', 'right']),
  )
  const yMaxValue = toFiniteNumber(
    bboxArray?.[3] ?? getRecordValue(bboxRecord, ['y_max', 'ymax', 'y2', 'bottom']),
  )
  if (xMinValue === null || yMinValue === null || xMaxValue === null || yMaxValue === null) {
    return null
  }

  const normalizedXMin = normalizeCoordinate(xMinValue, frameSize.width)
  const normalizedYMin = normalizeCoordinate(yMinValue, frameSize.height)
  const normalizedXMax = normalizeCoordinate(xMaxValue, frameSize.width)
  const normalizedYMax = normalizeCoordinate(yMaxValue, frameSize.height)
  const confidence = toFiniteNumber(detection.confidence ?? detection.score ?? detection.conf)

  return {
    class_name:
      typeof detection.class_name === 'string'
        ? detection.class_name
        : typeof detection.label === 'string'
          ? detection.label
          : typeof detection.name === 'string'
            ? detection.name
            : 'object',
    confidence: confidence ?? 0,
    bbox: {
      x_min: clamp(Math.min(normalizedXMin, normalizedXMax), 0, 1),
      y_min: clamp(Math.min(normalizedYMin, normalizedYMax), 0, 1),
      x_max: clamp(Math.max(normalizedXMin, normalizedXMax), 0, 1),
      y_max: clamp(Math.max(normalizedYMin, normalizedYMax), 0, 1),
    },
  }
}

const formatTimestamp = () => {
  return new Date().toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const formatDetection = (detection: Detection) => {
  return `${detection.class_name} ${Math.round(detection.confidence * 100)}%`
}

const isIphoneDevice = () => {
  if (typeof navigator === 'undefined') return false
  return navigator.platform === 'iPhone' || /\biPhone\b/i.test(navigator.userAgent)
}

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
  const rootRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const audioQueueRef = useRef<AudioPlaybackQueue | null>(null)
  const captureActiveRef = useRef(false)
  const captionModeRef = useRef<CaptionMode>('AUTO')
  const frameIdRef = useRef(0)
  const modeChangeCutoffFrameIdRef = useRef(1)
  const lastAudioFrameIdRef = useRef<number | null>(null)
  const sentFrameMetadataRef = useRef<Map<number, SentFrameMetadata>>(new Map())
  const isSendingFrameRef = useRef(false)
  const lastFrameSizeRef = useRef<FrameDimensions>({ width: 0, height: 0 })
  const detectionsClearTimerRef = useRef<number | undefined>(undefined)
  const skippedBackpressureFramesRef = useRef(0)
  const dragModeRef = useRef<'sidebar' | 'log' | null>(null)
  const logIdRef = useRef(0)
  const lastLogRef = useRef<{
    level: LogEntry['level']
    message: string
    createdAt: number
  } | null>(null)

  const [selectedDeviceId, setSelectedDeviceId] = useState('')
  const [caption, setCaption] = useState('')
  const [captionMode, setCaptionMode] = useState<CaptionMode>('AUTO')
  const [inactiveCaptureState, setInactiveCaptureState] = useState<CaptureState>('idle')
  const [detections, setDetections] = useState<Detection[]>([])
  const [isCaptureRunning, setIsCaptureRunning] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(300)
  const [logHeight, setLogHeight] = useState(132)
  const [isIphoneBrowser] = useState(() => isIphoneDevice())
  const [audioAutoplayUnlocked, setAudioAutoplayUnlocked] = useState(
    () => !isIphoneDevice(),
  )
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 0,
      timestamp: formatTimestamp(),
      level: 'info',
      message: `Avvio applicazione. Frequenza frame: ${(1000 / frameIntervalMs).toFixed(1)} FPS`,
    },
  ])
  const {
    message: pointingOverlay,
    apply: applyPointingOverlay,
    clear: clearPointingOverlay,
  } = usePointingOverlay()
  const isWebcamEnabled = selectedDeviceId !== ''

  const appendLog = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    const now = Date.now()
    const lastLog = lastLogRef.current
    if (
      lastLog &&
      lastLog.message === message &&
      lastLog.level === level &&
      now - lastLog.createdAt < 300
    ) {
      return
    }
    lastLogRef.current = { message, level, createdAt: now }

    setLogs((currentLogs) => [
      ...currentLogs.slice(-159),
      {
        id: (logIdRef.current += 1),
        timestamp: formatTimestamp(),
        level,
        message,
      },
    ])
  }, [])

  const getAudioQueue = useCallback(() => {
    if (audioQueueRef.current) return audioQueueRef.current
    const audioElement = audioRef.current
    if (!audioElement) return null

    audioQueueRef.current = new AudioPlaybackQueue({
      audio: audioElement,
      onPlaybackError: (error, item) => {
        appendLog(
          `Audio frame_id=${item.frameId} non riprodotto: ${(error as Error).message}`,
          'warning',
        )
      },
      onQueueChange: (pendingItems) => {
        console.debug('[AudioQueue] Stato coda', { pendingItems })
      },
    })
    return audioQueueRef.current
  }, [appendLog])

  const stopAudioPlayback = useCallback(
    ({ resetFrameId = false }: { resetFrameId?: boolean } = {}) => {
      if (audioQueueRef.current) {
        audioQueueRef.current.cancel()
      } else {
        const audioElement = audioRef.current
        audioElement?.pause()
        audioElement?.removeAttribute('src')
        audioElement?.load()
      }
      if (resetFrameId) {
        lastAudioFrameIdRef.current = null
      }
    },
    [],
  )

  const clearDetections = useCallback(() => {
    window.clearTimeout(detectionsClearTimerRef.current)
    detectionsClearTimerRef.current = undefined
    setDetections([])
  }, [])

  const showDetections = useCallback((nextDetections: Detection[]) => {
    window.clearTimeout(detectionsClearTimerRef.current)
    setDetections(nextDetections)

    if (nextDetections.length > 0) {
      detectionsClearTimerRef.current = window.setTimeout(() => {
        setDetections([])
        detectionsClearTimerRef.current = undefined
      }, detectionsTtlMs)
    }
  }, [])

  const getFrameMetadata = useCallback(
    (frameId: number, messageType: VisionServerMessage['type']) => {
      const metadata = sentFrameMetadataRef.current.get(frameId)
      const rejectionReason = getFrameOutputRejectionReason({
        frameId,
        metadata,
        currentMode: captionModeRef.current,
        modeChangeCutoffFrameId: modeChangeCutoffFrameIdRef.current,
      })
      if (rejectionReason) {
        appendLog(
          `[${messageType.toUpperCase()} DROP] ${rejectionReason}, frame_id=${frameId}, cutoff=${modeChangeCutoffFrameIdRef.current}`,
          'warning',
        )
        return null
      }
      return metadata
    },
    [appendLog],
  )

  const handleServerMessage = useCallback(
    (message: VisionServerMessage) => {
      const metadata = getFrameMetadata(message.frame_id, message.type)
      if (!metadata) return

      const latencyMs = Date.now() - metadata.sentAt
      if (message.type === 'pointing_overlay') {
        if (
          captionModeRef.current !== 'POINTING' ||
          metadata.mode !== 'POINTING'
        ) {
          clearPointingOverlay()
          return
        }

        const applied = applyPointingOverlay(message)
        if (!applied) {
          console.debug('[POINTING_OVERLAY DROP] frame vecchio', {
            frameId: message.frame_id,
          })
        }
        return
      }

      if (message.type === 'detections') {
        if (captionModeRef.current !== 'AUTO' || metadata.mode !== 'AUTO') {
          clearDetections()
          return
        }

        const nextDetections = message.detections
          .map((detection) => normalizeDetection(detection, lastFrameSizeRef.current))
          .filter((detection): detection is Detection => detection !== null)
        showDetections(nextDetections)
        appendLog(
          nextDetections.length > 0
            ? `Detections frame_id=${message.frame_id}, latency=${Math.round(latencyMs)}ms: ${nextDetections.map(formatDetection).join(' | ')}`
            : `Detections frame_id=${message.frame_id}: nessun oggetto`,
          nextDetections.length > 0 ? 'success' : 'info',
        )
        return
      }

      if (!captureActiveRef.current) {
        appendLog(
          `[AUDIO DROP] cattura ferma, frame_id=${message.frame_id}`,
          'warning',
        )
        stopAudioPlayback({ resetFrameId: true })
        return
      }

      const lastAudioFrameId = lastAudioFrameIdRef.current
      if (shouldDropAudioFrameByOrder(message.frame_id, lastAudioFrameId)) {
        appendLog(
          `[AUDIO DROP] frame vecchio frame_id=${message.frame_id}, ultimo=${lastAudioFrameId}`,
          'warning',
        )
        return
      }

      const freshnessLimit = getAudioFreshnessLimit(
        metadata.mode,
        autoAudioMaxLatencyMs,
        pointingAudioMaxLatencyMs,
      )
      if (latencyMs > freshnessLimit) {
        appendLog(
          `[AUDIO DROP] stale latency frame_id=${message.frame_id}, mode=${metadata.mode}, latency=${Math.round(latencyMs)}ms`,
          'warning',
        )
        return
      }

      if (isIphoneBrowser && !audioAutoplayUnlocked) {
        appendLog(
          'Audio scartato: abilita prima l’autoplay audio su iPhone',
          'warning',
        )
        return
      }

      try {
        const blob = decodeBase64Audio(message.audio, message.format)
        const audioQueue = getAudioQueue()
        if (!audioQueue) {
          throw new Error('Elemento audio non disponibile')
        }

        lastAudioFrameIdRef.current =
          lastAudioFrameId === null
            ? message.frame_id
            : Math.max(lastAudioFrameId, message.frame_id)
        setCaption(message.caption)
        audioQueue.enqueue({
          blob,
          caption: message.caption,
          frameId: message.frame_id,
        })
        appendLog(
          `Caption audio frame_id=${message.frame_id}, mode=${metadata.mode}, latency=${Math.round(latencyMs)}ms: ${message.caption}`,
          'success',
        )
        console.debug('[Audio] Chunk accodato', {
          frameId: message.frame_id,
          mode: metadata.mode,
          mimeType: blob.type,
          bytes: blob.size,
          latencyMs: Math.round(latencyMs),
        })
      } catch (error) {
        appendLog(`Audio non decodificabile: ${(error as Error).message}`, 'error')
      }
    },
    [
      appendLog,
      applyPointingOverlay,
      audioAutoplayUnlocked,
      clearDetections,
      clearPointingOverlay,
      getAudioQueue,
      getFrameMetadata,
      isIphoneBrowser,
      showDetections,
      stopAudioPlayback,
    ],
  )

  const {
    status: serverConnectionStatus,
    webSocketUrl,
    sendJson,
    getBufferedAmount,
  } = useServerConnection({
    enabled: isCaptureRunning,
    onLog: appendLog,
    onMessage: handleServerMessage,
    onDisconnect: () => {
      if (!captureActiveRef.current) return
      stopAudioPlayback({ resetFrameId: true })
      clearDetections()
      clearPointingOverlay()
      appendLog(
        'Output della connessione precedente cancellato prima del reconnect',
        'warning',
      )
    },
  })

  const { videoRef, isActive, isMirrored, error } = useWebcam({
    deviceId: selectedDeviceId,
    enabled: isWebcamEnabled && isCaptureRunning,
  })

  useEffect(() => {
    if (!isActive) {
      clearPointingOverlay()
    }
  }, [clearPointingOverlay, isActive])

  useEffect(() => {
    return () => {
      captureActiveRef.current = false
      window.clearTimeout(detectionsClearTimerRef.current)
      stopAudioPlayback({ resetFrameId: true })
    }
  }, [stopAudioPlayback])

  const unlockAudioAutoplay = useCallback(async () => {
    const audioElement = audioRef.current
    if (!audioElement) {
      appendLog('Elemento audio non disponibile', 'error')
      return false
    }

    stopAudioPlayback({ resetFrameId: true })
    const silentAudioUrl = URL.createObjectURL(createSilentWavBlob())
    try {
      audioElement.src = silentAudioUrl
      audioElement.load()
      await audioElement.play()
      audioElement.pause()
      audioElement.removeAttribute('src')
      audioElement.load()
      setAudioAutoplayUnlocked(true)
      appendLog('Autoplay audio abilitato su iPhone', 'success')
      return true
    } catch (unlockError) {
      appendLog(
        `Sblocco audio non riuscito: ${(unlockError as Error).message}`,
        'error',
      )
      return false
    } finally {
      URL.revokeObjectURL(silentAudioUrl)
    }
  }, [appendLog, stopAudioPlayback])

  const handleCaptionModeChange = useCallback(
    (nextMode: CaptionMode) => {
      if (captionModeRef.current === nextMode) return

      const cutoffFrameId = frameIdRef.current + 1
      captionModeRef.current = nextMode
      modeChangeCutoffFrameIdRef.current = cutoffFrameId
      lastAudioFrameIdRef.current = null
      setCaptionMode(nextMode)
      setCaption('')
      clearDetections()
      clearPointingOverlay()
      stopAudioPlayback({ resetFrameId: true })
      appendLog(
        `Modalità cambiata: ${nextMode}, cutoff frame_id=${cutoffFrameId}`,
        'success',
      )
      console.debug('[VisionSession] Cambio modalità', {
        mode: nextMode,
        cutoffFrameId,
      })
    },
    [appendLog, clearDetections, clearPointingOverlay, stopAudioPlayback],
  )

  const sendCurrentFrame = useCallback(async () => {
    if (
      !captureActiveRef.current ||
      isSendingFrameRef.current ||
      !isWebcamEnabled
    ) {
      return
    }

    const bufferedAmount = getBufferedAmount()
    if (shouldSkipFrameForBackpressure(bufferedAmount, maxSocketBufferedAmount)) {
      skippedBackpressureFramesRef.current += 1
      console.debug('[VisionSession] Frame saltato per backpressure', {
        bufferedAmount,
        threshold: maxSocketBufferedAmount,
        skippedFrames: skippedBackpressureFramesRef.current,
      })
      return
    }

    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return

    isSendingFrameRef.current = true
    try {
      captureCanvasRef.current ??= document.createElement('canvas')
      const frame = await captureVideoFrame(video, captureCanvasRef.current, {
        maxWidth: frameMaxWidth,
        maxHeight: frameMaxHeight,
        jpegQuality,
      })

      if (!captureActiveRef.current) return

      const bufferedAfterEncoding = getBufferedAmount()
      if (
        shouldSkipFrameForBackpressure(
          bufferedAfterEncoding,
          maxSocketBufferedAmount,
        )
      ) {
        skippedBackpressureFramesRef.current += 1
        console.debug('[VisionSession] JPEG scartato per backpressure', {
          bufferedAmount: bufferedAfterEncoding,
          jpegBytes: frame.blob.size,
        })
        return
      }

      const frameId = frameIdRef.current + 1
      const mode = captionModeRef.current
      const packet = buildFramePacket({
        imageBase64: frame.imageBase64,
        frameId,
        captionMode: mode,
      })
      const sendResult = sendJson(packet)
      if (!sendResult.sent) return

      const sentAt = Date.now()
      frameIdRef.current = frameId
      lastFrameSizeRef.current = { width: frame.width, height: frame.height }
      sentFrameMetadataRef.current.set(frameId, { frameId, mode, sentAt })

      const oldestRetainedFrameId = frameId - sentMetadataRetention
      for (const sentFrameId of sentFrameMetadataRef.current.keys()) {
        if (sentFrameId < oldestRetainedFrameId) {
          sentFrameMetadataRef.current.delete(sentFrameId)
        }
      }

      console.debug('[VisionSession] Frame inviato', {
        frameId,
        mode,
        jpegBytes: frame.blob.size,
        dimensions: `${frame.width}x${frame.height}`,
        bufferedAmount: sendResult.bufferedAmount,
      })
    } catch (frameError) {
      appendLog(`Errore invio frame: ${(frameError as Error).message}`, 'error')
    } finally {
      isSendingFrameRef.current = false
    }
  }, [
    appendLog,
    getBufferedAmount,
    isWebcamEnabled,
    sendJson,
    videoRef,
  ])

  useEffect(() => {
    if (
      !isCaptureRunning ||
      !isWebcamEnabled ||
      !isActive ||
      serverConnectionStatus !== 'open'
    ) {
      return
    }

    void sendCurrentFrame()
    const intervalId = window.setInterval(() => {
      void sendCurrentFrame()
    }, frameIntervalMs)
    return () => window.clearInterval(intervalId)
  }, [
    isActive,
    isCaptureRunning,
    isWebcamEnabled,
    sendCurrentFrame,
    serverConnectionStatus,
  ])

  const stopCapture = useCallback(
    (reason = 'Cattura fermata') => {
      captureActiveRef.current = false
      setIsCaptureRunning(false)
      setInactiveCaptureState('stopped')
      setCaption('')
      clearDetections()
      clearPointingOverlay()
      stopAudioPlayback({ resetFrameId: true })
      appendLog(reason, 'warning')
    },
    [appendLog, clearDetections, clearPointingOverlay, stopAudioPlayback],
  )

  const startCapture = useCallback(() => {
    if (!webSocketUrl) {
      setInactiveCaptureState('error')
      setCaption('Server WebSocket non configurato')
      appendLog('Impossibile avviare: VITE_VISION_WS_URL non configurato', 'error')
      return
    }

    captionModeRef.current = 'AUTO'
    frameIdRef.current = 0
    modeChangeCutoffFrameIdRef.current = 1
    lastAudioFrameIdRef.current = null
    sentFrameMetadataRef.current.clear()
    skippedBackpressureFramesRef.current = 0
    setCaptionMode('AUTO')
    setCaption('')
    clearDetections()
    clearPointingOverlay(true)
    stopAudioPlayback({ resetFrameId: true })
    captureActiveRef.current = true
    setInactiveCaptureState('idle')
    setIsCaptureRunning(true)
    appendLog('Nuova sessione di cattura avviata in modalità AUTO', 'success')
  }, [
    appendLog,
    clearDetections,
    clearPointingOverlay,
    stopAudioPlayback,
    webSocketUrl,
  ])

  const toggleCapture = useCallback(() => {
    if (isCaptureRunning) {
      stopCapture()
      return
    }
    startCapture()
  }, [isCaptureRunning, startCapture, stopCapture])

  const handleDeviceChange = useCallback(
    (deviceId: string) => {
      if (captureActiveRef.current) {
        stopCapture('Cattura fermata per cambio webcam')
      }
      setSelectedDeviceId(deviceId)
      setCaption('')
      clearDetections()
      clearPointingOverlay()
      appendLog(
        deviceId ? 'Webcam selezionata' : 'Webcam disattivata',
        'info',
      )
    },
    [appendLog, clearDetections, clearPointingOverlay, stopCapture],
  )

  const resizeSidebarAt = useCallback((clientX: number) => {
    const root = rootRef.current
    if (!root) return
    const rootRect = root.getBoundingClientRect()
    const maxWidth = Math.max(260, Math.min(460, rootRect.width * 0.42))
    setSidebarWidth(clamp(clientX - rootRect.left - 18, 220, maxWidth))
  }, [])

  const resizeLogAt = useCallback((clientY: number) => {
    const root = rootRef.current
    if (!root) return
    const rootRect = root.getBoundingClientRect()
    const maxHeight = Math.max(120, rootRect.height * 0.38)
    setLogHeight(clamp(rootRect.bottom - clientY - 18, 80, maxHeight))
  }, [])

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      if (dragModeRef.current === 'sidebar') resizeSidebarAt(event.clientX)
      if (dragModeRef.current === 'log') resizeLogAt(event.clientY)
    }
    const handlePointerUp = () => {
      dragModeRef.current = null
      document.body.classList.remove('is-resizing-dashboard')
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
    }
  }, [resizeLogAt, resizeSidebarAt])

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragModeRef.current = 'sidebar'
    document.body.classList.add('is-resizing-dashboard')
    resizeSidebarAt(event.clientX)
  }

  const startLogResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    dragModeRef.current = 'log'
    document.body.classList.add('is-resizing-dashboard')
    resizeLogAt(event.clientY)
  }

  const adjustSidebarWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const maxWidth = Math.max(260, Math.min(460, window.innerWidth * 0.42))
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      setSidebarWidth((width) => clamp(width - 20, 220, maxWidth))
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      setSidebarWidth((width) => clamp(width + 20, 220, maxWidth))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setSidebarWidth(220)
    } else if (event.key === 'End') {
      event.preventDefault()
      setSidebarWidth(maxWidth)
    }
  }

  const adjustLogWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    const maxHeight = Math.max(120, window.innerHeight * 0.38)
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setLogHeight((height) => clamp(height + 16, 80, maxHeight))
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      setLogHeight((height) => clamp(height - 16, 80, maxHeight))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setLogHeight(80)
    } else if (event.key === 'End') {
      event.preventDefault()
      setLogHeight(maxHeight)
    }
  }

  const dashboardStyle = {
    '--sidebar-width': `${sidebarWidth}px`,
    '--log-height': `${logHeight}px`,
  } as CSSProperties
  const captureState: CaptureState = isCaptureRunning
    ? !webSocketUrl
      ? 'error'
      : serverConnectionStatus === 'open'
        ? 'streaming'
        : 'connecting'
    : inactiveCaptureState

  return (
    <div className="dashboard-root" style={dashboardStyle} ref={rootRef}>
      <audio ref={audioRef} className="sr-only" preload="auto" />
      <div className="dashboard-inner">
        <aside className="dashboard-left">
          <Sidebar
            serverConnectionStatus={serverConnectionStatus}
            captureState={captureState}
            captionMode={captionMode}
            isWebcamActive={isActive}
            isWebcamEnabled={isWebcamEnabled}
            webcamError={error}
            isCaptureRunning={isCaptureRunning}
            selectedDeviceId={selectedDeviceId}
            showAudioAutoplay={isIphoneBrowser}
            audioAutoplayUnlocked={audioAutoplayUnlocked}
            onDeviceChange={handleDeviceChange}
            onCaptureToggle={toggleCapture}
            onCaptionModeChange={handleCaptionModeChange}
            onAudioAutoplayUnlock={unlockAudioAutoplay}
          />
        </aside>
        <div
          className="dashboard-resize-handle dashboard-resize-handle-side"
          role="separator"
          aria-label="Ridimensiona pannello laterale"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={startSidebarResize}
          onKeyDown={adjustSidebarWithKeyboard}
        />
        <main className="dashboard-main">
          <VideoPanel
            videoRef={videoRef}
            isActive={isActive}
            isMirrored={isMirrored}
            isWebcamEnabled={isWebcamEnabled}
            error={error}
            caption={caption}
            detections={detections}
            pointingOverlay={pointingOverlay}
            captionMode={captionMode}
            captureState={captureState}
          />
        </main>
      </div>
      <div
        className="dashboard-resize-handle dashboard-resize-handle-log"
        role="separator"
        aria-label="Ridimensiona barra log"
        aria-orientation="horizontal"
        tabIndex={0}
        onPointerDown={startLogResize}
        onKeyDown={adjustLogWithKeyboard}
      />
      <footer className="dashboard-footer">
        <LogPanel logs={logs} />
      </footer>
    </div>
  )
}

export default Dashboard
