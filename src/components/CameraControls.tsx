import {
  FACING_LABELS,
  facingToggleLabel,
  nextFacing,
  stepZoom,
  zoomLabel,
  type CameraFacing,
  type ZoomRange,
} from '../domain/cameraControls'
import './CameraControls.css'

type CameraControlsProps = {
  facing: CameraFacing
  onFacingChange: (facing: CameraFacing) => void
  zoom: number
  zoomRange: ZoomRange | null
  onZoomChange: (zoom: number) => void
  disabled?: boolean
}

/**
 * I due comandi che servono davvero: da che parte guarda la fotocamera e
 * quanto ingrandisce. L'elenco completo degli obiettivi resta altrove, per
 * chi lo vuole: su un telefono recente sono dieci voci dal nome quasi
 * identico, e letti da una sintesi vocale non aiutano a scegliere.
 */
export default function CameraControls({
  facing,
  onFacingChange,
  zoom,
  zoomRange,
  onZoomChange,
  disabled = false,
}: CameraControlsProps) {
  return (
    <div className="camera-controls">
      <button
        type="button"
        className="camera-facing"
        onClick={() => onFacingChange(nextFacing(facing))}
        disabled={disabled}
        aria-label={facingToggleLabel(facing)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 6.5 16 4h2l1.5 2.5H21a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h11.5ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        </svg>
        <span>{FACING_LABELS[facing]}</span>
      </button>

      {zoomRange && (
        <div className="camera-zoom" role="group" aria-label="Zoom">
          <button
            type="button"
            onClick={() => onZoomChange(stepZoom(zoom, zoomRange, -1))}
            disabled={disabled || zoom <= zoomRange.min}
            aria-label="Riduci lo zoom"
          >
            −
          </button>
          <input
            type="range"
            min={zoomRange.min}
            max={zoomRange.max}
            step={zoomRange.step}
            value={zoom}
            disabled={disabled}
            onChange={(event) => onZoomChange(Number(event.target.value))}
            aria-label="Zoom"
            aria-valuetext={zoomLabel(zoom)}
          />
          <button
            type="button"
            onClick={() => onZoomChange(stepZoom(zoom, zoomRange, 1))}
            disabled={disabled || zoom >= zoomRange.max}
            aria-label="Aumenta lo zoom"
          >
            +
          </button>
          <span className="camera-zoom-value" aria-hidden="true">
            {zoomLabel(zoom)}
          </span>
        </div>
      )}
    </div>
  )
}
