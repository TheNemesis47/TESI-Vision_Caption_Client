import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  parseVisionServerMessage,
  type VisionServerMessage,
} from '../domain/visionProtocol'

export type SocketState = 'connecting' | 'open' | 'closing' | 'closed'

type LogLevel = 'info' | 'success' | 'warning' | 'error'

type UseServerConnectionOptions = {
  enabled: boolean
  onMessage?: (message: VisionServerMessage) => void
  onDisconnect?: () => void
  onLog?: (message: string, level?: LogLevel) => void
}

export type SendJsonResult =
  | { sent: true; bufferedAmount: number }
  | { sent: false; bufferedAmount: number; reason: 'not-open' | 'send-failed' }

const initialReconnectDelayMs = 1000
const maximumReconnectDelayMs = 10000

export const buildWebSocketUrl = (
  rawBaseUrl: string | undefined = import.meta.env.VITE_VISION_WS_URL,
  pageProtocol: string = typeof window === 'undefined' ? 'http:' : window.location.protocol,
  pageHost: string = typeof window === 'undefined' ? '' : window.location.host,
) => {
  const configuredBaseUrl = rawBaseUrl?.trim()
  const baseUrl = configuredBaseUrl || (pageHost ? `${pageProtocol}//${pageHost}` : null)
  if (!baseUrl) return null

  try {
    const url = new URL(baseUrl)
    const securePage = pageProtocol === 'https:'
    const secureEndpoint = url.protocol === 'https:' || url.protocol === 'wss:'
    url.protocol = securePage || secureEndpoint ? 'wss:' : 'ws:'
    url.pathname = '/ws/vision'
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

const getSafeUrlLabel = (webSocketUrl: string) => {
  const url = new URL(webSocketUrl)
  return `${url.protocol}//${url.host}${url.pathname}`
}

export function useServerConnection({
  enabled,
  onMessage,
  onDisconnect,
  onLog,
}: UseServerConnectionOptions) {
  const webSocketUrl = useMemo(() => buildWebSocketUrl(), [])
  const socketRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  const onDisconnectRef = useRef(onDisconnect)
  const onLogRef = useRef(onLog)
  const [status, setStatus] = useState<SocketState>(
    enabled && webSocketUrl ? 'connecting' : 'closed',
  )

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  useEffect(() => {
    onDisconnectRef.current = onDisconnect
  }, [onDisconnect])

  useEffect(() => {
    onLogRef.current = onLog
  }, [onLog])

  useEffect(() => {
    if (!enabled) {
      return
    }

    if (!webSocketUrl) {
      onLogRef.current?.('VITE_VISION_WS_URL non configurato o non valido', 'error')
      return
    }

    let active = true
    let reconnectTimer: number | undefined
    let reconnectDelayMs = initialReconnectDelayMs
    const urlLabel = getSafeUrlLabel(webSocketUrl)

    const scheduleReconnect = () => {
      if (!active) return
      window.clearTimeout(reconnectTimer)
      const delay = reconnectDelayMs
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, maximumReconnectDelayMs)
      onLogRef.current?.(`[WebSocket] Riconnessione tra ${delay}ms`, 'warning')
      reconnectTimer = window.setTimeout(connect, delay)
    }

    const connect = () => {
      if (!active) return

      setStatus('connecting')
      onLogRef.current?.(`[WebSocket] Connessione a ${urlLabel}`, 'info')
      const socket = new WebSocket(webSocketUrl)
      socketRef.current = socket

      socket.onopen = () => {
        if (!active || socketRef.current !== socket) return
        reconnectDelayMs = initialReconnectDelayMs
        setStatus('open')
        onLogRef.current?.('[WebSocket] Connesso e pronto', 'success')
      }

      socket.onmessage = (event) => {
        if (!active || socketRef.current !== socket) return

        const result = parseVisionServerMessage(event.data)
        if (result.kind === 'message') {
          onMessageRef.current?.(result.message)
          return
        }

        if (result.kind === 'unknown') {
          onLogRef.current?.(
            `[WebSocket] Tipo messaggio sconosciuto: ${result.type}`,
            'warning',
          )
          return
        }

        onLogRef.current?.(`[WebSocket] Messaggio ignorato: ${result.reason}`, 'warning')
      }

      socket.onerror = () => {
        if (!active || socketRef.current !== socket) return
        onLogRef.current?.('[WebSocket] Errore di connessione', 'error')
        socket.close()
      }

      socket.onclose = (event) => {
        if (socketRef.current !== socket) return
        socketRef.current = null
        setStatus('closed')
        if (!active) return

        const reason = event.reason ? `, ${event.reason}` : ''
        onLogRef.current?.(
          `[WebSocket] Disconnesso (code=${event.code}${reason})`,
          event.wasClean ? 'warning' : 'error',
        )
        onDisconnectRef.current?.()
        scheduleReconnect()
      }
    }

    // Il defer evita socket transitori durante il replay degli effect in React StrictMode.
    queueMicrotask(connect)

    return () => {
      active = false
      window.clearTimeout(reconnectTimer)
      const socket = socketRef.current
      if (socket) {
        setStatus('closing')
        socket.onopen = null
        socket.onmessage = null
        socket.onerror = null
        socket.onclose = null
        socket.close(1000, 'Capture session ended')
      }
      socketRef.current = null
      setStatus('closed')
    }
  }, [enabled, webSocketUrl])

  const getBufferedAmount = useCallback(() => {
    return socketRef.current?.bufferedAmount ?? 0
  }, [])

  const sendJson = useCallback((message: unknown): SendJsonResult => {
    const socket = socketRef.current
    const bufferedAmount = socket?.bufferedAmount ?? 0
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return { sent: false, bufferedAmount, reason: 'not-open' }
    }

    try {
      socket.send(JSON.stringify(message))
      return { sent: true, bufferedAmount: socket.bufferedAmount }
    } catch {
      return { sent: false, bufferedAmount: socket.bufferedAmount, reason: 'send-failed' }
    }
  }, [])

  return {
    status,
    webSocketUrl,
    isConnected: status === 'open',
    sendJson,
    getBufferedAmount,
  }
}
