import { cropForZoom } from '../domain/cameraZoom'
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
  /**
   * Ritaglio al centro, per i livelli di zoom che l'obiettivo non copre.
   * Vale anche per l'anteprima, con lo stesso fattore: il server vede
   * esattamente l'inquadratura che vede chi tiene il telefono, altrimenti il
   * dito indicherebbe un punto fuori dall'immagine ricevuta.
   */
  zoom?: number
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
    zoom = 1,
  }: CaptureFrameOptions = {},
): Promise<CapturedFrame> => {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    throw new Error('Webcam non pronta')
  }

  const { sx, sy, sw, sh } = cropForZoom(video.videoWidth, video.videoHeight, zoom)
  const { width, height } = calculateFrameDimensions(sw, sh, maxWidth, maxHeight)

  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) {
    throw new Error('Contesto canvas non disponibile')
  }

  // Nessun mirroring, e lo stesso ritaglio dell'anteprima: preview e backend
  // vedono la stessa scena.
  context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height)

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
