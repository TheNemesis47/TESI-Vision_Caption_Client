/**
 * La guida vocale della prima apertura. Chi l'ha già vista non deve
 * risentirla, e la memoria di quel fatto sta nel browser di chi apre: un
 * registro sul server non saprebbe distinguere due utenti, perché dietro il
 * tunnel ogni connessione arriva da 127.0.0.1, e sul 5G migliaia di persone
 * escono dallo stesso indirizzo.
 */

export const TUTORIAL_VERSION = 'v2'
const SEEN_KEY = 'visioncaption.tutorial'
const VOICE_KEY = 'visioncaption.tutorial.voice'

export type TutorialStep = {
  id: string
  /** Titolo che prende il fuoco a ogni passo: è la prima cosa che un lettore di schermo annuncia. */
  title: string
  body: string
  /** Frase pronunciata dalla voce guida; vuota sul passo d'apertura, che non può ancora suonare. */
  voice: string
  /** Traccia pre-generata con la stessa voce dell'applicazione. */
  audio?: string
  control?: 'camera' | 'mode'
  /** Etichetta del pulsante che porta al passo seguente. */
  next: string
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'apertura',
    title: 'Guida rapida',
    body:
      'Ti spiego come funziona in un minuto. Se usi già un lettore di schermo, ' +
      'spegni la voce guida: il pulsante è qui sotto.',
    voice: '',
    next: 'Ascolta la guida',
  },
  {
    id: 'fotocamera',
    title: 'Primo passo: la fotocamera',
    body:
      'Scegli quale fotocamera usare. Di solito è quella posteriore, cioè quella ' +
      'che riprende quello che hai davanti.',
    voice:
      'Primo passo: la fotocamera. Scegli quale usare: di solito è quella posteriore, ' +
      'cioè quella che riprende quello che hai davanti. Poi premi Avanti.',
    audio: '/tutorial/fotocamera.mp3',
    control: 'camera',
    next: 'Avanti',
  },
  {
    id: 'modalita',
    title: 'Secondo passo: le due modalità',
    body:
      'Automatica descrive l’ambiente da sola, mentre cammini. Puntamento descrive ' +
      'soltanto l’oggetto che indichi con il dito, ed è quella che serve per farsi ' +
      'leggere un’etichetta, un cartello o un menu.',
    voice:
      'Secondo passo: le due modalità. Automatica descrive l’ambiente da sola, mentre ' +
      'cammini. Puntamento descrive soltanto l’oggetto che indichi con il dito, ed è ' +
      'quella che serve per farsi leggere un’etichetta, un cartello o un menu. ' +
      'Scegli quella che preferisci, potrai cambiarla quando vuoi, poi premi Avanti.',
    audio: '/tutorial/modalita.mp3',
    control: 'mode',
    next: 'Avanti',
  },
  {
    id: 'avvio',
    title: 'Sei pronto',
    body:
      'Premi Ho capito per chiudere la guida. Nella schermata trovi il pulsante ' +
      'Avvia: premilo per far partire le descrizioni e premilo di nuovo, quando ' +
      'diventa Arresta, per fermarle. Per riascoltare questa guida c’è il pulsante ' +
      'Rivedi la guida, in alto.',
    voice:
      'Sei pronto. Premi Ho capito per chiudere la guida. Nella schermata trovi il ' +
      'pulsante Avvia: premilo per far partire le descrizioni, e premilo di nuovo, ' +
      'quando diventa Arresta, per fermarle. Per riascoltare questa guida c’è il ' +
      'pulsante Rivedi la guida, in alto.',
    audio: '/tutorial/avvio.mp3',
    next: 'Ho capito',
  },
]

/**
 * Ogni accesso è protetto: in navigazione privata la lettura può sollevare, e
 * in quel caso la guida riparte. Mostrarla di nuovo è l'errore innocuo; il
 * pulsante per saltarla è il primo che si incontra.
 */
const readStorage = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

const writeStorage = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Niente da fare: la guida ricomparirà alla prossima apertura.
  }
}

/** Una guida aggiornata torna a mostrarsi: basta cambiare TUTORIAL_VERSION. */
export const hasSeenTutorial = () => readStorage(SEEN_KEY) === TUTORIAL_VERSION

export const rememberTutorialSeen = () => writeStorage(SEEN_KEY, TUTORIAL_VERSION)

export const isGuideVoiceEnabled = () => readStorage(VOICE_KEY) !== 'off'

export const rememberGuideVoice = (enabled: boolean) =>
  writeStorage(VOICE_KEY, enabled ? 'on' : 'off')
