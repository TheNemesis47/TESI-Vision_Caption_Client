export type AudioQueueItem = {
  blob: Blob
  caption: string
  frameId: number
}

type AudioElementLike = Pick<
  HTMLAudioElement,
  'src' | 'onended' | 'onerror' | 'pause' | 'play' | 'load' | 'removeAttribute'
>

type ObjectUrlApi = Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'>

type AudioPlaybackQueueOptions = {
  audio: AudioElementLike
  objectUrlApi?: ObjectUrlApi
  onPlaybackError?: (error: unknown, item: AudioQueueItem) => void
  onQueueChange?: (pendingItems: number) => void
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

  constructor({
    audio,
    objectUrlApi = URL,
    onPlaybackError,
    onQueueChange,
  }: AudioPlaybackQueueOptions) {
    this.audio = audio
    this.objectUrlApi = objectUrlApi
    this.onPlaybackError = onPlaybackError
    this.onQueueChange = onQueueChange
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
