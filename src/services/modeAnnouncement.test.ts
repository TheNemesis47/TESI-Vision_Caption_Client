import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { announceMode, MODE_ANNOUNCEMENTS } from './modeAnnouncement'

describe('annuncio della modalità', () => {
  const spoken: string[] = []

  beforeEach(() => {
    spoken.length = 0
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      text: string
      lang = ''
      constructor(text: string) {
        this.text = text
      }
    })
    vi.stubGlobal('speechSynthesis', {
      cancel: () => undefined,
      speak: (utterance: { text: string }) => spoken.push(utterance.text),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('dice in quale modalità si è entrati', () => {
    announceMode('POINTING')
    expect(spoken).toEqual([MODE_ANNOUNCEMENTS.POINTING])
    announceMode('AUTO')
    expect(spoken).toEqual([MODE_ANNOUNCEMENTS.POINTING, MODE_ANNOUNCEMENTS.AUTO])
  })

  it('senza voce di sistema non esplode', () => {
    vi.stubGlobal('speechSynthesis', undefined)
    expect(() => announceMode('AUTO')).not.toThrow()
  })

  it('una voce che rifiuta di parlare non ferma il cambio di modalità', () => {
    vi.stubGlobal('speechSynthesis', {
      cancel: () => undefined,
      speak: () => {
        throw new Error('not allowed')
      },
    })
    expect(() => announceMode('POINTING')).not.toThrow()
  })
})
