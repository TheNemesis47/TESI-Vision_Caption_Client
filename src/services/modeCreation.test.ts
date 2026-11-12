import { describe, expect, it, vi } from 'vitest'

import { createMode } from './modeCreation'

const risposta = (status: number, corpo?: unknown) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  })) as unknown as typeof fetch

describe('la modalità dettata a parole', () => {
  it('arriva al server come frase e torna come modalità', async () => {
    const chiamata = risposta(201, { id: 'pesca', label: 'Pesca da riva' })

    const esito = await createMode(
      '  accompagni una persona cieca che pesca da riva  ',
      chiamata,
    )

    expect(esito).toEqual({ ok: true, mode: { id: 'pesca', label: 'Pesca da riva' } })
    const [indirizzo, opzioni] = (chiamata as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0]
    expect(indirizzo).toBe('/modes')
    // Gli spazi intorno non sono parte della frase.
    expect(JSON.parse((opzioni as RequestInit).body as string)).toEqual({
      description: 'accompagni una persona cieca che pesca da riva',
    })
  })

  it('una frase troppo corta non va nemmeno chiesta', async () => {
    const chiamata = risposta(201, {})

    const esito = await createMode('pesca', chiamata)

    expect(esito).toEqual({
      ok: false,
      message: 'Descrivi la situazione in una frase un po più lunga.',
    })
    expect(chiamata).not.toHaveBeenCalled()
  })

  it('un server che non lo permette lo dice a parole, non con un numero', async () => {
    const esito = await createMode(
      'una persona cieca in officina con gli attrezzi',
      risposta(403),
    )

    expect(esito).toEqual({
      ok: false,
      message: 'Questo server non lascia creare modalità nuove.',
    })
  })

  it('una modalità alla volta', async () => {
    const esito = await createMode(
      'una persona cieca in officina con gli attrezzi',
      risposta(429),
    )

    expect(esito.ok).toBe(false)
    expect(esito.ok === false && esito.message).toContain('Una modalità alla volta')
  })

  it('se il modello non capisce lo dice senza colpevolizzare chi ha parlato', async () => {
    const esito = await createMode(
      'una persona cieca in officina con gli attrezzi',
      risposta(502),
    )

    expect(esito.ok === false && esito.message).toContain('in altre parole')
  })

  it('una risposta senza modalità dentro non diventa una modalità', async () => {
    const esito = await createMode(
      'una persona cieca in officina con gli attrezzi',
      risposta(201, { qualcosa: 'altro' }),
    )

    expect(esito.ok).toBe(false)
  })

  it('la rete caduta a metà non rompe il pannello', async () => {
    const esito = await createMode(
      'una persona cieca in officina con gli attrezzi',
      vi.fn(async () => {
        throw new Error('rete assente')
      }) as unknown as typeof fetch,
    )

    expect(esito.ok === false && esito.message).toContain('Riprova quando hai di nuovo rete')
  })

  it('una frase lunghissima viene tagliata invece di essere rifiutata dal server', async () => {
    const chiamata = risposta(201, { id: 'x', label: 'X' })

    await createMode('a'.repeat(900), chiamata)

    const [, opzioni] = (chiamata as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(
      JSON.parse((opzioni as RequestInit).body as string).description,
    ).toHaveLength(400)
  })

  it('dentro l app il server ha un indirizzo, non un percorso relativo', async () => {
    // Nel telefono la pagina sta nel pacchetto: «/modes» finirebbe lì dentro.
    // Il percorso lo decide VITE_VISION_API_BASE a build.
    const chiamata = risposta(201, { id: 'x', label: 'X' })
    await createMode('una persona cieca in officina con gli attrezzi', chiamata)

    const [indirizzo] = (chiamata as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(String(indirizzo).endsWith('/modes')).toBe(true)
  })
})
