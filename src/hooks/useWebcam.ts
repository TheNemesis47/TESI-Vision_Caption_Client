import {useCallback, useRef, useState, useEffect} from "react";

import {
    DEFAULT_FACING,
    clampZoom,
    readZoomRange,
    type CameraFacing,
    type ZoomRange,
} from "../domain/cameraControls";

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
    // Lo zoom vive sul track: cambiando fotocamera cambia la corsa, e a
    // volte sparisce del tutto.
    const videoTrackRef = useRef<MediaStreamTrack | null>(null);
    const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);

    const applyZoom = useCallback(async (value: number): Promise<number | null> => {
        const track = videoTrackRef.current;
        const range = readZoomRange(track);
        if (!track?.applyConstraints || !range) return null;
        const wanted = clampZoom(value, range);
        try {
            // Lo zoom non è ancora nei tipi standard di MediaTrackConstraints.
            await track.applyConstraints({
                advanced: [{zoom: wanted}],
            } as unknown as MediaTrackConstraints);
            return wanted;
        } catch {
            // Un obiettivo che rifiuta lo zoom non deve fermare l'anteprima.
            return null;
        }
    }, []);

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
            setZoomRange(null);
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
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: {deviceId: {exact: deviceId}},
                    });
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
                videoTrackRef.current = activeVideoTrack;
                setZoomRange(readZoomRange(activeVideoTrack));
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
                setZoomRange(null);
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
            videoTrackRef.current = null;
            setIsActive(false);
            setIsMirrored(false);
            setActiveDeviceId('');
            setZoomRange(null);
        }
    }, [deviceId, enabled, facing])
    return { videoRef, isActive, isMirrored, activeDeviceId, error, zoomRange, applyZoom };
}
