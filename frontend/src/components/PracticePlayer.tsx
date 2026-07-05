import {
    ChevronLeft,
    ChevronRight,
    ExternalLink,
    Maximize2,
    Pause,
    Play,
    Video as VideoIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getPlaybackUrl } from "../api";
import { formatDuration } from "../format";
import type { Segment, Video } from "../types";

type PracticePlayerProps = {
    segment: Segment | null;
    video: Video | null;
    hasPrevious: boolean;
    hasNext: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onOpenFullVideo: (segment: Segment) => void;
    onThumbnailCaptured: (segmentId: string, dataUrl: string) => void;
    onError: (message: string) => void;
};

export function PracticePlayer({
    segment,
    video,
    hasPrevious,
    hasNext,
    onPrevious,
    onNext,
    onOpenFullVideo,
    onThumbnailCaptured,
    onError,
}: PracticePlayerProps) {
    const shellRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const thumbnailCapturedForSegmentRef = useRef<string | null>(null);
    const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
    const [currentMilliseconds, setCurrentMilliseconds] = useState(0);
    const [aspectRatio, setAspectRatio] = useState("16 / 9");
    const [playing, setPlaying] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setPlaybackUrl(null);
        setPlaying(false);
        setAspectRatio("16 / 9");
        setCurrentMilliseconds(segment?.startMilliseconds ?? 0);
        thumbnailCapturedForSegmentRef.current = null;

        if (!segment || !video || video.sourceType !== "uploaded" || video.status !== "ready") return;

        let cancelled = false;
        setLoading(true);
        getPlaybackUrl(video.id)
            .then((url) => {
                if (!cancelled) setPlaybackUrl(url);
            })
            .catch((error: unknown) => {
                if (!cancelled) onError(error instanceof Error ? error.message : "Could not load practice video");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [segment?.id, video?.id, onError]);

    function togglePlayback() {
        const player = videoRef.current;
        if (!player || !segment) return;

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
        player.currentTime = milliseconds / 1000;
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
                canvas.height = Math.round(
                    canvas.width * player.videoHeight / player.videoWidth
                );
                const context = canvas.getContext("2d");
                if (!context) return;

                context.drawImage(player, 0, 0, canvas.width, canvas.height);
                onThumbnailCaptured(
                    segmentId,
                    canvas.toDataURL("image/jpeg", 0.78)
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
                <span>Select a segment to practice.</span>
            </section>
        );
    }

    const externalUrl = segment.playbackUrl ?? video.sourceUrl;

    return (
        <section className="practice-player">
            <div className="practice-player-heading">
                <div>
                    <span className="eyebrow">Now practicing</span>
                    <h2>{segment.name}</h2>
                    <p>{video.title}</p>
                </div>
                <button className="secondary-button" onClick={() => onOpenFullVideo(segment)}>
                    <VideoIcon size={15} /> Go to full video
                </button>
            </div>

            <div className="practice-player-shell" ref={shellRef}>
                {video.sourceType === "uploaded" ? (
                    playbackUrl ? (
                        <div className="practice-video-stage" style={{ aspectRatio }}>
                            <video
                                ref={videoRef}
                                src={playbackUrl}
                                crossOrigin="anonymous"
                                preload="metadata"
                                onClick={togglePlayback}
                                onLoadedMetadata={(event) => {
                                    const player = event.currentTarget;
                                    setAspectRatio(`${player.videoWidth} / ${player.videoHeight}`);
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
                        </div>
                    ) : (
                        <div className="practice-video-stage practice-player-message">
                            {loading ? "Loading segment..." : "Video unavailable"}
                        </div>
                    )
                ) : (
                    <div className="practice-video-stage practice-player-message">
                        <ExternalLink size={22} />
                        <span>External video source</span>
                        {externalUrl && (
                            <a className="primary-button" href={externalUrl} target="_blank" rel="noreferrer">
                                Open at timestamp
                            </a>
                        )}
                    </div>
                )}

                {video.sourceType === "uploaded" && playbackUrl && (
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
                            aria-label="Seek within segment"
                        />
                        <span className="player-control-time">{formatDuration(segment.endMilliseconds)}</span>
                        <button className="player-control-button" onClick={() => void shellRef.current?.requestFullscreen()} aria-label="Enter practice fullscreen">
                            <Maximize2 size={17} />
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
