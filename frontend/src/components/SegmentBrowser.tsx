import {
    ArrowDown,
    ArrowUp,
    Check,
    ChevronsDown,
    ChevronsUp,
    ListPlus,
    LoaderCircle,
    Pencil,
    Plus,
    Trash2,
    X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    deleteSegment,
    ApiRequestError,
    getMainList,
    saveMainList,
    getAllSegments,
    getSegmentThumbnailPlaybackUrl,
    updateSegment,
    uploadSegmentThumbnail,
} from "../api";
import { formatDuration } from "../format";
import type { Segment, UpdateSegmentInput, Video } from "../types";
import { DeleteSegmentDialog } from "./DeleteSegmentDialog";
import { SegmentPlayer } from "./SegmentPlayer";
import { EditSegmentDialog } from "./EditSegmentDialog";
import { AddMainListSegmentsDialog } from "./AddMainListSegmentsDialog";
import { SortableSegmentList, SortableSegmentRow } from "./SortableSegmentList";
import { arrayMove } from "@dnd-kit/sortable";
import { SegmentThumbnail } from "./SegmentThumbnail";

export type SegmentBrowserMode = "main" | "all";

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

export function SegmentBrowser({
    mode,
    videos,
    initialSelectedSegmentId,
    onSelectSegment,
    onOpenFullVideo,
    onError,
}: SegmentBrowserProps) {
    const [segments, setSegments] = useState<Segment[]>([]);
    const [mainVersion, setMainVersion] = useState(0);
    const [mainListLoaded, setMainListLoaded] = useState(false);
    const [savingList, setSavingList] = useState(false);
    const savingListRef = useRef(false);
    const [addingSegments, setAddingSegments] = useState(false);
    const [appendingSegmentId, setAppendingSegmentId] = useState<string | null>(null);
    const appendingSegmentRef = useRef(false);
    const [addedSegmentIDs, setAddedSegmentIDs] = useState<string[]>([]);
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
    const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
    const loadingMoreRef = useRef(false);

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

        const getSegments = mode === "main" ? async () => {
            const list = await getMainList();
            if (!cancelled) {
                setMainVersion(list.version);
                setMainListLoaded(true);
            }
            return { segments: list.segments, nextCursor: null };
        } : async () => {
            const [segmentPage, mainList] = await Promise.all([
                getAllSegments(),
                getMainList(),
            ]);
            if (!cancelled) setAddedSegmentIDs(mainList.segmentIDs);
            return segmentPage;
        };

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
                            : "Could not load segments"
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

    async function changeMainList(next: Segment[]): Promise<boolean> {
        if (savingListRef.current) return false;
        savingListRef.current = true;
        setSavingList(true);
        try {
            const saved = await saveMainList(next.map(segment => segment.id), mainVersion);
            setMainVersion(saved.version);
            setSegments(next);
            if (!next.some(segment => segment.id === selectedSegmentId)) selectSegment(next[0]?.id ?? null);
            return true;
        } catch (error) {
            if (error instanceof ApiRequestError && error.code === "MAIN_LIST_CONFLICT") {
                try {
                    const current = await getMainList();
                    setMainVersion(current.version);
                    setSegments(current.segments);
                    if (!current.segmentIDs.includes(selectedSegmentId ?? "")) selectSegment(current.segmentIDs[0] ?? null);
                    setAddingSegments(false);
                    onError("Main List changed on another device. Its saved order has been reloaded; please try again.");
                } catch {
                    onError("Could not reload Main List. Refresh before trying again.");
                }
            } else onError(error instanceof Error ? error.message : "Could not save Main List");
            return false;
        } finally {
            savingListRef.current = false;
            setSavingList(false);
        }
    }

    function moveSegment(segment: Segment, action: "top" | "up" | "down" | "bottom" | "remove") {
        const index = segments.findIndex(current => current.id === segment.id);
        const next = segments.filter(current => current.id !== segment.id);
        if (action !== "remove") {
            const destination = action === "top" ? 0 : action === "bottom" ? next.length : action === "up" ? index - 1 : index + 1;
            next.splice(Math.max(0, Math.min(destination, next.length)), 0, segment);
        }
        void changeMainList(next);
    }

    function handleDrop(fromID: string, toID: string) {
        if (mode !== "main" || savingListRef.current || updatingSegmentId || deletingSegment) return;
        const from = segments.findIndex(segment => segment.id === fromID);
        const to = segments.findIndex(segment => segment.id === toID);
        if (from < 0 || to < 0 || from === to) return;
        void changeMainList(arrayMove(segments, from, to));
    }

    async function addToMainList(segment: Segment) {
        if (appendingSegmentRef.current) return;
        appendingSegmentRef.current = true;
        setAppendingSegmentId(segment.id);
        try {
            // Read immediately before appending, rather than reuse a browsing snapshot.
            const current = await getMainList();
            if (!current.segmentIDs.includes(segment.id)) {
                if (current.segmentIDs.length >= 500) {
                    throw new Error("Main List is full (500 segments). Remove a segment before adding another.");
                }
                await saveMainList([...current.segmentIDs, segment.id], current.version);
            }
            setAddedSegmentIDs(currentIDs => [...new Set([...currentIDs, segment.id])]);
        } catch (error) {
            onError(error instanceof ApiRequestError && error.code === "MAIN_LIST_CONFLICT"
                ? "Main List changed on another device. Please add the segment again."
                : error instanceof Error ? error.message : "Could not add segment to Main List");
        } finally {
            appendingSegmentRef.current = false;
            setAppendingSegmentId(null);
        }
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

    const loadMore = useCallback(async () => {
        if (!nextCursor || loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoading(true);
        try {
            const response = await getAllSegments(nextCursor);
            setSegments((current) => [...current, ...response.segments]);
            setNextCursor(response.nextCursor);
        } catch (error) {
            onError(error instanceof Error ? error.message : "Could not load more segments");
        } finally {
            loadingMoreRef.current = false;
            setLoading(false);
        }
    }, [nextCursor, onError]);

    useEffect(() => {
        const sentinel = loadMoreSentinelRef.current;
        if (mode !== "all" || !nextCursor || loading || !sentinel) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) void loadMore();
            },
            { threshold: 0.01 }
        );

        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [loadMore, loading, mode, nextCursor]);

    async function updatePracticeFields(
        segment: Segment,
        input: UpdateSegmentInput
    ) {
        setUpdatingSegmentId(segment.id);
        try {
            const updatedSegment = await updateSegment(segment.id, input);
            const updatedSegments = segments.map((current) =>
                    current.id === updatedSegment.id
                        ? updatedSegment
                        : current
                );

            setSegments(updatedSegments);

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
            {mode === "main" && (
                <header className="practice-header">
                    <button
                        className="secondary-button"
                        disabled={!mainListLoaded || loading || savingList || segments.length >= 500}
                        onClick={() => setAddingSegments(true)}
                    >
                        <Plus size={15} /> Add segments
                    </button>
                </header>
            )}

            <div className="practice-layout">
                <SegmentPlayer
                    selectionLabel="Selected segment"
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
                        mode === "main" ? "Main List segments" : "All segments"
                    }
                >
                    <div className="practice-list-heading">
                        <span>Segments</span>
                        <strong>{segments.length}</strong>
                    </div>

                    <SortableSegmentList items={segments} onMove={handleDrop}>
                    <div className="practice-list">
                        {segments.map((segment) => (
                            <SortableSegmentRow
                                id={segment.id}
                                name={segment.name}
                                enabled={mode === "main"}
                                disabled={savingList || updatingSegmentId !== null || deletingSegment || addingSegments || segmentBeingEdited !== null || segmentPendingDeletion !== null}
                                className={`practice-list-item ${selectedSegmentId === segment.id ? "selected" : ""}`}
                                key={segment.id}
                            >
                                <button className={`practice-list-select${mode === "main" ? " main-list-select" : ""}`} onClick={() => selectSegment(segment.id)}>
                                    <SegmentThumbnail
                                        key={`${mode}-${segment.id}`}
                                        segmentId={segment.id}
                                        thumbnailUrl={thumbnails[segment.id]}
                                        onVisible={requestPersistentThumbnail}
                                    />
                                    {mode !== "main" && <span className="queue-time">{formatDuration(segment.startMilliseconds)}</span>}
                                    <span className="queue-movement">
                                        <strong>{segment.name}</strong>
                                        <span>{videoTitles.get(segment.videoId) ?? "Unknown video"}</span>
                                    </span>
                                </button>

                                <div className={`practice-field-controls${mode === "all" ? " segment-actions" : ""}`}>
                                    {mode !== "main" && <button
                                        className="secondary-button main-list-add"
                                        disabled={appendingSegmentId !== null || deletingSegment || addedSegmentIDs.includes(segment.id)}
                                        title={addedSegmentIDs.includes(segment.id)
                                            ? `${segment.name} is in Main List`
                                            : `Add ${segment.name} to Main List`}
                                        onClick={() => void addToMainList(segment)}
                                    >
                                        {appendingSegmentId === segment.id
                                            ? <LoaderCircle className="spin" size={15} />
                                            : addedSegmentIDs.includes(segment.id) ? <Check size={15} /> : <ListPlus size={15} />}
                                        {appendingSegmentId === segment.id
                                            ? "Adding..."
                                            : addedSegmentIDs.includes(segment.id) ? "In Main List" : "Add to Main List"}
                                    </button>}
                                    {mode === "main" && <div className="main-list-order-buttons" aria-label={`Order ${segment.name}`}>
                                        <button onClick={() => moveSegment(segment, "top")} disabled={savingList || segment.id === segments[0]?.id} aria-label={`Move ${segment.name} to top`} title="Move to top"><ChevronsUp size={17} /></button>
                                        <button onClick={() => moveSegment(segment, "up")} disabled={savingList || segment.id === segments[0]?.id} aria-label={`Move ${segment.name} up`} title="Move up"><ArrowUp size={17} /></button>
                                        <button onClick={() => moveSegment(segment, "down")} disabled={savingList || segment.id === segments.at(-1)?.id} aria-label={`Move ${segment.name} down`} title="Move down"><ArrowDown size={17} /></button>
                                        <button onClick={() => moveSegment(segment, "bottom")} disabled={savingList || segment.id === segments.at(-1)?.id} aria-label={`Move ${segment.name} to bottom`} title="Move to bottom"><ChevronsDown size={17} /></button>
                                        <button onClick={() => moveSegment(segment, "remove")} disabled={savingList} aria-label={`Remove ${segment.name} from Main List`} title="Remove from Main List"><X size={17} /></button>
                                    </div>}
                                    {mode !== "main" && <button
                                        className="practice-edit-button"
                                        onClick={() => setSegmentBeingEdited(segment)}
                                        disabled={savingList || updatingSegmentId === segment.id}
                                        aria-label={`Edit ${segment.name}`}
                                        title="Edit segment"
                                    >
                                        <Pencil size={15} />
                                    </button>}
                                    {mode !== "main" && <button
                                        className="practice-edit-button"
                                        onClick={() =>
                                            setSegmentPendingDeletion(segment)
                                        }
                                        disabled={
                                            savingList || updatingSegmentId === segment.id
                                        }
                                        aria-label={`Delete ${segment.name}`}
                                        title="Delete segment"
                                    >
                                        <Trash2 size={15} />
                                    </button>}
                                </div>
                            </SortableSegmentRow>
                        ))}

                        {loading && segments.length === 0 && (
                            <div className="queue-state"><LoaderCircle className="spin" /> Loading queue...</div>
                        )}
                        {!loading && segments.length === 0 && (
                            <div className="queue-state">
                                {mode === "main" ? "Your Main List is empty." : "You have no segments yet."}
                            </div>
                        )}
                        {nextCursor && (
                            <div
                                ref={loadMoreSentinelRef}
                                className="segment-load-sentinel"
                                aria-live="polite"
                            >
                                {loading && segments.length > 0 && (
                                    <><LoaderCircle className="spin" /> Loading more segments...</>
                                )}
                            </div>
                        )}
                    </div>
                    </SortableSegmentList>
                </section>
            </div>
            {addingSegments && <AddMainListSegmentsDialog
                existingIDs={segments.map(segment => segment.id)} videos={videos} saving={savingList}
                thumbnailUrls={thumbnails} onThumbnailVisible={requestPersistentThumbnail}
                onAdd={added => changeMainList([...segments, ...added])} onClose={() => setAddingSegments(false)} />}
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
