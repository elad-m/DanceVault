import {
    ArrowLeft,
    LoaderCircle,
    Maximize2,
    Pause,
    Pencil,
    Play,
    RotateCw,
    Trash2,
    Volume2,
    VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
    createSegment,
    deleteSegment,
    getPlaybackUrl,
    getVideoSegments,
    updateSegment,
    uploadSegmentThumbnail,
} from "../api";
import {
    formatDuration,
    getVisibleVideoStatusLabel,
} from "../format";
import type {
    CreateSegmentInput,
    Segment,
    UpdateSegmentInput,
    Video,
} from "../types";
import { DeleteSegmentDialog } from "./DeleteSegmentDialog";
import { EditSegmentDialog } from "./EditSegmentDialog";
import { SegmentEditor } from "./SegmentEditor";

type VideoWorkspaceProps = {
    video: Video | null;
    seekRequest: {
        id: string;
        milliseconds: number;
    } | null;
    backNavigation?: {
        label: string;
        onBack: () => void;
    };
    onDelete: (video: Video) => void;
    onError: (message: string) => void;
};

const thumbnailCaptureDebounceMilliseconds = 250;
const thumbnailMediaTimeoutMilliseconds = 5_000;
const thumbnailWidth = 320;
const thumbnailHeight = 240;

export function VideoWorkspace({ video, seekRequest, backNavigation, onDelete, onError }: VideoWorkspaceProps) {
    const playerShellRef = useRef<HTMLDivElement>(null);
    const playerRef = useRef<HTMLVideoElement>(null);
    const thumbnailCaptureTimeoutRef =
        useRef<ReturnType<typeof setTimeout> | null>(null);
    const thumbnailCaptureGenerationRef = useRef(0);
    const thumbnailCandidatePromiseRef =
        useRef<Promise<Blob | null>>(Promise.resolve(null));
    const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [currentMilliseconds, setCurrentMilliseconds] = useState(0);
    const [durationMilliseconds, setDurationMilliseconds] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(1);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [segmentBeingEdited, setSegmentBeingEdited] =
        useState<Segment | null>(null);
    const [savingSegmentEdit, setSavingSegmentEdit] = useState(false);
    const [segmentPendingDeletion, setSegmentPendingDeletion] =
        useState<Segment | null>(null);
    const [deletingSegment, setDeletingSegment] = useState(false);

    useEffect(() => {
        setPlaybackUrl(null);
        setSegments([]);
        setCurrentMilliseconds(0);
        setDurationMilliseconds(0);
        setIsPlaying(false);
        setSegmentBeingEdited(null);
        setSegmentPendingDeletion(null);

        if (!video) return;

        let cancelled = false;
        setLoading(true);

        Promise.all([
            getVideoSegments(video.id),
            video.status === "ready"
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
        return () => {
            if (thumbnailCaptureTimeoutRef.current) {
                clearTimeout(thumbnailCaptureTimeoutRef.current);
            }
        };
    }, []);

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
            const thumbnailCandidate =
                thumbnailCandidatePromiseRef.current;
            const segment = await createSegment(video.id, input);
            setSegments((current) => [...current, segment].sort((a, b) => a.startMilliseconds - b.startMilliseconds));

            try {
                const thumbnail = await thumbnailCandidate;
                if (!thumbnail) {
                    throw new Error(
                        "The browser could not capture the selected video frame"
                    );
                }
                await uploadSegmentThumbnail(segment.id, thumbnail);
            } catch (error: unknown) {
                onError(
                    error instanceof Error
                        ? `Segment saved, but its thumbnail could not be created: ${error.message}`
                        : "Segment saved, but its thumbnail could not be created"
                );
            }
        } catch (error) {
            onError(error instanceof Error ? error.message : "Could not save segment");
        } finally {
            setSaving(false);
        }
    }

    function scheduleThumbnailCandidate(
        milliseconds: number | null
    ) {
        if (thumbnailCaptureTimeoutRef.current) {
            clearTimeout(thumbnailCaptureTimeoutRef.current);
            thumbnailCaptureTimeoutRef.current = null;
        }

        const generation = ++thumbnailCaptureGenerationRef.current;

        if (milliseconds === null) {
            thumbnailCandidatePromiseRef.current =
                Promise.resolve(null);
            return;
        }

        thumbnailCandidatePromiseRef.current =
            new Promise<Blob | null>((resolve) => {
                thumbnailCaptureTimeoutRef.current = setTimeout(() => {
                    thumbnailCaptureTimeoutRef.current = null;
                    void captureThumbnailCandidate(
                        milliseconds,
                        generation
                    ).then(resolve);
                }, thumbnailCaptureDebounceMilliseconds);
            });
    }

    async function captureThumbnailCandidate(
        milliseconds: number,
        generation: number
    ): Promise<Blob | null> {
        if (!playbackUrl) return null;

        const thumbnailPlayer = document.createElement("video");
        thumbnailPlayer.crossOrigin = "anonymous";
        thumbnailPlayer.preload = "auto";
        thumbnailPlayer.muted = true;
        thumbnailPlayer.src = playbackUrl;

        try {
            const loaded = await waitForThumbnailMediaEvent(
                thumbnailPlayer,
                "loadeddata"
            );
            if (!loaded) return null;

            const targetSeconds = milliseconds / 1000;
            if (Math.abs(thumbnailPlayer.currentTime - targetSeconds) > 0.05) {
                const seekedPromise = waitForThumbnailMediaEvent(
                    thumbnailPlayer,
                    "seeked"
                );
                thumbnailPlayer.currentTime = targetSeconds;
                const seeked = await seekedPromise;
                if (!seeked) return null;
            }

            if (generation !== thumbnailCaptureGenerationRef.current) {
                return null;
            }

            return createThumbnailBlob(thumbnailPlayer);
        } finally {
            thumbnailPlayer.removeAttribute("src");
            thumbnailPlayer.load();
        }
    }

    function waitForThumbnailMediaEvent(
        player: HTMLVideoElement,
        eventName: "loadeddata" | "seeked"
    ): Promise<boolean> {
        return new Promise((resolve) => {
            const finish = (succeeded: boolean) => {
                clearTimeout(timeout);
                player.removeEventListener(eventName, handleSuccess);
                player.removeEventListener("error", handleError);
                resolve(succeeded);
            };
            const handleSuccess = () => finish(true);
            const handleError = () => finish(false);
            const timeout = setTimeout(
                () => finish(false),
                thumbnailMediaTimeoutMilliseconds
            );

            player.addEventListener(eventName, handleSuccess);
            player.addEventListener("error", handleError);

            if (eventName === "loadeddata") {
                player.load();
            }
        });
    }

    function createThumbnailBlob(
        player: HTMLVideoElement
    ): Promise<Blob | null> {
        const canvas = document.createElement("canvas");
        canvas.width = thumbnailWidth;
        canvas.height = thumbnailHeight;
        const context = canvas.getContext("2d");

        if (!context) return Promise.resolve(null);

        const scale = Math.min(
            thumbnailWidth / player.videoWidth,
            thumbnailHeight / player.videoHeight
        );
        const frameWidth = player.videoWidth * scale;
        const frameHeight = player.videoHeight * scale;
        const frameX = (thumbnailWidth - frameWidth) / 2;
        const frameY = (thumbnailHeight - frameHeight) / 2;

        context.fillStyle = "#000000";
        context.fillRect(0, 0, thumbnailWidth, thumbnailHeight);
        context.drawImage(
            player,
            frameX,
            frameY,
            frameWidth,
            frameHeight
        );

        return new Promise((resolve) => {
            canvas.toBlob(
                resolve,
                "image/jpeg",
                0.78
            );
        });
    }

    async function saveSegmentEdit(
        segment: Segment,
        input: UpdateSegmentInput
    ) {
        setSavingSegmentEdit(true);

        try {
            const updatedSegment = await updateSegment(segment.id, input);
            setSegments((current) =>
                current
                    .map((candidate) =>
                        candidate.id === updatedSegment.id
                            ? updatedSegment
                            : candidate
                    )
                    .sort(
                        (left, right) =>
                            left.startMilliseconds - right.startMilliseconds
                    )
            );
            setSegmentBeingEdited(null);
        } catch (error) {
            onError(
                error instanceof Error
                    ? error.message
                    : "Could not update segment"
            );
        } finally {
            setSavingSegmentEdit(false);
        }
    }

    async function handleDeleteSegment(segment: Segment) {
        setDeletingSegment(true);

        try {
            await deleteSegment(segment.id);
            setSegments((current) =>
                current.filter((candidate) => candidate.id !== segment.id)
            );
            setSegmentPendingDeletion(null);
        } catch (error) {
            onError(
                error instanceof Error
                    ? error.message
                    : "Could not delete segment"
            );
        } finally {
            setDeletingSegment(false);
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

    const statusLabel = getVisibleVideoStatusLabel(video.status);

    return (
        <main className="workspace">
            <header className="workspace-header">
                <div className="workspace-title">
                    <h1>{video.title}</h1>
                    {statusLabel && (
                        <span className={`status-badge ${video.status}`}>
                            {statusLabel}
                        </span>
                    )}
                </div>
                <div className="workspace-header-actions">
                    {backNavigation && (
                        <button className="secondary-button" onClick={backNavigation.onBack}>
                            <ArrowLeft size={16} /> {backNavigation.label}
                        </button>
                    )}
                    <button
                        className="danger-button subtle-danger-button"
                        onClick={() => onDelete(video)}
                    >
                        <Trash2 size={16} /> Delete video
                    </button>
                </div>
            </header>

            <div className="workspace-grid">
                <section className="player-column">
                    <div className="player-shell" ref={playerShellRef}>
                        {loading ? (
                            <div className="video-stage player-message"><LoaderCircle className="spin" /> Loading video...</div>
                        ) : playbackUrl ? (
                            <>
                                <div className="video-stage">
                                    <video
                                        ref={playerRef}
                                        src={playbackUrl}
                                        preload="metadata"
                                        onClick={togglePlayback}
                                        onDoubleClick={() => void enterFullscreen()}
                                        onLoadedMetadata={(event) => {
                                            const player = event.currentTarget;
                                            setDurationMilliseconds(Math.round(player.duration * 1000));
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
                        ) : (
                            <div className="video-stage player-message"><RotateCw size={22} /><span>Upload is not ready for playback.</span></div>
                        )}
                    </div>

                    {playbackUrl && (
                        <SegmentEditor
                            currentMilliseconds={currentMilliseconds}
                            saving={saving}
                            onCreate={saveSegment}
                            onThumbnailTimeChange={scheduleThumbnailCandidate}
                        />
                    )}
                </section>

                <aside className="segments-panel">
                    <div className="panel-heading">
                        <div><span className="eyebrow">Index</span><h2>Segments</h2></div>
                        <span className="count-badge">{segments.length}</span>
                    </div>
                    <div className="segment-list">
                        {segments.map((segment) => (
                            <article key={segment.id} className="segment-row">
                                <button
                                    className="segment-play-button"
                                    onClick={() => playSegment(segment)}
                                    disabled={!playbackUrl}
                                >
                                    <span className="segment-time">{formatDuration(segment.startMilliseconds)}</span>
                                    <span className="segment-copy">
                                        <strong>{segment.name}</strong>
                                    </span>
                                    <Play size={15} />
                                </button>
                                <button
                                    className="segment-edit-button"
                                    onClick={() => setSegmentBeingEdited(segment)}
                                    aria-label={`Edit ${segment.name}`}
                                    title="Edit segment"
                                >
                                    <Pencil size={15} />
                                </button>
                                <button
                                    className="segment-edit-button"
                                    onClick={() =>
                                        setSegmentPendingDeletion(segment)
                                    }
                                    aria-label={`Delete ${segment.name}`}
                                    title="Delete segment"
                                >
                                    <Trash2 size={15} />
                                </button>
                            </article>
                        ))}
                        {!loading && segments.length === 0 && <p className="empty-copy">No segments indexed yet.</p>}
                    </div>
                </aside>
            </div>
            <EditSegmentDialog
                segment={segmentBeingEdited}
                saving={savingSegmentEdit}
                onCancel={() => setSegmentBeingEdited(null)}
                onSave={saveSegmentEdit}
            />
            <DeleteSegmentDialog
                segment={segmentPendingDeletion}
                deleting={deletingSegment}
                onCancel={() => setSegmentPendingDeletion(null)}
                onConfirm={handleDeleteSegment}
            />
        </main>
    );
}
