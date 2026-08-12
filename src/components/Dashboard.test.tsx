import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'

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

vi.mock('../hooks/useCameraDevices', () => ({
  useCameraDevices: () => ({
    devices: [
      { deviceId: 'camera-back', label: 'Fotocamera posteriore' },
      { deviceId: 'camera-front', label: 'Fotocamera anteriore' },
    ],
    error: null,
    refresh: vi.fn(),
  }),
}))

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
