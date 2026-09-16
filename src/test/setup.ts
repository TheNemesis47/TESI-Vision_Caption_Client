import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom 27 non espone localStorage, e quello di Node sta dietro un flag: senza
// questo innesto ogni prova vedrebbe un browser che non ricorda nulla, e la
// memoria della guida non sarebbe verificabile.
if (typeof window !== 'undefined' && !window.localStorage) {
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

afterEach(() => {
  cleanup()
})
