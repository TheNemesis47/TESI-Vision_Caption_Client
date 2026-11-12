import { act, render, screen } from '@testing-library/react'
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
    captionMode: 'AUTO' as const,
    isPracticeRunning: false,
    onModeChange: vi.fn(),
    onPracticeStart: vi.fn(),
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

  it('il passo della fotocamera non ripropone l elenco degli obiettivi', () => {
    renderStep(1)

    // I comandi stanno nella schermata, uno solo per ogni cosa: un elenco
    // qui dentro sarebbe un doppione da ascoltare voce per voce.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
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

  it('la prova parte quando lo decide chi ascolta, non da sola', async () => {
    const user = userEvent.setup()
    const { props } = renderStep(3)

    // Prima della prova il pulsante è Prova: la fotocamera resta ferma
    // mentre la guida parla, e le due voci non si sovrappongono.
    expect(screen.queryByRole('button', { name: 'Avanti' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Prova' }))

    expect(props.onPracticeStart).toHaveBeenCalled()
    expect(props.onNext).not.toHaveBeenCalled()
  })

  it('mentre la fotocamera guarda, il pulsante dice che sta ascoltando', () => {
    renderStep(3, { isPracticeRunning: true })

    expect(screen.getByRole('button', { name: 'In ascolto…' })).toBeDisabled()
    expect(screen.getByLabelText('Stato della prova')).toHaveTextContent(
      'In ascolto: tieni il telefono fermo',
    )
    // «Ripeti» farebbe ripartire la guida sopra la descrizione in arrivo.
    expect(screen.queryByRole('button', { name: 'Ripeti' })).not.toBeInTheDocument()
  })

  it('sentita la descrizione, il pulsante diventa Avanti e la riporta', async () => {
    const user = userEvent.setup()
    const { props } = renderStep(3, {
      practiceCaption: 'Un tavolo con sopra un bicchiere',
    })

    expect(screen.getByLabelText('Stato della prova')).toHaveTextContent(
      'Hai sentito: Un tavolo con sopra un bicchiere',
    )
    await user.click(screen.getByRole('button', { name: 'Avanti' }))

    expect(props.onNext).toHaveBeenCalled()
  })

  it('se la descrizione non arriva, dopo un attimo si prosegue lo stesso', async () => {
    // Senza questa via d'uscita un server lento, o una scena che non ha
    // niente da dire, lascerebbero chi non vede fermo su un pulsante spento.
    vi.useFakeTimers()
    try {
      const { props } = renderStep(3, { isPracticeRunning: true })

      expect(screen.getByRole('button', { name: 'In ascolto…' })).toBeDisabled()

      await act(async () => {
        vi.advanceTimersByTime(15_000)
      })

      expect(screen.getByLabelText('Stato della prova')).toHaveTextContent(
        'Non è arrivata nessuna descrizione',
      )
      screen.getByRole('button', { name: 'Avanti' }).click()
      expect(props.onNext).toHaveBeenCalled()

      screen.getByRole('button', { name: 'Riprova' }).click()
      expect(props.onPracticeStart).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('Escape salta la guida', async () => {
    const user = userEvent.setup()
    const { props } = renderStep(2)

    await user.keyboard('{Escape}')

    expect(props.onSkip).toHaveBeenCalled()
  })
})
