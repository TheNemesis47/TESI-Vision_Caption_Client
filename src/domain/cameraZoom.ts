/**
 * I comandi della fotocamera come li ha il telefono: i livelli di zoom e il
 * verso, niente altro.
 *
 * L'elenco degli obiettivi non è una scelta utile. Un iPhone ne espone dieci,
 * con nomi come «Fotocamera doppia con grandangolo (posteriore)», e la metà
 * sono combinazioni virtuali dello stesso vetro. Chi non vede deve ascoltarli
 * tutti per trovare quello giusto, e chi vede non sa comunque quale scegliere.
 *
 * Lo zoom per vincolo (`applyConstraints({zoom})`) su Safari non esiste: è la
 * ragione per cui il cursore non muoveva niente. Il telefono cambia
 * ingrandimento cambiando obiettivo, ed è quello che facciamo qui: 0,5×
 * accende l'ultra-grandangolo, 2× il teleobiettivo. Dove l'obiettivo manca, il
 * livello si ottiene ritagliando il centro del fotogramma, che è anche il modo
 * in cui un cartello lontano arriva al modello più grande invece che più
 * piccolo.
 */

export type CameraFacing = 'environment' | 'user'

export type CameraDeviceInfo = {
  deviceId: string
  label: string
}

export type ZoomOption = {
  /** Il numero sul pulsante: 0,5 · 1 · 2 · 4. */
  factor: number
  /** Come si legge: «0,5×». */
  label: string
  /** Come si pronuncia, per chi usa un lettore di schermo. */
  spoken: string
  /** Obiettivo da accendere; vuoto significa «quello predefinito del verso». */
  deviceId: string
  /** Quante volte ritagliare il centro del fotogramma: 1 è nessun ritaglio. */
  digital: number
}

export const DEFAULT_FACING: CameraFacing = 'environment'
export const DEFAULT_ZOOM = 1

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

// «doppia» e «tripla» sono obiettivi virtuali che il telefono compone da solo:
// sceglierli non dà un ingrandimento prevedibile.
const COMBINATO = /doppia|tripla|dual|triple/i
const ULTRA = /ultra/i
const TELE = /tele/i
const POSTERIORE = /posteriore|back|rear/i

const obiettivo = (
  devices: CameraDeviceInfo[],
  tipo: RegExp,
): CameraDeviceInfo | undefined =>
  devices.find(
    (device) =>
      tipo.test(device.label) &&
      !COMBINATO.test(device.label) &&
      POSTERIORE.test(device.label),
  )

/** «0,5×» si scrive con la virgola e si pronuncia per esteso. */
const etichetta = (factor: number) =>
  `${Number.isInteger(factor) ? factor : factor.toFixed(1).replace('.', ',')}×`

const pronuncia = (factor: number) =>
  factor === 1 ? 'Zoom 1 volta' : `Zoom ${etichetta(factor).replace('×', '')} volte`

const opzione = (
  factor: number,
  deviceId: string,
  digital: number,
): ZoomOption => ({
  factor,
  label: etichetta(factor),
  spoken: pronuncia(factor),
  deviceId,
  digital,
})

/**
 * I livelli da mostrare, nell'ordine dei pulsanti.
 *
 * Davanti c'è un obiettivo solo, quindi restano 1× e il ritaglio. Dietro,
 * 0,5× compare solo se l'ultra-grandangolo esiste davvero: un pulsante che
 * non cambia niente è peggio di un pulsante assente.
 */
export function zoomOptions(
  devices: CameraDeviceInfo[],
  facing: CameraFacing,
): ZoomOption[] {
  if (facing === 'user') {
    return [opzione(1, '', 1), opzione(2, '', 2)]
  }

  const ultra = obiettivo(devices, ULTRA)
  const tele = obiettivo(devices, TELE)
  const opzioni: ZoomOption[] = []

  if (ultra) opzioni.push(opzione(0.5, ultra.deviceId, 1))
  opzioni.push(opzione(1, '', 1))
  // Con il teleobiettivo il 2× è ottico e il 4× raddoppia quello, non il
  // grandangolo: si parte sempre dal vetro più lungo disponibile.
  opzioni.push(tele ? opzione(2, tele.deviceId, 1) : opzione(2, '', 2))
  opzioni.push(tele ? opzione(4, tele.deviceId, 2) : opzione(4, '', 4))
  return opzioni
}

/** L'opzione corrispondente al fattore scelto, o 1× se non esiste più. */
export function findZoomOption(
  options: ZoomOption[],
  factor: number,
): ZoomOption {
  return (
    options.find((option) => option.factor === factor) ??
    options.find((option) => option.factor === DEFAULT_ZOOM) ??
    options[0]
  )
}

export type CropRect = { sx: number; sy: number; sw: number; sh: number }

/** Il rettangolo centrale da ritagliare per ottenere il ritaglio richiesto. */
export function cropForZoom(
  width: number,
  height: number,
  digital: number,
): CropRect {
  if (!Number.isFinite(digital) || digital <= 1) {
    return { sx: 0, sy: 0, sw: width, sh: height }
  }
  const sw = Math.max(1, Math.round(width / digital))
  const sh = Math.max(1, Math.round(height / digital))
  return {
    sx: Math.round((width - sw) / 2),
    sy: Math.round((height - sh) / 2),
    sw,
    sh,
  }
}
