import { LoaderCircle, Save, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type { Segment, UpdateSegmentInput } from "../types";

type EditSegmentDialogProps = {
    segment: Segment | null;
    saving: boolean;
    onCancel: () => void;
    onSave: (
        segment: Segment,
        input: UpdateSegmentInput
    ) => Promise<void>;
};

export function EditSegmentDialog({
    segment,
    saving,
    onCancel,
    onSave,
}: EditSegmentDialogProps) {
    if (!segment) return null;

    return (
        <EditSegmentForm
            key={segment.id}
            segment={segment}
            saving={saving}
            onCancel={onCancel}
            onSave={onSave}
        />
    );
}

function EditSegmentForm({
    segment,
    saving,
    onCancel,
    onSave,
}: EditSegmentDialogProps & { segment: Segment }) {
    const [name, setName] = useState(segment.name);
    async function submit(event: FormEvent) {
        event.preventDefault();

        await onSave(segment, {
            name: name.trim(),
        });
    }

    return (
        <div className="modal-backdrop" role="presentation">
            <form
                className="modal edit-segment-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="edit-segment-title"
                onSubmit={submit}
            >
                <header className="modal-header">
                    <div>
                        <h2 id="edit-segment-title">Edit segment</h2>
                        <p>Update the segment name.</p>
                    </div>
                    <button
                        type="button"
                        className="icon-button"
                        onClick={onCancel}
                        disabled={saving}
                        aria-label="Close segment editor"
                    >
                        <X size={17} />
                    </button>
                </header>

                <label>
                    Name
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        autoFocus
                    />
                </label>

                <footer className="modal-footer">
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={onCancel}
                        disabled={saving}
                    >
                        Cancel
                    </button>
                    <button
                        className="primary-button"
                        disabled={!name.trim() || saving}
                    >
                        {saving ? (
                            <LoaderCircle className="spin" size={16} />
                        ) : (
                            <Save size={16} />
                        )}
                        {saving ? "Saving..." : "Save changes"}
                    </button>
                </footer>
            </form>
        </div>
    );
}
