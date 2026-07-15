import { ListChecks, LoaderCircle, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getPracticeQueue, updateSegment } from "../api";
import { formatDuration } from "../format";
import {
    getSegmentThumbnail,
    saveSegmentThumbnail,
} from "../thumbnailStorage";
import type {
    Confidence,
    PracticePriority,
    Segment,
    UpdateSegmentInput,
    Video,
} from "../types";
import { PracticePlayer } from "./PracticePlayer";
import { EditSegmentDialog } from "./EditSegmentDialog";

type PracticeQueueProps = {
    videos: Video[];
    initialSelectedSegmentId: string | null;
    onSelectSegment: (segmentId: string | null) => void;
    onOpenFullVideo: (segment: Segment) => void;
    onError: (message: string) => void;
};

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

export function PracticeQueue({
    videos,
    initialSelectedSegmentId,
    onSelectSegment,
    onOpenFullVideo,
    onError,
}: PracticeQueueProps) {
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
    const [updatingSegmentId, setUpdatingSegmentId] = useState<string | null>(null);
    const [segmentBeingEdited, setSegmentBeingEdited] =
        useState<Segment | null>(null);
    const [nextCursor, setNextCursor] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
    const initialSelectedSegmentIdRef = useRef(initialSelectedSegmentId);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);

        getPracticeQueue()
            .then((response) => {
                if (cancelled) return;
                setSegments(response.segments);
                void loadStoredThumbnails(response.segments);
                const initialSegment = response.segments.find(
                    (segment) => segment.id === initialSelectedSegmentIdRef.current
                ) ?? response.segments[0];
                setSelectedSegmentId(initialSegment?.id ?? null);
                onSelectSegment(initialSegment?.id ?? null);
                setNextCursor(response.nextCursor);
            })
            .catch((error: unknown) => {
                if (!cancelled) onError(error instanceof Error ? error.message : "Could not load practice queue");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [onError, onSelectSegment]);

    function selectSegment(segmentId: string | null) {
        setSelectedSegmentId(segmentId);
        onSelectSegment(segmentId);
    }

    async function loadStoredThumbnails(segmentsToLoad: Segment[]) {
        const entries = await Promise.all(
            segmentsToLoad.map(async (segment): Promise<[string, string] | null> => {
                try {
                    const thumbnail = await getSegmentThumbnail(segment.id);
                    return thumbnail ? [segment.id, thumbnail] : null;
                } catch {
                    return null;
                }
            })
        );

        setThumbnails((current) => ({
            ...current,
            ...Object.fromEntries(entries.filter((entry) => entry !== null)),
        }));
    }

    function handleThumbnailCaptured(segmentId: string, dataUrl: string) {
        setThumbnails((current) => ({ ...current, [segmentId]: dataUrl }));
        void saveSegmentThumbnail(segmentId, dataUrl).catch(() => undefined);
    }

    async function loadMore() {
        if (!nextCursor) return;
        setLoading(true);
        try {
            const response = await getPracticeQueue(nextCursor);
            setSegments((current) => [...current, ...response.segments]);
            void loadStoredThumbnails(response.segments);
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
            const updatedSegments = sortPracticeSegments(belongsInPracticeQueue(updatedSegment)
                ? segments.map((current) => current.id === updatedSegment.id ? updatedSegment : current)
                : segments.filter((current) => current.id !== updatedSegment.id));

            setSegments(updatedSegments);

            if (selectedSegmentId === segment.id && !belongsInPracticeQueue(updatedSegment)) {
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
                    <span className="eyebrow">Training</span>
                    <h1>Practice queue</h1>
                </div>
                <span className="queue-total"><ListChecks size={16} /> {segments.length}</span>
            </header>

            <div className="practice-layout">
                <PracticePlayer
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

                <section className="practice-list-panel" aria-label="Practice queue segments">
                    <div className="practice-list-heading">
                        <span>Queue</span>
                        <strong>{segments.length}</strong>
                    </div>

                    <div className="practice-list">
                        {segments.map((segment) => (
                            <article
                                className={`practice-list-item ${selectedSegmentId === segment.id ? "selected" : ""}`}
                                key={segment.id}
                            >
                                <button className="practice-list-select" onClick={() => selectSegment(segment.id)}>
                                    <span className="queue-thumbnail">
                                        {thumbnails[segment.id] ? (
                                            <img src={thumbnails[segment.id]} alt="" />
                                        ) : (
                                            <ListChecks size={17} />
                                        )}
                                    </span>
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
                                </div>
                            </article>
                        ))}

                        {loading && segments.length === 0 && (
                            <div className="queue-state"><LoaderCircle className="spin" /> Loading queue...</div>
                        )}
                        {!loading && segments.length === 0 && (
                            <div className="queue-state">Your practice queue is empty.</div>
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
        </main>
    );
}
