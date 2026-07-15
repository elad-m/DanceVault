import { LoaderCircle, Save, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
    Confidence,
    Difficulty,
    PracticePriority,
    Segment,
    UpdateSegmentInput,
} from "../types";

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
    const [description, setDescription] = useState(
        segment.description ?? ""
    );
    const [tags, setTags] = useState(segment.tags.join(", "));
    const [startSeconds, setStartSeconds] = useState(
        String(segment.startMilliseconds / 1000)
    );
    const [endSeconds, setEndSeconds] = useState(
        String(segment.endMilliseconds / 1000)
    );
    const [difficulty, setDifficulty] = useState<Difficulty>(
        segment.difficulty
    );
    const [confidence, setConfidence] = useState<Confidence>(
        segment.confidence
    );
    const [practicePriority, setPracticePriority] =
        useState<PracticePriority>(segment.practicePriority);

    const startMilliseconds = Math.round(Number(startSeconds) * 1000);
    const endMilliseconds = Math.round(Number(endSeconds) * 1000);
    const timestampsAreValid =
        Number.isFinite(startMilliseconds) &&
        Number.isFinite(endMilliseconds) &&
        startMilliseconds >= 0 &&
        endMilliseconds > startMilliseconds;

    async function submit(event: FormEvent) {
        event.preventDefault();

        await onSave(segment, {
            name: name.trim(),
            description: description.trim(),
            startMilliseconds,
            endMilliseconds,
            tags: tags
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            difficulty,
            confidence,
            practicePriority,
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
                        <p>Update movement details and practice settings.</p>
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

                <div className="edit-time-grid">
                    <label>
                        Start (seconds)
                        <input
                            type="number"
                            min="0"
                            step="0.001"
                            value={startSeconds}
                            onChange={(event) =>
                                setStartSeconds(event.target.value)
                            }
                        />
                    </label>
                    <label>
                        End (seconds)
                        <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={endSeconds}
                            onChange={(event) =>
                                setEndSeconds(event.target.value)
                            }
                        />
                    </label>
                </div>

                <label>
                    Description
                    <textarea
                        value={description}
                        onChange={(event) =>
                            setDescription(event.target.value)
                        }
                        rows={2}
                    />
                </label>

                <label>
                    Tags
                    <input
                        value={tags}
                        onChange={(event) => setTags(event.target.value)}
                        placeholder="wave, open stance, solo"
                    />
                </label>

                <div className="select-grid">
                    <label>
                        Difficulty
                        <select
                            value={difficulty}
                            onChange={(event) =>
                                setDifficulty(
                                    event.target.value as Difficulty
                                )
                            }
                        >
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                            <option value="very_hard">Very hard</option>
                        </select>
                    </label>
                    <label>
                        Confidence
                        <select
                            value={confidence}
                            onChange={(event) =>
                                setConfidence(
                                    event.target.value as Confidence
                                )
                            }
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </label>
                    <label>
                        Priority
                        <select
                            value={practicePriority}
                            onChange={(event) =>
                                setPracticePriority(
                                    event.target.value as PracticePriority
                                )
                            }
                        >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                        </select>
                    </label>
                </div>

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
                        disabled={
                            !name.trim() || !timestampsAreValid || saving
                        }
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
