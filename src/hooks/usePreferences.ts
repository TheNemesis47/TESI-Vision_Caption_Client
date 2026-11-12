import { useCallback, useEffect, useState } from 'react'

import {
  TEXT_SCALE_FACTORS,
  loadPreferences,
  normalizePreferences,
  savePreferences,
  type Preferences,
} from '../domain/preferences'

/**
 * Le preferenze in uso, con il loro effetto sulla pagina.
 *
 * Due di esse non passano da React: il contrasto e la dimensione del testo
 * cambiano un attributo e una variabile sull'elemento radice, così valgono
 * anche per il pannello della guida e per i comandi della fotocamera, che
 * non ricevono le preferenze come proprietà.
 */
export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences>(() =>
    loadPreferences(),
  )

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = normalizePreferences({ ...current, ...patch })
      savePreferences(next)
      return next
    })
  }, [])

  useEffect(() => {
    // Si scrive sull'elemento radice e non su una proprietà React perché il
    // contrasto e la dimensione del testo devono valere anche per il pannello
    // della guida e per i comandi della fotocamera, che non ricevono le
    // preferenze dall'alto.
    const root =
      typeof document === 'undefined' ? null : document.documentElement
    if (!root) return
    if (preferences.highContrast) root.dataset.contrasto = 'alto'
    else delete root.dataset.contrasto
    root.style.setProperty(
      '--scala-testo',
      String(TEXT_SCALE_FACTORS[preferences.textScale]),
    )
  }, [preferences.highContrast, preferences.textScale])

  return { preferences, updatePreferences: update }
}
