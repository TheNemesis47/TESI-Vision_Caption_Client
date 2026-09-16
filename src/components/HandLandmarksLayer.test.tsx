import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import HandLandmarksLayer from './HandLandmarksLayer'
import { HAND_CONNECTIONS } from '../domain/handLandmarksOverlay'
import { HAND_LANDMARK_COUNT, type HandLandmarks } from '../domain/visionProtocol'

const hand = (): HandLandmarks => ({
  handedness: 'RIGHT',
  landmarks: Array.from({ length: HAND_LANDMARK_COUNT }, (_, index) => ({
    x: index / 100,
    y: 0.5,
  })),
})

describe('HandLandmarksLayer', () => {
  it('disegna ossa e giunti sul riquadro d’anteprima', () => {
    const { container } = render(
      <HandLandmarksLayer
        hands={[hand()]}
        width={400}
        height={200}
        mirrored={false}
      />,
    )

    const layer = container.querySelector('.hand-landmarks-layer')
    expect(layer).toHaveAttribute('viewBox', '0 0 400 200')
    expect(container.querySelectorAll('.hand-bone')).toHaveLength(
      HAND_CONNECTIONS.length,
    )
    expect(container.querySelectorAll('.hand-joint')).toHaveLength(
      HAND_LANDMARK_COUNT,
    )
    expect(container.querySelectorAll('.hand-joint.is-index')).toHaveLength(4)
  })

  it('senza mani non monta nulla', () => {
    const { container } = render(
      <HandLandmarksLayer hands={[]} width={400} height={200} mirrored={false} />,
    )

    expect(container.querySelector('.hand-landmarks-layer')).toBeNull()
  })
})
