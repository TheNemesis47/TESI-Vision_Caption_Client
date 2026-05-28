import {useRef, useState, useEffect, type RefObject} from "react";

type Result = {
    videoRef: RefObject<HTMLVideoElement>;
    isActive: boolean;
    error: string | null;
}

export function useWebcam() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isActive, setIsActive] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        //setup
        let stream: MediaStream;
        const start = async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({video: true});
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
                setIsActive(true);
            } catch (e) {
                setError("WebcamError - non disponibile: " + (e as Error).message);
            }
        };

        start();

        return () => {
            //cleanup
            stream?.getTracks().forEach((track) => track.stop());
            setIsActive(false);
        }
    }, [])
    return { videoRef, isActive, error };
}