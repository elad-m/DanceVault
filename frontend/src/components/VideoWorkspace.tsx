import {
    ArrowLeft,
    ExternalLink,
    LoaderCircle,
    Maximize2,
    Pause,
    Play,
    RotateCw,
    Trash2,
    Volume2,
    VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createSegment, getPlaybackUrl, getVideoSegments } from "../api";
import { formatDuration } from "../format";
import type { CreateSegmentInput, Segment, Video } from "../types";
import { SegmentEditor } from "./SegmentEditor";

type VideoWorkspaceProps = {
    video: Video | null;
    seekRequest: {
        id: string;
        milliseconds: number;
    } | null;
    onBackToPractice?: () => void;
    onDelete: (video: Video) => void;
    onError: (message: string) => void;
};

export function VideoWorkspace({ video, seekRequest, onBackToPractice, onDelete, onError }: VideoWorkspaceProps) {
    const playerShellRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<HTMLVideoElement>(null);
    const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [currentMilliseconds, setCurrentMilliseconds] = useState(0);
    const [durationMilliseconds, setDurationMilliseconds] = useState(0);
    const [videoAspectRatio, setVideoAspectRatio] = useState("16 / 9");
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setPlaybackUrl(null);
        setSegments([]);
        setCurrentMilliseconds(0);
        setDurationMilliseconds(0);
        setVideoAspectRatio("16 / 9");
        setIsPlaying(false);

        if (!video) return;

        let cancelled = false;
        setLoading(true);

        Promise.all([
            getVideoSegments(video.id),
            video.sourceType === "uploaded" && video.status === "ready"
                ? getPlaybackUrl(video.id)
                : Promise.resolve(null),
        ])
            .then(([nextSegments, nextPlaybackUrl]) => {
                if (cancelled) return;
                setSegments(nextSegments);
                setPlaybackUrl(nextPlaybackUrl);
            })
            .catch((error: unknown) => {
                if (!cancelled) onError(error instanceof Error ? error.message : "Could not load video");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [video, onError]);

    useEffect(() => {
        const player = playerRef.current;
        if (!player || !playbackUrl || !seekRequest || player.readyState < 1) return;

        player.currentTime = seekRequest.milliseconds / 1000;
        setCurrentMilliseconds(seekRequest.milliseconds);
    }, [playbackUrl, seekRequest]);

    async function saveSegment(input: CreateSegmentInput) {
        if (!video) return;
        setSaving(true);
        try {
            const segment = await createSegment(video.id, input);
            setSegments((current) => [...current, segment].sort((a, b) => a.startMilliseconds - b.startMilliseconds));
        } catch (error) {
            onError(error instanceof Error ? error.message : "Could not save segment");
        } finally {
            setSaving(false);
        }
    }

    function playSegment(segment: Segment) {
        const player = playerRef.current;
        if (!player) return;
        player.currentTime = segment.startMilliseconds / 1000;
        void player.play();
    }

    function togglePlayback() {
        const player = playerRef.current;
        if (!player) return;

        if (player.paused) {
            void player.play();
        } else {
            player.pause();
        }
    }

    function seekTo(milliseconds: number) {
        const player = playerRef.current;
        if (!player) return;

        player.currentTime = milliseconds / 1000;
        setCurrentMilliseconds(milliseconds);
    }

    function changeVolume(nextVolume: number) {
        const player = playerRef.current;
        if (!player) return;

        player.volume = nextVolume;
        setVolume(nextVolume);
    }

    async function enterFullscreen() {
        try {
            await playerShellRef.current?.requestFullscreen();
        } catch {
            onError("Fullscreen is not available in this browser");
        }
    }

    if (!video) {
        return (
            <main className="empty-workspace">
                <div className="empty-symbol"><Play size={28} /></div>
                <h1>Select a video</h1>
                <p>Choose a lesson from the library or upload an MP4.</p>
            </main>
        );
    }

    return (
        <main className="workspace">
            <header className="workspace-header">
                <div>
                    <span className="eyebrow">{video.sourceType.replace("_", " ")}</span>
                    <h1>{video.title}</h1>
                </div>
                <div className="workspace-header-actions">
                    {onBackToPractice && (
                        <button className="secondary-button" onClick={onBackToPractice}>
                            <ArrowLeft size={16} /> Back to practice queue
                        </button>
                    )}
                    <button
                        className="danger-button subtle-danger-button"
                        onClick={() => onDelete(video)}
                    >
                        <Trash2 size={16} /> Delete video
                    </button>
                    <span className={`status-badge ${video.status}`}>{video.status.replace("_", " ")}</span>
                </div>
            </header>

            <div className="workspace-grid">
                <section className="player-column">
                    <div className="player-shell" ref={playerShellRef}>
                        {loading ? (
                            <div className="video-stage player-message"><LoaderCircle className="spin" /> Loading video...</div>
                        ) : playbackUrl ? (
                            <>
                                <div className="video-stage" style={{ aspectRatio: videoAspectRatio }}>
                                    <video
                                        ref={playerRef}
                                        src={playbackUrl}
                                        preload="metadata"
                                        onClick={togglePlayback}
                                        onDoubleClick={() => void enterFullscreen()}
                                        onLoadedMetadata={(event) => {
                                            const player = event.currentTarget;
                                            setDurationMilliseconds(Math.round(player.duration * 1000));
                                            setVideoAspectRatio(`${player.videoWidth} / ${player.videoHeight}`);
                                            if (seekRequest) {
                                                player.currentTime = seekRequest.milliseconds / 1000;
                                                setCurrentMilliseconds(seekRequest.milliseconds);
                                            }
                                        }}
                                        onTimeUpdate={(event) => setCurrentMilliseconds(Math.round(event.currentTarget.currentTime * 1000))}
                                        onPlay={() => setIsPlaying(true)}
                                        onPause={() => setIsPlaying(false)}
                                    />
                                </div>
                                <div className="player-controls">
                                    <button className="player-control-button" onClick={togglePlayback} aria-label={isPlaying ? "Pause" : "Play"}>
                                        {isPlaying ? <Pause size={17} /> : <Play size={17} />}
                                    </button>
                                    <span className="player-control-time">{formatDuration(currentMilliseconds)}</span>
                                    <input
                                        className="player-seek"
                                        type="range"
                                        min="0"
                                        max={durationMilliseconds}
                                        step="1"
                                        value={Math.min(currentMilliseconds, durationMilliseconds)}
                                        onInput={(event) => seekTo(Number(event.currentTarget.value))}
                                        aria-label="Seek video"
                                    />
                                    <span className="player-control-time">{formatDuration(durationMilliseconds)}</span>
                                    {volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                                    <input
                                        className="volume-control"
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={volume}
                                        onInput={(event) => changeVolume(Number(event.currentTarget.value))}
                                        aria-label="Volume"
                                    />
                                    <button className="player-control-button" onClick={() => void enterFullscreen()} aria-label="Enter fullscreen" title="Enter fullscreen">
                                        <Maximize2 size={17} />
                                    </button>
                                </div>
                            </>
                        ) : video.sourceUrl ? (
                            <div className="video-stage player-message">
                                <ExternalLink size={22} />
                                <span>External video source</span>
                                <a className="primary-button" href={video.sourceUrl} target="_blank" rel="noreferrer">Open video</a>
                            </div>
                        ) : (
                            <div className="video-stage player-message"><RotateCw size={22} /><span>Upload is not ready for playback.</span></div>
                        )}
                    </div>

                    {playbackUrl && (
                        <SegmentEditor currentMilliseconds={currentMilliseconds} saving={saving} onCreate={saveSegment} />
                    )}
                </section>

                <aside className="segments-panel">
                    <div className="panel-heading">
                        <div><span className="eyebrow">Index</span><h2>Segments</h2></div>
                        <span className="count-badge">{segments.length}</span>
                    </div>
                    <div className="segment-list">
                        {segments.map((segment) => (
                            <button key={segment.id} className="segment-row" onClick={() => playSegment(segment)} disabled={!playbackUrl}>
                                <span className="segment-time">{formatDuration(segment.startMilliseconds)}</span>
                                <span className="segment-copy">
                                    <strong>{segment.name}</strong>
                                    <span>{segment.tags.length > 0 ? segment.tags.join(" / ") : "No tags"}</span>
                                </span>
                                <Play size={15} />
                            </button>
                        ))}
                        {!loading && segments.length === 0 && <p className="empty-copy">No segments indexed yet.</p>}
                    </div>
                </aside>
            </div>
        </main>
    );
}
