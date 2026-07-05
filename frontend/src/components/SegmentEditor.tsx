import { Flag, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatDuration } from "../format";
import type { Confidence, CreateSegmentInput, Difficulty, PracticePriority } from "../types";

type SegmentEditorProps = {
    currentMilliseconds: number;
    saving: boolean;
    onCreate: (input: CreateSegmentInput) => Promise<void>;
};

export function SegmentEditor({ currentMilliseconds, saving, onCreate }: SegmentEditorProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [tags, setTags] = useState("");
    const [startMilliseconds, setStartMilliseconds] = useState(0);
    const [endMilliseconds, setEndMilliseconds] = useState(0);
    const [difficulty, setDifficulty] = useState<Difficulty>("medium");
    const [confidence, setConfidence] = useState<Confidence>("medium");
    const [practicePriority, setPracticePriority] = useState<PracticePriority>("medium");

    async function submit(event: FormEvent) {
        event.preventDefault();
        await onCreate({
            name: name.trim(),
            description: description.trim() || undefined,
            startMilliseconds,
            endMilliseconds,
            tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
            difficulty,
            confidence,
            practicePriority,
        });
        setName("");
        setDescription("");
        setTags("");
    }

    return (
        <form className="segment-editor" onSubmit={submit}>
            <div className="panel-heading">
                <div>
                    <span className="eyebrow">New segment</span>
                    <h2>Mark this movement</h2>
                </div>
                <span className="time-readout">{formatDuration(currentMilliseconds)}</span>
            </div>
            <label>
                Name
                <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Open stance wave" />
            </label>
            <div className="time-controls">
                <button type="button" className="secondary-button" onClick={() => setStartMilliseconds(currentMilliseconds)}>
                    <Flag size={15} /> Set start
                </button>
                <output>{formatDuration(startMilliseconds)}</output>
                <button type="button" className="secondary-button" onClick={() => setEndMilliseconds(currentMilliseconds)}>
                    <Flag size={15} /> Set end
                </button>
                <output>{formatDuration(endMilliseconds)}</output>
            </div>
            <label>
                Description
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} placeholder="Timing, lead, or technique notes" />
            </label>
            <label>
                Tags
                <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="wave, open stance, solo" />
            </label>
            <div className="select-grid">
                <label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="very_hard">Very hard</option></select></label>
                <label>Confidence<select value={confidence} onChange={(event) => setConfidence(event.target.value as Confidence)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                <label>Priority<select value={practicePriority} onChange={(event) => setPracticePriority(event.target.value as PracticePriority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
            </div>
            <button className="primary-button full-width" disabled={!name.trim() || endMilliseconds <= startMilliseconds || saving}>
                <Save size={17} /> {saving ? "Saving..." : "Save segment"}
            </button>
        </form>
    );
}
