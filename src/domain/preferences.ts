/**
 * Le preferenze di chi usa l'applicazione, salvate su questo dispositivo.
 *
 * Non sono impostazioni da pannello di controllo: sono il modo in cui una
 * stessa applicazione serve persone molto diverse. Chi usa un lettore di
 * schermo da anni ascolta a una volta e mezza o al doppio della velocità
 * normale, e una descrizione di nove secondi detta a velocità normale copre
 * il professore che sta parlando. Chi è ipovedente la didascalia la legge, e
 * la legge se è grande e se il contrasto è vero.
 *
 * Due preferenze valgono subito sul telefono (velocità e aspetto), tre le
 * deve sapere il server perché cambiano il modo in cui le descrizioni
 * nascono (quante parole, ogni quanto, quale modalità). Stanno insieme qui
 * perché per chi le sceglie sono la stessa cosa.
 */

export type Verbosity = 'essenziale' | 'normale' | 'completa'
export type TextScale = 'normale' | 'grande' | 'enorme'

export type Preferences = {
  /** Moltiplicatore della velocità dell'audio: 1 è la voce come nasce. */
  speechRate: number
  /** Quanto deve dire una descrizione. */
  verbosity: Verbosity
  /** Secondi minimi fra una descrizione e la successiva. */
  captionIntervalSeconds: number
  /** Modalità scelta; vuoto significa «quella decisa dal server». */
  mode: string
  /** Dimensione della didascalia, per chi la legge invece di ascoltarla. */
  textScale: TextScale
  /** Giallo su nero pieno invece del pannello translucido. */
  highContrast: boolean
}

export const DEFAULT_PREFERENCES: Preferences = {
  speechRate: 1,
  verbosity: 'normale',
  captionIntervalSeconds: 10,
  mode: '',
  textScale: 'normale',
  highContrast: false,
}

/**
 * Le velocità offerte. Oltre il doppio alcuni browser abbassano il volume o
 * distorcono, e chi ha bisogno di più usa il lettore di schermo di sistema.
 */
export const SPEECH_RATES = [1, 1.25, 1.5, 1.75, 2] as const

/** Come si legge una velocità: «una volta e mezza», non «1.5». */
export const speechRateLabel = (rate: number): string => {
  const labels: Record<string, string> = {
    '1': 'Normale',
    '1.25': 'Un quarto più veloce',
    '1.5': 'Una volta e mezza',
    '1.75': 'Tre quarti più veloce',
    '2': 'Doppia',
  }
  return labels[String(rate)] ?? `${rate}×`
}

export const VERBOSITY_LABELS: Record<Verbosity, string> = {
  essenziale: 'Essenziale',
  normale: 'Normale',
  completa: 'Completa',
}

/**
 * Quante parole al massimo per ciascun livello. Il server ne ha una sua di
 * base (cinquanta): questi numeri la sostituiscono quando la scelta arriva
 * dal telefono.
 */
export const VERBOSITY_WORDS: Record<Verbosity, number> = {
  essenziale: 25,
  normale: 50,
  completa: 90,
}

export const TEXT_SCALE_LABELS: Record<TextScale, string> = {
  normale: 'Normale',
  grande: 'Grande',
  enorme: 'Molto grande',
}

/** Quanto moltiplicare la dimensione della didascalia. */
export const TEXT_SCALE_FACTORS: Record<TextScale, number> = {
  normale: 1,
  grande: 1.35,
  enorme: 1.8,
}

/** Gli intervalli offerti, in secondi. */
export const CAPTION_INTERVALS = [5, 10, 20, 40] as const

export const captionIntervalLabel = (seconds: number): string =>
  seconds >= 60
    ? `Ogni ${Math.round(seconds / 60)} minuti`
    : `Ogni ${seconds} secondi`

export const STORAGE_KEY = 'visioncaption.preferenze.v1'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

const isOneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value)

/**
 * Le preferenze valide ricavate da qualunque cosa sia stata salvata.
 *
 * Un valore fuori posto non azzera le altre scelte: ogni campo torna al
 * suo valore di base da solo. Una versione vecchia dell'applicazione che
 * aveva salvato meno campi continua quindi a funzionare.
 */
export function normalizePreferences(raw: unknown): Preferences {
  const source = (raw ?? {}) as Partial<Record<keyof Preferences, unknown>>
  const rate = Number(source.speechRate)
  const interval = Number(source.captionIntervalSeconds)
  return {
    speechRate: Number.isFinite(rate) ? clamp(rate, 0.5, 2) : DEFAULT_PREFERENCES.speechRate,
    verbosity: isOneOf<Verbosity>(source.verbosity, ['essenziale', 'normale', 'completa'])
      ? source.verbosity
      : DEFAULT_PREFERENCES.verbosity,
    captionIntervalSeconds: Number.isFinite(interval)
      ? clamp(interval, 2, 300)
      : DEFAULT_PREFERENCES.captionIntervalSeconds,
    mode: typeof source.mode === 'string' ? source.mode.trim().slice(0, 64) : '',
    textScale: isOneOf<TextScale>(source.textScale, ['normale', 'grande', 'enorme'])
      ? source.textScale
      : DEFAULT_PREFERENCES.textScale,
    highContrast: source.highContrast === true,
  }
}

export function loadPreferences(storage?: StorageLike | null): Preferences {
  const store = storage ?? safeStorage()
  if (!store) return { ...DEFAULT_PREFERENCES }
  try {
    const saved = store.getItem(STORAGE_KEY)
    if (!saved) return { ...DEFAULT_PREFERENCES }
    return normalizePreferences(JSON.parse(saved))
  } catch {
    // Finestra privata, dati del sito bloccati, JSON rovinato: si riparte dai
    // valori di base invece di mostrare una pagina rotta.
    return { ...DEFAULT_PREFERENCES }
  }
}

export function savePreferences(
  preferences: Preferences,
  storage?: StorageLike | null,
): void {
  const store = storage ?? safeStorage()
  if (!store) return
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch {
    // Lo spazio può essere esaurito o negato: le preferenze valgono per
    // questa sessione e non si perde altro.
  }
}

const safeStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * Le preferenze che cambiano le descrizioni, nella forma che viaggia col
 * fotogramma. Vanno su ogni fotogramma e non in un messaggio a parte perché
 * il server, quando i fotogrammi si accumulano, tiene soltanto l'ultimo: un
 * messaggio di impostazioni finirebbe fra quelli scartati.
 */
export type SessionPreferences = {
  max_words: number
  min_interval_seconds: number
  mode?: string
}

export function sessionPreferences(preferences: Preferences): SessionPreferences {
  const payload: SessionPreferences = {
    max_words: VERBOSITY_WORDS[preferences.verbosity],
    min_interval_seconds: preferences.captionIntervalSeconds,
  }
  if (preferences.mode) payload.mode = preferences.mode
  return payload
}
