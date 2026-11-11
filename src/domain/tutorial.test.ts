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
    expect(TUTORIAL_VERSION).toBe('v2')
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

describe('la voce nomina i pulsanti che si vedono davvero', () => {
  // Il riscontro degli utenti UICI: la traccia diceva di premere un pulsante
  // che sullo schermo si chiamava in un altro modo. Schermo, voce e pulsanti
  // hanno una sola fonte, questo file, e qui si controlla che non divergano.
  const GUIDE_BUTTONS = ['Avanti', 'Ho capito', 'Ascolta la guida']
  const APP_BUTTONS = ['Avvia', 'Arresta', 'Rivedi la guida']
  const NAMED_BUTTON =
    /(?:[Pp]remi(?:lo)?|pulsante)\s+([A-ZÀ-Ý][^,.:;]*?)(?=[,.:;]|\s+per\b|\s+e\b|\s+quando\b|\s+in alto\b|$)/gu

  const namedIn = (text: string): string[] =>
    [...text.matchAll(NAMED_BUTTON)].map((match) => match[1].trim())

  it.each(TUTORIAL_STEPS)('il passo $id nomina solo pulsanti esistenti', (step) => {
    for (const text of [step.body, step.voice]) {
      for (const name of namedIn(text)) {
        expect([...GUIDE_BUTTONS, ...APP_BUTTONS]).toContain(name)
      }
    }
  })

  it.each(TUTORIAL_STEPS)(
    'il passo $id chiede di premere il pulsante che ha davanti',
    (step) => {
      for (const text of [step.body, step.voice]) {
        for (const name of namedIn(text)) {
          if (GUIDE_BUTTONS.includes(name)) {
            expect(name).toBe(step.next)
          }
        }
      }
    },
  )

  it('ogni passo con una traccia ha la sua frase, e viceversa', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(Boolean(step.audio)).toBe(Boolean(step.voice))
    }
  })
})
