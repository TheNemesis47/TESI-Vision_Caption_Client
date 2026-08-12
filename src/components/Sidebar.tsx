import { useEffect, useState } from 'react';
import './Sidebar.css';
import CaptionModeSwitch from './CaptionModeSwitch';
import type { SocketState } from '../hooks/useServerConnection';
import type { CaptionMode, CaptureState } from '../domain/visionProtocol';

type WebcamDevice = {
    deviceId: string;
    label: string;
};

const defaultObjects = ['Nessuna rilevazione ancora.'];

type SidebarProps = {
    serverConnectionStatus: SocketState;
    captureState: CaptureState;
    captionMode: CaptionMode;
    isWebcamActive: boolean;
    isWebcamEnabled: boolean;
    webcamError: string | null;
    isCaptureRunning: boolean;
    selectedDeviceId: string;
    showAudioAutoplay: boolean;
    audioAutoplayUnlocked: boolean;
    onDeviceChange: (deviceId: string) => void;
    onCaptureToggle: () => void;
    onCaptionModeChange: (mode: CaptionMode) => void;
    onAudioAutoplayUnlock: () => Promise<boolean>;
};

export default function Sidebar({
    serverConnectionStatus,
    captureState,
    captionMode,
    isWebcamActive,
    isWebcamEnabled,
    webcamError,
    isCaptureRunning,
    selectedDeviceId,
    showAudioAutoplay,
    audioAutoplayUnlocked,
    onDeviceChange,
    onCaptureToggle,
    onCaptionModeChange,
    onAudioAutoplayUnlock,
}: SidebarProps) {
    const [devices, setDevices] = useState<WebcamDevice[]>([]);
    const [permissionStatus, setPermissionStatus] = useState<string>('In attesa');
    const [deviceError, setDeviceError] = useState<string | null>(null);
    const [foundObjects] = useState<string[]>(defaultObjects);
    const [isUnlockingAudio, setIsUnlockingAudio] = useState<boolean>(false);
    const isServerConnected = serverConnectionStatus === 'open';
    const hasServerError = isCaptureRunning && serverConnectionStatus === 'closed';
    const serverStatusText =
        serverConnectionStatus === 'open'
            ? 'Connected'
            : serverConnectionStatus === 'connecting'
              ? 'Connessione...'
              : serverConnectionStatus === 'closing'
                ? 'Chiusura...'
                : isCaptureRunning
                  ? 'Disconnesso'
                  : 'Pronto all’avvio';
    const captureStatusText =
        captureState === 'streaming'
            ? 'Streaming attivo'
            : captureState === 'connecting'
              ? 'Connessione al server'
              : captureState === 'error'
                ? 'Errore sessione'
                : captureState === 'stopped'
                  ? 'Cattura fermata'
                  : 'In attesa';
    const hasWebcamProblem = !isWebcamEnabled || !!webcamError;
    const webcamStatusText = !isWebcamEnabled
        ? 'Nessuna webcam'
        : webcamError
          ? 'Errore webcam'
          : isWebcamActive
            ? 'Webcam attiva'
            : isCaptureRunning
              ? 'Avvio webcam'
              : 'Pronta';

    useEffect(() => {
        const loadDevices = async () => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
                setDeviceError('Browser non support enumerateDevices');
                return;
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({video: true});
                setPermissionStatus('Webcam autorizzata');
                stream.getTracks().forEach((track) => track.stop());

                const allDevices = await navigator.mediaDevices.enumerateDevices();
                const videoInputs = allDevices
                    .filter((device) => device.kind === 'videoinput')
                    .map((device) => ({
                        deviceId: device.deviceId,
                        label: device.label || 'Dispositivo video non identificato',
                    }));
                
                setDevices(videoInputs);
                if (videoInputs.length > 0) {
                    onDeviceChange(videoInputs[0].deviceId);
                } else {
                    onDeviceChange('');
                }
            } catch {
                setDeviceError('Accesso Webcam negato o non disponibile');
                setPermissionStatus('Errore Webcam');
                onDeviceChange('');
            }
        };

        loadDevices();
    }, [onDeviceChange]);

    return (
    <div className="sidebar-root">
      <section className="sidebar-section">
        <h3>Server</h3>
        <div className="live-status" aria-live="polite">
          <span
            className={`live-dot ${isServerConnected ? 'is-active' : hasServerError ? 'is-error' : ''}`}
            aria-hidden="true"
          />
          <span>Stato: <strong>{serverStatusText}</strong></span>
        </div>
        <p className="sidebar-status">Sessione: {captureStatusText}</p>
      </section>

      <section className="sidebar-section">
        <CaptionModeSwitch value={captionMode} onChange={onCaptionModeChange} />
      </section>

      {showAudioAutoplay && (
        <section className="sidebar-section">
          <h3>Audio</h3>
          <p className="sidebar-status">
            {audioAutoplayUnlocked ? 'Autoplay abilitato' : 'Autoplay bloccato su iPhone'}
          </p>
          <button
            type="button"
            className={`audio-unlock-button ${audioAutoplayUnlocked ? 'is-unlocked' : ''}`}
            onClick={async (event) => {
              event.preventDefault();
              event.stopPropagation();

              if (audioAutoplayUnlocked || isUnlockingAudio) return;

              setIsUnlockingAudio(true);
              await onAudioAutoplayUnlock();
              setIsUnlockingAudio(false);
            }}
            disabled={audioAutoplayUnlocked || isUnlockingAudio}
          >
            {audioAutoplayUnlocked
              ? 'Audio Autoplay Abilitato'
              : isUnlockingAudio
                ? 'Abilitazione...'
                : 'Abilita Audio Autoplay'}
          </button>
        </section>
      )}

      <section className="sidebar-section">
        <h3>Webcam</h3>
        <label htmlFor="webcam-device">Seleziona il dispositivo</label>
        <select
          id="webcam-device"
          className="sidebar-select"
          value={selectedDeviceId}
          onChange={(event) => onDeviceChange(event.target.value)}
        >
          <option value="">Nessuna webcam</option>
          {devices.length > 0 ? (
            devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label}
              </option>
            ))
          ) : (
            <option value="__no_devices__" disabled>Nessun dispositivo trovato</option>
          )}
        </select>
        <p className="sidebar-status">Stato webcam: {permissionStatus}</p>
        <div className="webcam-actions">
          <div className="live-status">
            <span
              className={`live-dot ${
                hasWebcamProblem ? 'is-error' : isWebcamActive ? 'is-active' : ''
              }`}
              aria-hidden="true"
            />
            <span>{webcamStatusText}</span>
          </div>
          <button
            type="button"
            className={`capture-button ${isCaptureRunning ? 'is-running' : ''}`}
            onClick={onCaptureToggle}
            disabled={!isCaptureRunning && hasWebcamProblem}
          >
            {isCaptureRunning ? 'Ferma cattura' : 'Avvia cattura'}
          </button>
        </div>
        {deviceError && <p className="status-error">{deviceError}</p>}
        {webcamError && <p className="status-error">{webcamError}</p>}
      </section>

      <section className="sidebar-section">
        <h3>Info Webcam</h3>
        <p>
          Dispositivi trovati: <strong>{devices.length}</strong>
        </p>
        <p style={{ marginTop: 8 }}>
          Selezionato:{' '}
          <strong>
            {selectedDeviceId
              ? devices.find((device) => device.deviceId === selectedDeviceId)?.label ||
                'Dispositivo non disponibile'
              : 'Nessuna webcam'}
          </strong>
        </p>
      </section>

      <section className="sidebar-section">
        <h3>Oggetti trovati</h3>
        <div className="sidebar-card">
          <ul>
            {foundObjects.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
