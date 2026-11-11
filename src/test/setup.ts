import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom 27 non espone localStorage, e quello di Node sta dietro un flag: senza
// questo innesto ogni prova vedrebbe un browser che non ricorda nulla, e la
// memoria della guida non sarebbe verificabile.
//
// L'innesto si mette sempre, anche dove un localStorage esiste già: su Node 24
// la CI ne espone uno che restituisce un oggetto diverso a ogni accesso, e un
// vi.spyOn su quell'oggetto non veniva visto dal codice sotto prova. Era la
// ragione per cui la prova della memoria bloccata passava in locale e falliva
// in CI da fine ottobre.
if (typeof window !== 'undefined') {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, String(value))
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
      clear: () => {
        store.clear()
      },
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size
      },
    },
  })
}

// jsdom non implementa createObjectURL: senza, sbloccare l'audio - cosa che
// succede a ogni avvio della cattura - butta giù la prova con un TypeError
// invece di fallire su quello che la prova sta verificando.
if (typeof URL !== 'undefined' && typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:prova'
  URL.revokeObjectURL = () => undefined
}

afterEach(() => {
  cleanup()
})
