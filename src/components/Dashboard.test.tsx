import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import { rememberTutorialSeen } from '../domain/tutorial'

const videoRef = createRef<HTMLVideoElement>()

vi.mock('../hooks/useWebcam', () => ({
  useWebcam: () => ({
    videoRef,
    isActive: true,
    isMirrored: false,
    activeDeviceId: 'camera-back',
    error: null,
  }),
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
    expect(screen.getByRole('combobox', { name: 'Fotocamera' })).toHaveValue(
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
    const cameraSelect = screen.getByRole('combobox', { name: 'Fotocamera' })

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
