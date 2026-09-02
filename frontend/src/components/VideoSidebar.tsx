import {
    Check,
    Film,
    List,
    ListChecks,
    LoaderCircle,
    Pencil,
    Plus,
    RefreshCw,
    X,
} from "lucide-react";
import {
    useEffect,
    useRef,
    useState,
    type FormEvent,
} from "react";
import {
    getPlaybackUrl,
    getVideoThumbnailPlaybackUrl,
    uploadVideoThumbnail,
} from "../api";
import { getVisibleVideoStatusLabel } from "../format";
import type { Video } from "../types";
import { captureVideoThumbnailFromURL } from "../videoThumbnail";
import { AccountMenu } from "./AccountMenu";

export type AppView = "practice" | "videos" | "segments";

type VideoSidebarProps = {
    videos: Video[];
    selectedVideoId: string | null;
    loading: boolean;
    activeView: AppView;
    onViewChange: (view: AppView) => void;
    onSelect: (video: Video) => void;
    onRefresh: () => void;
    onUpload: () => void;
    onUpdateTitle: (video: Video, title: string) => Promise<boolean>;
    signedInUserLabel: string;
    onSignOut?: () => void;
};

const maximumConcurrentVideoThumbnailRequests = 2;

type VideoThumbnailRequest = {
    video: Video;
    generation: number;
};

type VideoThumbnailProps = {
    video: Video;
    thumbnailUrl: string | undefined;
    onVisible: (video: Video) => void;
};

function VideoThumbnail({
    video,
    thumbnailUrl,
    onVisible,
}: VideoThumbnailProps) {
    const elementRef = useRef<HTMLSpanElement>(null);
    const requestedRef = useRef(false);

    useEffect(() => {
        if (thumbnailUrl || requestedRef.current) return;

        const element = elementRef.current;
        if (!element || !("IntersectionObserver" in window)) {
            requestedRef.current = true;
            onVisible(video);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (!entries.some((entry) => entry.isIntersecting)) return;

                requestedRef.current = true;
                onVisible(video);
                observer.disconnect();
            },
            {
                rootMargin: "160px 0px",
            }
        );

        observer.observe(element);
        return () => observer.disconnect();
    }, [onVisible, thumbnailUrl, video]);

    return (
        <span className="video-thumbnail" ref={elementRef}>
            {thumbnailUrl ? (
                <img src={thumbnailUrl} alt="" />
            ) : (
                <Film size={16} />
            )}
        </span>
    );
}

export function VideoSidebar({
    videos,
    selectedVideoId,
    loading,
    activeView,
    onViewChange,
    onSelect,
    onRefresh,
    onUpload,
    onUpdateTitle,
    signedInUserLabel,
    onSignOut,
}: VideoSidebarProps) {
    const [thumbnailUrls, setThumbnailUrls] =
        useState<Record<string, string>>({});
    const thumbnailRequestQueueRef =
        useRef<VideoThumbnailRequest[]>([]);
    const activeThumbnailRequestCountRef = useRef(0);
    const thumbnailRequestGenerationRef = useRef(0);
    const requestedThumbnailIdsRef = useRef(new Set<string>());
    const [editingVideoId, setEditingVideoId] =
        useState<string | null>(null);
    const [titleDraft, setTitleDraft] = useState("");
    const [savingTitle, setSavingTitle] = useState(false);

    useEffect(() => {
        return () => {
            thumbnailRequestGenerationRef.current += 1;
            thumbnailRequestQueueRef.current = [];
        };
    }, []);

    function processThumbnailRequestQueue() {
        while (
            activeThumbnailRequestCountRef.current <
                maximumConcurrentVideoThumbnailRequests &&
            thumbnailRequestQueueRef.current.length > 0
        ) {
            const request = thumbnailRequestQueueRef.current.shift();
            if (!request) return;

            activeThumbnailRequestCountRef.current += 1;

            void loadOrRepairVideoThumbnail(request.video)
                .then((thumbnailUrl) => {
                    if (
                        !thumbnailUrl ||
                        request.generation !==
                            thumbnailRequestGenerationRef.current
                    ) {
                        return;
                    }

                    setThumbnailUrls((current) => ({
                        ...current,
                        [request.video.id]: thumbnailUrl,
                    }));
                })
                .catch(() => {
                    // Thumbnail repair is optional; the video remains usable.
                })
                .finally(() => {
                    activeThumbnailRequestCountRef.current -= 1;
                    processThumbnailRequestQueue();
                });
        }
    }

    async function loadOrRepairVideoThumbnail(
        video: Video
    ): Promise<string | null> {
        if (video.status !== "ready") return null;

        const existingThumbnailUrl =
            await getVideoThumbnailPlaybackUrl(video.id);
        if (existingThumbnailUrl) return existingThumbnailUrl;

        const videoPlaybackUrl = await getPlaybackUrl(video.id);
        const thumbnail =
            await captureVideoThumbnailFromURL(videoPlaybackUrl);
        await uploadVideoThumbnail(video.id, thumbnail);

        return getVideoThumbnailPlaybackUrl(video.id);
    }

    function requestPersistentThumbnail(video: Video) {
        if (requestedThumbnailIdsRef.current.has(video.id)) return;

        requestedThumbnailIdsRef.current.add(video.id);
        thumbnailRequestQueueRef.current.push({
            video,
            generation: thumbnailRequestGenerationRef.current,
        });
        processThumbnailRequestQueue();
    }

    function startEditingTitle(video: Video) {
        setEditingVideoId(video.id);
        setTitleDraft(video.title);
    }

    function cancelEditingTitle() {
        if (savingTitle) return;
        setEditingVideoId(null);
        setTitleDraft("");
    }

    async function submitTitle(
        event: FormEvent,
        video: Video
    ) {
        event.preventDefault();
        const title = titleDraft.trim();
        if (!title || savingTitle) return;

        setSavingTitle(true);
        try {
            const saved = await onUpdateTitle(video, title);
            if (saved) {
                setEditingVideoId(null);
                setTitleDraft("");
            }
        } finally {
            setSavingTitle(false);
        }
    }

    return (
        <aside className="sidebar">
            <div className="brand-row">
                <div className="brand-mark"><Film size={20} /></div>
                <div className="brand-copy">
                    <strong>DanceVault</strong>
                    <span className="signed-in-user" title={signedInUserLabel}>
                        {signedInUserLabel}
                    </span>
                </div>
                <AccountMenu
                    signedInUserLabel={signedInUserLabel}
                    onSignOut={onSignOut}
                />
            </div>

            <div className="sidebar-actions">
                <button className="primary-button" onClick={onUpload} aria-label="Add video">
                    <Plus size={17} /> <span className="add-video-label">Add video</span>
                </button>
                <button
                    className="icon-button"
                    onClick={onRefresh}
                    title="Refresh videos"
                    aria-label="Refresh videos"
                >
                    <RefreshCw size={17} className={loading ? "spin" : ""} />
                </button>
            </div>

            <nav className="view-navigation" aria-label="Main views">
                <button className={activeView === "practice" ? "active" : ""} onClick={() => onViewChange("practice")}>
                    <ListChecks size={16} /> Practice queue
                </button>
                <button className={activeView === "videos" ? "active" : ""} onClick={() => onViewChange("videos")}>
                    <Film size={16} /> All videos
                </button>
                <button className={activeView === "segments" ? "active" : ""} onClick={() => onViewChange("segments")}>
                    <List size={16} /> All segments
                </button>
            </nav>

            {activeView === "videos" && (
                <section className="video-library">
                <div className="section-label">Videos <span>{videos.length}</span></div>
                <nav className="video-list" aria-label="Videos">
                {videos.map((video) => {
                    const statusLabel = getVisibleVideoStatusLabel(
                        video.status
                    );

                    return (
                        <div
                            key={video.id}
                            className={`video-list-item ${selectedVideoId === video.id ? "selected" : ""}`}
                        >
                            {editingVideoId === video.id ? (
                                <form
                                    className="video-title-form"
                                    onSubmit={(event) =>
                                        void submitTitle(event, video)
                                    }
                                >
                                    <input
                                        value={titleDraft}
                                        onChange={(event) =>
                                            setTitleDraft(event.target.value)
                                        }
                                        onKeyDown={(event) => {
                                            if (event.key === "Escape") {
                                                cancelEditingTitle();
                                            }
                                        }}
                                        aria-label={`Title for ${video.title}`}
                                        autoFocus
                                    />
                                    <button
                                        type="submit"
                                        className="video-row-action"
                                        disabled={!titleDraft.trim() || savingTitle}
                                        aria-label="Save video title"
                                        title="Save title"
                                    >
                                        {savingTitle ? (
                                            <LoaderCircle className="spin" size={16} />
                                        ) : (
                                            <Check size={16} />
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        className="video-row-action"
                                        onClick={cancelEditingTitle}
                                        disabled={savingTitle}
                                        aria-label="Cancel video title editing"
                                        title="Cancel"
                                    >
                                        <X size={16} />
                                    </button>
                                </form>
                            ) : (
                                <>
                                    <button
                                        className="video-list-select"
                                        onClick={() => onSelect(video)}
                                    >
                                        <VideoThumbnail
                                            video={video}
                                            thumbnailUrl={thumbnailUrls[video.id]}
                                            onVisible={requestPersistentThumbnail}
                                        />
                                        <span className="video-list-copy">
                                            <strong>{video.title}</strong>
                                            <span>{video.originalFileName}</span>
                                        </span>
                                        {statusLabel && (
                                            <span
                                                className={`status-dot ${video.status}`}
                                                title={statusLabel}
                                                aria-label={statusLabel}
                                            />
                                        )}
                                    </button>
                                    <button
                                        type="button"
                                        className="video-row-action"
                                        onClick={() => startEditingTitle(video)}
                                        aria-label={`Edit title for ${video.title}`}
                                        title="Edit video title"
                                    >
                                        <Pencil size={15} />
                                    </button>
                                </>
                            )}
                        </div>
                    );
                })}
                {!loading && videos.length === 0 && (
                    <p className="empty-copy">No videos yet.</p>
                )}
                </nav>
                </section>
            )}
        </aside>
    );
}
