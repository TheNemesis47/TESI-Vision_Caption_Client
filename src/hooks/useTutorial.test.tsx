import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTutorial } from './useTutorial'
import { TUTORIAL_STEPS } from '../domain/tutorial'

const speak = vi.fn()
const stop = vi.fn()
const setRate = vi.fn()

vi.mock('../services/tutorialVoice', () => ({
  TutorialVoice: class {
    speak = speak
    stop = stop
    setRate = setRate
  },
}))

describe('useTutorial', () => {
  beforeEach(() => {
    window.localStorage.clear()
    speak.mockClear()
    stop.mockClear()
    setRate.mockClear()
  })

  it('si apre da sola alla prima apertura e non torna dopo', () => {
    const first = renderHook(() => useTutorial())
    expect(first.result.current.isOpen).toBe(true)

    act(() => first.result.current.close())
    expect(first.result.current.isOpen).toBe(false)

    const second = renderHook(() => useTutorial())
    expect(second.result.current.isOpen).toBe(false)
  })

  it('il passo d’apertura non parla: su iPhone l’audio vuole un gesto', () => {
    const { result } = renderHook(() => useTutorial())

    expect(speak).not.toHaveBeenCalled()
    act(() => result.current.next())
    expect(speak).toHaveBeenCalledWith(TUTORIAL_STEPS[1])
  })

  it('all’ultimo passo si chiude invece di sfondare in coda', () => {
    const { result } = renderHook(() => useTutorial())

    for (let index = 0; index < TUTORIAL_STEPS.length; index += 1) {
      act(() => result.current.next())
    }

    expect(result.current.isOpen).toBe(false)
    expect(result.current.stepIndex).toBe(TUTORIAL_STEPS.length - 1)
  })

  it('con la voce spenta nessun passo parla, e la scelta resta memorizzata', () => {
    const { result } = renderHook(() => useTutorial())

    act(() => result.current.next())
    speak.mockClear()
    act(() => result.current.toggleVoice())
    act(() => result.current.next())

    expect(result.current.isVoiceEnabled).toBe(false)
    expect(stop).toHaveBeenCalled()
    expect(speak).not.toHaveBeenCalled()

    const reopened = renderHook(() => useTutorial())
    expect(reopened.result.current.isVoiceEnabled).toBe(false)
  })

  it('il pulsante della guida la riapre dal primo passo', () => {
    const { result } = renderHook(() => useTutorial())

    act(() => result.current.next())
    act(() => result.current.close())
    act(() => result.current.open())

    expect(result.current.isOpen).toBe(true)
    expect(result.current.stepIndex).toBe(0)
  })

  it('«ripeti» ridice il passo corrente', () => {
    const { result } = renderHook(() => useTutorial())

    act(() => result.current.next())
    speak.mockClear()
    act(() => result.current.repeat())

    expect(speak).toHaveBeenCalledWith(TUTORIAL_STEPS[1])
  })
})

describe('la velocità della guida', () => {
  it('è quella scelta nelle impostazioni, non una sua', () => {
    const { result } = renderHook(() => useTutorial(1.75))

    act(() => result.current.next())

    // Chi ascolta al doppio non vuole l'eccezione proprio nella guida, che è
    // il primo contatto con l'applicazione.
    expect(setRate).toHaveBeenCalledWith(1.75)
    expect(speak).toHaveBeenCalled()
  })
})
