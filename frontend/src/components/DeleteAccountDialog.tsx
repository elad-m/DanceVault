import { LoaderCircle, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";

type DeleteAccountDialogProps = {
    open: boolean;
    deleting: boolean;
    onCancel: () => void;
    onConfirm: () => Promise<void>;
};

const confirmationText = "DELETE";

export function DeleteAccountDialog({
    open,
    deleting,
    onCancel,
    onConfirm,
}: DeleteAccountDialogProps) {
    const [confirmation, setConfirmation] = useState("");

    useEffect(() => {
        if (!open) {
            setConfirmation("");
        }
    }, [open]);

    if (!open) return null;

    const confirmed = confirmation === confirmationText;

    return (
        <div className="modal-backdrop" role="presentation">
            <section
                className="modal delete-account-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-account-title"
            >
                <header className="modal-header">
                    <div>
                        <h2 id="delete-account-title">Delete account?</h2>
                        <p>This cannot be undone.</p>
                    </div>
                    <button
                        type="button"
                        className="icon-button"
                        onClick={onCancel}
                        disabled={deleting}
                        aria-label="Close account deletion confirmation"
                    >
                        <X size={17} />
                    </button>
                </header>

                <div className="delete-account-copy">
                    <p>
                        Your videos, segments, thumbnails, lists, and sign-in
                        account will be permanently deleted. You will be
                        signed out as soon as deletion is scheduled.
                    </p>
                    <label>
                        Type <strong>{confirmationText}</strong> to confirm
                        <input
                            value={confirmation}
                            onChange={(event) =>
                                setConfirmation(event.target.value)
                            }
                            disabled={deleting}
                            autoComplete="off"
                            spellCheck={false}
                        />
                    </label>
                </div>

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
                        onClick={() => void onConfirm()}
                        disabled={deleting || !confirmed}
                    >
                        {deleting ? (
                            <LoaderCircle className="spin" size={16} />
                        ) : (
                            <Trash2 size={16} />
                        )}
                        {deleting ? "Scheduling..." : "Delete account"}
                    </button>
                </footer>
            </section>
        </div>
    );
}
