import { useEffect, useRef } from 'react'
import './LogPanel.css'

export type LogEntry = {
  id: number
  timestamp: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
}

type LogPanelProps = {
  logs: LogEntry[]
}

export default function LogPanel({ logs }: LogPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const scrollElement = scrollRef.current
    if (!scrollElement) return

    scrollElement.scrollTop = scrollElement.scrollHeight
  }, [logs])

  return (
    <div className="log-panel-root">
      <div className="log-panel-header">
        <h4>Log</h4>
        <span>{logs.length}</span>
      </div>
      <div className="log-panel-list" ref={scrollRef}>
        {logs.map((log) => (
          <div className={`log-row is-${log.level}`} key={log.id}>
            <span className="log-time">{log.timestamp}</span>
            <span className="log-level">{log.level}</span>
            <span className="log-message">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
