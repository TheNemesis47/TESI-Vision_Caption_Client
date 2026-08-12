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

export type PointingOverlay = {
  handedness: 'LEFT' | 'RIGHT' | 'UNKNOWN'
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

export type VisionServerMessage =
  | AudioServerMessage
  | DetectionsServerMessage
  | PointingOverlayMessage
  | StreamConfigServerMessage
  | FrameDoneServerMessage

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

const parsePointingOverlay = (value: unknown): PointingOverlay | null => {
  if (!isRecord(value) || !isRecord(value.ray)) return null
  if (
    value.handedness !== 'LEFT' &&
    value.handedness !== 'RIGHT' &&
    value.handedness !== 'UNKNOWN'
  ) {
    return null
  }
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
    if (!isFiniteNumber(parsed.auto_fps) || parsed.auto_fps <= 0) {
      return { kind: 'invalid', reason: 'stream_config con auto_fps non valido' }
    }
    if (!isFiniteNumber(parsed.pointing_fps) || parsed.pointing_fps <= 0) {
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
        auto_fps: parsed.auto_fps,
        pointing_fps: parsed.pointing_fps,
        max_in_flight: parsed.max_in_flight,
      },
    }
  }

  if (parsed.type === 'frame_done') {
    const frameId = parseFrameId(parsed.frame_id)
    if (frameId === null || frameId < 1) {
      return { kind: 'invalid', reason: 'frame_done con frame_id non valido' }
    }
    if (typeof parsed.outcome !== 'string' || parsed.outcome.trim().length === 0) {
      return { kind: 'invalid', reason: 'frame_done con outcome non valido' }
    }
    if (!isNonNegativeNumber(parsed.next_frame_after_ms)) {
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
        outcome: parsed.outcome,
        next_frame_after_ms: parsed.next_frame_after_ms,
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

    return {
      kind: 'message',
      message: {
        type: 'pointing_overlay',
        frame_id: frameId,
        overlays: overlays as PointingOverlay[],
        corridor,
      },
    }
  }

  return { kind: 'unknown', type: parsed.type, value: parsed }
}
