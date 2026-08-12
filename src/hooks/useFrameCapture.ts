import { stripJpegDataUrlPrefix } from '../domain/visionProtocol'

export type FrameDimensions = {
  width: number
  height: number
}

export type CapturedFrame = FrameDimensions & {
  blob: Blob
  imageBase64: string
}

type CaptureFrameOptions = {
  maxWidth?: number
  maxHeight?: number
  jpegQuality?: number
}

export const shouldSkipFrameForBackpressure = (
  bufferedAmount: number,
  maximumBufferedAmount: number,
) => {
  return bufferedAmount > maximumBufferedAmount
}

export const calculateFrameDimensions = (
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): FrameDimensions => {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('Dimensioni video non valide')
  }

  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight)
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  }
}

export const blobToBase64 = (blob: Blob) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('Immagine non convertibile'))
        return
      }

      const base64 = stripJpegDataUrlPrefix(reader.result)
      if (!base64) {
        reject(new Error('Frame JPEG Base64 vuoto'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(new Error('Errore durante la lettura del frame JPEG'))
    reader.readAsDataURL(blob)
  })
}

export const captureVideoFrame = async (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  {
    maxWidth = 1280,
    maxHeight = 720,
    jpegQuality = 0.86,
  }: CaptureFrameOptions = {},
): Promise<CapturedFrame> => {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('Webcam non pronta')
  }

  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  const { width, height } = calculateFrameDimensions(
    sourceWidth,
    sourceHeight,
    maxWidth,
    maxHeight,
  )

  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Contesto canvas non disponibile')
  }

  // Disegna l'intero frame senza crop o mirroring: preview e backend vedono la stessa scena.
  context.drawImage(video, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob || nextBlob.type !== 'image/jpeg') {
          reject(new Error('Frame non convertibile in JPEG'))
          return
        }
        resolve(nextBlob)
      },
      'image/jpeg',
      jpegQuality,
    )
  })

  return {
    blob,
    imageBase64: await blobToBase64(blob),
    width,
    height,
  }
}
