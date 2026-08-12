import {useRef, useState, useEffect} from "react";

type UseWebcamOptions = {
    deviceId?: string;
    enabled?: boolean;
};

export function useWebcam({deviceId, enabled = true}: UseWebcamOptions = {}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isActive, setIsActive] = useState<boolean>(false);
    const [isMirrored, setIsMirrored] = useState<boolean>(false);
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
        };

        queueMicrotask(() => {
            if (cancelled) return;
            setIsActive(false);
            setIsMirrored(false);
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
                const videoConstraints: boolean | MediaTrackConstraints = deviceId
                    ? {deviceId: {exact: deviceId}}
                    : true;
                console.log('[useWebcam] Richiesta stream con constrains:', videoConstraints);
                stream = await navigator.mediaDevices.getUserMedia({video: videoConstraints});
                console.log('[useWebcam] ✓ Stream ottenuto:', {
                  videoTracks: stream.getVideoTracks().length,
                  audioTracks: stream.getAudioTracks().length,
                  id: stream.id,
                });

                if (cancelled) {
                    console.log('[useWebcam] Operazione cancellata, fermo stream');
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }

                activeVideoTrack = stream.getVideoTracks()[0] ?? null;
                const facingMode = activeVideoTrack?.getSettings?.().facingMode;
                setIsMirrored(facingMode === 'user');
                activeVideoTrack?.addEventListener?.('ended', handleTrackEnded);

                if (videoElement) {
                    console.log('[useWebcam] Assegno srcObject al video element');
                    videoElement.srcObject = stream;

                    // Forza il play su iOS
                    if (videoElement.play) {
                        videoElement.play()
                          .then(() => {
                            console.log('[useWebcam] ✓ Video play() riuscito');
                          })
                          .catch((err) => {
                            console.error('[useWebcam] ✗ Video play() fallito:', err);
                          });
                    }

                    setIsActive(true);
                } else {
                    console.error('[useWebcam] videoElement è null!');
                }
            } catch (e) {
                console.error('[useWebcam] Errore getUserMedia:', e);
                if (cancelled) return;
                setIsMirrored(false);
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
        }
    }, [deviceId, enabled])
    return { videoRef, isActive, isMirrored, error };
}
