import { ChevronDown, ChevronUp, Flag, Plus, Save } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatDuration } from "../format";
import type { Confidence, CreateSegmentInput, PracticePriority } from "../types";

type SegmentEditorProps = {
    currentMilliseconds: number;
    saving: boolean;
    onCreate: (input: CreateSegmentInput) => Promise<void>;
};

export function SegmentEditor({ currentMilliseconds, saving, onCreate }: SegmentEditorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [name, setName] = useState("");
    const [startMilliseconds, setStartMilliseconds] = useState(0);
    const [endMilliseconds, setEndMilliseconds] = useState(0);
    const [confidence, setConfidence] = useState<Confidence>("medium");
    const [practicePriority, setPracticePriority] = useState<PracticePriority>("medium");

    async function submit(event: FormEvent) {
        event.preventDefault();
        await onCreate({
            name: name.trim(),
            startMilliseconds,
            endMilliseconds,
            confidence,
            practicePriority,
        });
        setName("");
        setIsOpen(false);
    }

    return (
        <form className="segment-editor" onSubmit={submit}>
            <button
                type="button"
                className="segment-editor-toggle"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((current) => !current)}
            >
                <div>
                    <span className="eyebrow">New segment</span>
                    <h2>Mark this movement</h2>
                </div>
                <span className="segment-editor-toggle-status">
                    <span className="time-readout">{formatDuration(currentMilliseconds)}</span>
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </span>
            </button>
            {isOpen && (
                <div className="segment-editor-fields">
                    <label>
                        Name
                        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Open stance wave" autoFocus />
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
                    <div className="select-grid segment-practice-fields">
                        <label>Confidence<select value={confidence} onChange={(event) => setConfidence(event.target.value as Confidence)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                        <label>Priority<select value={practicePriority} onChange={(event) => setPracticePriority(event.target.value as PracticePriority)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></label>
                    </div>
                    <button className="primary-button full-width" disabled={!name.trim() || endMilliseconds <= startMilliseconds || saving}>
                        {saving ? <Save size={17} /> : <Plus size={17} />} {saving ? "Saving..." : "Save segment"}
                    </button>
                </div>
            )}
        </form>
    );
}
