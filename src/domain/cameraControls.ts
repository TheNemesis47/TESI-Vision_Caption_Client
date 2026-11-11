/**
 * I comandi della fotocamera come li ha una persona in mano al telefono.
 *
 * L'elenco dei dispositivi non è una scelta: un iPhone recente ne espone
 * dieci, con nomi come "Fotocamera posteriore con teleobiettivo doppio", e
 * chi non vede deve ascoltarli tutti per trovare quella giusta. Le scelte
 * vere sono due: da che parte guarda la fotocamera e quanto ingrandisce.
 *
 * Lo zoom esiste solo se il browser lo dichiara: su Safari dipende
 * dall'obiettivo e sui portatili non c'è quasi mai. Quando manca, il
 * comando non si mostra invece di mostrarsi e non funzionare.
 */

export type CameraFacing = 'environment' | 'user'

export type ZoomRange = {
  min: number
  max: number
  step: number
}

export const DEFAULT_FACING: CameraFacing = 'environment'

export const FACING_LABELS: Record<CameraFacing, string> = {
  environment: 'Fotocamera posteriore',
  user: 'Fotocamera frontale',
}

/** Il nome di ciò che si ottiene premendo, non di ciò che si ha. */
export function facingToggleLabel(facing: CameraFacing): string {
  return facing === 'environment'
    ? 'Passa alla fotocamera frontale'
    : 'Passa alla fotocamera posteriore'
}

export function nextFacing(facing: CameraFacing): CameraFacing {
  return facing === 'environment' ? 'user' : 'environment'
}

type CapabilityHolder = {
  getCapabilities?: () => MediaTrackCapabilities & {
    zoom?: { min?: number; max?: number; step?: number }
  }
}

export function readZoomRange(track: CapabilityHolder | null | undefined): ZoomRange | null {
  if (!track?.getCapabilities) return null
  let zoom
  try {
    zoom = track.getCapabilities().zoom
  } catch {
    return null
  }
  if (!zoom) return null
  const { min, max, step } = zoom
  if (typeof min !== 'number' || typeof max !== 'number') return null
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null
  const usableStep =
    typeof step === 'number' && Number.isFinite(step) && step > 0
      ? step
      : (max - min) / 20
  return { min, max, step: usableStep }
}

export function clampZoom(value: number, range: ZoomRange): number {
  if (!Number.isFinite(value)) return range.min
  return Math.min(range.max, Math.max(range.min, value))
}

/** Un passo di zoom, per i pulsanti meno e più accanto al cursore. */
export function stepZoom(
  value: number,
  range: ZoomRange,
  direction: 1 | -1,
): number {
  // Un passo dichiarato minuscolo (0,01) richiederebbe cento pressioni per
  // attraversare la corsa: il pulsante si muove di un ventesimo almeno.
  const stride = Math.max(range.step, (range.max - range.min) / 20)
  return clampZoom(value + direction * stride, range)
}

/** Lo zoom detto a voce: "due virgola cinque ingrandimenti" lo legge male. */
export function zoomLabel(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(1).replace('.', ',')
  return `Zoom ${text}×`
}
