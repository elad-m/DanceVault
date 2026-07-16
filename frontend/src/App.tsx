import { AlertCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { deleteVideo, listVideos, uploadVideo } from "./api";
import { signOutUser } from "./auth/authentication";
import { DeleteVideoDialog } from "./components/DeleteVideoDialog";
import { UploadDialog } from "./components/UploadDialog";
import { PracticeQueue } from "./components/PracticeQueue";
import { VideoSidebar, type AppView } from "./components/VideoSidebar";
import { VideoWorkspace } from "./components/VideoWorkspace";
import { runtime } from "./runtime";
import type { Segment, Video } from "./types";

export default function App() {
    const [videos, setVideos] = useState<Video[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [videoPendingDeletion, setVideoPendingDeletion] = useState<Video | null>(null);
    const [deletingVideo, setDeletingVideo] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeView, setActiveView] = useState<AppView>(() =>
        window.location.pathname.startsWith("/videos") ? "library" : "practice"
    );
    const [practiceSegmentId, setPracticeSegmentId] = useState<string | null>(null);
    const [canReturnToPractice, setCanReturnToPractice] = useState(false);
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
        if (window.location.pathname === "/") {
            window.history.replaceState({}, "", "/practice");
        }
    }, []);

    useEffect(() => {
        function handleBrowserNavigation(event: PopStateEvent) {
            setActiveView(window.location.pathname.startsWith("/videos") ? "library" : "practice");
            setCanReturnToPractice(event.state?.fromPractice === true);
        }

        window.addEventListener("popstate", handleBrowserNavigation);
        return () => window.removeEventListener("popstate", handleBrowserNavigation);
    }, []);

    function navigateToView(view: AppView) {
        const path = view === "practice" ? "/practice" : selectedVideo ? `/videos/${selectedVideo.id}` : "/";
        window.history.pushState({}, "", path);
        setCanReturnToPractice(false);
        setActiveView(view);
    }

    async function handleUpload(title: string, file: File) {
        setUploading(true);
        setError(null);
        try {
            const video = await uploadVideo(title, file);
            setVideos((current) => [...current, video]);
            setSelectedVideo(video);
            window.history.pushState({}, "", `/videos/${video.id}`);
            setCanReturnToPractice(false);
            setUploadOpen(false);
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
            setCanReturnToPractice(false);
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

    async function handleSignOut() {
        try {
            await signOutUser();
        } catch {
            showError("Could not sign out");
        }
    }

    function handleOpenFullVideo(segment: Segment) {
        const video = videos.find((candidate) => candidate.id === segment.videoId);
        if (!video) {
            showError("The source video is not available");
            return;
        }

        if (video.sourceType !== "uploaded") {
            const externalUrl = video.sourceUrl;
            if (externalUrl) window.open(externalUrl, "_blank", "noopener,noreferrer");
            return;
        }

        setSelectedVideo(video);
        setSeekRequest({
            id: segment.id,
            milliseconds: segment.startMilliseconds,
        });
        setPracticeSegmentId(segment.id);
        window.history.pushState({ fromPractice: true }, "", `/videos/${video.id}`);
        setCanReturnToPractice(true);
        setActiveView("library");
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
                    setCanReturnToPractice(false);
                }}
                onRefresh={() => void refreshVideos()}
                onUpload={() => setUploadOpen(true)}
                onSignOut={
                    runtime.environment === "dev"
                        ? () => void handleSignOut()
                        : undefined
                }
            />
            {activeView === "library" ? (
                <VideoWorkspace
                    video={selectedVideo}
                    seekRequest={seekRequest}
                    onBackToPractice={canReturnToPractice ? () => window.history.back() : undefined}
                    onDelete={setVideoPendingDeletion}
                    onError={showError}
                />
            ) : (
                <PracticeQueue
                    videos={videos}
                    initialSelectedSegmentId={practiceSegmentId}
                    onSelectSegment={setPracticeSegmentId}
                    onOpenFullVideo={handleOpenFullVideo}
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
