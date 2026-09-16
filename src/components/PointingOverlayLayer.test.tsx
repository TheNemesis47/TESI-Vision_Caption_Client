import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type {
  PointingOverlay,
  PointingOverlayMessage,
} from '../domain/visionProtocol'
import PointingOverlayLayer from './PointingOverlayLayer'

const createMessage = (
  overlays: PointingOverlay[],
  frameId = 123,
): PointingOverlayMessage => ({
  type: 'pointing_overlay',
  frame_id: frameId,
  overlays,
  hands: [],
  corridor: {
    coordinate_space: 'normalized',
    width_reference: 'short_side',
    start_half_width_ratio: 0.008,
    min_end_half_width_ratio: 0.03,
    expansion_ratio: 0.04,
    fill_alpha: 0.14,
    color: '#FFFF00',
    line_width_px: 2,
  },
})

const candidate: PointingOverlay = {
  handedness: 'RIGHT',
  state: 'CANDIDATE',
  confirmation_progress: 0.62,
  ray: {
    start: { x: 0.2, y: 0.5 },
    end: { x: 0.8, y: 0.5 },
  },
}

describe('PointingOverlayLayer', () => {
  it('usa confirmation_progress e distingue CANDIDATE da ACTIVE', () => {
    const { container, rerender } = render(
      <PointingOverlayLayer
        message={createMessage([candidate])}
        imageWidth={1000}
        imageHeight={500}
        mirrored={false}
      />,
    )

    const candidateGroup = container.querySelector('[data-state="CANDIDATE"]')
    const candidatePolygon = container.querySelector('polygon')
    expect(candidateGroup).toHaveClass('is-candidate')
    expect(candidatePolygon).toHaveAttribute('stroke-dasharray', '6 4')
    expect(
      Number(candidatePolygon?.getAttribute('fill-opacity')),
    ).toBeCloseTo(0.077)
    expect(container.querySelector('[data-progress="0.62"]')).toBeInTheDocument()

    rerender(
      <PointingOverlayLayer
        message={createMessage([{ ...candidate, state: 'ACTIVE' }], 124)}
        imageWidth={1000}
        imageHeight={500}
        mirrored={false}
      />,
    )

    const activeGroup = container.querySelector('[data-state="ACTIVE"]')
    const activePolygon = container.querySelector('polygon')
    expect(activeGroup).toHaveClass('is-active')
    expect(activePolygon).not.toHaveAttribute('stroke-dasharray')
    expect(Number(activePolygon?.getAttribute('fill-opacity'))).toBeCloseTo(0.14)
    expect(container.querySelector('.pointing-confirmation-progress')).toBeNull()
  })

  it('cancella immediatamente il layer con overlays vuoto', () => {
    const { container, rerender } = render(
      <PointingOverlayLayer
        message={createMessage([candidate])}
        imageWidth={1000}
        imageHeight={500}
        mirrored={false}
      />,
    )
    expect(container.querySelector('svg')).toBeInTheDocument()

    rerender(
      <PointingOverlayLayer
        message={createMessage([], 124)}
        imageWidth={1000}
        imageHeight={500}
        mirrored={false}
      />,
    )

    expect(container.querySelector('svg')).toBeNull()
    expect(screen.queryByTestId('pointing-overlay')).toBeNull()
  })
})
