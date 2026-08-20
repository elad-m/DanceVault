import {
    Film,
    List,
    ListChecks,
    Plus,
    RefreshCw,
    Upload,
} from "lucide-react";
import { getVisibleVideoStatusLabel } from "../format";
import type { Video } from "../types";
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
    signedInUserLabel: string;
    onSignOut?: () => void;
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
    signedInUserLabel,
    onSignOut,
}: VideoSidebarProps) {
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

            {activeView === "videos" && <>
                <div className="section-label">Videos <span>{videos.length}</span></div>
                <nav className="video-list" aria-label="Videos">
                {videos.map((video) => {
                    const statusLabel = getVisibleVideoStatusLabel(
                        video.status
                    );

                    return (
                        <button
                            key={video.id}
                            className={`video-list-item ${selectedVideoId === video.id ? "selected" : ""}`}
                            onClick={() => onSelect(video)}
                        >
                            <span className="video-icon">
                                <Upload size={16} />
                            </span>
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
                    );
                })}
                {!loading && videos.length === 0 && (
                    <p className="empty-copy">No videos yet.</p>
                )}
                </nav>
            </>}
        </aside>
    );
}
