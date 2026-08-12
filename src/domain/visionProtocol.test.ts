import { describe, expect, it } from 'vitest'
import {
  buildFramePacket,
  getAudioFreshnessLimit,
  getAudioMimeType,
  getFrameOutputRejectionReason,
  parseVisionServerMessage,
  shouldDropAudioFrameByOrder,
} from './visionProtocol'

describe('buildFramePacket', () => {
  it('serializza AUTO e rimuove il prefisso data URL', () => {
    expect(
      buildFramePacket({
        imageBase64: 'data:image/jpeg;base64,abc123',
        frameId: 1,
        captionMode: 'AUTO',
      }),
    ).toEqual({
      image: 'abc123',
      frame_id: 1,
      caption_mode: 'AUTO',
      pointing_coordinates: null,
    })
  })

  it('usa POINTING in ogni frame successivo', () => {
    const packets = [2, 3, 4].map((frameId) =>
      buildFramePacket({
        imageBase64: 'jpeg',
        frameId,
        captionMode: 'POINTING',
      }),
    )

    expect(packets.map((packet) => packet.caption_mode)).toEqual([
      'POINTING',
      'POINTING',
      'POINTING',
    ])
    expect(packets.map((packet) => packet.frame_id)).toEqual([2, 3, 4])
  })

  it('rifiuta frame_id non positivi', () => {
    expect(() =>
      buildFramePacket({
        imageBase64: 'jpeg',
        frameId: 0,
        captionMode: 'AUTO',
      }),
    ).toThrow(/frame_id/)
  })
})

describe('parseVisionServerMessage', () => {
  it('riconosce un audio JSON e conserva formato e frame_id', () => {
    const result = parseVisionServerMessage(
      JSON.stringify({
        type: 'audio',
        frame_id: 12,
        caption: 'Una persona',
        audio: 'YXVkaW8=',
        duration: 1.4,
        format: 'mp3',
      }),
    )

    expect(result).toEqual({
      kind: 'message',
      message: {
        type: 'audio',
        frame_id: 12,
        caption: 'Una persona',
        audio: 'YXVkaW8=',
        duration: 1.4,
        format: 'mp3',
      },
    })
  })

  it('riconosce detections distinte dall’audio', () => {
    const result = parseVisionServerMessage({
      type: 'detections',
      frame_id: 7,
      detections: [{ class_name: 'person', confidence: 0.9, bbox: {} }],
    })

    expect(result.kind).toBe('message')
    if (result.kind === 'message') {
      expect(result.message.type).toBe('detections')
      expect(result.message.frame_id).toBe(7)
    }
  })

  it('riconosce pointing_overlay senza influenzare gli altri tipi', () => {
    const result = parseVisionServerMessage({
      type: 'pointing_overlay',
      frame_id: 123,
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
    })

    expect(result).toMatchObject({
      kind: 'message',
      message: {
        type: 'pointing_overlay',
        frame_id: 123,
        overlays: [
          {
            handedness: 'RIGHT',
            state: 'CANDIDATE',
            confirmation_progress: 0.62,
          },
        ],
      },
    })
  })

  it('accetta overlays vuoto e rifiuta coordinate non normalizzate', () => {
    const corridor = {
      coordinate_space: 'normalized',
      width_reference: 'short_side',
      start_half_width_ratio: 0.008,
      min_end_half_width_ratio: 0.03,
      expansion_ratio: 0.04,
      fill_alpha: 0.14,
      color: '#FFFF00',
      line_width_px: 2,
    }

    expect(
      parseVisionServerMessage({
        type: 'pointing_overlay',
        frame_id: 124,
        overlays: [],
        corridor,
      }),
    ).toMatchObject({
      kind: 'message',
      message: { type: 'pointing_overlay', frame_id: 124, overlays: [] },
    })

    expect(
      parseVisionServerMessage({
        type: 'pointing_overlay',
        frame_id: 125,
        overlays: [
          {
            handedness: 'LEFT',
            state: 'ACTIVE',
            confirmation_progress: 1,
            ray: {
              start: { x: -0.1, y: 0.5 },
              end: { x: 0.8, y: 0.5 },
            },
          },
        ],
        corridor,
      }),
    ).toMatchObject({ kind: 'invalid' })
  })

  it('gestisce tipo sconosciuto senza eccezioni', () => {
    expect(
      parseVisionServerMessage({ type: 'diagnostic', frame_id: 1 }),
    ).toMatchObject({ kind: 'unknown', type: 'diagnostic' })
  })

  it('gestisce JSON non valido senza eccezioni', () => {
    expect(parseVisionServerMessage('{')).toEqual({
      kind: 'invalid',
      reason: 'JSON non valido',
    })
  })

  it('rifiuta formati audio fuori contratto', () => {
    expect(
      parseVisionServerMessage({
        type: 'audio',
        frame_id: 1,
        caption: 'Test',
        audio: 'YQ==',
        format: 'aac',
      }),
    ).toMatchObject({ kind: 'invalid' })
  })
})

describe('audio MIME type', () => {
  it.each([
    ['mp3', 'audio/mpeg'],
    ['wav', 'audio/wav'],
    ['opus', 'audio/opus'],
  ] as const)('mappa %s a %s', (format, expected) => {
    expect(getAudioMimeType(format)).toBe(expected)
  })
})

describe('policy output della sessione', () => {
  const metadata = { frameId: 8, mode: 'POINTING' as const, sentAt: 100 }

  it('scarta output precedente al cutoff del cambio modalità', () => {
    expect(
      getFrameOutputRejectionReason({
        frameId: 7,
        metadata: { ...metadata, frameId: 7, mode: 'AUTO' },
        currentMode: 'POINTING',
        modeChangeCutoffFrameId: 8,
      }),
    ).toBe('before-mode-cutoff')
  })

  it('accetta metadata della modalità corrente dal cutoff in poi', () => {
    expect(
      getFrameOutputRejectionReason({
        frameId: 8,
        metadata,
        currentMode: 'POINTING',
        modeChangeCutoffFrameId: 8,
      }),
    ).toBeNull()
  })

  it('scarta frame audio minori ma accetta chunk con frame_id uguale', () => {
    expect(shouldDropAudioFrameByOrder(9, 10)).toBe(true)
    expect(shouldDropAudioFrameByOrder(10, 10)).toBe(false)
  })

  it('mantiene policy di freschezza separate per AUTO e POINTING', () => {
    expect(getAudioFreshnessLimit('AUTO', 2500, 12000)).toBe(2500)
    expect(getAudioFreshnessLimit('POINTING', 2500, 12000)).toBe(12000)
  })
})
