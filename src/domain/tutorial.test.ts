import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasSeenTutorial,
  spokenText,
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
    expect(TUTORIAL_VERSION).toBe('v4')
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
    expect(spokenText(TUTORIAL_STEPS[0])).toBe('')
    expect(TUTORIAL_STEPS[0].audio).toBeUndefined()
  })

  it('ogni passo parlato ha la sua traccia', () => {
    const parlati = TUTORIAL_STEPS.filter((step) => spokenText(step))
    expect(parlati).toHaveLength(5)
    expect(parlati.every((step) => step.audio?.startsWith('/tutorial/'))).toBe(true)
  })

  it('la modalità si sceglie dalla guida; la fotocamera si comanda dalla schermata', () => {
    // L'elenco degli obiettivi è sparito: restava un doppione del pulsante
    // per girare la fotocamera, e nessuno sapeva quale voce scegliere.
    expect(TUTORIAL_STEPS.map((step) => step.control)).toEqual([
      undefined,
      undefined,
      'mode',
      undefined,
      undefined,
      undefined,
    ])
  })

  it('si prova davvero una modalità alla volta, prima di restare soli', () => {
    // Il riscontro di chi ha visto i test: finita la spiegazione l'utente
    // deve aver già sentito una descrizione in automatica e una puntando.
    expect(TUTORIAL_STEPS.map((step) => step.practice)).toEqual([
      undefined,
      undefined,
      undefined,
      'AUTO',
      'POINTING',
      undefined,
    ])
    // L'ultimo passo non è una prova: chiude la guida.
    expect(TUTORIAL_STEPS.at(-1)?.practice).toBeUndefined()
  })

  it('ogni prova ha il suo pulsante per partire', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(Boolean(step.start)).toBe(Boolean(step.practice))
    }
  })
})

describe('la voce legge quello che c è scritto', () => {
  // Il riscontro degli utenti: la traccia diceva cose che sullo schermo non
  // c'erano. Ora il testo è uno solo e la voce non può divergere.
  it.each(TUTORIAL_STEPS.filter((step) => spokenText(step)))(
    'il passo $id si pronuncia come si legge',
    (step) => {
      expect(spokenText(step)).toBe(`${step.title}. ${step.body}`)
    },
  )
})

describe('la voce nomina i pulsanti che si vedono davvero', () => {
  // Il riscontro degli utenti UICI: la traccia diceva di premere un pulsante
  // che sullo schermo si chiamava in un altro modo. Schermo, voce e pulsanti
  // hanno una sola fonte, questo file, e qui si controlla che non divergano.
  const AVANZAMENTO = ['Avanti', 'Ho capito', 'Ascolta la guida', 'Prova']
  const SEMPRE_PRESENTI = [
    'Salta la guida',
    'Ripeti',
    'Spegni la voce guida',
    'Accendi la voce guida',
  ]
  const APP_BUTTONS = ['Avvia', 'Arresta', 'Rivedi la guida']
  const NAMED_BUTTON =
    /(?:[Pp]remi(?:lo)?|pulsante)\s+([A-ZÀ-Ý][^,.:;]*?)(?=[,.:;]|\s+per\b|\s+e\b|\s+quando\b|\s+in alto\b|$)/gu

  const namedIn = (text: string): string[] =>
    [...text.matchAll(NAMED_BUTTON)].map((match) => match[1].trim())

  it.each(TUTORIAL_STEPS)('il passo $id nomina solo pulsanti esistenti', (step) => {
    for (const name of namedIn(step.body)) {
      expect([...AVANZAMENTO, ...SEMPRE_PRESENTI, ...APP_BUTTONS]).toContain(name)
    }
  })

  it.each(TUTORIAL_STEPS)(
    'il passo $id chiede di premere il pulsante che ha davanti',
    (step) => {
      for (const name of namedIn(step.body)) {
        if (AVANZAMENTO.includes(name)) {
          expect([step.next, step.start].filter(Boolean)).toContain(name)
        }
      }
    },
  )

  it('ogni passo con una traccia ha la sua frase, e viceversa', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(Boolean(step.audio)).toBe(Boolean(spokenText(step)))
    }
  })
})
