import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasSeenTutorial,
  isGuideVoiceEnabled,
  rememberGuideVoice,
  rememberTutorialSeen,
  TUTORIAL_STEPS,
  TUTORIAL_VERSION,
} from './tutorial'

describe('memoria della guida', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('alla prima apertura la guida non risulta vista', () => {
    expect(hasSeenTutorial()).toBe(false)
  })

  it('una volta vista non torna', () => {
    rememberTutorialSeen()
    expect(hasSeenTutorial()).toBe(true)
  })

  it('una guida di versione diversa torna a mostrarsi', () => {
    window.localStorage.setItem('visioncaption.tutorial', 'v0')
    expect(hasSeenTutorial()).toBe(false)
    expect(TUTORIAL_VERSION).toBe('v1')
  })

  it('la voce guida è accesa salvo che non sia stata spenta', () => {
    expect(isGuideVoiceEnabled()).toBe(true)
    rememberGuideVoice(false)
    expect(isGuideVoiceEnabled()).toBe(false)
    rememberGuideVoice(true)
    expect(isGuideVoiceEnabled()).toBe(true)
  })

  it('con la memoria del browser bloccata la guida riparte invece di cadere', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('accesso negato')
    })
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('accesso negato')
    })

    expect(() => rememberTutorialSeen()).not.toThrow()
    expect(hasSeenTutorial()).toBe(false)
    expect(isGuideVoiceEnabled()).toBe(true)
  })
})

describe('i passi della guida', () => {
  it('si apre con un passo muto, perché iPhone non suona senza un gesto', () => {
    expect(TUTORIAL_STEPS[0].voice).toBe('')
    expect(TUTORIAL_STEPS[0].audio).toBeUndefined()
  })

  it('ogni passo parlato ha la sua traccia', () => {
    const spoken = TUTORIAL_STEPS.filter((step) => step.voice)
    expect(spoken).toHaveLength(3)
    expect(spoken.every((step) => step.audio?.startsWith('/tutorial/'))).toBe(true)
  })

  it('fotocamera e modalità si scelgono dalla guida, non solo se ne parla', () => {
    expect(TUTORIAL_STEPS.map((step) => step.control)).toEqual([
      undefined,
      'camera',
      'mode',
      undefined,
    ])
  })
})
