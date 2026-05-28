import {useRef, useState, useEffect, type RefObject} from "react";

export function useFrameCapture(videoRef: RefObject<HTMLVideoElement>) {
    const canvasRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
    const [lastFrame, setLastFrame] = useState<string | null>(null);

    useEffect(() => {
        const intervalId = setInterval(() => {
            const video = videoRef.current;
            const canvas = canvasRef.current;

            if (!video || video.readyState < 2) return;

            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(video, 0, 0, 640, 480);
            const base64 = canvas.toDataURL('image/jpeg').split(',')[1]
            setLastFrame(base64)
        }, 100);

        return () => {clearInterval(intervalId);};
    }, []);

    return { lastFrame };

}