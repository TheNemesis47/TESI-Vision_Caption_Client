import type { CaptionMode } from '../domain/visionProtocol'

/**
 * Dice ad alta voce in quale modalità si è appena entrati.
 *
 * Il cambio di modalità con il gesto a V non si vede e non si sente: senza
 * un riscontro, chi non vede non sa se il gesto è stato capito e lo ripete,
 * facendo rimbalzare le modalità. La frase è brevissima apposta, perché
 * arriva mentre la persona sta ancora guardando l'oggetto che le interessa.
 *
 * Usa la voce di sistema, non quella del server: deve partire subito e
 * funzionare anche quando la rete è lenta.
 */
export const MODE_ANNOUNCEMENTS: Record<CaptionMode, string> = {
  AUTO: 'Modalità automatica',
  POINTING: 'Modalità puntamento',
}

export function announceMode(mode: CaptionMode): void {
  if (
    typeof speechSynthesis === 'undefined' ||
    typeof SpeechSynthesisUtterance === 'undefined'
  ) {
    return
  }
  const utterance = new SpeechSynthesisUtterance(MODE_ANNOUNCEMENTS[mode])
  utterance.lang = 'it-IT'
  try {
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  } catch {
    // Una voce di sistema assente non deve fermare il cambio di modalità.
  }
}
