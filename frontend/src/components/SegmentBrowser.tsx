import { ListChecks, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
    deleteSegment,
    getAllSegments,
    getPracticeQueue,
    getSegmentThumbnailPlaybackUrl,
    updateSegment,
    uploadSegmentThumbnail,
} from "../api";
import { formatDuration } from "../format";
import type {
    Confidence,
    PracticePriority,
    Segment,
    UpdateSegmentInput,
    Video,
} from "../types";
import { DeleteSegmentDialog } from "./DeleteSegmentDialog";
import { SegmentPlayer } from "./SegmentPlayer";
import { EditSegmentDialog } from "./EditSegmentDialog";

export type SegmentBrowserMode = "practice" | "all";

type SegmentBrowserProps = {
    mode: SegmentBrowserMode;
    videos: Video[];
    initialSelectedSegmentId: string | null;
    onSelectSegment: (segmentId: string | null) => void;
    onOpenFullVideo: (segment: Segment) => void;
    onError: (message: string) => void;
};

const maximumConcurrentThumbnailRequests = 3;

type ThumbnailRequest = {
    segmentId: string;
    generation: number;
};

type SegmentThumbnailProps = {
    segmentId: string;
    thumbnailUrl: string | undefined;
    onVisible: (segmentId: string) => void;
};

function SegmentThumbnail({
    segmentId,
    thumbnailUrl,
    onVisible,
}: SegmentThumbnailProps) {
    const elementRef = useRef<HTMLSpanElement>(null);
    const requestedRef = useRef(false);

    useEffect(() => {
        if (thumbnailUrl || requestedRef.current) return;

        const element = elementRef.current;
        if (!element || !("IntersectionObserver" in window)) {
            requestedRef.current = true;
            onVisible(segmentId);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;

                requestedRef.current = true;
                onVisible(segmentId);
                observer.disconnect();
            },
            {
                rootMargin: "160px 0px",
            }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [onVisible, segmentId, thumbnailUrl]);

    return (
        <span className="queue-thumbnail" ref={elementRef}>
            {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" />
            ) : (
                <ListChecks size={17} />
            )}
        </span>
    );
}

function belongsInPracticeQueue(segment: Segment): boolean {
    return segment.practicePriority === "high" || segment.confidence === "low";
}

function sortPracticeSegments(segments: Segment[]): Segment[] {
    const priorityRank: Record<PracticePriority, number> = {
        high: 3,
        medium: 2,
        low: 1,
    };
    const confidenceRank: Record<Confidence, number> = {
        low: 1,
        medium: 2,
        high: 3,
    };

    return [...segments].sort((left, right) =>
        priorityRank[right.practicePriority] - priorityRank[left.practicePriority] ||
        confidenceRank[left.confidence] - confidenceRank[right.confidence] ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.id.localeCompare(right.id)
    );
}

export function SegmentBrowser({
    mode,
    videos,
    initialSelectedSegmentId,
    onSelectSegment,
    onOpenFullVideo,
    onError,
}: SegmentBrowserProps) {
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
    const [updatingSegmentId, setUpdatingSegmentId] = useState<string | null>(null);
    const [segmentBeingEdited, setSegmentBeingEdited] =
        useState<Segment | null>(null);
    const [segmentPendingDeletion, setSegmentPendingDeletion] =
        useState<Segment | null>(null);
    const [deletingSegment, setDeletingSegment] = useState(false);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
    const initialSelectedSegmentIdRef = useRef(initialSelectedSegmentId);
    const thumbnailObjectUrlsRef = useRef(new Set<string>());
    const thumbnailRequestQueueRef = useRef<ThumbnailRequest[]>([]);
    const activeThumbnailRequestCountRef = useRef(0);
    const thumbnailRequestGenerationRef = useRef(0);
    const requestedThumbnailIdsRef = useRef(new Set<string>());

    useEffect(() => {
        const thumbnailObjectUrls = thumbnailObjectUrlsRef.current;

        return () => {
            thumbnailRequestGenerationRef.current += 1;
            thumbnailRequestQueueRef.current = [];

            for (const objectUrl of thumbnailObjectUrls) {
                URL.revokeObjectURL(objectUrl);
            }
            thumbnailObjectUrls.clear();
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        thumbnailRequestGenerationRef.current += 1;
        thumbnailRequestQueueRef.current = [];
        requestedThumbnailIdsRef.current.clear();
        setLoading(true);

        const getSegments = mode === "practice"
            ? getPracticeQueue
            : getAllSegments;

        getSegments()
            .then((response) => {
                if (cancelled) return;
                setSegments(response.segments);
                const initialSegment = response.segments.find(
                    (segment) => segment.id === initialSelectedSegmentIdRef.current
                ) ?? response.segments[0];
                setSelectedSegmentId(initialSegment?.id ?? null);
                onSelectSegment(initialSegment?.id ?? null);
                setNextCursor(response.nextCursor);
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    onError(
                        error instanceof Error
                            ? error.message
                            : `Could not load ${mode === "practice" ? "practice queue" : "segments"}`
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [mode, onError, onSelectSegment]);

    function selectSegment(segmentId: string | null) {
        setSelectedSegmentId(segmentId);
        onSelectSegment(segmentId);
    }

    function processThumbnailRequestQueue() {
        while (
            activeThumbnailRequestCountRef.current <
                maximumConcurrentThumbnailRequests &&
            thumbnailRequestQueueRef.current.length > 0
        ) {
            const request = thumbnailRequestQueueRef.current.shift();
            if (!request) return;

            activeThumbnailRequestCountRef.current += 1;

            void getSegmentThumbnailPlaybackUrl(request.segmentId)
                .then((playbackUrl) => {
                    if (
                        request.generation !==
                        thumbnailRequestGenerationRef.current
                    ) {
                        return;
                    }

                    setThumbnails((current) => ({
                        ...current,
                        [request.segmentId]: playbackUrl,
                    }));
                })
                .catch(() => {
                    // Missing thumbnails are repaired when their segment plays.
                })
                .finally(() => {
                    activeThumbnailRequestCountRef.current -= 1;
                    processThumbnailRequestQueue();
                });
        }
    }

    function requestPersistentThumbnail(segmentId: string) {
        if (requestedThumbnailIdsRef.current.has(segmentId)) return;

        requestedThumbnailIdsRef.current.add(segmentId);
        thumbnailRequestQueueRef.current.push({
            segmentId,
            generation: thumbnailRequestGenerationRef.current,
        });
        processThumbnailRequestQueue();
    }

    async function handleThumbnailCaptured(
        segmentId: string,
        thumbnail: Blob
    ): Promise<void> {
        const previewUrl = URL.createObjectURL(thumbnail);
        thumbnailObjectUrlsRef.current.add(previewUrl);
        setThumbnails((current) => ({
            ...current,
            [segmentId]: previewUrl,
        }));

        try {
            await uploadSegmentThumbnail(segmentId, thumbnail);
            const playbackUrl =
                await getSegmentThumbnailPlaybackUrl(segmentId);

            setThumbnails((current) => ({
                ...current,
                [segmentId]: playbackUrl,
            }));
            URL.revokeObjectURL(previewUrl);
            thumbnailObjectUrlsRef.current.delete(previewUrl);
        } catch (error: unknown) {
            onError(
                error instanceof Error
                    ? error.message
                    : "Could not save segment thumbnail"
            );
            throw error;
        }
    }

    async function loadMore() {
        if (!nextCursor) return;
        setLoading(true);
        try {
            const response = mode === "practice"
                ? await getPracticeQueue(nextCursor)
                : await getAllSegments(nextCursor);
            setSegments((current) => [...current, ...response.segments]);
            setNextCursor(response.nextCursor);
        } catch (error) {
            onError(error instanceof Error ? error.message : "Could not load more segments");
        } finally {
            setLoading(false);
        }
    }

    async function updatePracticeFields(
        segment: Segment,
        input: UpdateSegmentInput
    ) {
        setUpdatingSegmentId(segment.id);
        try {
            const updatedSegment = await updateSegment(segment.id, input);
            const updatedSegments = mode === "practice"
                ? sortPracticeSegments(
                    belongsInPracticeQueue(updatedSegment)
                        ? segments.map((current) =>
                            current.id === updatedSegment.id
                                ? updatedSegment
                                : current
                        )
                        : segments.filter(
                            (current) => current.id !== updatedSegment.id
                        )
                )
                : segments.map((current) =>
                    current.id === updatedSegment.id
                        ? updatedSegment
                        : current
                );

            setSegments(updatedSegments);

            if (
                mode === "practice" &&
                selectedSegmentId === segment.id &&
                !belongsInPracticeQueue(updatedSegment)
            ) {
                const removedIndex = segments.findIndex((current) => current.id === segment.id);
                selectSegment(updatedSegments[Math.min(removedIndex, updatedSegments.length - 1)]?.id ?? null);
            }
            return true;
        } catch (error) {
            onError(error instanceof Error ? error.message : "Could not update segment");
            return false;
        } finally {
            setUpdatingSegmentId(null);
        }
    }

    async function saveSegmentEdit(
        segment: Segment,
        input: UpdateSegmentInput
    ) {
        const saved = await updatePracticeFields(segment, input);
        if (saved) setSegmentBeingEdited(null);
    }

    async function handleDeleteSegment(segment: Segment) {
        setDeletingSegment(true);

        try {
            await deleteSegment(segment.id);
            const deletedIndex = segments.findIndex(
                (candidate) => candidate.id === segment.id
            );
            const remainingSegments = segments.filter(
                (candidate) => candidate.id !== segment.id
            );

            setSegments(remainingSegments);
            setThumbnails((current) => {
                const next = { ...current };
                const thumbnailUrl = next[segment.id];
                if (
                    thumbnailUrl &&
                    thumbnailObjectUrlsRef.current.has(thumbnailUrl)
                ) {
                    URL.revokeObjectURL(thumbnailUrl);
                    thumbnailObjectUrlsRef.current.delete(thumbnailUrl);
                }
                delete next[segment.id];
                return next;
            });

            if (selectedSegmentId === segment.id) {
                selectSegment(
                    remainingSegments[
                        Math.min(deletedIndex, remainingSegments.length - 1)
                    ]?.id ?? null
                );
            }

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

    const selectedIndex = segments.findIndex((segment) => segment.id === selectedSegmentId);
    const selectedSegment = selectedIndex >= 0 ? segments[selectedIndex] : null;
    const selectedVideo = selectedSegment
        ? videos.find((video) => video.id === selectedSegment.videoId) ?? null
        : null;
    const videoTitles = new Map(videos.map((video) => [video.id, video.title]));

    return (
        <main className="practice-workspace">
            <header className="practice-header">
                <div>
                    <span className="eyebrow">
                        {mode === "practice" ? "Training" : "Browse"}
                    </span>
                    <h1>
                        {mode === "practice"
                            ? "Practice queue"
                            : "All segments"}
                    </h1>
                </div>
                <span className="queue-total"><ListChecks size={16} /> {segments.length}</span>
            </header>

            <div className="practice-layout">
                <SegmentPlayer
                    selectionLabel={
                        mode === "practice"
                            ? "Now practicing"
                            : "Selected segment"
                    }
                    segment={selectedSegment}
                    video={selectedVideo}
                    hasPrevious={selectedIndex > 0}
                    hasNext={selectedIndex >= 0 && selectedIndex < segments.length - 1}
                    onPrevious={() => selectSegment(segments[selectedIndex - 1]?.id ?? null)}
                    onNext={() => selectSegment(segments[selectedIndex + 1]?.id ?? null)}
                    onOpenFullVideo={onOpenFullVideo}
                    onThumbnailCaptured={handleThumbnailCaptured}
                    onError={onError}
                />

                <section
                    className="practice-list-panel"
                    aria-label={
                        mode === "practice"
                            ? "Practice queue segments"
                            : "All segments"
                    }
                >
                    <div className="practice-list-heading">
                        <span>{mode === "practice" ? "Queue" : "Segments"}</span>
                        <strong>{segments.length}</strong>
                    </div>

                    <div className="practice-list">
                        {segments.map((segment) => (
                            <article
                                className={`practice-list-item ${selectedSegmentId === segment.id ? "selected" : ""}`}
                                key={segment.id}
                            >
                                <button className="practice-list-select" onClick={() => selectSegment(segment.id)}>
                                    <SegmentThumbnail
                                        key={`${mode}-${segment.id}`}
                                        segmentId={segment.id}
                                        thumbnailUrl={thumbnails[segment.id]}
                                        onVisible={requestPersistentThumbnail}
                                    />
                                    <span className="queue-time">{formatDuration(segment.startMilliseconds)}</span>
                                    <span className="queue-movement">
                                        <strong>{segment.name}</strong>
                                        <span>{videoTitles.get(segment.videoId) ?? "Unknown video"}</span>
                                    </span>
                                </button>

                                <div className="practice-field-controls">
                                    <label>
                                        Priority
                                        <select
                                            value={segment.practicePriority}
                                            disabled={updatingSegmentId === segment.id}
                                            onChange={(event) => void updatePracticeFields(segment, {
                                                practicePriority: event.target.value as PracticePriority,
                                            })}
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </label>
                                    <label>
                                        Confidence
                                        <select
                                            value={segment.confidence}
                                            disabled={updatingSegmentId === segment.id}
                                            onChange={(event) => void updatePracticeFields(segment, {
                                                confidence: event.target.value as Confidence,
                                            })}
                                        >
                                            <option value="low">Low</option>
                                            <option value="medium">Medium</option>
                                            <option value="high">High</option>
                                        </select>
                                    </label>
                                    <button
                                        className="practice-edit-button"
                                        onClick={() => setSegmentBeingEdited(segment)}
                                        disabled={updatingSegmentId === segment.id}
                                        aria-label={`Edit ${segment.name}`}
                                        title="Edit segment"
                                    >
                                        <Pencil size={15} />
                                    </button>
                                    <button
                                        className="practice-edit-button"
                                        onClick={() =>
                                            setSegmentPendingDeletion(segment)
                                        }
                                        disabled={
                                            updatingSegmentId === segment.id
                                        }
                                        aria-label={`Delete ${segment.name}`}
                                        title="Delete segment"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </article>
                        ))}

                        {loading && segments.length === 0 && (
                            <div className="queue-state"><LoaderCircle className="spin" /> Loading queue...</div>
                        )}
                        {!loading && segments.length === 0 && (
                            <div className="queue-state">
                                {mode === "practice"
                                    ? "Your practice queue is empty."
                                    : "You have no segments yet."}
                            </div>
                        )}
                    </div>

                    {nextCursor && (
                        <button className="secondary-button load-more" onClick={() => void loadMore()} disabled={loading}>
                            {loading ? "Loading..." : "Load more"}
                        </button>
                    )}
                </section>
            </div>
            <EditSegmentDialog
                segment={segmentBeingEdited}
                saving={
                    segmentBeingEdited !== null &&
                    updatingSegmentId === segmentBeingEdited.id
                }
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
