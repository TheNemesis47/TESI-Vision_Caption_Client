import { useEffect, useId, useRef, useState } from 'react'

import {
  CAPTION_INTERVALS,
  SPEECH_RATES,
  TEXT_SCALE_LABELS,
  VERBOSITY_LABELS,
  captionIntervalLabel,
  speechRateLabel,
  type Preferences,
  type TextScale,
  type Verbosity,
} from '../domain/preferences'
import {
  DESCRIPTION_MIN_LENGTH,
  createMode,
  type CreatedMode,
} from '../services/modeCreation'
import './SettingsPanel.css'

/**
 * Le impostazioni, a schermo pieno.
 *
 * Non è un pannello con un ingranaggio in un angolo: chi non vede non trova
 * un'icona piccola, e chi è ipovedente non la distingue. È una schermata a
 * elenco con righe alte, gruppi nativi di scelta (le frecce funzionano da
 * sole e il lettore di schermo annuncia «3 di 5»), e nessun tasto «Salva»:
 * ogni scelta vale appena fatta e viene annunciata.
 */

export type CameraMode = { id: string; label: string }

type SettingsPanelProps = {
  preferences: Preferences
  onChange: (patch: Partial<Preferences>) => void
  onClose: () => void
  onRestartTutorial?: () => void
  onSaveLesson?: () => void
  /** Le modalità che il server dichiara di avere. */
  modes?: CameraMode[]
  /** Se il server accetta una modalità nuova dettata a parole. */
  canCreateModes?: boolean
  /** Una modalità appena creata, per chi tiene l'elenco. */
  onModeCreated?: (mode: CreatedMode) => void
  /** Quante descrizioni ci sono da salvare; zero nasconde il pulsante. */
  savedDescriptions?: number
}

type ChoiceGroupProps<T extends string | number> = {
  legend: string
  hint?: string
  name: string
  value: T
  options: { value: T; label: string }[]
  onSelect: (value: T) => void
}

function ChoiceGroup<T extends string | number>({
  legend,
  hint,
  name,
  value,
  options,
  onSelect,
}: ChoiceGroupProps<T>) {
  const hintId = useId()
  return (
    <fieldset className="settings-group">
      <legend className="settings-legend">{legend}</legend>
      {hint && (
        <p className="settings-hint" id={hintId}>
          {hint}
        </p>
      )}
      <div className="settings-choices" aria-describedby={hint ? hintId : undefined}>
        {options.map((option) => (
          <label
            key={String(option.value)}
            className={`settings-choice${option.value === value ? ' is-selected' : ''}`}
          >
            <input
              type="radio"
              name={name}
              value={String(option.value)}
              checked={option.value === value}
              onChange={() => onSelect(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function SettingsPanel({
  preferences,
  onChange,
  onClose,
  onRestartTutorial,
  onSaveLesson,
  modes = [],
  canCreateModes = false,
  onModeCreated,
  savedDescriptions = 0,
}: SettingsPanelProps) {
  const titleId = useId()
  const descriptionId = useId()
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)
  const [creationMessage, setCreationMessage] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Il fuoco entra nel pannello: senza questo, chi usa la tastiera o
  // VoiceOver resterebbe sul pulsante che lo ha aperto, dietro la schermata.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // Esc chiude, e il fuoco non esce dal pannello finché è aperto: fuori non
  // c'è niente da raggiungere, e uscirne senza vedere è non tornare più.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button, input, [href], [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="settings-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      ref={panelRef}
    >
      <div className="settings-sheet">
        <header className="settings-header">
          <h2 className="settings-title" id={titleId}>
            Impostazioni
          </h2>
          <button
            type="button"
            className="settings-close"
            onClick={onClose}
            ref={closeRef}
          >
            Chiudi
          </button>
        </header>

        <div className="settings-body">
          <ChoiceGroup
            legend="Velocità della voce"
            hint="Vale anche sulla descrizione che sta parlando."
            name="velocita"
            value={preferences.speechRate}
            options={SPEECH_RATES.map((rate) => ({
              value: rate as number,
              label: speechRateLabel(rate),
            }))}
            onSelect={(speechRate) => onChange({ speechRate })}
          />

          <ChoiceGroup
            legend="Quanto dice"
            hint="Essenziale è più corta e arriva prima."
            name="verbosita"
            value={preferences.verbosity}
            options={(Object.keys(VERBOSITY_LABELS) as Verbosity[]).map((key) => ({
              value: key,
              label: VERBOSITY_LABELS[key],
            }))}
            onSelect={(verbosity) => onChange({ verbosity })}
          />

          <ChoiceGroup
            legend="Ogni quanto parla"
            name="intervallo"
            value={preferences.captionIntervalSeconds}
            options={CAPTION_INTERVALS.map((seconds) => ({
              value: seconds as number,
              label: captionIntervalLabel(seconds),
            }))}
            onSelect={(captionIntervalSeconds) => onChange({ captionIntervalSeconds })}
          />

          {modes.length > 0 && (
            <ChoiceGroup
              legend="Modalità"
              hint="Cambia cosa viene descritto e cosa viene taciuto."
              name="modalita"
              value={preferences.mode}
              options={[
                { value: '', label: 'Come decide il server' },
                ...modes.map((mode) => ({ value: mode.id, label: mode.label })),
              ]}
              onSelect={(mode) => onChange({ mode })}
            />
          )}

          <ChoiceGroup
            legend="Dimensione del testo"
            hint="La didascalia si può leggere, non solo ascoltare."
            name="testo"
            value={preferences.textScale}
            options={(Object.keys(TEXT_SCALE_LABELS) as TextScale[]).map((key) => ({
              value: key,
              label: TEXT_SCALE_LABELS[key],
            }))}
            onSelect={(textScale) => onChange({ textScale })}
          />

          <div className="settings-group">
            <button
              type="button"
              className="settings-toggle"
              aria-pressed={preferences.highContrast}
              onClick={() => onChange({ highContrast: !preferences.highContrast })}
            >
              <span className="settings-toggle-label">Contrasto alto</span>
              <span className="settings-toggle-state">
                {preferences.highContrast ? 'Attivo' : 'Non attivo'}
              </span>
            </button>
            <p className="settings-hint">
              Giallo su nero pieno, senza trasparenze sopra l'immagine.
            </p>
          </div>

          {onSaveLesson && savedDescriptions > 0 && (
            <div className="settings-group">
              <button type="button" className="settings-action" onClick={onSaveLesson}>
                Salva le descrizioni
              </button>
              <p className="settings-hint">
                {savedDescriptions === 1
                  ? 'Una descrizione da rileggere più tardi.'
                  : `${savedDescriptions} descrizioni da rileggere più tardi.`}
              </p>
            </div>
          )}

          {canCreateModes && (
            <div className="settings-group">
              <label className="settings-legend" htmlFor={descriptionId}>
                Una modalità tua
              </label>
              <p className="settings-hint">
                Racconta in una frase dove la usi e cosa ti serve sapere. Per
                dettarla, usa il microfono della tastiera.
              </p>
              <textarea
                id={descriptionId}
                className="settings-field"
                rows={3}
                value={description}
                maxLength={400}
                disabled={creating}
                placeholder="Lavoro in officina, dimmi solo gli attrezzi e dove stanno"
                onChange={(event) => setDescription(event.target.value)}
              />
              <button
                type="button"
                className="settings-action"
                disabled={creating || description.trim().length < DESCRIPTION_MIN_LENGTH}
                onClick={async () => {
                  setCreating(true)
                  setCreationMessage('Sto scrivendo la modalità…')
                  const esito = await createMode(description)
                  setCreating(false)
                  if (esito.ok) {
                    // Il nome della modalità nuova è la conferma: chi ascolta
                    // sente che esiste e come si chiama.
                    setCreationMessage(`Modalità «${esito.mode.label}» creata.`)
                    setDescription('')
                    onModeCreated?.(esito.mode)
                  } else {
                    setCreationMessage(esito.message)
                  }
                }}
              >
                {creating ? 'Sto scrivendo…' : 'Crea la modalità'}
              </button>
              {/* Il messaggio è annunciato: una modalità creata o un errore
                  non si capiscono guardando il campo svuotarsi. */}
              <p className="settings-hint" role="status" aria-live="polite">
                {creationMessage}
              </p>
            </div>
          )}

          {onRestartTutorial && (
            <div className="settings-group">
              <button
                type="button"
                className="settings-action"
                onClick={onRestartTutorial}
              >
                Rivedi la guida
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
