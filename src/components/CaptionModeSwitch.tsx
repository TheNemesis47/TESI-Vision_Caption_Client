import type { CaptionMode } from '../domain/visionProtocol'
import './CaptionModeSwitch.css'

type CaptionModeSwitchProps = {
  value: CaptionMode
  onChange: (mode: CaptionMode) => void
  disabled?: boolean
}

const MODE_CONTENT: Record<
  CaptionMode,
  { label: string; shortLabel: string; description: string }
> = {
  AUTO: {
    label: 'Automatica',
    shortLabel: 'AUTO',
    description: 'Descrive automaticamente i cambiamenti della scena',
  },
  POINTING: {
    label: 'Puntamento',
    shortLabel: 'POINTING',
    description: 'Descrive quando mantieni il gesto di puntamento',
  },
}

export default function CaptionModeSwitch({
  value,
  onChange,
  disabled = false,
}: CaptionModeSwitchProps) {
  const selectedMode = MODE_CONTENT[value]

  return (
    <fieldset className="caption-mode-fieldset" disabled={disabled}>
      <legend>Modalità descrizione</legend>
      <div className="caption-mode-options">
        {(Object.keys(MODE_CONTENT) as CaptionMode[]).map((mode) => {
          const content = MODE_CONTENT[mode]
          return (
            <label
              className={`caption-mode-option ${value === mode ? 'is-selected' : ''}`}
              key={mode}
            >
              <input
                type="radio"
                name="caption-mode"
                value={mode}
                aria-label={`${content.shortLabel}, ${content.label}`}
                checked={value === mode}
                onChange={() => onChange(mode)}
              />
              <span className="caption-mode-option-copy">
                <strong>{content.shortLabel}</strong>
                <span>{content.label}</span>
              </span>
              <span className="caption-mode-check" aria-hidden="true">
                {value === mode ? '✓' : ''}
              </span>
            </label>
          )
        })}
      </div>
      <p className="caption-mode-description">{selectedMode.description}</p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        Modalità descrizione: {selectedMode.label}
      </p>
    </fieldset>
  )
}
