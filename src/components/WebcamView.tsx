import { useWebcam} from "../hooks/useWebcam.ts";

export function WebcamView() {
    const { videoRef, isActive, error } = useWebcam();

    if (error) {
        return <p style={{ color: "red" }}>{error}</p>;
    }

    return (
        <div>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%" }}
                />
            {!isActive && <p>Avvio Webcam...</p>}
        </div>
    );
}