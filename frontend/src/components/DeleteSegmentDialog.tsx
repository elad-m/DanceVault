import { LoaderCircle, Trash2, X } from "lucide-react";
import type { Segment } from "../types";

type DeleteSegmentDialogProps = {
    segment: Segment | null;
    deleting: boolean;
    onCancel: () => void;
    onConfirm: (segment: Segment) => Promise<void>;
};

export function DeleteSegmentDialog({
    segment,
    deleting,
    onCancel,
    onConfirm,
}: DeleteSegmentDialogProps) {
    if (!segment) return null;

    return (
        <div className="modal-backdrop" role="presentation">
            <section
                className="modal delete-video-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-segment-title"
            >
                <header className="modal-header">
                    <div>
                        <h2 id="delete-segment-title">Delete segment?</h2>
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
                    <strong>{segment.name}</strong> will be removed from its
                    video and the practice queue.
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
                        onClick={() => void onConfirm(segment)}
                        disabled={deleting}
                    >
                        {deleting ? (
                            <LoaderCircle className="spin" size={16} />
                        ) : (
                            <Trash2 size={16} />
                        )}
                        {deleting ? "Deleting..." : "Delete segment"}
                    </button>
                </footer>
            </section>
        </div>
    );
}
