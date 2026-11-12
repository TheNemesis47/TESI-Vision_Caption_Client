import {useCallback, useEffect, useRef, useState} from "react";

import {DEFAULT_FACING, type CameraFacing} from "../domain/cameraZoom";
import {
    FOCUS_RESTORE_MS,
    continuousFocusConstraints,
    describeCameraCapabilities,
    focusConstraints,
    readFocusSupport,
    type FocusPoint,
    type FocusSupport,
} from "../domain/cameraFocus";

type UseWebcamOptions = {
    deviceId?: string;
    enabled?: boolean;
    facing?: CameraFacing;
};

const facingConstraints = (facing: CameraFacing): MediaTrackConstraints => ({
    facingMode: {exact: facing},
});

const REAR_CAMERA_FALLBACK_ERRORS = new Set([
    'ConstraintNotSatisfiedError',
    'NotFoundError',
    'OverconstrainedError',
]);

/**
 * L'anteprima e l'obiettivo acceso.
 *
 * Lo zoom non passa da qui: su Safari `applyConstraints({zoom})` non fa
 * niente, e il telefono cambia ingrandimento cambiando obiettivo. Qui arriva
 * già il deviceId del vetro scelto; il resto dell'ingrandimento è un ritaglio
 * al momento della cattura.
 *
 * Cambiando obiettivo il flusso nuovo si accende PRIMA di spegnere il
 * vecchio. Non è un'ottimizzazione: su Safari, se si spengono tutte le
 * tracce, il permesso della fotocamera torna da chiedere, e a ogni pressione
 * del pulsante ricompariva il pop-up. Finché una traccia resta viva, il
 * permesso resta.
 */
export function useWebcam({
    deviceId,
    enabled = true,
    facing = DEFAULT_FACING,
}: UseWebcamOptions = {}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const videoTrackRef = useRef<MediaStreamTrack | null>(null);
    const restoreFocusTimerRef = useRef<number | undefined>(undefined);
    const [focusSupport, setFocusSupport] = useState<FocusSupport | null>(null);
    const [cameraCapabilities, setCameraCapabilities] = useState<string>('');
    const [isActive, setIsActive] = useState<boolean>(false);
    const [isMirrored, setIsMirrored] = useState<boolean>(false);
    const [activeDeviceId, setActiveDeviceId] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const releaseStream = useCallback(() => {
        window.clearTimeout(restoreFocusTimerRef.current);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        videoTrackRef.current = null;
    }, []);

    /**
     * Mette a fuoco sul punto toccato, in coordinate 0–1 del fotogramma.
     * Restituisce false quando l'obiettivo non lascia comandare il fuoco: chi
     * chiama non deve mostrare un riscontro per qualcosa che non è successo.
     */
    const focusAt = useCallback(async (point: FocusPoint): Promise<boolean> => {
        const track = videoTrackRef.current;
        const support = readFocusSupport(track);
        if (!track?.applyConstraints || !support) return false;
        const richiesta = focusConstraints(support, point);
        if (!richiesta) return false;
        try {
            await track.applyConstraints(richiesta.constraints);
        } catch {
            return false;
        }
        if (richiesta.restoreContinuous) {
            // Lo scatto singolo blocca il fuoco su quel piano: chi non vede
            // non se ne accorgerebbe, quindi il continuo si rimette da sé.
            window.clearTimeout(restoreFocusTimerRef.current);
            restoreFocusTimerRef.current = window.setTimeout(() => {
                void track.applyConstraints(continuousFocusConstraints()).catch(() => undefined);
            }, FOCUS_RESTORE_MS);
        }
        return true;
    }, []);

    useEffect(() => {
        let cancelled = false;
        const videoElement = videoRef.current;
        const handleTrackEnded = () => {
            if (cancelled) return;
            setIsActive(false);
            setIsMirrored(false);
            setActiveDeviceId('');
        };

        if (!enabled) {
            releaseStream();
            if (videoElement) {
                videoElement.srcObject = null;
            }
            queueMicrotask(() => {
                if (cancelled) return;
                setIsActive(false);
                setIsMirrored(false);
                setActiveDeviceId('');
            });
            return () => {
                cancelled = true;
            };
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            queueMicrotask(() => {
                if (cancelled) return;
                setError("WebcamError - API webcam non supportata");
            });
            return;
        }

        const apri = async (): Promise<MediaStream> => {
            if (deviceId) {
                try {
                    return await navigator.mediaDevices.getUserMedia({
                        video: {deviceId: {exact: deviceId}},
                    });
                } catch (lensError) {
                    // Un obiettivo che sparisce (lo usa un'altra app, o
                    // l'elenco è cambiato) non deve spegnere l'anteprima:
                    // si torna a quello predefinito del verso.
                    const errorName = lensError instanceof Error ? lensError.name : '';
                    if (!REAR_CAMERA_FALLBACK_ERRORS.has(errorName)) throw lensError;
                }
            }
            try {
                return await navigator.mediaDevices.getUserMedia({
                    video: facingConstraints(facing),
                });
            } catch (rearCameraError) {
                const errorName = rearCameraError instanceof Error
                    ? rearCameraError.name
                    : '';
                if (!REAR_CAMERA_FALLBACK_ERRORS.has(errorName)) throw rearCameraError;
                return await navigator.mediaDevices.getUserMedia({video: true});
            }
        };

        const start = async () => {
            const precedente = streamRef.current;
            let stream: MediaStream;
            try {
                stream = await apri();
            } catch (primoTentativo) {
                // Qualche telefono non accende due fotocamere insieme: in quel
                // caso si libera la prima e si riprova, accettando il pop-up.
                if (!precedente) {
                    if (cancelled) return;
                    setIsMirrored(false);
                    setActiveDeviceId('');
                    setError("WebcamError - non disponibile: " + (primoTentativo as Error).message);
                    return;
                }
                releaseStream();
                try {
                    stream = await apri();
                } catch (secondoTentativo) {
                    if (cancelled) return;
                    setIsActive(false);
                    setIsMirrored(false);
                    setActiveDeviceId('');
                    setError("WebcamError - non disponibile: " + (secondoTentativo as Error).message);
                    return;
                }
            }

            if (cancelled) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }

            streamRef.current = stream;
            const videoTrack = stream.getVideoTracks()[0] ?? null;
            videoTrackRef.current = videoTrack;
            setFocusSupport(readFocusSupport(videoTrack));
            setCameraCapabilities(describeCameraCapabilities(videoTrack));
            const settings = videoTrack?.getSettings?.();
            videoTrack?.addEventListener?.('ended', handleTrackEnded);

            if (videoElement) {
                videoElement.srcObject = stream;
                if (videoElement.play) {
                    videoElement.play().catch((err) => {
                        if (cancelled) return;
                        setIsActive(false);
                        setError("WebcamError - avvio anteprima non riuscito: " + (err as Error).message);
                    });
                }
            }

            // Solo adesso: il permesso resta acceso perché una traccia è viva.
            if (precedente && precedente !== stream) {
                precedente.getTracks().forEach((track) => track.stop());
            }

            setError(null);
            setIsMirrored(settings?.facingMode === 'user');
            setActiveDeviceId(settings?.deviceId ?? deviceId ?? '');
            setIsActive(true);
        };

        void start();

        return () => {
            cancelled = true;
        };
    }, [deviceId, enabled, facing, releaseStream])

    // Lo spegnimento vero avviene quando la pagina si chiude, non a ogni
    // cambio di obiettivo.
    useEffect(() => releaseStream, [releaseStream]);

    return {
        videoRef,
        isActive,
        isMirrored,
        activeDeviceId,
        error,
        focusAt,
        canFocus: focusSupport !== null,
        cameraCapabilities,
    };
}
