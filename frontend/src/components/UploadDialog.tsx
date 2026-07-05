import { Upload, X } from "lucide-react";
import { useState, type FormEvent } from "react";

type UploadDialogProps = {
    open: boolean;
    uploading: boolean;
    onClose: () => void;
    onUpload: (title: string, file: File) => Promise<void>;
};

export function UploadDialog({ open, uploading, onClose, onUpload }: UploadDialogProps) {
    const [title, setTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);

    if (!open) return null;

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!file || !title.trim()) return;
        await onUpload(title.trim(), file);
        setTitle("");
        setFile(null);
    }

    return (
        <div className="modal-backdrop" role="presentation">
            <form className="modal" onSubmit={submit}>
                <div className="modal-header">
                    <div>
                        <h2>Upload lesson video</h2>
                        <p>MP4 files only</p>
                    </div>
                    <button type="button" className="icon-button" onClick={onClose} disabled={uploading} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                <label>
                    Video title
                    <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Thursday salsa lesson" autoFocus />
                </label>
                <label>
                    MP4 file
                    <input
                        type="file"
                        accept="video/mp4,.mp4"
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                    />
                </label>
                <div className="modal-footer">
                    <button type="button" className="secondary-button" onClick={onClose} disabled={uploading}>Cancel</button>
                    <button className="primary-button" disabled={!file || !title.trim() || uploading}>
                        <Upload size={17} /> {uploading ? "Uploading..." : "Upload video"}
                    </button>
                </div>
            </form>
        </div>
    );
}
