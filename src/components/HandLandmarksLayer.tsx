import { useMemo } from 'react'
import { toOverlayHands } from '../domain/handLandmarksOverlay'
import type { HandLandmarks } from '../domain/visionProtocol'

type HandLandmarksLayerProps = {
  hands: HandLandmarks[]
  width: number
  height: number
  mirrored: boolean
}

/** Scheletro MediaPipe sopra l'anteprima: solo vista diagnostica. */
export default function HandLandmarksLayer({
  hands,
  width,
  height,
  mirrored,
}: HandLandmarksLayerProps) {
  const overlayHands = useMemo(
    () => toOverlayHands(hands, { width, height, mirrored }),
    [hands, height, mirrored, width],
  )

  if (overlayHands.length === 0) return null

  // Il raggio dei giunti segue il lato corto: su un telefono in verticale
  // l'anteprima è stretta, e punti a misura fissa coprirebbero le dita.
  const jointRadius = Math.max(2.5, Math.min(width, height) * 0.008)

  return (
    <svg
      className="hand-landmarks-layer"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
    >
      {overlayHands.map((hand, handIndex) => (
        <g
          key={`${hand.handedness}-${handIndex}`}
          className="hand-landmarks"
          data-handedness={hand.handedness}
        >
          {hand.bones.map((bone, boneIndex) => (
            <line
              key={boneIndex}
              className={`hand-bone${bone.isIndexFinger ? ' is-index' : ''}`}
              x1={bone.x1}
              y1={bone.y1}
              x2={bone.x2}
              y2={bone.y2}
            />
          ))}
          {hand.points.map((point, pointIndex) => (
            <circle
              key={pointIndex}
              className={`hand-joint${point.isIndexFinger ? ' is-index' : ''}`}
              cx={point.x}
              cy={point.y}
              r={jointRadius}
            />
          ))}
        </g>
      ))}
    </svg>
  )
}
