import { describe, expect, it } from 'vitest'
import type {
  PointingCorridorStyle,
  PointingOverlay,
} from '../domain/visionProtocol'
import {
  buildPointingCorridorGeometry,
  calculatePreviewContentRect,
  getPointingOverlayVisualStyle,
  shouldApplyPointingOverlayFrame,
} from './pointingOverlayGeometry'

const corridor: PointingCorridorStyle = {
  coordinate_space: 'normalized',
  width_reference: 'short_side',
  start_half_width_ratio: 0.008,
  min_end_half_width_ratio: 0.03,
  expansion_ratio: 0.04,
  fill_alpha: 0.14,
  color: '#FFFF00',
  line_width_px: 2,
}

const createOverlay = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  state: PointingOverlay['state'] = 'ACTIVE',
): PointingOverlay => ({
  handedness: 'RIGHT',
  state,
  confirmation_progress: state === 'ACTIVE' ? 1 : 0.62,
  ray: { start, end },
})

describe('buildPointingCorridorGeometry', () => {
  it('costruisce un raggio orizzontale', () => {
    const geometry = buildPointingCorridorGeometry({
      overlay: createOverlay({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }),
      corridor,
      imageWidth: 1000,
      imageHeight: 500,
    })

    expect(geometry).toMatchObject({
      start: { x: 200, y: 250 },
      end: { x: 800, y: 250 },
      length: 600,
      startHalfWidth: 4,
      endHalfWidth: 24,
      polygon: [
        { x: 200, y: 254 },
        { x: 200, y: 246 },
        { x: 800, y: 226 },
        { x: 800, y: 274 },
      ],
    })
  })

  it('costruisce un raggio verticale', () => {
    const geometry = buildPointingCorridorGeometry({
      overlay: createOverlay({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }),
      corridor,
      imageWidth: 1000,
      imageHeight: 500,
    })

    expect(geometry).toMatchObject({
      start: { x: 500, y: 100 },
      end: { x: 500, y: 400 },
      length: 300,
      polygon: [
        { x: 496, y: 100 },
        { x: 504, y: 100 },
        { x: 515, y: 400 },
        { x: 485, y: 400 },
      ],
    })
  })

  it('mantiene le larghezze perpendicolari su un raggio diagonale', () => {
    const geometry = buildPointingCorridorGeometry({
      overlay: createOverlay({ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.8 }),
      corridor,
      imageWidth: 800,
      imageHeight: 600,
    })

    expect(geometry).not.toBeNull()
    if (!geometry) return

    const startEdgeLength = Math.hypot(
      geometry.polygon[0].x - geometry.polygon[1].x,
      geometry.polygon[0].y - geometry.polygon[1].y,
    )
    const endEdgeLength = Math.hypot(
      geometry.polygon[2].x - geometry.polygon[3].x,
      geometry.polygon[2].y - geometry.polygon[3].y,
    )
    expect(startEdgeLength).toBeCloseTo(geometry.startHalfWidth * 2)
    expect(endEdgeLength).toBeCloseTo(geometry.endHalfWidth * 2)
  })

  it('inverte una sola volta le ascisse per la preview frontale', () => {
    const geometry = buildPointingCorridorGeometry({
      overlay: createOverlay({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }),
      corridor,
      imageWidth: 1000,
      imageHeight: 500,
      mirrored: true,
    })

    expect(geometry?.start.x).toBeCloseTo(800)
    expect(geometry?.end.x).toBeCloseTo(200)
  })
})

describe('allineamento preview', () => {
  it('calcola i margini di object-fit contain', () => {
    expect(
      calculatePreviewContentRect({
        containerWidth: 400,
        containerHeight: 400,
        imageWidth: 1600,
        imageHeight: 900,
        objectFit: 'contain',
      }),
    ).toEqual({
      left: 0,
      top: 87.5,
      width: 400,
      height: 225,
    })
  })

  it('calcola il crop di object-fit cover', () => {
    const rect = calculatePreviewContentRect({
      containerWidth: 400,
      containerHeight: 400,
      imageWidth: 1600,
      imageHeight: 900,
      objectFit: 'cover',
    })

    expect(rect.left).toBeCloseTo(-155.555_555)
    expect(rect.top).toBeCloseTo(0)
    expect(rect.width).toBeCloseTo(711.111_111)
    expect(rect.height).toBeCloseTo(400)
  })
})

describe('stato visuale e ordine frame', () => {
  it('rende CANDIDATE più tenue e tratteggiato rispetto ad ACTIVE', () => {
    const candidate = getPointingOverlayVisualStyle(
      createOverlay({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }, 'CANDIDATE'),
      corridor,
    )
    const active = getPointingOverlayVisualStyle(
      createOverlay({ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }),
      corridor,
    )

    expect(candidate.fillOpacity).toBeLessThan(active.fillOpacity)
    expect(candidate.strokeDasharray).toBe('6 4')
    expect(active.strokeDasharray).toBeUndefined()
  })

  it('scarta un frame più vecchio ma accetta frame uguali o successivi', () => {
    expect(shouldApplyPointingOverlayFrame(9, 10)).toBe(false)
    expect(shouldApplyPointingOverlayFrame(10, 10)).toBe(true)
    expect(shouldApplyPointingOverlayFrame(11, 10)).toBe(true)
  })
})
