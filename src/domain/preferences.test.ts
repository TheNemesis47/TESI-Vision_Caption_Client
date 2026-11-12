import { describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_PREFERENCES,
  STORAGE_KEY,
  captionIntervalLabel,
  loadPreferences,
  normalizePreferences,
  savePreferences,
  sessionPreferences,
  speechRateLabel,
} from './preferences'

const storage = (contenuto: Record<string, string> = {}) => ({
  getItem: (chiave: string) => contenuto[chiave] ?? null,
  setItem: (chiave: string, valore: string) => {
    contenuto[chiave] = valore
  },
  contenuto,
})

describe('le preferenze salvate', () => {
  it('senza niente di salvato valgono quelle di base', () => {
    expect(loadPreferences(storage())).toEqual(DEFAULT_PREFERENCES)
  })

  it('tornano come sono state salvate', () => {
    const store = storage()
    savePreferences(
      { ...DEFAULT_PREFERENCES, speechRate: 1.5, textScale: 'enorme' },
      store,
    )

    expect(loadPreferences(store)).toMatchObject({
      speechRate: 1.5,
      textScale: 'enorme',
    })
  })

  it('un solo valore rovinato non cancella le altre scelte', () => {
    expect(
      normalizePreferences({ speechRate: 'veloce', textScale: 'grande' }),
    ).toMatchObject({ speechRate: 1, textScale: 'grande' })
  })

  it('una velocità assurda viene riportata nei limiti', () => {
    expect(normalizePreferences({ speechRate: 9 }).speechRate).toBe(2)
    expect(normalizePreferences({ speechRate: 0.1 }).speechRate).toBe(0.5)
  })

  it('una versione vecchia che aveva salvato meno campi continua a valere', () => {
    expect(normalizePreferences({ speechRate: 1.25 })).toEqual({
      ...DEFAULT_PREFERENCES,
      speechRate: 1.25,
    })
  })

  it('in finestra privata non si rompe niente', () => {
    const negato = {
      getItem: () => {
        throw new Error('accesso negato')
      },
      setItem: () => {
        throw new Error('accesso negato')
      },
    }

    expect(loadPreferences(negato)).toEqual(DEFAULT_PREFERENCES)
    expect(() => savePreferences(DEFAULT_PREFERENCES, negato)).not.toThrow()
  })

  it('un JSON rovinato non rompe l avvio', () => {
    expect(loadPreferences(storage({ [STORAGE_KEY]: '{non json' }))).toEqual(
      DEFAULT_PREFERENCES,
    )
  })
})

describe('come si pronunciano', () => {
  it('le velocità si dicono a parole, non in numeri', () => {
    expect(speechRateLabel(1)).toBe('Normale')
    expect(speechRateLabel(1.5)).toBe('Una volta e mezza')
    expect(speechRateLabel(2)).toBe('Doppia')
    // Un valore salvato da una versione futura resta leggibile.
    expect(speechRateLabel(3)).toBe('3×')
  })

  it('gli intervalli si dicono in secondi o minuti', () => {
    expect(captionIntervalLabel(10)).toBe('Ogni 10 secondi')
    expect(captionIntervalLabel(120)).toBe('Ogni 2 minuti')
  })
})

describe('cosa viaggia verso il server', () => {
  it('la verbosità diventa un numero di parole', () => {
    expect(sessionPreferences({ ...DEFAULT_PREFERENCES, verbosity: 'essenziale' })).toEqual({
      max_words: 25,
      min_interval_seconds: 10,
    })
    expect(
      sessionPreferences({ ...DEFAULT_PREFERENCES, verbosity: 'completa' }).max_words,
    ).toBe(90)
  })

  it('la modalità viaggia solo se è stata scelta: altrimenti decide il server', () => {
    expect(sessionPreferences(DEFAULT_PREFERENCES).mode).toBeUndefined()
    expect(
      sessionPreferences({ ...DEFAULT_PREFERENCES, mode: 'supermercato' }).mode,
    ).toBe('supermercato')
  })

  it('la velocità della voce non viaggia: è il telefono a riprodurre', () => {
    const payload = sessionPreferences({ ...DEFAULT_PREFERENCES, speechRate: 2 })

    expect(Object.keys(payload).sort()).toEqual([
      'max_words',
      'min_interval_seconds',
    ])
  })
})

describe('senza spazio di memoria del browser', () => {
  it('si usa localStorage quando non se ne passa uno', () => {
    const vero = { getItem: vi.fn(() => null), setItem: vi.fn() }
    vi.stubGlobal('localStorage', vero)

    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES)
    expect(vero.getItem).toHaveBeenCalledWith(STORAGE_KEY)

    vi.unstubAllGlobals()
  })
})
