import {
  facingToggleLabel,
  nextFacing,
  type CameraFacing,
  type ZoomOption,
} from '../domain/cameraZoom'
import './CameraControls.css'

type CameraControlsProps = {
  facing: CameraFacing
  onFacingChange: (facing: CameraFacing) => void
  zoom: number
  options: ZoomOption[]
  onZoomChange: (factor: number) => void
  disabled?: boolean
}

/**
 * I comandi della fotocamera messi dove il telefono li mette: i livelli di
 * zoom in fila sopra il pulsante di avvio, e accanto il pulsante per girare
 * l'obiettivo. Sono gli stessi due gesti dell'app Fotocamera, così chi li ha
 * già usati non deve impararli di nuovo.
 */
export default function CameraControls({
  facing,
  onFacingChange,
  zoom,
  options,
  onZoomChange,
  disabled = false,
}: CameraControlsProps) {
  return (
    <div className="camera-zoombar">
      <div className="zoom-levels" role="group" aria-label="Livello di zoom">
        {options.map((option) => {
          const selected = option.factor === zoom
          return (
            <button
              key={option.factor}
              type="button"
              className={`zoom-level${selected ? ' is-selected' : ''}`}
              onClick={() => onZoomChange(option.factor)}
              disabled={disabled}
              aria-pressed={selected}
              aria-label={option.spoken}
            >
              <span aria-hidden="true">{option.label}</span>
            </button>
          )
        })}
      </div>

      <button
        type="button"
        className="camera-flip"
        onClick={() => onFacingChange(nextFacing(facing))}
        disabled={disabled}
        aria-label={facingToggleLabel(facing)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 7a5 5 0 0 1 4.9 6h2.04A7 7 0 0 0 12 5V2.5L8.5 6 12 9.5V7Zm0 10a5 5 0 0 1-4.9-6H5.06A7 7 0 0 0 12 19v2.5L15.5 18 12 14.5V17Z" />
        </svg>
      </button>
    </div>
  )
}
