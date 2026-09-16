import type { DetectionPayload } from './visionProtocol'

/**
 * L'interruttore dei livelli diagnostici e i box RF-DETR che ne dipendono. Il
 * client per l'utente finale non li monta: la dashboard diagnostica che li
 * disegnava è stata sostituita dal client mobile, e un test blocca la
 * ricomparsa dei renderer diagnostici nella vista ordinaria. Qui tornano solo
 * su richiesta esplicita: `?debug=1` nell'indirizzo, oppure
 * VITE_SHOW_DETECTIONS a build. Lo stesso interruttore accende i box in AUTO e
 * lo scheletro della mano in POINTING.
 */

/** Un box pronto da disegnare: frazioni dell'immagine, non pixel. */
export type OverlayBox = {
  label: string
  left: number
  top: number
  width: number
  height: number
}

const TRUTHY = new Set(['1', 'true', 'yes', 'on'])

export const isDiagnosticOverlayEnabled = (
  search: string = typeof window === 'undefined' ? '' : window.location.search,
  buildFlag: unknown = import.meta.env.VITE_SHOW_DETECTIONS,
): boolean => {
  const fromUrl = new URLSearchParams(search).get('debug')
  if (fromUrl !== null) return TRUTHY.has(fromUrl.toLowerCase())
  return TRUTHY.has(String(buildFlag ?? '').toLowerCase())
}

const readNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

/**
 * Le detection arrivano in pixel del fotogramma che il client ha inviato, non
 * normalizzate: senza le dimensioni di quel fotogramma non c'è modo di
 * collocarle, e la lista resta vuota invece di finire fuori schermo.
 */
export const toOverlayBoxes = (
  detections: DetectionPayload[],
  frameWidth: number | undefined,
  frameHeight: number | undefined,
): OverlayBox[] => {
  if (!frameWidth || !frameHeight) return []

  return detections.flatMap((detection) => {
    const bbox = detection.bbox
    if (typeof bbox !== 'object' || bbox === null) return []

    const box = bbox as Record<string, unknown>
    const xMin = readNumber(box.x_min)
    const yMin = readNumber(box.y_min)
    const xMax = readNumber(box.x_max)
    const yMax = readNumber(box.y_max)
    if (xMin === null || yMin === null || xMax === null || yMax === null) {
      return []
    }

    const confidence = readNumber(detection.confidence)
    const className =
      typeof detection.class_name === 'string' ? detection.class_name : '?'

    return [
      {
        label:
          confidence === null
            ? className
            : `${className} ${Math.round(confidence * 100)}%`,
        left: xMin / frameWidth,
        top: yMin / frameHeight,
        width: Math.max(0, xMax - xMin) / frameWidth,
        height: Math.max(0, yMax - yMin) / frameHeight,
      },
    ]
  })
}
