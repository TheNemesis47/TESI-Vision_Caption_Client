import { describe, expect, it } from 'vitest'
import {
  calculateFrameDimensions,
  shouldSkipFrameForBackpressure,
} from './useFrameCapture'

describe('calculateFrameDimensions', () => {
  it('ridimensiona in landscape mantenendo l’aspect ratio', () => {
    expect(calculateFrameDimensions(1920, 1080, 1280, 720)).toEqual({
      width: 1280,
      height: 720,
    })
  })

  it('conserva l’intera scena in portrait senza crop', () => {
    expect(calculateFrameDimensions(1080, 1920, 1280, 720)).toEqual({
      width: 405,
      height: 720,
    })
  })

  it('non ingrandisce frame già piccoli', () => {
    expect(calculateFrameDimensions(640, 480, 1280, 720)).toEqual({
      width: 640,
      height: 480,
    })
  })
})

describe('backpressure', () => {
  it('scarta solo quando bufferedAmount supera la soglia', () => {
    expect(shouldSkipFrameForBackpressure(1_000_001, 1_000_000)).toBe(true)
    expect(shouldSkipFrameForBackpressure(1_000_000, 1_000_000)).toBe(false)
  })
})
