import {
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    LoaderCircle,
    Maximize2,
    Pause,
    Play,
    RefreshCw,
    StepBack,
    StepForward,
    Video as VideoIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getPlaybackUrl } from "../api";
import { formatDuration } from "../format";
import type {
    DecodedVideoFrame,
    VideoFrameDecoder,
} from "../media/VideoFrameDecoder";
import type { Segment, Video } from "../types";

type FrameAction =
    | {
        type: "step";
        direction: "previous" | "next";
    }
    | {
        type: "seek";
        milliseconds: number;
    };

type FramePosition = {
    timestamp: number;
    duration: number;
};

type SegmentPlayerProps = {
    selectionLabel: string;
    segment: Segment | null;
    video: Video | null;
    hasPrevious: boolean;
    hasNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onOpenFullVideo: (segment: Segment) => void;
    onThumbnailCaptured: (
        segmentId: string,
        thumbnail: Blob
    ) => Promise<void>;
    onError: (message: string) => void;
};

export function SegmentPlayer({
    selectionLabel,
    segment,
    video,
    hasPrevious,
    hasNext,
    onPrevious,
    onNext,
    onOpenFullVideo,
    onThumbnailCaptured,
    onError,
}: SegmentPlayerProps) {
    const shellRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const frameCanvasRef = useRef<HTMLCanvasElement>(null);
    const frameDecoderRef = useRef<VideoFrameDecoder | null>(null);
    const frameDecoderGenerationRef = useRef(0);
    const frameOperationRunningRef = useRef(false);
    const frameSeekTimeoutRef = useRef<number | null>(null);
    const lastFrameActionRef = useRef<FrameAction | null>(null);
    const thumbnailCapturedForSegmentRef = useRef<string | null>(null);
    const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
    const [currentMilliseconds, setCurrentMilliseconds] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [loading, setLoading] = useState(false);
    const [frameMode, setFrameMode] = useState(false);
    const [framePosition, setFramePosition] =
        useState<FramePosition | null>(null);
    const [frameLoading, setFrameLoading] = useState(false);
    const [frameError, setFrameError] = useState<string | null>(null);

    useEffect(() => {
        frameDecoderGenerationRef.current += 1;
        frameDecoderRef.current?.dispose();
        frameDecoderRef.current = null;
        frameOperationRunningRef.current = false;
        if (frameSeekTimeoutRef.current !== null) {
            window.clearTimeout(frameSeekTimeoutRef.current);
            frameSeekTimeoutRef.current = null;
        }

        setPlaybackUrl(null);
        setPlaying(false);
        setCurrentMilliseconds(segment?.startMilliseconds ?? 0);
        setFrameMode(false);
        setFramePosition(null);
        setFrameLoading(false);
        setFrameError(null);
        thumbnailCapturedForSegmentRef.current = null;

        if (!segment || !video || video.status !== "ready") return;

        let cancelled = false;
        setLoading(true);
        getPlaybackUrl(video.id)
            .then((url) => {
                if (!cancelled) setPlaybackUrl(url);
            })
            .catch((error: unknown) => {
                if (!cancelled) onError(error instanceof Error ? error.message : "Could not load segment video");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [segment?.id, video?.id, onError]);

    useEffect(() => {
        return () => {
            frameDecoderGenerationRef.current += 1;
            frameDecoderRef.current?.dispose();
            if (frameSeekTimeoutRef.current !== null) {
                window.clearTimeout(frameSeekTimeoutRef.current);
            }
        };
    }, []);

    function disposeFrameDecoder() {
        frameDecoderRef.current?.dispose();
        frameDecoderRef.current = null;
    }

    async function getFrameDecoder(
        generation: number
    ): Promise<VideoFrameDecoder | null> {
        if (frameDecoderRef.current) {
            return frameDecoderRef.current;
        }
        if (!playbackUrl) return null;

        const { VideoFrameDecoder: Decoder } = await import(
            "../media/VideoFrameDecoder"
        );
        const decoder = await Decoder.create(playbackUrl);

        if (generation !== frameDecoderGenerationRef.current) {
            decoder.dispose();
            return null;
        }

        frameDecoderRef.current = decoder;
        return decoder;
    }

    function drawDecodedFrame(frame: DecodedVideoFrame) {
        const canvas = frameCanvasRef.current;
        if (!canvas) return;

        canvas.width = frame.canvas.width;
        canvas.height = frame.canvas.height;

        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("The browser could not display the decoded frame");
        }

        context.drawImage(frame.canvas, 0, 0);
    }

    async function resolveFrameAction(
        decoder: VideoFrameDecoder,
        action: FrameAction
    ): Promise<DecodedVideoFrame> {
        if (!segment) {
            throw new Error("No segment is selected");
        }

        const epsilonSeconds = 0.000001;
        const segmentStartSeconds = segment.startMilliseconds / 1000;
        const segmentEndSeconds = segment.endMilliseconds / 1000;
        const lastSegmentTimestamp = Math.max(
            segmentStartSeconds,
            segmentEndSeconds - epsilonSeconds
        );
        const startFrame = await decoder.getFrameAt(segmentStartSeconds);
        const endFrame = await decoder.getFrameAt(lastSegmentTimestamp);

        if (action.type === "seek") {
            const requestedTimestamp = action.milliseconds / 1000;
            const timestamp = Math.min(
                Math.max(requestedTimestamp, startFrame.timestamp),
                endFrame.timestamp
            );
            return decoder.getFrameAt(timestamp);
        }

        const currentFrame = framePosition ?? await decoder.getFrameAt(
            Math.min(
                Math.max(currentMilliseconds / 1000, segmentStartSeconds),
                lastSegmentTimestamp
            )
        );
        const requestedTimestamp = action.direction === "next"
            ? currentFrame.timestamp +
                Math.max(currentFrame.duration, epsilonSeconds) +
                epsilonSeconds
            : currentFrame.timestamp - epsilonSeconds;
        const timestamp = Math.min(
            Math.max(requestedTimestamp, startFrame.timestamp),
            endFrame.timestamp
        );

        return decoder.getFrameAt(timestamp);
    }

    async function executeFrameAction(action: FrameAction) {
        if (
            !segment ||
            !playbackUrl ||
            frameOperationRunningRef.current
        ) {
            return;
        }

        const generation = frameDecoderGenerationRef.current;
        frameOperationRunningRef.current = true;
        lastFrameActionRef.current = action;
        setFrameLoading(true);
        setFrameError(null);
        videoRef.current?.pause();

        try {
            let decodedFrame: DecodedVideoFrame | null = null;

            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    const decoder = await getFrameDecoder(generation);
                    if (!decoder) return;

                    decodedFrame = await resolveFrameAction(decoder, action);
                    break;
                } catch (error) {
                    disposeFrameDecoder();
                    if (attempt === 1) throw error;
                }
            }

            if (
                !decodedFrame ||
                generation !== frameDecoderGenerationRef.current
            ) {
                return;
            }

            drawDecodedFrame(decodedFrame);
            setFramePosition({
                timestamp: decodedFrame.timestamp,
                duration: decodedFrame.duration,
            });
            setCurrentMilliseconds(
                Math.min(
                    Math.max(
                        Math.round(decodedFrame.timestamp * 1000),
                        segment.startMilliseconds
                    ),
                    segment.endMilliseconds
                )
            );
            setFrameMode(true);
        } catch (error) {
            if (generation !== frameDecoderGenerationRef.current) return;

            setFrameError(
                error instanceof Error
                    ? error.message
                    : "Could not decode this video frame"
            );
        } finally {
            if (generation === frameDecoderGenerationRef.current) {
                frameOperationRunningRef.current = false;
                setFrameLoading(false);
            }
        }
    }

    function leaveFrameMode(playAfterLeaving: boolean) {
        const player = videoRef.current;
        setFrameMode(false);
        setFramePosition(null);
        setFrameError(null);
        if (!player) return;

        player.currentTime = currentMilliseconds / 1000;
        if (playAfterLeaving) {
            void player.play();
        }
    }

    function togglePlayback() {
        const player = videoRef.current;
        if (!player || !segment) return;

        if (frameMode) {
            leaveFrameMode(true);
            return;
        }

        if (player.paused) {
            if (
                player.currentTime * 1000 < segment.startMilliseconds ||
                player.currentTime * 1000 >= segment.endMilliseconds
            ) {
                player.currentTime = segment.startMilliseconds / 1000;
            }
            void player.play();
        } else {
            player.pause();
        }
    }

    function seekTo(milliseconds: number) {
        const player = videoRef.current;
        if (!player) return;

        if (frameMode) {
            setCurrentMilliseconds(milliseconds);
            if (frameSeekTimeoutRef.current !== null) {
                window.clearTimeout(frameSeekTimeoutRef.current);
            }
            frameSeekTimeoutRef.current = window.setTimeout(() => {
                frameSeekTimeoutRef.current = null;
                void executeFrameAction({
                    type: "seek",
                    milliseconds,
                });
            }, 120);
            return;
        }

        player.currentTime = milliseconds / 1000;
        setFramePosition(null);
        setCurrentMilliseconds(milliseconds);
    }

    function captureSegmentThumbnail(player: HTMLVideoElement) {
        if (
            !segment ||
            thumbnailCapturedForSegmentRef.current === segment.id ||
            player.videoWidth === 0 ||
            player.videoHeight === 0 ||
            Math.abs(player.currentTime * 1000 - segment.startMilliseconds) > 100
        ) {
            return;
        }

        thumbnailCapturedForSegmentRef.current = segment.id;
        const segmentId = segment.id;

        player.requestVideoFrameCallback(() => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = 320;
                canvas.height = 240;
                const context = canvas.getContext("2d");

                if (!context) {
                    thumbnailCapturedForSegmentRef.current = null;
                    return;
                }

                const scale = Math.min(
                    canvas.width / player.videoWidth,
                    canvas.height / player.videoHeight
                );
                const frameWidth = player.videoWidth * scale;
                const frameHeight = player.videoHeight * scale;
                const frameX = (canvas.width - frameWidth) / 2;
                const frameY = (canvas.height - frameHeight) / 2;

                context.fillStyle = "#000000";
                context.fillRect(0, 0, canvas.width, canvas.height);
                context.drawImage(
                    player,
                    frameX,
                    frameY,
                    frameWidth,
                    frameHeight
                );
                canvas.toBlob(
                    (thumbnail) => {
                        if (!thumbnail) {
                            thumbnailCapturedForSegmentRef.current = null;
                            return;
                        }

                        void onThumbnailCaptured(segmentId, thumbnail)
                            .catch(() => {
                                thumbnailCapturedForSegmentRef.current = null;
                            });
                    },
                    "image/jpeg",
                    0.78
                );
            } catch {
                thumbnailCapturedForSegmentRef.current = null;
                // Thumbnail capture is optional and can be blocked by storage CORS policy.
            }
        });
    }

    if (!segment || !video) {
        return (
            <section className="practice-player empty-practice-player">
                <Play size={24} />
                <span>Select a segment.</span>
            </section>
        );
    }

    return (
        <section className="practice-player">
            <div className="practice-player-heading">
                <div>
                    <span className="eyebrow">{selectionLabel}</span>
                    <h2>{segment.name}</h2>
                    <p>{video.title}</p>
                </div>
                <button className="secondary-button" onClick={() => onOpenFullVideo(segment)}>
                    <VideoIcon size={15} />
                    <span className="full-video-label">Go to full video</span>
                </button>
            </div>

            <div className="practice-player-shell" ref={shellRef}>
                {playbackUrl ? (
                    <div
                        className={`practice-video-stage${
                            frameMode ? " frame-mode-active" : ""
                        }`}
                    >
                        <video
                            ref={videoRef}
                            src={playbackUrl}
                            crossOrigin="anonymous"
                            preload="metadata"
                            onClick={togglePlayback}
                            onLoadedMetadata={(event) => {
                                const player = event.currentTarget;
                                player.currentTime = segment.startMilliseconds / 1000;
                            }}
                            onLoadedData={(event) => captureSegmentThumbnail(event.currentTarget)}
                            onSeeked={(event) => captureSegmentThumbnail(event.currentTarget)}
                            onPlay={() => setPlaying(true)}
                            onPause={() => setPlaying(false)}
                            onTimeUpdate={(event) => {
                                const player = event.currentTarget;
                                const milliseconds = Math.round(player.currentTime * 1000);
                                if (milliseconds >= segment.endMilliseconds) {
                                    player.pause();
                                    player.currentTime = segment.endMilliseconds / 1000;
                                    setCurrentMilliseconds(segment.endMilliseconds);
                                    return;
                                }
                                setCurrentMilliseconds(milliseconds);
                            }}
                        />
                        <canvas
                            ref={frameCanvasRef}
                            className="practice-frame-canvas"
                            hidden={!frameMode}
                            onClick={() => leaveFrameMode(true)}
                        />
                        {frameLoading && (
                            <div className="frame-loading-overlay">
                                <LoaderCircle className="spin" size={19} />
                                Decoding frame...
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="practice-video-stage practice-player-message">
                        {loading ? "Loading segment..." : "Video unavailable"}
                    </div>
                )}

                {playbackUrl && (
                    <div className="practice-player-controls">
                        <button className="player-control-button" onClick={togglePlayback} aria-label={playing ? "Pause segment" : "Play segment"}>
                            {playing ? <Pause size={17} /> : <Play size={17} />}
                        </button>
                        <span className="player-control-time">{formatDuration(currentMilliseconds)}</span>
                        <input
                            type="range"
                            className="player-seek"
                            min={segment.startMilliseconds}
                            max={segment.endMilliseconds}
                            step="1"
                            value={Math.min(Math.max(currentMilliseconds, segment.startMilliseconds), segment.endMilliseconds)}
                            onInput={(event) => seekTo(Number(event.currentTarget.value))}
                            disabled={frameLoading}
                            aria-label="Seek within segment"
                        />
                        <span className="player-control-time">{formatDuration(segment.endMilliseconds)}</span>
                        <button
                            className="player-control-button"
                            onClick={() => void executeFrameAction({
                                type: "step",
                                direction: "previous",
                            })}
                            disabled={frameLoading}
                            aria-label="Previous video frame"
                            title="Previous frame"
                        >
                            <StepBack size={17} />
                        </button>
                        <button
                            className="player-control-button"
                            onClick={() => void executeFrameAction({
                                type: "step",
                                direction: "next",
                            })}
                            disabled={frameLoading}
                            aria-label="Next video frame"
                            title="Next frame"
                        >
                            <StepForward size={17} />
                        </button>
                        <button className="player-control-button" onClick={() => void shellRef.current?.requestFullscreen()} aria-label="Enter segment fullscreen">
                            <Maximize2 size={17} />
                        </button>
                    </div>
                )}
                {frameError && (
                    <div className="frame-decoder-error" role="alert">
                        <AlertCircle size={16} />
                        <span>{frameError}</span>
                        <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                                const action = lastFrameActionRef.current;
                                if (action) void executeFrameAction(action);
                            }}
                        >
                            <RefreshCw size={15} />
                            Retry
                        </button>
                    </div>
                )}
            </div>

            <div className="practice-navigation">
                <button className="secondary-button" onClick={onPrevious} disabled={!hasPrevious}>
                    <ChevronLeft size={16} /> Previous
                </button>
                <span>{formatDuration(segment.endMilliseconds - segment.startMilliseconds)}</span>
                <button className="secondary-button" onClick={onNext} disabled={!hasNext}>
                    Next <ChevronRight size={16} />
                </button>
            </div>
        </section>
    );
}
