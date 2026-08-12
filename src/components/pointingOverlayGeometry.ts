import type {
  NormalizedPoint,
  PointingCorridorStyle,
  PointingOverlay,
} from '../domain/visionProtocol'

export type PreviewObjectFit = 'contain' | 'cover'

export type PreviewContentRect = {
  left: number
  top: number
  width: number
  height: number
}

export type ImagePoint = {
  x: number
  y: number
}

export type PointingCorridorGeometry = {
  start: ImagePoint
  end: ImagePoint
  polygon: [ImagePoint, ImagePoint, ImagePoint, ImagePoint]
  length: number
  shortSide: number
  startHalfWidth: number
  endHalfWidth: number
}

export type PointingOverlayVisualStyle = {
  fillOpacity: number
  strokeOpacity: number
  strokeDasharray: string | undefined
}

export const calculatePreviewContentRect = ({
  containerWidth,
  containerHeight,
  imageWidth,
  imageHeight,
  objectFit,
}: {
  containerWidth: number
  containerHeight: number
  imageWidth: number
  imageHeight: number
  objectFit: PreviewObjectFit
}): PreviewContentRect => {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return {
      left: 0,
      top: 0,
      width: Math.max(0, containerWidth),
      height: Math.max(0, containerHeight),
    }
  }

  const containScale = Math.min(
    containerWidth / imageWidth,
    containerHeight / imageHeight,
  )
  const coverScale = Math.max(
    containerWidth / imageWidth,
    containerHeight / imageHeight,
  )
  const scale = objectFit === 'cover' ? coverScale : containScale
  const width = imageWidth * scale
  const height = imageHeight * scale

  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  }
}

const toImagePoint = (
  point: NormalizedPoint,
  imageWidth: number,
  imageHeight: number,
  mirrored: boolean,
): ImagePoint => {
  return {
    x: (mirrored ? 1 - point.x : point.x) * imageWidth,
    y: point.y * imageHeight,
  }
}

export const buildPointingCorridorGeometry = ({
  overlay,
  corridor,
  imageWidth,
  imageHeight,
  mirrored = false,
}: {
  overlay: PointingOverlay
  corridor: PointingCorridorStyle
  imageWidth: number
  imageHeight: number
  mirrored?: boolean
}): PointingCorridorGeometry | null => {
  if (imageWidth <= 0 || imageHeight <= 0) return null

  const start = toImagePoint(
    overlay.ray.start,
    imageWidth,
    imageHeight,
    mirrored,
  )
  const end = toImagePoint(
    overlay.ray.end,
    imageWidth,
    imageHeight,
    mirrored,
  )
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length <= Number.EPSILON) return null

  const perpendicularX = -dy / length
  const perpendicularY = dx / length
  const shortSide = Math.min(imageWidth, imageHeight)
  const startHalfWidth = corridor.start_half_width_ratio * shortSide
  const endHalfWidth = Math.max(
    corridor.min_end_half_width_ratio * shortSide,
    length * corridor.expansion_ratio,
  )

  return {
    start,
    end,
    length,
    shortSide,
    startHalfWidth,
    endHalfWidth,
    polygon: [
      {
        x: start.x + perpendicularX * startHalfWidth,
        y: start.y + perpendicularY * startHalfWidth,
      },
      {
        x: start.x - perpendicularX * startHalfWidth,
        y: start.y - perpendicularY * startHalfWidth,
      },
      {
        x: end.x - perpendicularX * endHalfWidth,
        y: end.y - perpendicularY * endHalfWidth,
      },
      {
        x: end.x + perpendicularX * endHalfWidth,
        y: end.y + perpendicularY * endHalfWidth,
      },
    ],
  }
}

export const getPointingOverlayVisualStyle = (
  overlay: PointingOverlay,
  corridor: PointingCorridorStyle,
): PointingOverlayVisualStyle => {
  const lineWidth = Math.max(1, corridor.line_width_px)
  if (overlay.state === 'CANDIDATE') {
    return {
      fillOpacity: corridor.fill_alpha * 0.55,
      strokeOpacity: 0.72,
      strokeDasharray: `${lineWidth * 3} ${lineWidth * 2}`,
    }
  }

  return {
    fillOpacity: corridor.fill_alpha,
    strokeOpacity: 1,
    strokeDasharray: undefined,
  }
}

export const shouldApplyPointingOverlayFrame = (
  frameId: number,
  lastAppliedFrameId: number | null,
) => {
  return lastAppliedFrameId === null || frameId >= lastAppliedFrameId
}
