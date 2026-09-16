import type { TutorialStep } from '../domain/tutorial'

/**
 * La voce della guida. Prima prova la traccia pre-generata, che ha lo stesso
 * timbro delle descrizioni; se manca o il browser la rifiuta ripiega sulla
 * sintesi di sistema, che è meno bella ma c'è sempre.
 *
 * Su iPhone l'audio parte solo dentro un gesto dell'utente: per questo il
 * passo d'apertura non parla e la prima traccia suona alla pressione del
 * pulsante, non al caricamento della pagina.
 */
export class TutorialVoice {
  private audio: HTMLAudioElement | null = null
  private utterance: SpeechSynthesisUtterance | null = null

  async speak(step: TutorialStep): Promise<void> {
    this.stop()
    if (!step.voice) return

    if (step.audio && typeof Audio !== 'undefined') {
      const audio = new Audio(step.audio)
      this.audio = audio
      try {
        await audio.play()
        return
      } catch {
        // Traccia assente o riproduzione rifiutata: resta la sintesi di sistema.
        this.audio = null
      }
    }

    this.speakWithSystemVoice(step.voice)
  }

  stop(): void {
    if (this.audio) {
      this.audio.pause()
      this.audio.currentTime = 0
      this.audio = null
    }
    if (this.utterance && typeof speechSynthesis !== 'undefined') {
      speechSynthesis.cancel()
      this.utterance = null
    }
  }

  private speakWithSystemVoice(text: string): void {
    if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') {
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'it-IT'
    this.utterance = utterance
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
  }
}
