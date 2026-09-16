import {
  HAND_LANDMARK_COUNT,
  type HandLandmarks,
  type NormalizedPoint,
} from './visionProtocol'

/**
 * Lo scheletro della mano sopra l'anteprima, gemello diagnostico dei box
 * RF-DETR: stesso interruttore (`?debug=1` o VITE_SHOW_DETECTIONS), stessa
 * regola di non mostrarlo all'utente finale. Qui serve a vedere se MediaPipe
 * segue davvero la mano quando il puntamento non scatta.
 */

/** Le ossa della mano, nella numerazione dei landmark MediaPipe. */
export const HAND_CONNECTIONS: readonly (readonly [number, number])[] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [9, 10], [10, 11], [11, 12],
  [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
]

/** L'indice detta la direzione del raggio: va letto a colpo d'occhio. */
export const INDEX_FINGER_LANDMARKS: ReadonlySet<number> = new Set([5, 6, 7, 8])

export type OverlayPoint = {
  x: number
  y: number
  isIndexFinger: boolean
}

export type OverlayBone = {
  x1: number
  y1: number
  x2: number
  y2: number
  isIndexFinger: boolean
}

export type OverlayHand = {
  handedness: string
  points: OverlayPoint[]
  bones: OverlayBone[]
}

/**
 * I landmark arrivano in frazioni del frame inviato, mai specchiate. Qui
 * diventano pixel del riquadro d'anteprima, ribaltati se l'anteprima lo è,
 * così che scheletro e mano combacino sullo schermo.
 */
export const toOverlayHands = (
  hands: HandLandmarks[],
  {
    width,
    height,
    mirrored,
  }: { width: number; height: number; mirrored: boolean },
): OverlayHand[] => {
  if (!(width > 0) || !(height > 0)) return []

  return hands.flatMap((hand) => {
    if (hand.landmarks.length !== HAND_LANDMARK_COUNT) return []

    const toPixels = (landmark: NormalizedPoint) => ({
      x: (mirrored ? 1 - landmark.x : landmark.x) * width,
      y: landmark.y * height,
    })
    const pixels = hand.landmarks.map(toPixels)

    return [
      {
        handedness: hand.handedness,
        points: pixels.map((point, index) => ({
          ...point,
          isIndexFinger: INDEX_FINGER_LANDMARKS.has(index),
        })),
        bones: HAND_CONNECTIONS.map(([start, end]) => ({
          x1: pixels[start].x,
          y1: pixels[start].y,
          x2: pixels[end].x,
          y2: pixels[end].y,
          isIndexFinger:
            INDEX_FINGER_LANDMARKS.has(start) &&
            INDEX_FINGER_LANDMARKS.has(end),
        })),
      },
    ]
  })
}
