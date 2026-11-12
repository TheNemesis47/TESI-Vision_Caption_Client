import { describe, expect, it, vi } from 'vitest'

import {
  downloadTranscript,
  lessonTranscript,
  transcriptFileName,
} from './lessonTranscript'

const quandoEra = new Date(2026, 10, 12, 9, 5)

describe('le descrizioni salvate', () => {
  it('sono numerate e precedute dal giorno', () => {
    const testo = lessonTranscript(
      ['Titolo: Fonti di energia.', 'Testo: tre voci in elenco.'],
      quandoEra,
    )

    expect(testo).toBe(
      'VisionCaption - descrizioni del 12/11/2026 alle 09:05\n' +
        '\n' +
        '1. Titolo: Fonti di energia.\n' +
        '\n' +
        '2. Testo: tre voci in elenco.\n',
    )
  })

  it('una sessione senza descrizioni lo dice invece di dare un file vuoto', () => {
    expect(lessonTranscript([], quandoEra)).toContain(
      'Nessuna descrizione in questa sessione.',
    )
  })

  it('il nome del file distingue le sessioni dello stesso giorno', () => {
    expect(transcriptFileName(quandoEra)).toBe('visioncaption-20261112-0905.txt')
  })
})

describe('la consegna del file', () => {
  it('crea il collegamento, lo attiva e lo rimuove', () => {
    const link = { href: '', download: '', click: vi.fn() }
    const doc = {
      createElement: vi.fn(() => link as unknown as HTMLAnchorElement),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    }
    const urls = {
      createObjectURL: vi.fn(() => 'blob:appunti'),
      revokeObjectURL: vi.fn(),
    }

    expect(downloadTranscript('testo', 'appunti.txt', doc, urls)).toBe(true)
    expect(link.download).toBe('appunti.txt')
    expect(link.click).toHaveBeenCalled()
    // Il collegamento non resta nella pagina: il lettore di schermo lo
    // troverebbe fra i comandi veri.
    expect(doc.body.removeChild).toHaveBeenCalledWith(link)
    expect(urls.revokeObjectURL).toHaveBeenCalledWith('blob:appunti')
  })

  it('senza documento non solleva: il pulsante non deve rompere la sessione', () => {
    expect(downloadTranscript('testo', 'appunti.txt', null, undefined)).toBe(
      typeof URL !== 'undefined' && typeof document !== 'undefined',
    )
  })
})
