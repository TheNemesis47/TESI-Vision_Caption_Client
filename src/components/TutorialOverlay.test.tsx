import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import TutorialOverlay from './TutorialOverlay'
import { TUTORIAL_STEPS } from '../domain/tutorial'

const renderStep = (stepIndex: number, overrides = {}) => {
  const props = {
    step: TUTORIAL_STEPS[stepIndex],
    stepIndex,
    stepCount: TUTORIAL_STEPS.length,
    isVoiceEnabled: true,
    cameraDevices: [
      { deviceId: 'camera-back', label: 'Fotocamera posteriore' },
      { deviceId: 'camera-front', label: 'Fotocamera anteriore' },
    ],
    selectedCameraId: 'camera-back',
    captionMode: 'AUTO' as const,
    onCameraChange: vi.fn(),
    onModeChange: vi.fn(),
    onNext: vi.fn(),
    onSkip: vi.fn(),
    onRepeat: vi.fn(),
    onToggleVoice: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<TutorialOverlay {...props} />) }
}

describe('TutorialOverlay', () => {
  it('è una finestra modale e porta il fuoco sul titolo del passo', () => {
    renderStep(0)

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Guida rapida' })).toHaveFocus()
  })

  it('si può saltare, ed è il primo comando dopo il numero del passo', async () => {
    const user = userEvent.setup()
    const { props } = renderStep(0)

    await user.click(screen.getByRole('button', { name: 'Salta la guida' }))

    expect(props.onSkip).toHaveBeenCalled()
  })

  it('il passo d’apertura non offre «ripeti», perché non ha ancora parlato', () => {
    renderStep(0)

    expect(screen.queryByRole('button', { name: 'Ripeti' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ascolta la guida' })).toBeInTheDocument()
  })

  it('la fotocamera si sceglie dalla guida e la scelta arriva alla Dashboard', async () => {
    const user = userEvent.setup()
    const { props } = renderStep(1)

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Fotocamera' }),
      'camera-front',
    )

    expect(props.onCameraChange).toHaveBeenCalledWith('camera-front')
  })

  it('la modalità si sceglie dalla guida', async () => {
    const user = userEvent.setup()
    const { props } = renderStep(2)

    expect(screen.getByRole('radio', { name: 'Automatica' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'Puntamento' }))

    expect(props.onModeChange).toHaveBeenCalledWith('POINTING')
  })

  it('la voce guida si spegne dal pulsante, che dichiara il proprio stato', async () => {
    const user = userEvent.setup()
    const { props } = renderStep(1)

    const toggle = screen.getByRole('button', { name: 'Spegni la voce guida' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(toggle)

    expect(props.onToggleVoice).toHaveBeenCalled()
  })

  it('Escape salta la guida', async () => {
    const user = userEvent.setup()
    const { props } = renderStep(2)

    await user.keyboard('{Escape}')

    expect(props.onSkip).toHaveBeenCalled()
  })
})
