import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import './VideoPanel.css';
import type {
  CaptionMode,
  CaptureState,
  PointingOverlayMessage,
} from '../domain/visionProtocol';
import PointingOverlayLayer from './PointingOverlayLayer';
import {
  calculatePreviewContentRect,
  type PreviewObjectFit,
} from './pointingOverlayGeometry';

type Detection = {
  class_name: string;
  confidence: number;
  bbox: {
    x_min: number;
    y_min: number;
    x_max: number;
    y_max: number;
  };
};

type VideoLayout = {
  left: number;
  top: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
};

type VideoPanelProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  isActive: boolean;
  isMirrored: boolean;
  isWebcamEnabled: boolean;
  error: string | null;
  caption: string;
  detections: Detection[];
  pointingOverlay: PointingOverlayMessage | null;
  captionMode: CaptionMode;
  captureState: CaptureState;
  objectFit?: PreviewObjectFit;
};

export default function VideoPanel({
  videoRef,
  isActive,
  isMirrored,
  isWebcamEnabled,
  error,
  caption,
  detections,
  pointingOverlay,
  captionMode,
  captureState,
  objectFit = 'contain',
}: VideoPanelProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [videoLayout, setVideoLayout] = useState<VideoLayout>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
    imageWidth: 0,
    imageHeight: 0,
  });

  const updateVideoContentRect = useCallback(() => {
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!frame) return;

    const frameRect = frame.getBoundingClientRect();
    const frameWidth = frameRect.width;
    const frameHeight = frameRect.height;
    const videoWidth = video?.videoWidth ?? 0;
    const videoHeight = video?.videoHeight ?? 0;

    if (frameWidth <= 0 || frameHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) {
      setVideoLayout({
        left: 0,
        top: 0,
        width: frameWidth,
        height: frameHeight,
        imageWidth: videoWidth,
        imageHeight: videoHeight,
      });
      return;
    }

    const contentRect = calculatePreviewContentRect({
      containerWidth: frameWidth,
      containerHeight: frameHeight,
      imageWidth: videoWidth,
      imageHeight: videoHeight,
      objectFit,
    });

    setVideoLayout({
      ...contentRect,
      imageWidth: videoWidth,
      imageHeight: videoHeight,
    });
  }, [objectFit, videoRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const logEvent = (eventName: string, data?: unknown) => {
      console.log(`[VideoPanel] Video event: ${eventName}`, data);
    };

    const handlePlay = () => {
      logEvent('play', { paused: video.paused, readyState: video.readyState });
    };

    const handleLoadedMetadata = () => {
      logEvent('loadedmetadata', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
      });
    };

    const handleCanPlay = () => {
      logEvent('canplay', { readyState: video.readyState });
    };

    const handlePlaying = () => {
      logEvent('playing', { currentTime: video.currentTime });
    };

    const handleError = () => {
      logEvent('error', { error: video.error });
    };

    const handlePause = () => {
      logEvent('pause', { paused: video.paused });
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoRef]);

  useEffect(() => {
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!frame) return;

    let animationFrame = 0;
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateVideoContentRect);
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);

    resizeObserver.observe(frame);
    video?.addEventListener('loadedmetadata', scheduleUpdate);
    video?.addEventListener('resize', scheduleUpdate);
    window.addEventListener('resize', scheduleUpdate);
    scheduleUpdate();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      video?.removeEventListener('loadedmetadata', scheduleUpdate);
      video?.removeEventListener('resize', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, [updateVideoContentRect, videoRef]);

  const videoContentStyle = {
    left: `${videoLayout.left}px`,
    top: `${videoLayout.top}px`,
    width: `${videoLayout.width}px`,
    height: `${videoLayout.height}px`,
  } as CSSProperties;
  const currentPointingOverlay =
    pointingOverlay?.overlays.find((overlay) => overlay.state === 'ACTIVE') ??
    pointingOverlay?.overlays[0];

  return (
    <div className="video-panel-root">
      <div
        ref={frameRef}
        className="video-frame"
      >
        <video
          ref={videoRef}
          className={isMirrored ? 'is-mirrored' : undefined}
          style={{ objectFit }}
          autoPlay
          playsInline
          muted
        />
        <div className="video-content-layer" style={videoContentStyle}>
          <PointingOverlayLayer
            message={
              captionMode === 'POINTING' && isActive ? pointingOverlay : null
            }
            imageWidth={videoLayout.imageWidth}
            imageHeight={videoLayout.imageHeight}
            mirrored={isMirrored}
          />
          {detections.length > 0 && (
            <div className="detections-layer" aria-hidden="true">
              {detections.map((detection, index) => {
                const { x_min, y_min, x_max, y_max } = detection.bbox;
                const width = Math.max(0, x_max - x_min);
                const height = Math.max(0, y_max - y_min);
                const left = isMirrored ? 1 - x_max : x_min;

                return (
                  <div
                    className="bounding-box"
                    key={`${detection.class_name}-${index}`}
                    style={{
                      left: `${left * 100}%`,
                      top: `${y_min * 100}%`,
                      width: `${width * 100}%`,
                      height: `${height * 100}%`,
                    }}
                  >
                    <span className="detection-label">
                      {detection.class_name} {Math.round(detection.confidence * 100)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {!isWebcamEnabled && <div className="overlay error">Nessuna webcam selezionata</div>}
        {isWebcamEnabled && !isActive && (
          <div className="overlay">
            {captureState === 'connecting'
              ? 'Avvio webcam…'
              : 'Webcam pronta. Avvia la cattura.'}
          </div>
        )}
        {error && <div className="overlay error">{error}</div>}
        {captionMode === 'POINTING' && isActive && !error && (
          <div className="pointing-wait-status" role="status" aria-live="polite">
            {currentPointingOverlay?.state === 'ACTIVE'
              ? 'Puntamento attivo'
              : currentPointingOverlay?.state === 'CANDIDATE'
                ? `Conferma gesto ${Math.round(
                    currentPointingOverlay.confirmation_progress * 100,
                  )}%`
                : 'In attesa del gesto'}
          </div>
        )}
        {caption && (
          <div className="caption-overlay" aria-live="polite" aria-atomic="true">
            {caption}
          </div>
        )}
      </div>
    </div>
  );
}
