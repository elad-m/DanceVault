import { LoaderCircle, Trash2, X } from "lucide-react";
import type { Video } from "../types";

type DeleteVideoDialogProps = {
    video: Video | null;
    deleting: boolean;
    onCancel: () => void;
    onConfirm: (video: Video) => Promise<void>;
};

export function DeleteVideoDialog({
    video,
    deleting,
    onCancel,
    onConfirm,
}: DeleteVideoDialogProps) {
    if (!video) return null;

    return (
        <div className="modal-backdrop" role="presentation">
            <section
                className="modal delete-video-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-video-title"
            >
                <header className="modal-header">
                    <div>
                        <h2 id="delete-video-title">Delete video?</h2>
                        <p>This cannot be undone.</p>
                    </div>
                    <button
                        type="button"
                        className="icon-button"
                        onClick={onCancel}
                        disabled={deleting}
                        aria-label="Close deletion confirmation"
                    >
                        <X size={17} />
                    </button>
                </header>

                <p className="delete-video-copy">
                    <strong>{video.title}</strong> and all of its segments will
                    be deleted. {video.sourceType === "uploaded" &&
                        "The uploaded file will also be removed from storage."}
                </p>

                <footer className="modal-footer">
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={onCancel}
                        disabled={deleting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="danger-button"
                        onClick={() => void onConfirm(video)}
                        disabled={deleting}
                    >
                        {deleting ? (
                            <LoaderCircle className="spin" size={16} />
                        ) : (
                            <Trash2 size={16} />
                        )}
                        {deleting ? "Deleting..." : "Delete video"}
                    </button>
                </footer>
            </section>
        </div>
    );
}
