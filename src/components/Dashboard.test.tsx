import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'

const videoRef = createRef<HTMLVideoElement>()

vi.mock('../hooks/useWebcam', () => ({
  useWebcam: () => ({
    videoRef,
    isActive: true,
    isMirrored: false,
    error: null,
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

    expect(container.querySelector('.detections-layer')).not.toBeInTheDocument()
    expect(container.querySelector('.pointing-overlay-layer')).not.toBeInTheDocument()
    expect(container.querySelector('.bounding-box')).not.toBeInTheDocument()
    expect(container.querySelector('.log-panel')).not.toBeInTheDocument()
    expect(container.querySelector('canvas')).not.toBeInTheDocument()
  })
})
