import { useMemo } from 'react'
import type { PointingOverlayMessage } from '../domain/visionProtocol'
import {
  buildPointingCorridorGeometry,
  getPointingOverlayVisualStyle,
} from './pointingOverlayGeometry'

type PointingOverlayLayerProps = {
  message: PointingOverlayMessage | null
  imageWidth: number
  imageHeight: number
  mirrored: boolean
}

export default function PointingOverlayLayer({
  message,
  imageWidth,
  imageHeight,
  mirrored,
}: PointingOverlayLayerProps) {
  const renderedOverlays = useMemo(() => {
    if (!message) return []

    return message.overlays.flatMap((overlay, index) => {
      const geometry = buildPointingCorridorGeometry({
        overlay,
        corridor: message.corridor,
        imageWidth,
        imageHeight,
        mirrored,
      })
      if (!geometry) return []

      return [
        {
          key: `${overlay.handedness}-${index}`,
          overlay,
          geometry,
          visualStyle: getPointingOverlayVisualStyle(
            overlay,
            message.corridor,
          ),
        },
      ]
    })
  }, [imageHeight, imageWidth, message, mirrored])

  if (!message || renderedOverlays.length === 0) return null

  const lineWidth = Math.max(1, message.corridor.line_width_px)

  return (
    <svg
      className="pointing-overlay-layer"
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-frame-id={message.frame_id}
    >
      {renderedOverlays.map(({ key, overlay, geometry, visualStyle }) => {
        const originRadius = Math.max(
          lineWidth * 2.75,
          geometry.shortSide * 0.006,
        )
        const progressRadius = originRadius + lineWidth * 2.25
        const polygonPoints = geometry.polygon
          .map((point) => `${point.x},${point.y}`)
          .join(' ')

        return (
          <g
            key={key}
            className={`pointing-corridor is-${overlay.state.toLowerCase()}`}
            data-state={overlay.state}
            data-handedness={overlay.handedness}
          >
            <polygon
              className="pointing-corridor-fill"
              points={polygonPoints}
              fill={message.corridor.color}
              fillOpacity={visualStyle.fillOpacity}
              stroke={message.corridor.color}
              strokeOpacity={visualStyle.strokeOpacity}
              strokeWidth={lineWidth}
              strokeDasharray={visualStyle.strokeDasharray}
              vectorEffect="non-scaling-stroke"
            />
            <line
              className="pointing-corridor-center"
              x1={geometry.start.x}
              y1={geometry.start.y}
              x2={geometry.end.x}
              y2={geometry.end.y}
              stroke={message.corridor.color}
              strokeOpacity={visualStyle.strokeOpacity}
              strokeWidth={lineWidth}
              strokeDasharray={visualStyle.strokeDasharray}
              vectorEffect="non-scaling-stroke"
            />
            <circle
              className="pointing-corridor-origin"
              cx={geometry.start.x}
              cy={geometry.start.y}
              r={originRadius}
              fill={
                overlay.state === 'ACTIVE'
                  ? message.corridor.color
                  : 'transparent'
              }
              stroke={message.corridor.color}
              strokeOpacity={visualStyle.strokeOpacity}
              strokeWidth={lineWidth}
              vectorEffect="non-scaling-stroke"
            />
            {overlay.state === 'CANDIDATE' && (
              <>
                <circle
                  className="pointing-confirmation-track"
                  cx={geometry.start.x}
                  cy={geometry.start.y}
                  r={progressRadius}
                  fill="none"
                  stroke={message.corridor.color}
                  strokeOpacity={0.22}
                  strokeWidth={lineWidth * 1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  className="pointing-confirmation-progress"
                  cx={geometry.start.x}
                  cy={geometry.start.y}
                  r={progressRadius}
                  fill="none"
                  pathLength={1}
                  stroke={message.corridor.color}
                  strokeOpacity={0.95}
                  strokeWidth={lineWidth * 1.5}
                  strokeDasharray={`${overlay.confirmation_progress} 1`}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${geometry.start.x} ${geometry.start.y})`}
                  vectorEffect="non-scaling-stroke"
                  data-progress={overlay.confirmation_progress}
                />
              </>
            )}
          </g>
        )
      })}
    </svg>
  )
}
