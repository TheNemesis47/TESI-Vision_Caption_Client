import { describe, expect, it } from 'vitest'

import {
  clampZoom,
  facingToggleLabel,
  nextFacing,
  readZoomRange,
  stepZoom,
  zoomLabel,
} from './cameraControls'

const track = (zoom: unknown) => ({
  getCapabilities: () => ({ zoom }) as never,
})

describe('da che parte guarda la fotocamera', () => {
  it('il pulsante dice dove si va, non dove si è', () => {
    expect(facingToggleLabel('environment')).toBe('Passa alla fotocamera frontale')
    expect(facingToggleLabel('user')).toBe('Passa alla fotocamera posteriore')
    expect(nextFacing('environment')).toBe('user')
    expect(nextFacing(nextFacing('environment'))).toBe('environment')
  })
})

describe('zoom disponibile solo se il browser lo dichiara', () => {
  it('legge la corsa dichiarata dall obiettivo', () => {
    expect(readZoomRange(track({ min: 1, max: 5, step: 0.1 }))).toEqual({
      min: 1,
      max: 5,
      step: 0.1,
    })
  })

  it('senza zoom, senza capacità o con una corsa nulla non si mostra niente', () => {
    expect(readZoomRange(null)).toBeNull()
    expect(readZoomRange({})).toBeNull()
    expect(readZoomRange(track(undefined))).toBeNull()
    expect(readZoomRange(track({ min: 1, max: 1 }))).toBeNull()
    expect(readZoomRange(track({ min: 1 }))).toBeNull()
  })

  it('una fotocamera che non risponde non rompe la pagina', () => {
    expect(
      readZoomRange({
        getCapabilities: () => {
          throw new Error('InvalidStateError')
        },
      }),
    ).toBeNull()
  })

  it('senza passo dichiarato ne usa uno percorribile', () => {
    expect(readZoomRange(track({ min: 1, max: 3 }))?.step).toBeCloseTo(0.1)
  })
})

describe('il valore dello zoom resta dentro la corsa', () => {
  const range = { min: 1, max: 4, step: 0.1 }

  it('non esce dai limiti', () => {
    expect(clampZoom(0.2, range)).toBe(1)
    expect(clampZoom(9, range)).toBe(4)
    expect(clampZoom(Number.NaN, range)).toBe(1)
  })

  it('i pulsanti si muovono di un passo utile anche con passi minuscoli', () => {
    expect(stepZoom(1, { min: 1, max: 3, step: 0.01 }, 1)).toBeCloseTo(1.1)
    expect(stepZoom(4, range, 1)).toBe(4)
    expect(stepZoom(1, range, -1)).toBe(1)
  })

  it('si legge a voce senza decimali inutili', () => {
    expect(zoomLabel(1)).toBe('Zoom 1×')
    expect(zoomLabel(2.46)).toBe('Zoom 2,5×')
  })
})
