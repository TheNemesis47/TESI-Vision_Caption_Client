import { describe, expect, it } from 'vitest'

import {
  cropForZoom,
  facingToggleLabel,
  findZoomOption,
  nextFacing,
  zoomOptions,
} from './cameraZoom'

// Le etichette sono quelle vere di un iPhone in italiano, prese dal telefono
// usato nei test: è l'unico appiglio che il browser dà per capire quale
// obiettivo è quale.
const iphone = [
  { deviceId: 'ultra', label: 'Fotocamera con ultra-grandangolo (posteriore)' },
  { deviceId: 'wide', label: 'Fotocamera posteriore' },
  { deviceId: 'tele', label: 'Fotocamera con teleobiettivo (posteriore)' },
  { deviceId: 'doppia', label: 'Fotocamera doppia con grandangolo (posteriore)' },
  { deviceId: 'tripla', label: 'Fotocamera tripla (posteriore)' },
  { deviceId: 'fronte', label: 'Fotocamera anteriore' },
]

describe('da che parte guarda la fotocamera', () => {
  it('il pulsante dice dove si va, non dove si è', () => {
    expect(facingToggleLabel('environment')).toBe('Passa alla fotocamera frontale')
    expect(facingToggleLabel('user')).toBe('Passa alla fotocamera posteriore')
    expect(nextFacing('environment')).toBe('user')
    expect(nextFacing(nextFacing('environment'))).toBe('environment')
  })
})

describe('i livelli di zoom nascono dagli obiettivi che il telefono ha', () => {
  it('su un telefono con tre obiettivi 0,5 e 2 sono ottici', () => {
    const livelli = zoomOptions(iphone, 'environment')

    expect(livelli.map((livello) => livello.label)).toEqual(['0,5×', '1×', '2×', '4×'])
    expect(livelli[0]).toMatchObject({ deviceId: 'ultra', digital: 1 })
    expect(livelli[1]).toMatchObject({ deviceId: '', digital: 1 })
    expect(livelli[2]).toMatchObject({ deviceId: 'tele', digital: 1 })
    // Il 4× parte dal teleobiettivo e raddoppia quello, non il grandangolo.
    expect(livelli[3]).toMatchObject({ deviceId: 'tele', digital: 2 })
  })

  it('senza ultra-grandangolo il pulsante 0,5 non compare', () => {
    const livelli = zoomOptions(
      [{ deviceId: 'wide', label: 'Fotocamera posteriore' }],
      'environment',
    )

    expect(livelli.map((livello) => livello.label)).toEqual(['1×', '2×', '4×'])
    expect(livelli.every((livello) => livello.deviceId === '')).toBe(true)
    expect(livelli[1].digital).toBe(2)
  })

  it('non sceglie mai un obiettivo combinato, che non dà un ingrandimento prevedibile', () => {
    const livelli = zoomOptions(
      [
        { deviceId: 'doppia', label: 'Fotocamera doppia (posteriore)' },
        { deviceId: 'tripla', label: 'Fotocamera tripla (posteriore)' },
      ],
      'environment',
    )

    expect(livelli.map((livello) => livello.deviceId)).toEqual(['', '', ''])
  })

  it('davanti c è un obiettivo solo: restano 1 e il ritaglio', () => {
    expect(zoomOptions(iphone, 'user').map((livello) => livello.label)).toEqual([
      '1×',
      '2×',
    ])
  })

  it('ogni livello si può pronunciare', () => {
    const detti = zoomOptions(iphone, 'environment').map((livello) => livello.spoken)

    expect(detti).toEqual(['Zoom 0,5 volte', 'Zoom 1 volta', 'Zoom 2 volte', 'Zoom 4 volte'])
  })
})

describe('il livello scelto sopravvive al cambio di fotocamera', () => {
  it('un livello che non esiste più torna a 1×', () => {
    const davanti = zoomOptions(iphone, 'user')

    expect(findZoomOption(davanti, 0.5).factor).toBe(1)
    expect(findZoomOption(davanti, 2).factor).toBe(2)
  })
})

describe('il ritaglio digitale', () => {
  it('senza ritaglio restituisce il fotogramma intero', () => {
    expect(cropForZoom(1280, 720, 1)).toEqual({ sx: 0, sy: 0, sw: 1280, sh: 720 })
  })

  it('ritaglia il centro, non un angolo', () => {
    expect(cropForZoom(1280, 720, 2)).toEqual({ sx: 320, sy: 180, sw: 640, sh: 360 })
  })

  it('su un fotogramma piccolissimo resta almeno un pixel', () => {
    expect(cropForZoom(1, 1, 4)).toEqual({ sx: 0, sy: 0, sw: 1, sh: 1 })
  })
})
