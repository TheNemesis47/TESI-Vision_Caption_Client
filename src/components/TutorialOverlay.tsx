import { useCallback, useEffect, useRef, useState } from 'react'
import './TutorialOverlay.css'
import { spokenText, type TutorialStep } from '../domain/tutorial'
import type { CaptionMode } from '../domain/visionProtocol'

type TutorialOverlayProps = {
  step: TutorialStep
  stepIndex: number
  stepCount: number
  isVoiceEnabled: boolean
  captionMode: CaptionMode
  /** Vero mentre la fotocamera sta guardando, nei passi di prova. */
  isPracticeRunning: boolean
  /** L'ultima descrizione sentita: nei passi di prova è il riscontro. */
  practiceCaption?: string
  onModeChange: (mode: CaptionMode) => void
  onPracticeStart: () => void
  onNext: () => void
  onSkip: () => void
  onRepeat: () => void
  onToggleVoice: () => void
}

/**
 * Quanto si aspetta una descrizione prima di sbloccare comunque il passo.
 * Senza questa via d'uscita, un server lento o una scena che non ha niente da
 * dire lascerebbero la guida ferma su un pulsante spento.
 */
const PRACTICE_TIMEOUT_MS = 15_000

export default function TutorialOverlay({
  step,
  stepIndex,
  stepCount,
  isVoiceEnabled,
  captionMode,
  isPracticeRunning,
  practiceCaption,
  onModeChange,
  onPracticeStart,
  onNext,
  onSkip,
  onRepeat,
  onToggleVoice,
}: TutorialOverlayProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [practiceTimedOut, setPracticeTimedOut] = useState(false)

  // Il fuoco torna sul titolo a ogni passo: è così che un lettore di schermo
  // annuncia il passo nuovo senza che l'utente debba cercarlo.
  useEffect(() => {
    headingRef.current?.focus()
  }, [stepIndex])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onSkip()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onSkip])

  const isPractice = Boolean(step.practice)
  const heard = isPractice && Boolean(practiceCaption?.trim())

  useEffect(() => {
    if (!isPracticeRunning || heard) return
    const timer = window.setTimeout(
      () => setPracticeTimedOut(true),
      PRACTICE_TIMEOUT_MS,
    )
    return () => window.clearTimeout(timer)
  }, [heard, isPracticeRunning])

  // L'attesa si azzera da chi preme, non da un effetto: così il passo
  // seguente non eredita l'attesa di quello appena finito.
  const startPractice = useCallback(() => {
    setPracticeTimedOut(false)
    onPracticeStart()
  }, [onPracticeStart])

  const goNext = useCallback(() => {
    setPracticeTimedOut(false)
    onNext()
  }, [onNext])
  // Finché la prova non è stata fatta il pulsante è Prova: premerlo ferma la
  // voce della guida e accende la fotocamera, così la descrizione non arriva
  // mentre la guida sta ancora parlando.
  const waitingForPractice = isPractice && !heard && !practiceTimedOut
  const practiceStatus = heard
    ? `Hai sentito: ${practiceCaption}`
    : practiceTimedOut
      ? 'Non è arrivata nessuna descrizione: premi Riprova oppure vai avanti.'
      : isPracticeRunning
        ? 'In ascolto: tieni il telefono fermo e aspetta la descrizione.'
        : 'Quando sei pronto premi Prova.'

  return (
    <div
      className={`tutorial-backdrop${isPractice ? ' is-practice' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-title"
    >
      <div className="tutorial-card">
        <div className="tutorial-topline">
          <span className="tutorial-progress">
            Passo {stepIndex + 1} di {stepCount}
          </span>
          <button className="tutorial-skip" type="button" onClick={onSkip}>
            Salta la guida
          </button>
        </div>

        <h2 className="tutorial-title" id="tutorial-title" ref={headingRef} tabIndex={-1}>
          {step.title}
        </h2>
        <p className="tutorial-body">{step.body}</p>

        {isPractice && (
          // aria-live: chi non vede deve sapere che la descrizione è
          // arrivata anche quando la voce della guida è spenta.
          <p
            className={`tutorial-practice${heard ? ' is-heard' : ''}`}
            role="status"
            aria-label="Stato della prova"
            aria-live="polite"
          >
            {practiceStatus}
          </p>
        )}

        {step.control === 'mode' && (
          <fieldset className="tutorial-control tutorial-modes">
            <legend>Modalità</legend>
            <label className={captionMode === 'AUTO' ? 'is-selected' : undefined}>
              <input
                type="radio"
                name="tutorial-caption-mode"
                value="AUTO"
                checked={captionMode === 'AUTO'}
                onChange={() => onModeChange('AUTO')}
              />
              Automatica
            </label>
            <label className={captionMode === 'POINTING' ? 'is-selected' : undefined}>
              <input
                type="radio"
                name="tutorial-caption-mode"
                value="POINTING"
                checked={captionMode === 'POINTING'}
                onChange={() => onModeChange('POINTING')}
              />
              Puntamento
            </label>
          </fieldset>
        )}

        <div className="tutorial-actions">
          {waitingForPractice ? (
            <button
              className="tutorial-next"
              type="button"
              onClick={startPractice}
              disabled={isPracticeRunning}
            >
              {isPracticeRunning ? 'In ascolto…' : (step.start ?? 'Prova')}
            </button>
          ) : (
            <button className="tutorial-next" type="button" onClick={goNext}>
              {step.next}
            </button>
          )}
          {practiceTimedOut && !heard && (
            <button className="tutorial-secondary" type="button" onClick={startPractice}>
              Riprova
            </button>
          )}
          {spokenText(step) && !isPracticeRunning && (
            <button className="tutorial-secondary" type="button" onClick={onRepeat}>
              Ripeti
            </button>
          )}
          <button
            className="tutorial-secondary"
            type="button"
            onClick={onToggleVoice}
            aria-pressed={isVoiceEnabled}
          >
            {isVoiceEnabled ? 'Spegni la voce guida' : 'Accendi la voce guida'}
          </button>
        </div>
      </div>
    </div>
  )
}
