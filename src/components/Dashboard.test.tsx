import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import { rememberTutorialSeen } from '../domain/tutorial'

const videoRef = createRef<HTMLVideoElement>()

const webcam = {
  zoomRange: null as { min: number; max: number; step: number } | null,
  applyZoom: vi.fn(async (value: number) => value),
  facing: '' as string,
}

vi.mock('../hooks/useWebcam', () => ({
  useWebcam: (options: { facing?: string } = {}) => {
    webcam.facing = options.facing ?? ''
    return {
      videoRef,
      isActive: true,
      isMirrored: false,
      activeDeviceId: 'camera-back',
      error: null,
      zoomRange: webcam.zoomRange,
      applyZoom: webcam.applyZoom,
    }
  },
}))

vi.mock('../hooks/useCameraDevices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useCameraDevices')>()
  return {
    ...actual,
    useCameraDevices: () => ({
      devices: [
        { deviceId: 'camera-back', label: 'Fotocamera posteriore' },
        { deviceId: 'camera-front', label: 'Fotocamera anteriore' },
      ],
      error: null,
      refresh: vi.fn(),
    }),
  }
})

vi.mock('../hooks/useServerConnection', () => ({
  useServerConnection: () => ({
    status: 'closed',
    webSocketUrl: 'wss://vision.example/ws/vision',
    isConnected: false,
    sendJson: vi.fn(() => ({ sent: false, bufferedAmount: 0, reason: 'not-open' })),
    getBufferedAmount: vi.fn(() => 0),
  }),
}))

describe('Dashboard end-user', () => {
  beforeEach(() => {
    videoRef.current = null
    webcam.zoomRange = null
    webcam.applyZoom.mockClear()
    window.localStorage.clear()
    // La vista ordinaria è quella di chi la guida l'ha già vista.
    rememberTutorialSeen()
  })

  it('monta solo anteprima e controlli essenziali, senza renderer diagnostici', () => {
    const { container } = render(<Dashboard />)

    expect(screen.getByLabelText('Anteprima fotocamera')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Auto' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Punta' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Avvia' })).toBeInTheDocument()
    expect(screen.getByText('Server')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Altri obiettivi della fotocamera' })).toHaveValue(
      'camera-back',
    )

    expect(container.querySelector('.detections-layer')).not.toBeInTheDocument()
    expect(container.querySelector('.pointing-overlay-layer')).not.toBeInTheDocument()
    expect(container.querySelector('.hand-landmarks-layer')).not.toBeInTheDocument()
    expect(container.querySelector('.bounding-box')).not.toBeInTheDocument()
    expect(container.querySelector('.log-panel')).not.toBeInTheDocument()
    expect(container.querySelector('canvas')).not.toBeInTheDocument()
  })

  it('permette di scegliere la fotocamera prima dell’analisi', async () => {
    const user = userEvent.setup()
    render(<Dashboard />)
    const cameraSelect = screen.getByRole('combobox', { name: 'Altri obiettivi della fotocamera' })

    await user.selectOptions(cameraSelect, 'camera-front')

    expect(cameraSelect).toHaveValue('camera-front')
  })
})

describe('Dashboard e la guida', () => {
  beforeEach(() => {
    videoRef.current = null
    window.localStorage.clear()
  })

  it('alla prima apertura la guida si presenta da sola', () => {
    render(<Dashboard />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Guida rapida' })).toBeInTheDocument()
  })

  it('saltata una volta non torna, e il pulsante con il libro la riapre', async () => {
    const user = userEvent.setup()
    const { unmount } = render(<Dashboard />)

    await user.click(screen.getByRole('button', { name: 'Salta la guida' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    unmount()
    render(<Dashboard />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Rivedi la guida' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})


describe('comandi della fotocamera', () => {
  beforeEach(() => {
    videoRef.current = null
    window.localStorage.clear()
    rememberTutorialSeen()
    webcam.zoomRange = null
    webcam.applyZoom.mockClear()
  })

  it('parte dalla posteriore e il pulsante dice dove si va', async () => {
    render(<Dashboard />)

    const toggle = screen.getByRole('button', {
      name: 'Passa alla fotocamera frontale',
    })
    expect(toggle).toHaveTextContent('Fotocamera posteriore')
    expect(webcam.facing).toBe('environment')

    await userEvent.click(toggle)

    expect(webcam.facing).toBe('user')
    expect(
      screen.getByRole('button', { name: 'Passa alla fotocamera posteriore' }),
    ).toHaveTextContent('Fotocamera frontale')
  })

  it('lo zoom non si mostra se l obiettivo non lo dichiara', () => {
    render(<Dashboard />)

    expect(screen.queryByRole('group', { name: 'Zoom' })).not.toBeInTheDocument()
  })

  it('con lo zoom disponibile i pulsanti lo spostano davvero', async () => {
    webcam.zoomRange = { min: 1, max: 3, step: 0.5 }
    render(<Dashboard />)

    expect(screen.getByRole('group', { name: 'Zoom' })).toBeInTheDocument()
    const slider = screen.getByRole('slider', { name: 'Zoom' })
    expect(slider).toHaveAttribute('aria-valuetext', 'Zoom 1×')
    // Al minimo della corsa non si può ridurre oltre.
    expect(screen.getByRole('button', { name: 'Riduci lo zoom' })).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Aumenta lo zoom' }))

    expect(webcam.applyZoom).toHaveBeenCalledWith(1.5)
    expect(screen.getByRole('slider', { name: 'Zoom' })).toHaveAttribute(
      'aria-valuetext',
      'Zoom 1,5×',
    )
  })
})

describe('prova guidata dentro il tutorial', () => {
  beforeEach(() => {
    videoRef.current = null
    window.localStorage.clear()
    webcam.zoomRange = null
    webcam.applyZoom.mockClear()
    // Qui la guida non è stata vista: si apre da sola.
  })

  const advance = async (label: string) => {
    await userEvent.click(screen.getByRole('button', { name: label }))
  }

  it('fa provare prima l automatica e poi il puntamento, con la fotocamera accesa', async () => {
    render(<Dashboard />)

    await advance('Ascolta la guida')
    await advance('Avanti') // fotocamera
    await advance('Avanti') // modalità

    expect(
      screen.getByRole('heading', { name: /prova la modalità automatica/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('status', { name: 'Stato della prova' }),
    ).toHaveTextContent('In ascolto')
    expect(screen.getByRole('radio', { name: 'Auto' })).toBeChecked()
    // La cattura parte da sola: la prova non si fa a fotocamera spenta.
    expect(screen.getByRole('button', { name: 'Arresta' })).toBeInTheDocument()

    await advance('Avanti')

    expect(
      screen.getByRole('heading', { name: /indicare col dito|indica col dito/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Punta' })).toBeChecked()

    await advance('Avanti')

    expect(screen.getByRole('heading', { name: 'Sei pronto' })).toBeInTheDocument()
    // Finita la prova la cattura si ferma: riparte col pulsante Avvia.
    expect(screen.getByRole('button', { name: 'Avvia' })).toBeInTheDocument()
  })

  it('chiudere la guida durante una prova spegne la cattura', async () => {
    render(<Dashboard />)

    await advance('Ascolta la guida')
    await advance('Avanti')
    await advance('Avanti')
    expect(screen.getByRole('button', { name: 'Arresta' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Salta la guida' }))

    expect(screen.getByRole('button', { name: 'Avvia' })).toBeInTheDocument()
  })
})
