import { describe, expect, it } from 'vitest'
import {
  HAND_CONNECTIONS,
  toOverlayHands,
} from './handLandmarksOverlay'
import { HAND_LANDMARK_COUNT, type HandLandmarks } from './visionProtocol'

const hand = (
  landmarks: { x: number; y: number }[] = Array.from(
    { length: HAND_LANDMARK_COUNT },
    (_, index) => ({ x: index / 100, y: index / 200 }),
  ),
): HandLandmarks => ({ handedness: 'RIGHT', landmarks })

describe('toOverlayHands', () => {
  it('porta i landmark nei pixel del riquadro d’anteprima', () => {
    const [overlayHand] = toOverlayHands([hand()], {
      width: 400,
      height: 200,
      mirrored: false,
    })

    expect(overlayHand.handedness).toBe('RIGHT')
    expect(overlayHand.points).toHaveLength(HAND_LANDMARK_COUNT)
    expect(overlayHand.bones).toHaveLength(HAND_CONNECTIONS.length)
    expect(overlayHand.points[0]).toEqual({ x: 0, y: 0, isIndexFinger: false })
    expect(overlayHand.points[8]).toEqual({
      x: 32,
      y: 8,
      isIndexFinger: true,
    })
  })

  it('ribalta le ascisse quando l’anteprima è specchiata', () => {
    const [overlayHand] = toOverlayHands([hand()], {
      width: 400,
      height: 200,
      mirrored: true,
    })

    expect(overlayHand.points[8].x).toBe(400 - 32)
    expect(overlayHand.points[8].y).toBe(8)
  })

  it('collega le ossa nella numerazione MediaPipe', () => {
    const [overlayHand] = toOverlayHands([hand()], {
      width: 100,
      height: 100,
      mirrored: false,
    })
    const [wristToThumb] = overlayHand.bones

    expect(wristToThumb).toEqual({
      x1: 0,
      y1: 0,
      x2: 1,
      y2: 0.5,
      isIndexFinger: false,
    })
    expect(
      overlayHand.bones.filter((bone) => bone.isIndexFinger),
    ).toHaveLength(3)
  })

  it('senza un riquadro misurato non disegna nulla', () => {
    const measures = { width: 0, height: 200, mirrored: false }
    expect(toOverlayHands([hand()], measures)).toEqual([])
    expect(
      toOverlayHands([hand()], { width: 400, height: 0, mirrored: false }),
    ).toEqual([])
  })

  it('scarta una mano incompleta senza far cadere le altre', () => {
    const overlayHands = toOverlayHands(
      [hand([{ x: 0.1, y: 0.1 }]), hand()],
      { width: 400, height: 200, mirrored: false },
    )

    expect(overlayHands).toHaveLength(1)
  })
})
