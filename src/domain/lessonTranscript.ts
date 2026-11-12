/**
 * Le descrizioni della sessione come file di testo.
 *
 * Durante la lezione la voce passa e non torna. Chi vede riguarda le slide
 * fotografate; chi non vede, finora, non aveva niente da riguardare. Le
 * descrizioni ci sono già tutte: salvarle è un pulsante, e trasforma
 * l'applicazione da «mi dice cosa c'è adesso» a «ho gli appunti».
 *
 * Testo semplice e non PDF: è il formato che ogni lettore di schermo e ogni
 * barra braille legge senza chiedere niente a nessuno.
 */

const due = (valore: number) => String(valore).padStart(2, '0')

/** Il giorno e l'ora in forma leggibile, non in inglese tecnico. */
const quando = (at: Date) =>
  `${due(at.getDate())}/${due(at.getMonth() + 1)}/${at.getFullYear()} ` +
  `alle ${due(at.getHours())}:${due(at.getMinutes())}`

export function lessonTranscript(
  descriptions: string[],
  at: Date = new Date(),
): string {
  const righe = [
    `VisionCaption - descrizioni del ${quando(at)}`,
    '',
  ]
  if (descriptions.length === 0) {
    righe.push('Nessuna descrizione in questa sessione.')
  } else {
    descriptions.forEach((testo, indice) => {
      righe.push(`${indice + 1}. ${testo.trim()}`, '')
    })
  }
  return `${righe.join('\n').trimEnd()}\n`
}

/** Un nome che si distingue dagli altri nella cartella dei download. */
export function transcriptFileName(at: Date = new Date()): string {
  return (
    `visioncaption-${at.getFullYear()}${due(at.getMonth() + 1)}` +
    `${due(at.getDate())}-${due(at.getHours())}${due(at.getMinutes())}.txt`
  )
}

type DocumentLike = Pick<Document, 'createElement'> & {
  body: Pick<HTMLElement, 'appendChild' | 'removeChild'>
}

type UrlApi = Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>

/**
 * Consegna il file al telefono. Su iPhone si apre il foglio di condivisione,
 * da cui si salva in File o si manda a sé stessi: è il comportamento normale
 * dei download in Safari, non un'eccezione da aggirare.
 */
export function downloadTranscript(
  text: string,
  fileName: string,
  documentLike?: DocumentLike | null,
  urlApi?: UrlApi,
): boolean {
  const doc =
    documentLike ?? (typeof document === 'undefined' ? null : document)
  const urls = urlApi ?? (typeof URL === 'undefined' ? null : URL)
  if (!doc || !urls) return false
  const url = urls.createObjectURL(new Blob([text], { type: 'text/plain' }))
  const link = doc.createElement('a')
  link.href = url
  link.download = fileName
  doc.body.appendChild(link)
  link.click()
  doc.body.removeChild(link)
  urls.revokeObjectURL(url)
  return true
}
