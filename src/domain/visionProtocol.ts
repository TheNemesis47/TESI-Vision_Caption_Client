export const CAPTION_MODES = ['AUTO', 'POINTING'] as const

export type CaptionMode = (typeof CAPTION_MODES)[number]

export type CaptureState = 'idle' | 'connecting' | 'streaming' | 'stopped' | 'error'

export type FramePacket = {
  image: string
  frame_id: number
  caption_mode: CaptionMode
  pointing_coordinates: null
}

export type SentFrameMetadata = {
  frameId: number
  mode: CaptionMode
  sentAt: number
  // Le detection tornano in pixel del frame inviato, non normalizzate: per
  // disegnarle sopra l'anteprima serve sapere quanto era grande quel frame.
  width?: number
  height?: number
}

export type AudioFormat = 'wav' | 'mp3' | 'opus'

export type AudioServerMessage = {
  type: 'audio'
  frame_id: number
  caption: string
  audio: string
  duration: number | null
  format: AudioFormat
}

export type DetectionPayload = {
  class_name?: unknown
  confidence?: unknown
  bbox?: unknown
  [key: string]: unknown
}

export type DetectionsServerMessage = {
  type: 'detections'
  frame_id: number
  detections: DetectionPayload[]
}

export type NormalizedPoint = {
  x: number
  y: number
}

export type Handedness = 'LEFT' | 'RIGHT' | 'UNKNOWN'

/** I 21 landmark MediaPipe di una mano, in frazioni del frame inviato. */
export type HandLandmarks = {
  handedness: Handedness
  landmarks: NormalizedPoint[]
}

export const HAND_LANDMARK_COUNT = 21

export type PointingOverlay = {
  handedness: Handedness
  state: 'CANDIDATE' | 'ACTIVE'
  confirmation_progress: number
  ray: {
    start: NormalizedPoint
    end: NormalizedPoint
  }
}

export type PointingCorridorStyle = {
  coordinate_space: 'normalized'
  width_reference: 'short_side'
  start_half_width_ratio: number
  min_end_half_width_ratio: number
  expansion_ratio: number
  fill_alpha: number
  color: string
  line_width_px: number
}

export type PointingOverlayMessage = {
  type: 'pointing_overlay'
  frame_id: number
  overlays: PointingOverlay[]
  // I landmark accompagnano l'overlay a ogni frame POINTING, anche quando la
  // mano non punta: servono alla vista diagnostica, non all'utente finale.
  hands: HandLandmarks[]
  corridor: PointingCorridorStyle
}

export type StreamConfigServerMessage = {
  type: 'stream_config'
  auto_fps: number
  pointing_fps: number
  max_in_flight: number
}

export type FrameDoneServerMessage = {
  type: 'frame_done'
  frame_id: number
  outcome: string
  next_frame_after_ms: number
}

/** Il server ha visto il gesto di stop (mano aperta): la voce va zittita. */
export type StopAudioServerMessage = {
  type: 'stop_audio'
  frame_id: number
}

/** Il server ha visto il gesto a V: il telefono deve cambiare modalità. */
export type ModeSwitchServerMessage = {
  type: 'mode_switch'
  frame_id: number
  mode: CaptionMode
  min_frame_interval_ms: number | null
}

export type VisionServerMessage =
  | AudioServerMessage
  | DetectionsServerMessage
  | PointingOverlayMessage
  | StreamConfigServerMessage
  | FrameDoneServerMessage
  | StopAudioServerMessage
  | ModeSwitchServerMessage

export type VisionMessageParseResult =
  | { kind: 'message'; message: VisionServerMessage }
  | { kind: 'unknown'; type: string; value: Record<string, unknown> }
  | { kind: 'invalid'; reason: string }

const AUDIO_FORMATS = new Set<AudioFormat>(['wav', 'mp3', 'opus'])
const DATA_URL_PREFIX = /^data:image\/jpeg;base64,/i

export type FrameOutputRejectionReason =
  | 'before-mode-cutoff'
  | 'missing-metadata'
  | 'mode-mismatch'

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value)
}

const isRatio = (value: unknown): value is number => {
  return isFiniteNumber(value) && value >= 0 && value <= 1
}

const isNonNegativeNumber = (value: unknown): value is number => {
  return isFiniteNumber(value) && value >= 0
}

const parseFrameId = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return null
  return value
}

const parseNormalizedPoint = (value: unknown): NormalizedPoint | null => {
  if (!isRecord(value) || !isRatio(value.x) || !isRatio(value.y)) return null
  return { x: value.x, y: value.y }
}

const isHandedness = (value: unknown): value is Handedness => {
  return value === 'LEFT' || value === 'RIGHT' || value === 'UNKNOWN'
}

/**
 * I landmark escono dal fotogramma quando la mano tocca il bordo, quindi non
 * sono vincolati a [0, 1] come i punti del corridoio. Una mano malformata si
 * scarta da sola: è materiale diagnostico, non deve far cadere l'overlay del
 * puntamento.
 */
const parseHandLandmarks = (value: unknown): HandLandmarks | null => {
  if (!isRecord(value) || !isHandedness(value.handedness)) return null
  if (!Array.isArray(value.landmarks)) return null
  if (value.landmarks.length !== HAND_LANDMARK_COUNT) return null

  const landmarks: NormalizedPoint[] = []
  for (const rawLandmark of value.landmarks) {
    if (
      !isRecord(rawLandmark) ||
      !isFiniteNumber(rawLandmark.x) ||
      !isFiniteNumber(rawLandmark.y)
    ) {
      return null
    }
    landmarks.push({ x: rawLandmark.x, y: rawLandmark.y })
  }

  return { handedness: value.handedness, landmarks }
}

const parsePointingOverlay = (value: unknown): PointingOverlay | null => {
  if (!isRecord(value) || !isRecord(value.ray)) return null
  if (!isHandedness(value.handedness)) return null
  if (value.state !== 'CANDIDATE' && value.state !== 'ACTIVE') return null
  if (!isRatio(value.confirmation_progress)) return null

  const start = parseNormalizedPoint(value.ray.start)
  const end = parseNormalizedPoint(value.ray.end)
  if (!start || !end) return null

  return {
    handedness: value.handedness,
    state: value.state,
    confirmation_progress: value.confirmation_progress,
    ray: { start, end },
  }
}

const parsePointingCorridorStyle = (
  value: unknown,
): PointingCorridorStyle | null => {
  if (!isRecord(value)) return null
  if (
    value.coordinate_space !== 'normalized' ||
    value.width_reference !== 'short_side' ||
    !isNonNegativeNumber(value.start_half_width_ratio) ||
    !isNonNegativeNumber(value.min_end_half_width_ratio) ||
    !isNonNegativeNumber(value.expansion_ratio) ||
    !isRatio(value.fill_alpha) ||
    typeof value.color !== 'string' ||
    value.color.trim().length === 0 ||
    !isNonNegativeNumber(value.line_width_px)
  ) {
    return null
  }

  return {
    coordinate_space: 'normalized',
    width_reference: 'short_side',
    start_half_width_ratio: value.start_half_width_ratio,
    min_end_half_width_ratio: value.min_end_half_width_ratio,
    expansion_ratio: value.expansion_ratio,
    fill_alpha: value.fill_alpha,
    color: value.color,
    line_width_px: value.line_width_px,
  }
}

export const stripJpegDataUrlPrefix = (value: string) => {
  return value.replace(DATA_URL_PREFIX, '')
}

export const buildFramePacket = ({
  imageBase64,
  frameId,
  captionMode,
}: {
  imageBase64: string
  frameId: number
  captionMode: CaptionMode
}): FramePacket => {
  if (!Number.isInteger(frameId) || frameId < 1) {
    throw new Error('frame_id deve essere un intero positivo')
  }

  const image = stripJpegDataUrlPrefix(imageBase64)
  if (!image) {
    throw new Error('Il frame JPEG Base64 è vuoto')
  }

  return {
    image,
    frame_id: frameId,
    caption_mode: captionMode,
    pointing_coordinates: null,
  }
}

export const getAudioMimeType = (format: AudioFormat) => {
  if (format === 'mp3') return 'audio/mpeg'
  return `audio/${format}`
}

export const getFrameOutputRejectionReason = ({
  frameId,
  metadata,
  currentMode,
  modeChangeCutoffFrameId,
}: {
  frameId: number
  metadata: SentFrameMetadata | undefined
  currentMode: CaptionMode
  modeChangeCutoffFrameId: number
}): FrameOutputRejectionReason | null => {
  if (frameId < modeChangeCutoffFrameId) return 'before-mode-cutoff'
  if (!metadata) return 'missing-metadata'
  if (metadata.mode !== currentMode) return 'mode-mismatch'
  return null
}

export const shouldDropAudioFrameByOrder = (
  frameId: number,
  lastAudioFrameId: number | null,
) => {
  return lastAudioFrameId !== null && frameId < lastAudioFrameId
}

export const getAudioFreshnessLimit = (
  mode: CaptionMode,
  autoLimitMs: number,
  pointingLimitMs: number,
) => {
  return mode === 'AUTO' ? autoLimitMs : pointingLimitMs
}

export const decodeBase64Audio = (audioBase64: string, format: AudioFormat) => {
  const binaryString = atob(audioBase64)
  const bytes = new Uint8Array(binaryString.length)

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index)
  }

  return new Blob([bytes], { type: getAudioMimeType(format) })
}

export const parseVisionServerMessage = (raw: unknown): VisionMessageParseResult => {
  let parsed: unknown = raw

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { kind: 'invalid', reason: 'JSON non valido' }
    }
  }

  if (!isRecord(parsed)) {
    return { kind: 'invalid', reason: 'Il messaggio deve essere un oggetto JSON' }
  }

  if (typeof parsed.type !== 'string') {
    return { kind: 'invalid', reason: 'Campo type mancante' }
  }

  if (parsed.type === 'stream_config') {
    const nestedFps = isRecord(parsed.fps) ? parsed.fps : null
    const autoFps = parsed.auto_fps ?? nestedFps?.AUTO
    const pointingFps = parsed.pointing_fps ?? nestedFps?.POINTING

    if (!isFiniteNumber(autoFps) || autoFps <= 0) {
      return { kind: 'invalid', reason: 'stream_config con auto_fps non valido' }
    }
    if (!isFiniteNumber(pointingFps) || pointingFps <= 0) {
      return { kind: 'invalid', reason: 'stream_config con pointing_fps non valido' }
    }
    if (
      !isFiniteNumber(parsed.max_in_flight) ||
      !Number.isInteger(parsed.max_in_flight) ||
      parsed.max_in_flight < 1
    ) {
      return { kind: 'invalid', reason: 'stream_config con max_in_flight non valido' }
    }

    return {
      kind: 'message',
      message: {
        type: 'stream_config',
        auto_fps: autoFps,
        pointing_fps: pointingFps,
        max_in_flight: parsed.max_in_flight,
      },
    }
  }

  if (parsed.type === 'stop_audio') {
    const frameId = parseFrameId(parsed.frame_id)
    if (frameId === null) {
      return { kind: 'invalid', reason: 'stop_audio con frame_id non valido' }
    }
    return { kind: 'message', message: { type: 'stop_audio', frame_id: frameId } }
  }

  if (parsed.type === 'mode_switch') {
    const frameId = parseFrameId(parsed.frame_id)
    if (frameId === null) {
      return { kind: 'invalid', reason: 'mode_switch con frame_id non valido' }
    }
    if (parsed.mode !== 'AUTO' && parsed.mode !== 'POINTING') {
      return { kind: 'invalid', reason: 'mode_switch con modalità sconosciuta' }
    }
    const interval = Number(parsed.min_frame_interval_ms)
    return {
      kind: 'message',
      message: {
        type: 'mode_switch',
        frame_id: frameId,
        mode: parsed.mode,
        min_frame_interval_ms:
          Number.isFinite(interval) && interval > 0 ? interval : null,
      },
    }
  }

  if (parsed.type === 'frame_done') {
    const frameId = parseFrameId(parsed.frame_id)
    const nextFrameAfterMs =
      parsed.next_frame_after_ms ?? parsed.min_frame_interval_ms
    const outcome =
      typeof parsed.outcome === 'string' && parsed.outcome.trim().length > 0
        ? parsed.outcome
        : 'completed'
    if (frameId === null || frameId < 1) {
      return { kind: 'invalid', reason: 'frame_done con frame_id non valido' }
    }
    if (!isNonNegativeNumber(nextFrameAfterMs)) {
      return {
        kind: 'invalid',
        reason: 'frame_done con next_frame_after_ms non valido',
      }
    }

    return {
      kind: 'message',
      message: {
        type: 'frame_done',
        frame_id: frameId,
        outcome,
        next_frame_after_ms: nextFrameAfterMs,
      },
    }
  }

  if (parsed.type === 'audio') {
    const frameId = parseFrameId(parsed.frame_id)
    const normalizedFormat =
      typeof parsed.format === 'string' ? parsed.format.toLowerCase() : ''

    if (frameId === null) {
      return { kind: 'invalid', reason: 'Messaggio audio con frame_id non valido' }
    }
    if (typeof parsed.caption !== 'string') {
      return { kind: 'invalid', reason: 'Messaggio audio con caption non valida' }
    }
    if (typeof parsed.audio !== 'string' || parsed.audio.length === 0) {
      return { kind: 'invalid', reason: 'Messaggio audio senza Base64' }
    }
    if (!AUDIO_FORMATS.has(normalizedFormat as AudioFormat)) {
      return { kind: 'invalid', reason: `Formato audio non supportato: ${normalizedFormat}` }
    }

    return {
      kind: 'message',
      message: {
        type: 'audio',
        frame_id: frameId,
        caption: parsed.caption,
        audio: parsed.audio,
        duration:
          typeof parsed.duration === 'number' && Number.isFinite(parsed.duration)
            ? parsed.duration
            : null,
        format: normalizedFormat as AudioFormat,
      },
    }
  }

  if (parsed.type === 'detections') {
    const frameId = parseFrameId(parsed.frame_id)
    if (frameId === null) {
      return { kind: 'invalid', reason: 'Messaggio detections con frame_id non valido' }
    }
    if (!Array.isArray(parsed.detections)) {
      return { kind: 'invalid', reason: 'Messaggio detections senza array detections' }
    }

    return {
      kind: 'message',
      message: {
        type: 'detections',
        frame_id: frameId,
        detections: parsed.detections.filter(isRecord),
      },
    }
  }

  if (parsed.type === 'pointing_overlay') {
    const frameId = parseFrameId(parsed.frame_id)
    if (frameId === null) {
      return {
        kind: 'invalid',
        reason: 'Messaggio pointing_overlay con frame_id non valido',
      }
    }
    if (!Array.isArray(parsed.overlays)) {
      return {
        kind: 'invalid',
        reason: 'Messaggio pointing_overlay senza array overlays',
      }
    }

    const overlays = parsed.overlays.map(parsePointingOverlay)
    if (overlays.some((overlay) => overlay === null)) {
      return {
        kind: 'invalid',
        reason: 'Messaggio pointing_overlay con overlay non valido',
      }
    }

    const corridor = parsePointingCorridorStyle(parsed.corridor)
    if (!corridor) {
      return {
        kind: 'invalid',
        reason: 'Messaggio pointing_overlay con corridor non valido',
      }
    }

    const hands = Array.isArray(parsed.hands)
      ? parsed.hands
          .map(parseHandLandmarks)
          .filter((hand): hand is HandLandmarks => hand !== null)
      : []

    return {
      kind: 'message',
      message: {
        type: 'pointing_overlay',
        frame_id: frameId,
        overlays: overlays as PointingOverlay[],
        hands,
        corridor,
      },
    }
  }

  return { kind: 'unknown', type: parsed.type, value: parsed }
}
