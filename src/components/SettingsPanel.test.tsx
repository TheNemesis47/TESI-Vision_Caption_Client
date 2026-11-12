import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_PREFERENCES } from '../domain/preferences'
import { SettingsPanel } from './SettingsPanel'

const apri = (props: Partial<Parameters<typeof SettingsPanel>[0]> = {}) => {
  const onChange = vi.fn()
  const onClose = vi.fn()
  render(
    <SettingsPanel
      preferences={DEFAULT_PREFERENCES}
      onChange={onChange}
      onClose={onClose}
      {...props}
    />,
  )
  return { onChange, onClose }
}

describe('il pannello delle impostazioni', () => {
  it('si presenta come una finestra con un nome', () => {
    apri()

    const dialogo = screen.getByRole('dialog')
    expect(dialogo).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Impostazioni' })).toBeVisible()
  })

  it('prende il fuoco appena si apre', () => {
    apri()

    // Senza questo chi usa VoiceOver resterebbe sul pulsante che lo ha
    // aperto, dietro una schermata che copre tutto.
    expect(screen.getByRole('button', { name: 'Chiudi' })).toHaveFocus()
  })

  it('si chiude con Esc', () => {
    const { onClose } = apri()

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalled()
  })

  it('ogni scelta sta in un gruppo con un nome', () => {
    apri()

    // Tre gruppi hanno un'opzione che si chiama «Normale»: senza il nome del
    // gruppo, chi ascolta sentirebbe «Normale» tre volte senza sapere di che
    // cosa. Il nome del gruppo è ciò che lo rende distinguibile a voce.
    const velocita = screen.getByRole('group', { name: 'Velocità della voce' })
    const scelte = within(velocita).getAllByRole('radio')

    expect(scelte).toHaveLength(5)
    expect(
      within(velocita).getByRole('radio', { name: 'Normale', checked: true }),
    ).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Quanto dice' })).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Dimensione del testo' })).toBeTruthy()
  })

  it('una velocità scelta vale subito, senza tasto Salva', () => {
    const { onChange } = apri()

    fireEvent.click(screen.getByRole('radio', { name: 'Doppia' }))

    expect(onChange).toHaveBeenCalledWith({ speechRate: 2 })
  })

  it('la verbosità arriva come parola, non come numero di parole', () => {
    const { onChange } = apri()

    fireEvent.click(screen.getByRole('radio', { name: 'Essenziale' }))

    expect(onChange).toHaveBeenCalledWith({ verbosity: 'essenziale' })
  })

  it('il contrasto dice se è attivo, non solo col colore', () => {
    const { onChange } = apri()

    const interruttore = screen.getByRole('button', { name: /Contrasto alto/ })
    expect(interruttore).toHaveAttribute('aria-pressed', 'false')
    expect(interruttore).toHaveTextContent('Non attivo')

    fireEvent.click(interruttore)
    expect(onChange).toHaveBeenCalledWith({ highContrast: true })
  })

  it('le modalità compaiono solo se il server ne dichiara', () => {
    apri()
    expect(screen.queryByText('Modalità')).toBeNull()
  })

  it('le modalità dichiarate si possono scegliere, con il ritorno al server', () => {
    const { onChange } = apri({
      modes: [
        { id: 'lesson', label: 'Lezione' },
        { id: 'supermercato', label: 'Supermercato' },
      ],
    })

    expect(screen.getByRole('radio', { name: 'Come decide il server' })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'Supermercato' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'supermercato' })
  })

  it('il salvataggio compare solo se c è qualcosa da salvare', () => {
    const onSaveLesson = vi.fn()
    apri({ onSaveLesson, savedDescriptions: 0 })

    expect(screen.queryByRole('button', { name: /Salva le descrizioni/ })).toBeNull()
  })

  it('il salvataggio dice quante descrizioni ci sono', () => {
    const onSaveLesson = vi.fn()
    apri({ onSaveLesson, savedDescriptions: 4 })

    expect(screen.getByText('4 descrizioni da rileggere più tardi.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Salva le descrizioni' }))
    expect(onSaveLesson).toHaveBeenCalled()
  })

  it('tutti i comandi si raggiungono con la tastiera', () => {
    apri({ onRestartTutorial: vi.fn(), onSaveLesson: vi.fn(), savedDescriptions: 2 })

    const raggiungibili = screen
      .getAllByRole('button')
      .filter((elemento) => elemento.getAttribute('tabindex') !== '-1')

    expect(raggiungibili.length).toBeGreaterThanOrEqual(4)
  })

  it('il campo della modalità dettata compare solo dove il server lo accetta', () => {
    apri()
    expect(screen.queryByLabelText('Una modalità tua')).toBeNull()

    cleanup()
    apri({ canCreateModes: true })
    expect(screen.getByLabelText('Una modalità tua')).toBeVisible()
  })

  it('il pulsante resta spento finché la frase è troppo corta', () => {
    apri({ canCreateModes: true })

    const pulsante = screen.getByRole('button', { name: 'Crea la modalità' })
    expect(pulsante).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Una modalità tua'), {
      target: { value: 'lavoro in officina e mi servono gli attrezzi' },
    })

    expect(pulsante).toBeEnabled()
  })

  it('il campo è grande almeno 17px, o Safari ingrandisce la pagina da sé', () => {
    apri({ canCreateModes: true })

    // Sotto i 16px iOS zooma al fuoco e il pannello scappa sotto le dita.
    expect(screen.getByLabelText('Una modalità tua').className).toContain(
      'settings-field',
    )
  })
})
