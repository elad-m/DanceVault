import { Film, ListChecks, Plus, RefreshCw, Upload } from "lucide-react";
import type { Video } from "../types";

export type AppView = "library" | "practice";

type VideoSidebarProps = {
    videos: Video[];
    selectedVideoId: string | null;
    loading: boolean;
    activeView: AppView;
    onViewChange: (view: AppView) => void;
    onSelect: (video: Video) => void;
    onRefresh: () => void;
    onUpload: () => void;
};

export function VideoSidebar({
    videos,
    selectedVideoId,
    loading,
    activeView,
    onViewChange,
    onSelect,
    onRefresh,
    onUpload,
}: VideoSidebarProps) {
    return (
        <aside className="sidebar">
            <div className="brand-row">
                <div className="brand-mark"><Film size={20} /></div>
                <div>
                    <strong>DanceVault</strong>
                    <span>Movement library</span>
                </div>
            </div>

            <div className="sidebar-actions">
                <button className="primary-button" onClick={onUpload}>
                    <Plus size={17} /> Add video
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
                <button className={activeView === "library" ? "active" : ""} onClick={() => onViewChange("library")}>
                    <Film size={16} /> Library
                </button>
                <button className={activeView === "practice" ? "active" : ""} onClick={() => onViewChange("practice")}>
                    <ListChecks size={16} /> Practice queue
                </button>
            </nav>

            {activeView === "library" && <>
                <div className="section-label">Videos <span>{videos.length}</span></div>
                <nav className="video-list" aria-label="Videos">
                {videos.map((video) => (
                    <button
                        key={video.id}
                        className={`video-list-item ${selectedVideoId === video.id ? "selected" : ""}`}
                        onClick={() => onSelect(video)}
                    >
                        <span className="video-icon">
                            {video.sourceType === "uploaded" ? <Upload size={16} /> : <Film size={16} />}
                        </span>
                        <span className="video-list-copy">
                            <strong>{video.title}</strong>
                            <span>{video.originalFileName ?? video.sourceType.replace("_", " ")}</span>
                        </span>
                        <span className={`status-dot ${video.status}`} title={video.status} />
                    </button>
                ))}
                {!loading && videos.length === 0 && (
                    <p className="empty-copy">No videos yet.</p>
                )}
                </nav>
            </>}
        </aside>
    );
}
