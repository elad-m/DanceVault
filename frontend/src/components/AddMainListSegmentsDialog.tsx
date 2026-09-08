import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getAllSegments } from "../api";
import type { Segment, Video } from "../types";
import { SegmentThumbnail } from "./SegmentThumbnail";

export function AddMainListSegmentsDialog({ existingIDs, videos, saving, thumbnailUrls, onThumbnailVisible, onAdd, onClose }: {
    existingIDs: string[];
    videos: Video[];
    saving: boolean;
    thumbnailUrls: Record<string, string>;
    onThumbnailVisible: (segmentId: string) => void;
    onAdd: (segments: Segment[]) => Promise<boolean>;
    onClose: () => void;
}) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        dialogRef.current?.showModal();
        let cancelled = false;
        async function load() {
            const result: Segment[] = [];
            let cursor: string | undefined;
            do {
                const page = await getAllSegments(cursor);
                if (cancelled) return;
                result.push(...page.segments);
                cursor = page.nextCursor ?? undefined;
            } while (cursor);
            setSegments(result);
        }
        void load().catch((caught: unknown) => {
            if (!cancelled) setError(caught instanceof Error ? caught.message : "Could not load segments");
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);
    const titles = new Map(videos.map(video => [video.id, video.title]));
    const available = segments.filter(segment => !existingIDs.includes(segment.id));
    return (
        <dialog ref={dialogRef} className="modal main-list-dialog" aria-labelledby="add-main-list-title"
            onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}>
            <header className="modal-header">
                <h2 id="add-main-list-title">Add segments</h2>
                <button className="icon-button" onClick={onClose} disabled={saving} aria-label="Close"><X size={18} /></button>
            </header>
            <label className="main-list-search">Search segments
                <input autoFocus type="search" value={query} onChange={event => setQuery(event.target.value)} />
            </label>
            <div className="main-list-options">
                {loading && <p>Loading segments...</p>}
                {error && <p role="alert">{error}</p>}
                {!loading && !error && available.length === 0 && <p>No segments to add.</p>}
                {available.filter(segment => `${segment.name} ${titles.get(segment.videoId) ?? ""}`.toLowerCase().includes(query.toLowerCase())).map(segment => (
                    <label className="main-list-option" key={segment.id}>
                        <input type="checkbox" checked={selected.includes(segment.id)}
                            disabled={saving || (!selected.includes(segment.id) && existingIDs.length + selected.length >= 500)}
                            onChange={event => setSelected(current => event.target.checked ? [...current, segment.id] : current.filter(id => id !== segment.id))} />
                        <SegmentThumbnail
                            segmentId={segment.id}
                            thumbnailUrl={thumbnailUrls[segment.id]}
                            onVisible={onThumbnailVisible}
                            className="main-list-option-thumbnail"
                        />
                        <span>{segment.name}<small>{titles.get(segment.videoId)}</small></span>
                    </label>
                ))}
            </div>
            <footer className="modal-footer">
                <span>{existingIDs.length + selected.length} / 500</span>
                <button className="primary-button" disabled={saving || loading || !!error || selected.length === 0}
                    onClick={() => void onAdd(selected.flatMap(id => segments.find(segment => segment.id === id) ?? [])).then(saved => {
                        if (saved) onClose();
                        else setError("Could not save the selection. Close this dialog to see the error and try again.");
                    })}>
                    <Plus size={16} /> {saving ? "Saving..." : `Add (${selected.length})`}
                </button>
            </footer>
        </dialog>
    );
}
