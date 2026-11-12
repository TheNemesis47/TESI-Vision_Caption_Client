import { describe, expect, it } from 'vitest'

import {
  continuousFocusConstraints,
  describeCameraCapabilities,
  focusConstraints,
  readFocusSupport,
} from './cameraFocus'

const track = (capacità: unknown) => ({
  getCapabilities: () => capacità as never,
})

const avanzato = (constraints: MediaTrackConstraints) =>
  (constraints as unknown as { advanced: Record<string, unknown>[] }).advanced[0]

describe('cosa l obiettivo lascia comandare', () => {
  it('legge punto e modi dichiarati', () => {
    expect(
      readFocusSupport(
        track({ focusMode: ['continuous', 'single-shot'], pointsOfInterest: {} }),
      ),
    ).toEqual({ point: true, continuous: true, singleShot: true })
  })

  it('senza niente da comandare non c è sostegno, e il tocco non si accende', () => {
    expect(readFocusSupport(track({}))).toBeNull()
    expect(readFocusSupport(track({ focusMode: [] }))).toBeNull()
    expect(readFocusSupport(null)).toBeNull()
    expect(readFocusSupport({})).toBeNull()
  })

  it('un track già spento che solleva vale come non dichiarato', () => {
    expect(
      readFocusSupport({
        getCapabilities: () => {
          throw new Error('track terminato')
        },
      }),
    ).toBeNull()
  })
})

describe('il vincolo del tocco', () => {
  it('indica il punto e tiene il fuoco automatico continuo', () => {
    const support = { point: true, continuous: true, singleShot: true }
    const esito = focusConstraints(support, { x: 0.25, y: 0.75 })

    expect(avanzato(esito!.constraints)).toEqual({
      pointsOfInterest: [{ x: 0.25, y: 0.75 }],
      focusMode: 'continuous',
    })
    // Con il continuo non c'è niente da rimettere: il fuoco resta vivo.
    expect(esito!.restoreContinuous).toBe(false)
  })

  it('con il solo scatto singolo chiede di rimettere il continuo', () => {
    const esito = focusConstraints(
      { point: true, continuous: false, singleShot: true },
      { x: 0.5, y: 0.5 },
    )

    expect(avanzato(esito!.constraints)).toMatchObject({ focusMode: 'single-shot' })
    // Altrimenti il fuoco resterebbe bloccato su quel piano senza che chi non
    // vede possa accorgersene.
    expect(esito!.restoreContinuous).toBe(true)
  })

  it('tiene il punto dentro l inquadratura', () => {
    const esito = focusConstraints(
      { point: true, continuous: true, singleShot: false },
      { x: -0.4, y: 1.8 },
    )

    expect(avanzato(esito!.constraints).pointsOfInterest).toEqual([{ x: 0, y: 1 }])
  })

  it('senza punto né modi non produce un vincolo vuoto', () => {
    expect(
      focusConstraints({ point: false, continuous: false, singleShot: false }, { x: 0.5, y: 0.5 }),
    ).toBeNull()
  })

  it('il ripristino rimette il fuoco continuo', () => {
    expect(avanzato(continuousFocusConstraints())).toEqual({ focusMode: 'continuous' })
  })
})

describe('la riga di diagnostica', () => {
  it('dice in una riga cosa questo telefono dichiara', () => {
    expect(
      describeCameraCapabilities(
        track({
          zoom: { min: 1, max: 5 },
          focusMode: ['continuous'],
          pointsOfInterest: {},
          width: { max: 1920 },
          height: { max: 1080 },
        }),
      ),
    ).toBe('zoom 1–5 · fuoco continuous · punto sì · 1920×1080')
  })

  it('dice anche quando non c è niente, che è l informazione che serve', () => {
    expect(describeCameraCapabilities(track({}))).toBe('zoom no · fuoco no · punto no')
    expect(describeCameraCapabilities(null)).toBe('capacità non dichiarate')
  })
})
