/**
 * La messa a fuoco su un punto, dove il browser la lascia comandare.
 *
 * Il telefono mette a fuoco da solo, in continuo, e nella maggior parte delle
 * scene basta. Serve toccare quando l'inquadratura ha due piani — un cartello
 * vicino davanti a una stanza, una slide in fondo all'aula — e l'automatismo
 * sceglie quello sbagliato.
 *
 * Non tutti i browser lo permettono: `pointsOfInterest` e `focusMode` sono
 * nelle capacità del track solo dove sono implementati davvero. Qui si legge
 * cosa c'è e si costruisce il vincolo di conseguenza; dove non c'è niente, il
 * tocco non fa finta di funzionare e l'anello non compare.
 *
 * Fra i due modi si preferisce `continuous` con il punto d'interesse:
 * `single-shot` blocca il fuoco su quel piano e chi non vede non ha modo di
 * accorgersi che è rimasto bloccato. Quando c'è solo lo scatto singolo, il
 * continuo si rimette da sé dopo qualche secondo.
 */

export type FocusPoint = { x: number; y: number }

export type FocusSupport = {
  /** Il browser accetta un punto su cui mettere a fuoco. */
  point: boolean
  /** Modi dichiarati dall'obiettivo. */
  continuous: boolean
  singleShot: boolean
}

export const FOCUS_RESTORE_MS = 6000

type CapabilityHolder = {
  getCapabilities?: () => MediaTrackCapabilities & {
    focusMode?: string[]
    pointsOfInterest?: unknown
    zoom?: { min?: number; max?: number; step?: number }
  }
}

const capabilities = (track: CapabilityHolder | null | undefined) => {
  if (!track?.getCapabilities) return null
  try {
    return track.getCapabilities()
  } catch {
    // Safari solleva se il track è già spento: vale come «non si sa».
    return null
  }
}

export function readFocusSupport(
  track: CapabilityHolder | null | undefined,
): FocusSupport | null {
  const capacità = capabilities(track)
  if (!capacità) return null
  const modi = Array.isArray(capacità.focusMode) ? capacità.focusMode : []
  const support: FocusSupport = {
    point: capacità.pointsOfInterest !== undefined,
    continuous: modi.includes('continuous'),
    singleShot: modi.includes('single-shot') || modi.includes('manual'),
  }
  // Senza un punto da indicare e senza modi da imporre non c'è niente da
  // comandare: il tocco resterebbe un gesto senza effetto.
  if (!support.point && !support.singleShot && !support.continuous) return null
  return support
}

/** Il vincolo da applicare al tocco, e se il continuo va rimesso dopo. */
export function focusConstraints(
  support: FocusSupport,
  point: FocusPoint,
): { constraints: MediaTrackConstraints; restoreContinuous: boolean } | null {
  const x = Math.min(1, Math.max(0, point.x))
  const y = Math.min(1, Math.max(0, point.y))
  const advanced: Record<string, unknown> = {}

  if (support.point) advanced.pointsOfInterest = [{ x, y }]
  if (support.continuous) advanced.focusMode = 'continuous'
  else if (support.singleShot) advanced.focusMode = 'single-shot'

  if (Object.keys(advanced).length === 0) return null
  return {
    constraints: { advanced: [advanced] } as unknown as MediaTrackConstraints,
    restoreContinuous: !support.continuous && support.singleShot,
  }
}

/** Il vincolo che rimette la messa a fuoco automatica continua. */
export function continuousFocusConstraints(): MediaTrackConstraints {
  return { advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints
}

/**
 * Cosa l'obiettivo dichiara davvero, in una riga. Serve con ?debug=1 per
 * smettere di tirare a indovinare su che cosa questo telefono permette.
 */
export function describeCameraCapabilities(
  track: CapabilityHolder | null | undefined,
): string {
  const capacità = capabilities(track)
  if (!capacità) return 'capacità non dichiarate'
  const parti: string[] = []
  const zoom = capacità.zoom
  parti.push(
    zoom && typeof zoom.min === 'number'
      ? `zoom ${zoom.min}–${zoom.max}`
      : 'zoom no',
  )
  const modi = Array.isArray(capacità.focusMode) ? capacità.focusMode : []
  parti.push(modi.length ? `fuoco ${modi.join('/')}` : 'fuoco no')
  parti.push(capacità.pointsOfInterest !== undefined ? 'punto sì' : 'punto no')
  const settings = capacità as { width?: { max?: number }; height?: { max?: number } }
  if (settings.width?.max && settings.height?.max) {
    parti.push(`${settings.width.max}×${settings.height.max}`)
  }
  return parti.join(' · ')
}
