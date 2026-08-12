import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CaptionModeSwitch from './CaptionModeSwitch'
import type { CaptionMode } from '../domain/visionProtocol'

function SwitchHarness({ onChange = vi.fn() }: { onChange?: (mode: CaptionMode) => void }) {
  const [mode, setMode] = useState<CaptionMode>('AUTO')
  return (
    <CaptionModeSwitch
      value={mode}
      onChange={(nextMode) => {
        setMode(nextMode)
        onChange(nextMode)
      }}
    />
  )
}

describe('CaptionModeSwitch', () => {
  it('parte da AUTO con nome e stato accessibili', () => {
    render(<SwitchHarness />)

    expect(
      screen.getByRole('group', { name: 'Modalità descrizione' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /AUTO, Automatica/i })).toBeChecked()
    expect(
      screen.getByText('Descrive automaticamente i cambiamenti della scena'),
    ).toBeInTheDocument()
  })

  it('passa a POINTING e ritorna ad AUTO', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SwitchHarness onChange={onChange} />)

    await user.click(screen.getByRole('radio', { name: /POINTING, Puntamento/i }))
    expect(screen.getByRole('radio', { name: /POINTING, Puntamento/i })).toBeChecked()
    expect(
      screen.getByText('Descrive quando mantieni il gesto di puntamento'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /AUTO, Automatica/i }))
    expect(screen.getByRole('radio', { name: /AUTO, Automatica/i })).toBeChecked()
    expect(onChange).toHaveBeenNthCalledWith(1, 'POINTING')
    expect(onChange).toHaveBeenNthCalledWith(2, 'AUTO')
  })

  it('è utilizzabile da tastiera', async () => {
    const user = userEvent.setup()
    render(<SwitchHarness />)

    await user.tab()
    expect(screen.getByRole('radio', { name: /AUTO, Automatica/i })).toHaveFocus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('radio', { name: /POINTING, Puntamento/i })).toBeChecked()
  })
})
