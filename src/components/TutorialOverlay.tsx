import { useEffect, useRef } from 'react'
import './TutorialOverlay.css'
import type { TutorialStep } from '../domain/tutorial'
import type { CaptionMode } from '../domain/visionProtocol'
import type { CameraDevice } from '../hooks/useCameraDevices'

type TutorialOverlayProps = {
  step: TutorialStep
  stepIndex: number
  stepCount: number
  isVoiceEnabled: boolean
  cameraDevices: CameraDevice[]
  selectedCameraId: string
  captionMode: CaptionMode
  onCameraChange: (deviceId: string) => void
  onModeChange: (mode: CaptionMode) => void
  onNext: () => void
  onSkip: () => void
  onRepeat: () => void
  onToggleVoice: () => void
}

export default function TutorialOverlay({
  step,
  stepIndex,
  stepCount,
  isVoiceEnabled,
  cameraDevices,
  selectedCameraId,
  captionMode,
  onCameraChange,
  onModeChange,
  onNext,
  onSkip,
  onRepeat,
  onToggleVoice,
}: TutorialOverlayProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)

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

  return (
    <div
      className="tutorial-backdrop"
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

        {step.control === 'camera' && (
          <div className="tutorial-control">
            <label htmlFor="tutorial-camera">Fotocamera</label>
            <select
              id="tutorial-camera"
              value={selectedCameraId}
              onChange={(event) => onCameraChange(event.target.value)}
              disabled={cameraDevices.length === 0}
            >
              {cameraDevices.length === 0 ? (
                <option value="">Ricerca fotocamere…</option>
              ) : (
                cameraDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))
              )}
            </select>
          </div>
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
          <button className="tutorial-next" type="button" onClick={onNext}>
            {step.next}
          </button>
          {step.voice && (
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
