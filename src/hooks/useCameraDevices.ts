import { useCallback, useEffect, useState } from 'react'

export type CameraDevice = {
  deviceId: string
  label: string
}

export function resolveAvailableCameraId(
  devices: CameraDevice[],
  ...preferredIds: Array<string | undefined>
) {
  const availableIds = new Set(devices.map((device) => device.deviceId))
  return preferredIds.find((deviceId) => deviceId && availableIds.has(deviceId))
    ?? devices[0]?.deviceId
    ?? ''
}

export function useCameraDevices(enabled: boolean) {
  const [devices, setDevices] = useState<CameraDevice[]>([])
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError('Selezione fotocamera non supportata')
      return
    }

    try {
      const mediaDevices = await navigator.mediaDevices.enumerateDevices()
      const videoInputs = mediaDevices
        .filter((device) => device.kind === 'videoinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Fotocamera ${index + 1}`,
        }))
      setDevices(videoInputs)
      setError(null)
    } catch {
      setError('Impossibile leggere le fotocamere disponibili')
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const initialRefreshTimer = window.setTimeout(() => {
      void refresh()
    }, 0)
    const mediaDevices = navigator.mediaDevices
    mediaDevices?.addEventListener?.('devicechange', refresh)
    return () => {
      window.clearTimeout(initialRefreshTimer)
      mediaDevices?.removeEventListener?.('devicechange', refresh)
    }
  }, [enabled, refresh])

  return { devices, error, refresh }
}
