import { createRef } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Dashboard from './Dashboard'
import { rememberTutorialSeen } from '../domain/tutorial'

const videoRef = createRef<HTMLVideoElement>()

const IPHONE = [
  { deviceId: 'ultra', label: 'Fotocamera con ultra-grandangolo (posteriore)' },
  { deviceId: 'wide', label: 'Fotocamera posteriore' },
  { deviceId: 'tele', label: 'Fotocamera con teleobiettivo (posteriore)' },
  { deviceId: 'fronte', label: 'Fotocamera anteriore' },
]

const webcam = {
  facing: '' as string,
  /** L'obiettivo acceso: vuoto significa quello predefinito del verso. */
  deviceId: '' as string | undefined,
  mirrored: false,
  canFocus: false,
  focusAt: vi.fn(async () => true),
}

const cameras = { devices: IPHONE as { deviceId: string; label: string }[] }

vi.mock('../hooks/useWebcam', () => ({
  useWebcam: (options: { facing?: string; deviceId?: string } = {}) => {
    webcam.facing = options.facing ?? ''
    webcam.deviceId = options.deviceId ?? ''
    return {
      videoRef,
      isActive: true,
      isMirrored: webcam.mirrored,
      error: null,
      focusAt: webcam.focusAt,
      canFocus: webcam.canFocus,
      cameraCapabilities: 'zoom no · fuoco continuous · punto sì',
    }
  },
}))

vi.mock('../hooks/useCameraDevices', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../hooks/useCameraDevices')>()
  return {
    ...actual,
    useCameraDevices: () => ({
      devices: cameras.devices,
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
    cameras.devices = IPHONE
    webcam.mirrored = false
    webcam.canFocus = false
    webcam.focusAt.mockClear()
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
    // L'elenco dei dieci obiettivi non c'è più: restano i livelli di zoom.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Livello di zoom' })).toBeInTheDocument()

    expect(container.querySelector('.detections-layer')).not.toBeInTheDocument()
    expect(container.querySelector('.pointing-overlay-layer')).not.toBeInTheDocument()
    expect(container.querySelector('.hand-landmarks-layer')).not.toBeInTheDocument()
    expect(container.querySelector('.bounding-box')).not.toBeInTheDocument()
    expect(container.querySelector('.log-panel')).not.toBeInTheDocument()
    expect(container.querySelector('canvas')).not.toBeInTheDocument()
  })

  it('i livelli di zoom sono quelli che il telefono può davvero fare', () => {
    render(<Dashboard />)

    expect(
      screen.getAllByRole('button', { name: /^Zoom/ }).map((pulsante) => pulsante.textContent),
    ).toEqual(['0,5×', '1×', '2×', '4×'])
    expect(screen.getByRole('button', { name: 'Zoom 1 volta' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
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
    cameras.devices = IPHONE
    window.localStorage.clear()
    rememberTutorialSeen()
  })

  it('parte dalla posteriore e il pulsante dice dove si va', async () => {
    render(<Dashboard />)

    const giro = screen.getByRole('button', { name: 'Passa alla fotocamera frontale' })
    expect(webcam.facing).toBe('environment')

    await userEvent.click(giro)

    expect(webcam.facing).toBe('user')
    expect(
      screen.getByRole('button', { name: 'Passa alla fotocamera posteriore' }),
    ).toBeInTheDocument()
  })

  it('davanti restano i livelli che una fotocamera sola può dare', async () => {
    render(<Dashboard />)

    await userEvent.click(screen.getByRole('button', { name: 'Passa alla fotocamera frontale' }))

    expect(
      screen.getAllByRole('button', { name: /^Zoom/ }).map((pulsante) => pulsante.textContent),
    ).toEqual(['1×', '2×'])
  })

  it('senza ultra-grandangolo il livello 0,5 non compare', () => {
    cameras.devices = [{ deviceId: 'wide', label: 'Fotocamera posteriore' }]
    render(<Dashboard />)

    expect(
      screen.getAllByRole('button', { name: /^Zoom/ }).map((pulsante) => pulsante.textContent),
    ).toEqual(['1×', '2×', '4×'])
  })

  it('un livello ottico accende l obiettivo giusto, uno digitale no', async () => {
    render(<Dashboard />)
    expect(webcam.deviceId).toBe('')

    await userEvent.click(screen.getByRole('button', { name: 'Zoom 0,5 volte' }))
    expect(webcam.deviceId).toBe('ultra')
    expect(screen.getByRole('button', { name: 'Zoom 0,5 volte' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    await userEvent.click(screen.getByRole('button', { name: 'Zoom 2 volte' }))
    expect(webcam.deviceId).toBe('tele')

    // Senza teleobiettivo lo stesso livello non cambia obiettivo: ritaglia.
    cameras.devices = [{ deviceId: 'wide', label: 'Fotocamera posteriore' }]
    await userEvent.click(screen.getByRole('button', { name: 'Zoom 1 volta' }))
    await userEvent.click(screen.getByRole('button', { name: 'Zoom 2 volte' }))
    expect(webcam.deviceId).toBe('')
  })

  it('girando la fotocamera lo zoom torna a 1, perché l obiettivo scelto non c è più', async () => {
    render(<Dashboard />)

    await userEvent.click(screen.getByRole('button', { name: 'Zoom 0,5 volte' }))
    expect(webcam.deviceId).toBe('ultra')

    await userEvent.click(screen.getByRole('button', { name: 'Passa alla fotocamera frontale' }))

    expect(webcam.deviceId).toBe('')
    expect(screen.getByRole('button', { name: 'Zoom 1 volta' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('tocco per mettere a fuoco', () => {
  beforeEach(() => {
    videoRef.current = null
    cameras.devices = IPHONE
    webcam.mirrored = false
    webcam.canFocus = true
    webcam.focusAt.mockClear()
    window.localStorage.clear()
    rememberTutorialSeen()
  })

  const tocca = (container: HTMLElement, clientX: number, clientY: number) => {
    const strato = container.querySelector('.focus-layer') as HTMLElement | null
    if (!strato) return null
    strato.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 400, height: 800 }) as DOMRect
    fireEvent.click(strato, { clientX, clientY })
    return strato
  }

  it('se l obiettivo non lascia comandare il fuoco, il tocco non c è', () => {
    webcam.canFocus = false
    const { container } = render(<Dashboard />)

    // Meglio nessun gesto che un gesto che non fa niente: è lo stesso
    // motivo per cui il cursore dello zoom è stato tolto.
    expect(container.querySelector('.focus-layer')).not.toBeInTheDocument()
  })

  it('tocca il punto inquadrato e mostra l anello solo se è stato accettato', async () => {
    const { container } = render(<Dashboard />)

    tocca(container, 100, 200)

    await waitFor(() =>
      expect(webcam.focusAt).toHaveBeenCalledWith({ x: 0.25, y: 0.25 }),
    )
    await waitFor(() => expect(container.querySelector('.focus-ring')).toBeInTheDocument())
  })

  it('con la fotocamera frontale il punto è specchiato, come l anteprima', async () => {
    webcam.mirrored = true
    const { container } = render(<Dashboard />)

    tocca(container, 100, 200)

    await waitFor(() =>
      expect(webcam.focusAt).toHaveBeenCalledWith({ x: 0.75, y: 0.25 }),
    )
  })

  it('se l obiettivo rifiuta, niente anello: nessun riscontro falso', async () => {
    webcam.focusAt.mockResolvedValueOnce(false)
    const { container } = render(<Dashboard />)

    tocca(container, 100, 200)

    await waitFor(() => expect(webcam.focusAt).toHaveBeenCalled())
    expect(container.querySelector('.focus-ring')).not.toBeInTheDocument()
  })
})

describe('prova guidata dentro il tutorial', () => {
  beforeEach(() => {
    videoRef.current = null
    cameras.devices = IPHONE
    window.localStorage.clear()
    // Qui la guida non è stata vista: si apre da sola.
  })

  const advance = async (label: string) => {
    await userEvent.click(screen.getByRole('button', { name: label }))
  }

  it('la fotocamera resta ferma finché non si preme Prova', async () => {
    render(<Dashboard />)

    await advance('Ascolta la guida')
    await advance('Avanti') // fotocamera
    await advance('Avanti') // modalità

    expect(
      screen.getByRole('heading', { name: /prova la modalità automatica/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Auto' })).toBeChecked()
    // Questo è il punto: con la cattura già avviata la descrizione arriverebbe
    // mentre la guida sta ancora leggendo il passo, e le voci si coprirebbero.
    expect(screen.getByRole('status', { name: 'Stato della prova' })).toHaveTextContent(
      'Quando sei pronto premi Prova',
    )
    expect(screen.queryByRole('button', { name: 'Arresta' })).not.toBeInTheDocument()

    await advance('Prova')

    expect(screen.getByRole('button', { name: 'Arresta' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Stato della prova' })).toHaveTextContent(
      'In ascolto',
    )
  })

  it('chiudere la guida durante una prova spegne la cattura', async () => {
    render(<Dashboard />)

    await advance('Ascolta la guida')
    await advance('Avanti')
    await advance('Avanti')
    await advance('Prova')
    expect(screen.getByRole('button', { name: 'Arresta' })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Salta la guida' }))

    expect(screen.getByRole('button', { name: 'Avvia' })).toBeInTheDocument()
  })
})

describe('le impostazioni dalla vista ordinaria', () => {
  beforeEach(() => {
    window.localStorage.clear()
    rememberTutorialSeen()
  })

  it('si aprono da un pulsante con un nome, non da un ingranaggio muto', async () => {
    render(<Dashboard />)

    await userEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))

    expect(screen.getByRole('dialog', { name: 'Impostazioni' })).toBeVisible()
    expect(
      screen.getByRole('group', { name: 'Velocità della voce' }),
    ).toBeInTheDocument()
  })

  it('una velocità scelta resta sul telefono per la prossima apertura', async () => {
    render(<Dashboard />)

    await userEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Doppia' }))
    await userEvent.click(screen.getByRole('button', { name: 'Chiudi' }))

    expect(window.localStorage.getItem('visioncaption.preferenze.v1')).toContain(
      '"speechRate":2',
    )
  })

  it('il contrasto alto cambia la pagina intera, non solo il pannello', async () => {
    render(<Dashboard />)

    await userEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))
    await userEvent.click(screen.getByRole('button', { name: /Contrasto alto/ }))

    // Vale anche per i comandi della fotocamera e per la guida, che non
    // ricevono le preferenze come proprietà.
    expect(document.documentElement.dataset.contrasto).toBe('alto')
  })

  it('il testo più grande arriva alla didascalia come scala, non come classe', async () => {
    render(<Dashboard />)

    await userEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Molto grande' }))

    expect(
      document.documentElement.style.getPropertyValue('--scala-testo'),
    ).toBe('1.8')
  })

  it('senza modalità dichiarate dal server la scelta non compare vuota', async () => {
    render(<Dashboard />)

    await userEvent.click(screen.getByRole('button', { name: 'Impostazioni' }))

    expect(screen.queryByRole('group', { name: 'Modalità' })).toBeNull()
  })
})
