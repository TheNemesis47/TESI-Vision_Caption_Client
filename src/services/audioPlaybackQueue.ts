export type AudioQueueItem = {
  blob: Blob
  caption: string
  frameId: number
}

type AudioElementLike = Pick<
  HTMLAudioElement,
  'src' | 'onended' | 'onerror' | 'pause' | 'play' | 'load' | 'removeAttribute'
> & {
  playbackRate?: number
  /**
   * Senza questo, l'audio accelerato alza il tono e la voce diventa
   * caricaturale: chi ascolta a velocità doppia deve sentire la stessa voce,
   * solo più svelta. Safari lo espone, i browser più vecchi no.
   */
  preservesPitch?: boolean
}

type ObjectUrlApi = Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>

type AudioPlaybackQueueOptions = {
  audio: AudioElementLike
  objectUrlApi?: ObjectUrlApi
  onPlaybackError?: (error: unknown, item: AudioQueueItem) => void
  onQueueChange?: (pendingItems: number) => void
  /** Moltiplicatore della velocità di riproduzione; 1 è la voce come nasce. */
  rate?: number
}

export class AudioPlaybackQueue {
  private readonly audio: AudioElementLike
  private readonly objectUrlApi: ObjectUrlApi
  private readonly onPlaybackError?: (error: unknown, item: AudioQueueItem) => void
  private readonly onQueueChange?: (pendingItems: number) => void
  private items: AudioQueueItem[] = []
  private activeUrl: string | null = null
  private playing = false
  private generation = 0
  private rate = 1

  constructor({
    audio,
    objectUrlApi = URL,
    onPlaybackError,
    onQueueChange,
    rate = 1,
  }: AudioPlaybackQueueOptions) {
    this.audio = audio
    this.objectUrlApi = objectUrlApi
    this.onPlaybackError = onPlaybackError
    this.onQueueChange = onQueueChange
    this.setRate(rate)
  }

  /**
   * La velocità scelta nelle impostazioni.
   *
   * Vale anche su ciò che sta suonando adesso: chi si accorge che la voce
   * corre troppo cambia l'impostazione e deve sentire l'effetto su quella
   * frase, non sulla prossima. Cambiare `src` azzera `playbackRate` in alcuni
   * browser, quindi si rimette a ogni traccia.
   */
  setRate(rate: number) {
    this.rate = Number.isFinite(rate) && rate > 0 ? rate : 1
    this.applyRate()
  }

  private applyRate() {
    try {
      this.audio.preservesPitch = true
      this.audio.playbackRate = this.rate
    } catch {
      // Un browser che rifiuta la velocità riproduce comunque la descrizione:
      // meglio una voce lenta che nessuna voce.
    }
  }

  enqueue(item: AudioQueueItem) {
    this.items.push(item)
    this.notifyQueueChange()
    if (!this.playing) {
      void this.playNext()
    }
  }

  cancel() {
    this.generation += 1
    this.items = []
    this.playing = false
    this.audio.onended = null
    this.audio.onerror = null
    this.audio.pause()
    this.audio.removeAttribute('src')
    this.audio.load()
    this.revokeActiveUrl()
    this.notifyQueueChange()
  }

  get pendingCount() {
    return this.items.length + (this.playing ? 1 : 0)
  }

  private notifyQueueChange() {
    this.onQueueChange?.(this.pendingCount)
  }

  private revokeActiveUrl() {
    if (!this.activeUrl) return
    this.objectUrlApi.revokeObjectURL(this.activeUrl)
    this.activeUrl = null
  }

  private async playNext() {
    const item = this.items.shift()
    if (!item) {
      this.playing = false
      this.notifyQueueChange()
      return
    }

    const generation = this.generation
    this.playing = true
    this.revokeActiveUrl()
    this.activeUrl = this.objectUrlApi.createObjectURL(item.blob)
    this.audio.src = this.activeUrl
    this.audio.load()
    this.applyRate()
    this.notifyQueueChange()

    let advanced = false
    const advance = () => {
      if (advanced || generation !== this.generation) return
      advanced = true
      this.audio.onended = null
      this.audio.onerror = null
      this.revokeActiveUrl()
      this.playing = false
      void this.playNext()
    }

    this.audio.onended = advance
    this.audio.onerror = () => {
      this.onPlaybackError?.(new Error('Errore durante la riproduzione audio'), item)
      advance()
    }

    try {
      await this.audio.play()
    } catch (error) {
      if (generation !== this.generation) return
      this.onPlaybackError?.(error, item)
      advance()
    }
  }
}
