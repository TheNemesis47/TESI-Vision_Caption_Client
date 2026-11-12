import {useRef, useState, useEffect} from "react";

import {DEFAULT_FACING, type CameraFacing} from "../domain/cameraZoom";

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
 */
export function useWebcam({
    deviceId,
    enabled = true,
    facing = DEFAULT_FACING,
}: UseWebcamOptions = {}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isActive, setIsActive] = useState<boolean>(false);
    const [isMirrored, setIsMirrored] = useState<boolean>(false);
    const [activeDeviceId, setActiveDeviceId] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        //setup
        let stream: MediaStream | null = null;
        let activeVideoTrack: MediaStreamTrack | null = null;
        let cancelled = false;
        const videoElement = videoRef.current;
        const handleTrackEnded = () => {
            if (cancelled) return;
            setIsActive(false);
            setIsMirrored(false);
            setActiveDeviceId('');
        };

        queueMicrotask(() => {
            if (cancelled) return;
            setIsActive(false);
            setIsMirrored(false);
            setActiveDeviceId('');
            setError(null);
        });

        if (!enabled) {
            if (videoElement) {
                videoElement.srcObject = null;
            }
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

        const start = async () => {
            try {
                if (deviceId) {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: {deviceId: {exact: deviceId}},
                        });
                    } catch (lensError) {
                        // Un obiettivo che sparisce (il telefono lo riserva a
                        // un'altra app, o l'elenco è cambiato) non deve
                        // spegnere l'anteprima: si torna a quello del verso.
                        const errorName = lensError instanceof Error ? lensError.name : '';
                        if (!REAR_CAMERA_FALLBACK_ERRORS.has(errorName)) {
                            throw lensError;
                        }
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: facingConstraints(facing),
                        });
                    }
                } else {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({
                            video: facingConstraints(facing),
                        });
                    } catch (rearCameraError) {
                        const errorName = rearCameraError instanceof Error
                            ? rearCameraError.name
                            : '';
                        if (!REAR_CAMERA_FALLBACK_ERRORS.has(errorName)) {
                            throw rearCameraError;
                        }
                        stream = await navigator.mediaDevices.getUserMedia({video: true});
                    }
                }

                if (cancelled) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                activeVideoTrack = stream.getVideoTracks()[0] ?? null;
                const facingMode = activeVideoTrack?.getSettings?.().facingMode;
                const nextActiveDeviceId = activeVideoTrack?.getSettings?.().deviceId;
                setIsMirrored(facingMode === 'user');
                setActiveDeviceId(nextActiveDeviceId ?? deviceId ?? '');
                activeVideoTrack?.addEventListener?.('ended', handleTrackEnded);

                if (videoElement) {
                    videoElement.srcObject = stream;

                    if (videoElement.play) {
                        videoElement.play()
                          .catch((err) => {
                            if (cancelled) return;
                            setIsActive(false);
                            setError("WebcamError - avvio anteprima non riuscito: " + (err as Error).message);
                          });
                    }

                    setIsActive(true);
                }
            } catch (e) {
                if (cancelled) return;
                setIsMirrored(false);
                setActiveDeviceId('');
                setError("WebcamError - non disponibile: " + (e as Error).message);
            }
        };

        start();

        return () => {
            //cleanup
            cancelled = true;
            if (videoElement) {
                videoElement.srcObject = null;
            }
            activeVideoTrack?.removeEventListener?.('ended', handleTrackEnded);
            stream?.getTracks().forEach((track) => track.stop());
            setIsActive(false);
            setIsMirrored(false);
            setActiveDeviceId('');
        }
    }, [deviceId, enabled, facing])
    return { videoRef, isActive, isMirrored, activeDeviceId, error };
}
