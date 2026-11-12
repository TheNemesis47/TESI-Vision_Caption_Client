/**
 * Chiede al server una modalità nuova, descritta a parole.
 *
 * La dettatura non la fa questa funzione: la fa la tastiera del telefono, col
 * suo pulsante del microfono. È la scelta giusta e non una scorciatoia -
 * quella dettatura chi usa VoiceOver la conosce già, funziona offline su
 * iPhone, e non dipende dal riconoscimento vocale del browser, che su Safari
 * è incostante. Qui arriva il testo, da qualunque parte venga.
 */

export type CreatedMode = { id: string; label: string }

export type ModeCreationResult =
  | { ok: true; mode: CreatedMode }
  | { ok: false; message: string }

export const DESCRIPTION_MIN_LENGTH = 15
export const DESCRIPTION_MAX_LENGTH = 400

type FetchLike = typeof fetch

/**
 * Da dove sta il server.
 *
 * Nel browser la pagina e il server stanno sullo stesso indirizzo, e un
 * percorso relativo basta. Dentro l'app iOS la pagina non sta su un
 * indirizzo: sta nel telefono, e «/modes» finirebbe dentro il pacchetto.
 */
const apiBase = (import.meta.env.VITE_VISION_API_BASE ?? '')
  .toString()
  .replace(/\/$/, '')

/** I messaggi degli errori che il server può dare, detti a chi ascolta. */
const MESSAGES: Record<number, string> = {
  403: 'Questo server non lascia creare modalità nuove.',
  422: 'Descrivi la situazione in una frase un po più lunga.',
  429: 'Una modalità alla volta: riprova fra un minuto.',
  502: 'Il modello non ha capito la richiesta. Riprova dicendolo in altre parole.',
}

export async function createMode(
  description: string,
  fetchLike?: FetchLike,
): Promise<ModeCreationResult> {
  const testo = description.trim()
  if (testo.length < DESCRIPTION_MIN_LENGTH) {
    return {
      ok: false,
      message: 'Descrivi la situazione in una frase un po più lunga.',
    }
  }
  const richiesta = fetchLike ?? (typeof fetch === 'undefined' ? null : fetch)
  if (!richiesta) {
    return { ok: false, message: 'Non è stato possibile contattare il server.' }
  }

  try {
    const risposta = await richiesta(`${apiBase}/modes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: testo.slice(0, DESCRIPTION_MAX_LENGTH) }),
    })
    if (!risposta.ok) {
      return {
        ok: false,
        message:
          MESSAGES[risposta.status] ??
          'Il server non ha creato la modalità. Riprova più tardi.',
      }
    }
    const corpo = (await risposta.json()) as Partial<CreatedMode>
    if (typeof corpo?.id !== 'string' || typeof corpo?.label !== 'string') {
      return { ok: false, message: 'Il server ha risposto in modo inatteso.' }
    }
    return { ok: true, mode: { id: corpo.id, label: corpo.label } }
  } catch {
    // Rete caduta a metà, o il modello ha superato il tempo del proxy.
    return {
      ok: false,
      message: 'Il server non ha risposto. Riprova quando hai di nuovo rete.',
    }
  }
}
