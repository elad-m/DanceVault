import { AlertCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
    deleteVideo,
    listVideos,
    updateVideo,
    uploadVideo,
    uploadVideoThumbnail,
} from "./api";
import {
    getSignedInUserLabel,
    signOutUser,
} from "./auth/authentication";
import { DeleteVideoDialog } from "./components/DeleteVideoDialog";
import { UploadDialog } from "./components/UploadDialog";
import { SegmentBrowser } from "./components/SegmentBrowser";
import { VideoSidebar, type AppView } from "./components/VideoSidebar";
import { VideoWorkspace } from "./components/VideoWorkspace";
import { runtime } from "./runtime";
import type { Segment, Video } from "./types";
import { captureVideoThumbnail } from "./videoThumbnail";

function getViewForPath(pathname: string): AppView {
    if (pathname.startsWith("/videos")) return "videos";
    if (pathname.startsWith("/segments")) return "segments";
    return "main";
}

export default function App() {
    const [videos, setVideos] = useState<Video[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [videoPendingDeletion, setVideoPendingDeletion] = useState<Video | null>(null);
    const [deletingVideo, setDeletingVideo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [signedInUserLabel, setSignedInUserLabel] = useState("Loading account...");
    const [activeView, setActiveView] = useState<AppView>(() =>
        getViewForPath(window.location.pathname)
    );
    const [mainSegmentId, setMainSegmentId] = useState<string | null>(null);
    const [allSegmentsSegmentId, setAllSegmentsSegmentId] =
        useState<string | null>(null);
    const [returnToView, setReturnToView] =
        useState<"main" | "segments" | null>(null);
    const [seekRequest, setSeekRequest] = useState<{
        id: string;
        milliseconds: number;
    } | null>(null);

    const showError = useCallback((message: string) => setError(message), []);

    const refreshVideos = useCallback(async () => {
        setLoading(true);
        try {
            const nextVideos = await listVideos();
            setVideos(nextVideos);
            setSelectedVideo((current) =>
                current ? nextVideos.find((video) => video.id === current.id) ?? null : nextVideos[0] ?? null
            );
        } catch (caught) {
            showError(caught instanceof Error ? caught.message : "Could not load videos");
        } finally {
            setLoading(false);
        }
    }, [showError]);

    useEffect(() => {
        void refreshVideos();
    }, [refreshVideos]);

    useEffect(() => {
        void getSignedInUserLabel()
            .then(setSignedInUserLabel)
            .catch(() => setSignedInUserLabel("Email unavailable"));
    }, []);

    useEffect(() => {
        if (window.location.pathname === "/") {
            window.history.replaceState({}, "", "/main-list");
        }
    }, []);

    useEffect(() => {
        function handleBrowserNavigation(event: PopStateEvent) {
            setActiveView(getViewForPath(window.location.pathname));
            setReturnToView(event.state?.fromView ?? null);
        }

        window.addEventListener("popstate", handleBrowserNavigation);
        return () => window.removeEventListener("popstate", handleBrowserNavigation);
    }, []);

    function navigateToView(view: AppView) {
        const path = view === "main" ? "/main-list" : view === "segments"
                ? "/segments"
                : selectedVideo
                    ? `/videos/${selectedVideo.id}`
                    : "/videos";
        window.history.pushState({}, "", path);
        setReturnToView(null);
        setActiveView(view);
    }

    async function handleUpload(title: string, file: File) {
        setUploading(true);
        setError(null);

        const thumbnailResultPromise = captureVideoThumbnail(file)
            .then((thumbnail) => ({ thumbnail, error: null }))
            .catch((caught: unknown) => ({
                thumbnail: null,
                error: caught,
            }));

        try {
            const video = await uploadVideo(title, file);
            const thumbnailResult = await thumbnailResultPromise;
            let thumbnailWarning: string | null = null;

            try {
                if (!thumbnailResult.thumbnail) {
                    throw thumbnailResult.error;
                }

                await uploadVideoThumbnail(
                    video.id,
                    thumbnailResult.thumbnail
                );
            } catch (caught) {
                thumbnailWarning = caught instanceof Error
                        ? `Video uploaded, but its thumbnail could not be created: ${caught.message}`
                        : "Video uploaded, but its thumbnail could not be created";
            }

            setVideos((current) => [...current, video]);
            setSelectedVideo(video);
            window.history.pushState({}, "", `/videos/${video.id}`);
            setReturnToView(null);
            setActiveView("videos");
            setUploadOpen(false);

            if (thumbnailWarning) showError(thumbnailWarning);
        } catch (caught) {
            showError(caught instanceof Error ? caught.message : "Could not upload video");
        } finally {
            setUploading(false);
        }
    }

    async function handleDeleteVideo(video: Video) {
        setDeletingVideo(true);
        setError(null);

        try {
            await deleteVideo(video.id);

            const remainingVideos = videos.filter(
                (candidate) => candidate.id !== video.id
            );
            const nextVideo = remainingVideos[0] ?? null;

            setVideos(remainingVideos);
            setSelectedVideo(nextVideo);
            setSeekRequest(null);
            setReturnToView(null);
            setVideoPendingDeletion(null);
            window.history.pushState(
                {},
                "",
                nextVideo ? `/videos/${nextVideo.id}` : "/videos"
            );
        } catch (caught) {
            showError(
                caught instanceof Error
                    ? caught.message
                    : "Could not delete video"
            );
        } finally {
            setDeletingVideo(false);
        }
    }

    async function handleUpdateVideoTitle(
        video: Video,
        title: string
    ): Promise<boolean> {
        try {
            const updatedVideo = await updateVideo(video.id, { title });

            setVideos((current) =>
                current.map((candidate) =>
                    candidate.id === updatedVideo.id
                        ? updatedVideo
                        : candidate
                )
            );
            setSelectedVideo((current) =>
                current?.id === updatedVideo.id
                    ? updatedVideo
                    : current
            );
            return true;
        } catch (caught) {
            showError(
                caught instanceof Error
                    ? caught.message
                    : "Could not update video title"
            );
            return false;
        }
    }

    async function handleSignOut() {
        try {
            await signOutUser();
        } catch {
            showError("Could not sign out");
        }
    }

    function handleOpenFullVideo(
        segment: Segment,
        fromView: "main" | "segments"
    ) {
        const video = videos.find((candidate) => candidate.id === segment.videoId);
        if (!video) {
            showError("The source video is not available");
            return;
        }

        setSelectedVideo(video);
        setSeekRequest({
            id: segment.id,
            milliseconds: segment.startMilliseconds,
        });
        if (fromView === "main") {
            setMainSegmentId(segment.id);
        } else {
            setAllSegmentsSegmentId(segment.id);
        }
        window.history.pushState(
            { fromView },
            "",
            `/videos/${video.id}`
        );
        setReturnToView(fromView);
        setActiveView("videos");
    }

    return (
        <div className="app-shell">
            <VideoSidebar
                videos={videos}
                selectedVideoId={selectedVideo?.id ?? null}
                loading={loading}
                activeView={activeView}
                onViewChange={navigateToView}
                onSelect={(video) => {
                    setSelectedVideo(video);
                    setSeekRequest(null);
                    window.history.pushState({}, "", `/videos/${video.id}`);
                    setReturnToView(null);
                }}
                onRefresh={() => void refreshVideos()}
                onUpload={() => setUploadOpen(true)}
                onUpdateTitle={handleUpdateVideoTitle}
                signedInUserLabel={signedInUserLabel}
                onSignOut={
                    runtime.environment === "dev"
                        ? () => void handleSignOut()
                        : undefined
                }
            />
            {activeView === "videos" ? (
                <VideoWorkspace
                    video={selectedVideo}
                    seekRequest={seekRequest}
                    backNavigation={returnToView ? {
                        label: returnToView === "main" ? "Back to Main List" : "Back to all segments",
                        onBack: () => window.history.back(),
                    } : undefined}
                    onDelete={setVideoPendingDeletion}
                    onError={showError}
                />
            ) : activeView === "main" ? (
                <SegmentBrowser
                    key="main"
                    mode="main"
                    videos={videos}
                    initialSelectedSegmentId={mainSegmentId}
                    onSelectSegment={setMainSegmentId}
                    onOpenFullVideo={(segment) => handleOpenFullVideo(segment, "main")}
                    onError={showError}
                />
            ) : (
                <SegmentBrowser
                    key="all"
                    mode="all"
                    videos={videos}
                    initialSelectedSegmentId={allSegmentsSegmentId}
                    onSelectSegment={setAllSegmentsSegmentId}
                    onOpenFullVideo={(segment) =>
                        handleOpenFullVideo(segment, "segments")
                    }
                    onError={showError}
                />
            )}
            <UploadDialog open={uploadOpen} uploading={uploading} onClose={() => setUploadOpen(false)} onUpload={handleUpload} />
            <DeleteVideoDialog
                video={videoPendingDeletion}
                deleting={deletingVideo}
                onCancel={() => setVideoPendingDeletion(null)}
                onConfirm={handleDeleteVideo}
            />
            {error && (
                <div className="error-toast" role="alert">
                    <AlertCircle size={18} /><span>{error}</span>
                    <button onClick={() => setError(null)} aria-label="Dismiss error"><X size={17} /></button>
                </div>
            )}
        </div>
    );
}
