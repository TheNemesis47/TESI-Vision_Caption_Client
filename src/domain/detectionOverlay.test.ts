import { describe, expect, it } from 'vitest'
import { isDiagnosticOverlayEnabled, toOverlayBoxes } from './detectionOverlay'

const detection = (bbox: unknown, extra: Record<string, unknown> = {}) => ({
  class_name: 'printer',
  confidence: 0.87,
  bbox,
  ...extra,
})

describe('isDiagnosticOverlayEnabled', () => {
  it('resta spento senza richiesta esplicita', () => {
    expect(isDiagnosticOverlayEnabled('', undefined)).toBe(false)
    expect(isDiagnosticOverlayEnabled('?altro=1', undefined)).toBe(false)
  })

  it('si accende dall’indirizzo o dal flag di build', () => {
    expect(isDiagnosticOverlayEnabled('?debug=1', undefined)).toBe(true)
    expect(isDiagnosticOverlayEnabled('?debug=true', undefined)).toBe(true)
    expect(isDiagnosticOverlayEnabled('', 'true')).toBe(true)
  })

  it('l’indirizzo ha la precedenza sul flag di build', () => {
    expect(isDiagnosticOverlayEnabled('?debug=0', 'true')).toBe(false)
  })
})

describe('toOverlayBoxes', () => {
  it('converte i pixel del frame inviato in frazioni dell’immagine', () => {
    const boxes = toOverlayBoxes(
      [detection({ x_min: 320, y_min: 180, x_max: 640, y_max: 540 })],
      1280,
      720,
    )

    expect(boxes).toEqual([
      { label: 'printer 87%', left: 0.25, top: 0.25, width: 0.25, height: 0.5 },
    ])
  })

  it('senza le dimensioni del frame non disegna nulla', () => {
    const payload = [detection({ x_min: 0, y_min: 0, x_max: 10, y_max: 10 })]
    expect(toOverlayBoxes(payload, undefined, 720)).toEqual([])
    expect(toOverlayBoxes(payload, 1280, 0)).toEqual([])
  })

  it('scarta i box malformati senza far cadere gli altri', () => {
    const boxes = toOverlayBoxes(
      [
        detection(null),
        detection({ x_min: 0, y_min: 0, x_max: 'no', y_max: 10 }),
        detection({ x_min: 0, y_min: 0, x_max: 640, y_max: 360 }),
      ],
      1280,
      720,
    )

    expect(boxes).toHaveLength(1)
    expect(boxes[0].label).toBe('printer 87%')
  })

  it('non produce larghezze negative da un box invertito', () => {
    const [box] = toOverlayBoxes(
      [detection({ x_min: 640, y_min: 360, x_max: 320, y_max: 180 })],
      1280,
      720,
    )

    expect(box.width).toBe(0)
    expect(box.height).toBe(0)
  })

  it('usa un’etichetta di ripiego quando classe o confidenza mancano', () => {
    const [box] = toOverlayBoxes(
      [
        {
          bbox: { x_min: 0, y_min: 0, x_max: 128, y_max: 72 },
          class_name: undefined,
          confidence: undefined,
        },
      ],
      1280,
      720,
    )

    expect(box.label).toBe('?')
  })
})
