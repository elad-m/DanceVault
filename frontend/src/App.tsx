import { AlertCircle, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listVideos, uploadVideo } from "./api";
import { UploadDialog } from "./components/UploadDialog";
import { VideoSidebar } from "./components/VideoSidebar";
import { VideoWorkspace } from "./components/VideoWorkspace";
import type { Video } from "./types";

export default function App() {
    const [videos, setVideos] = useState<Video[]>([]);
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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

    async function handleUpload(title: string, file: File) {
        setUploading(true);
        setError(null);
        try {
            const video = await uploadVideo(title, file);
            setVideos((current) => [...current, video]);
            setSelectedVideo(video);
            setUploadOpen(false);
        } catch (caught) {
            showError(caught instanceof Error ? caught.message : "Could not upload video");
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="app-shell">
            <VideoSidebar
                videos={videos}
                selectedVideoId={selectedVideo?.id ?? null}
                loading={loading}
                onSelect={setSelectedVideo}
                onRefresh={() => void refreshVideos()}
                onUpload={() => setUploadOpen(true)}
            />
            <VideoWorkspace video={selectedVideo} onError={showError} />
            <UploadDialog open={uploadOpen} uploading={uploading} onClose={() => setUploadOpen(false)} onUpload={handleUpload} />
            {error && (
                <div className="error-toast" role="alert">
                    <AlertCircle size={18} /><span>{error}</span>
                    <button onClick={() => setError(null)} aria-label="Dismiss error"><X size={17} /></button>
                </div>
            )}
        </div>
    );
}
