/**
 * La guida vocale della prima apertura. Chi l'ha già vista non deve
 * risentirla, e la memoria di quel fatto sta nel browser di chi apre: un
 * registro sul server non saprebbe distinguere due utenti, perché dietro il
 * tunnel ogni connessione arriva da 127.0.0.1, e sul 5G migliaia di persone
 * escono dallo stesso indirizzo.
 */

import type { CaptionMode } from './visionProtocol'

export const TUTORIAL_VERSION = 'v4'
const SEEN_KEY = 'visioncaption.tutorial'
const VOICE_KEY = 'visioncaption.tutorial.voice'

export type TutorialStep = {
  id: string
  /** Titolo che prende il fuoco a ogni passo: è la prima cosa che un lettore di schermo annuncia. */
  title: string
  /**
   * Il testo del passo. La voce legge esattamente questo, preceduto dal
   * titolo: una frase scritta e una pronunciata che differiscono mandano
   * chi ascolta a cercare un pulsante che non esiste.
   */
  body: string
  /** Traccia pre-generata con la stessa voce dell'applicazione. */
  audio?: string
  control?: 'mode'
  /**
   * Passo di prova: premendo il pulsante la fotocamera guarda davvero, in
   * questa modalità, e la guida tace finché la descrizione non è arrivata.
   */
  practice?: CaptionMode
  /** Etichetta del pulsante che porta al passo seguente. */
  next: string
  /** Etichetta del pulsante che fa partire la prova, nei passi di prova. */
  start?: string
}

/** Quello che la voce pronuncia: il titolo e poi il testo, parola per parola. */
export const spokenText = (step: TutorialStep) =>
  step.id === 'apertura' ? '' : `${step.title}. ${step.body}`

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'apertura',
    title: 'Guida rapida',
    body:
      'Ti spiego come funziona in un minuto. Se usi già un lettore di schermo, ' +
      'premi Spegni la voce guida, qui sotto. Per saltarla premi Salta la guida, in alto.',
    next: 'Ascolta la guida',
  },
  {
    id: 'fotocamera',
    title: 'Primo passo: la fotocamera',
    body:
      'Si usa la fotocamera posteriore, quella che riprende quello che hai davanti. ' +
      'In fondo allo schermo, sopra il pulsante Avvia, ci sono i livelli di zoom: ' +
      'premi 1× per la ripresa normale e 2× per ingrandire quello che è lontano, ' +
      'per esempio una slide o un cartello. Accanto ai numeri c’è il pulsante tondo ' +
      'per girare la fotocamera verso di te. Ora premi Avanti.',
    audio: '/tutorial/fotocamera.mp3',
    next: 'Avanti',
  },
  {
    id: 'modalita',
    title: 'Secondo passo: le due modalità',
    body:
      'Automatica descrive l’ambiente da sola, mentre cammini. Puntamento descrive ' +
      'soltanto l’oggetto che indichi con il dito, ed è quella che serve per farsi ' +
      'leggere un’etichetta, un cartello o un menu. Le provi tutte e due adesso, ' +
      'una alla volta. Premi Avanti.',
    audio: '/tutorial/modalita.mp3',
    control: 'mode',
    next: 'Avanti',
  },
  {
    id: 'prova-automatica',
    title: 'Terzo passo: prova la modalità automatica',
    body:
      'Punta il telefono verso quello che hai davanti e tienilo fermo. Quando sei ' +
      'pronto premi Prova: dopo un paio di secondi senti la descrizione. Poi il ' +
      'pulsante diventa Avanti.',
    audio: '/tutorial/prova-automatica.mp3',
    practice: 'AUTO',
    start: 'Prova',
    next: 'Avanti',
  },
  {
    id: 'prova-puntamento',
    title: 'Quarto passo: prova a indicare col dito',
    body:
      'Tieni il telefono con una mano. Premi Prova, poi indica un oggetto davanti a ' +
      'te con l’indice teso, fermo un attimo: senti la descrizione di quello che ' +
      'indichi. Poi il pulsante diventa Avanti.',
    audio: '/tutorial/prova-puntamento.mp3',
    practice: 'POINTING',
    start: 'Prova',
    next: 'Avanti',
  },
  {
    id: 'avvio',
    title: 'Sei pronto',
    body:
      'Hai provato tutte e due le modalità. Premi Ho capito per chiudere la guida. ' +
      'Nella schermata trovi il pulsante Avvia: premilo per far partire le descrizioni ' +
      'e premilo di nuovo, quando diventa Arresta, per fermarle. Per riascoltare questa ' +
      'guida c’è il pulsante Rivedi la guida, in alto a sinistra.',
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
