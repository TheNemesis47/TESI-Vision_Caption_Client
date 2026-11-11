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
  it('riconosce la configurazione stream inviata all’apertura', () => {
    expect(
      parseVisionServerMessage({
        type: 'stream_config',
        auto_fps: 2,
        pointing_fps: 10,
        max_in_flight: 1,
      }),
    ).toEqual({
      kind: 'message',
      message: {
        type: 'stream_config',
        auto_fps: 2,
        pointing_fps: 10,
        max_in_flight: 1,
      },
    })
  })

  it('normalizza il formato stream_config effettivo del backend', () => {
    expect(
      parseVisionServerMessage({
        type: 'stream_config',
        protocol_version: 1,
        fps: { AUTO: 2, POINTING: 10 },
        max_in_flight: 1,
        max_buffered_amount_bytes: 262144,
      }),
    ).toEqual({
      kind: 'message',
      message: {
        type: 'stream_config',
        auto_fps: 2,
        pointing_fps: 10,
        max_in_flight: 1,
      },
    })
  })

  it('riconosce frame_done anche per un esito non completato', () => {
    expect(
      parseVisionServerMessage({
        type: 'frame_done',
        frame_id: 123,
        outcome: 'failed',
        next_frame_after_ms: 500,
      }),
    ).toEqual({
      kind: 'message',
      message: {
        type: 'frame_done',
        frame_id: 123,
        outcome: 'failed',
        next_frame_after_ms: 500,
      },
    })
  })

  it('normalizza il frame_done effettivo del backend', () => {
    expect(
      parseVisionServerMessage({
        type: 'frame_done',
        frame_id: 123,
        processing_ms: 842,
        min_frame_interval_ms: 500,
      }),
    ).toEqual({
      kind: 'message',
      message: {
        type: 'frame_done',
        frame_id: 123,
        outcome: 'completed',
        next_frame_after_ms: 500,
      },
    })
  })

  it('rifiuta configurazioni stream e ACK malformati', () => {
    expect(
      parseVisionServerMessage({
        type: 'stream_config',
        auto_fps: 0,
        pointing_fps: 10,
        max_in_flight: 1,
      }).kind,
    ).toBe('invalid')
    expect(
      parseVisionServerMessage({
        type: 'frame_done',
        frame_id: 1,
        outcome: 'failed',
        next_frame_after_ms: -1,
      }).kind,
    ).toBe('invalid')
  })

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
    if (result.kind === 'message' && result.message.type === 'detections') {
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

  it('porta i landmark della mano accanto agli overlay', () => {
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
    const landmarks = Array.from({ length: 21 }, (_, index) => ({
      // Fuori dal fotogramma: la mano al bordo non va scartata.
      x: index === 0 ? -0.02 : index / 100,
      y: 0.5,
    }))

    const result = parseVisionServerMessage({
      type: 'pointing_overlay',
      frame_id: 126,
      overlays: [],
      hands: [
        { handedness: 'LEFT', landmarks },
        { handedness: 'RIGHT', landmarks: landmarks.slice(0, 20) },
        { handedness: 'CENTRO', landmarks },
      ],
      corridor,
    })

    expect(result.kind).toBe('message')
    if (result.kind !== 'message') return
    if (result.message.type !== 'pointing_overlay') return

    // Le due mani malformate spariscono senza invalidare il messaggio.
    expect(result.message.hands).toHaveLength(1)
    expect(result.message.hands[0].handedness).toBe('LEFT')
    expect(result.message.hands[0].landmarks[0]).toEqual({ x: -0.02, y: 0.5 })
  })

  it('accetta un pointing_overlay senza il campo hands', () => {
    const result = parseVisionServerMessage({
      type: 'pointing_overlay',
      frame_id: 127,
      overlays: [],
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
      message: { type: 'pointing_overlay', hands: [] },
    })
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

describe('stop_audio', () => {
  it('riconosce il gesto di stop inviato dal server', () => {
    expect(parseVisionServerMessage(JSON.stringify({ type: 'stop_audio', frame_id: 42 }))).toEqual({
      kind: 'message',
      message: { type: 'stop_audio', frame_id: 42 },
    })
  })

  it('rifiuta uno stop_audio senza frame_id valido', () => {
    expect(parseVisionServerMessage(JSON.stringify({ type: 'stop_audio' })).kind).toBe('invalid')
  })
})

describe('messaggio di cambio modalità', () => {
  it('riconosce la richiesta del server dopo il gesto', () => {
    const result = parseVisionServerMessage(
      JSON.stringify({
        type: 'mode_switch',
        frame_id: 7,
        mode: 'POINTING',
        min_frame_interval_ms: 100,
      }),
    )

    expect(result).toEqual({
      kind: 'message',
      message: {
        type: 'mode_switch',
        frame_id: 7,
        mode: 'POINTING',
        min_frame_interval_ms: 100,
      },
    })
  })

  it('rifiuta una modalità che non esiste', () => {
    const result = parseVisionServerMessage(
      JSON.stringify({ type: 'mode_switch', frame_id: 7, mode: 'MUSEO' }),
    )

    expect(result.kind).toBe('invalid')
  })

  it('accetta il messaggio anche senza il ritmo dei frame', () => {
    const result = parseVisionServerMessage(
      JSON.stringify({ type: 'mode_switch', frame_id: 7, mode: 'AUTO' }),
    )

    expect(result).toMatchObject({
      kind: 'message',
      message: { mode: 'AUTO', min_frame_interval_ms: null },
    })
  })
})
