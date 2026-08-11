import { Upload, X } from "lucide-react";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";

type UploadDialogProps = {
    open: boolean;
    uploading: boolean;
    onClose: () => void;
    onUpload: (title: string, file: File) => Promise<void>;
};

function createVideoTitleFromFileName(fileName: string): string {
    const titleWithoutExtension = fileName.replace(/\.[^.]+$/, "");
    return titleWithoutExtension || fileName;
}

export function UploadDialog({ open, uploading, onClose, onUpload }: UploadDialogProps) {
    const [title, setTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const generatedTitleRef = useRef<string | null>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);

    if (!open) return null;

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!file || !title.trim()) return;
        await onUpload(title.trim(), file);
        setTitle("");
        setFile(null);
        generatedTitleRef.current = null;
    }

    function closeDialog() {
        setTitle("");
        setFile(null);
        generatedTitleRef.current = null;
        onClose();
    }

    function updateTitle(event: ChangeEvent<HTMLInputElement>) {
        const nextTitle = event.target.value;
        setTitle(nextTitle);

        if (nextTitle !== generatedTitleRef.current) {
            generatedTitleRef.current = null;
        }
    }

    function selectFile(event: ChangeEvent<HTMLInputElement>) {
        const selectedFile = event.target.files?.[0] ?? null;
        setFile(selectedFile);

        if (!selectedFile) return;

        const generatedTitle = createVideoTitleFromFileName(
            selectedFile.name
        );
        const titleCanBeReplaced =
            !title.trim() || title === generatedTitleRef.current;

        if (!titleCanBeReplaced) return;

        generatedTitleRef.current = generatedTitle;
        setTitle(generatedTitle);
        window.requestAnimationFrame(() => {
            titleInputRef.current?.focus();
            titleInputRef.current?.select();
        });
    }

    return (
        <div className="modal-backdrop" role="presentation">
            <form className="modal" onSubmit={submit}>
                <div className="modal-header">
                    <div>
                        <h2>Upload lesson video</h2>
                        <p>MP4 or MOV files, up to 500 MB</p>
                    </div>
                    <button type="button" className="icon-button" onClick={closeDialog} disabled={uploading} aria-label="Close">
                        <X size={18} />
                    </button>
                </div>
                <label>
                    Video title
                    <input
                        ref={titleInputRef}
                        value={title}
                        onChange={updateTitle}
                        placeholder="Video title"
                        autoFocus
                    />
                </label>
                <label>
                    Video file
                    <input
                        type="file"
                        accept="video/mp4,video/quicktime,.mp4,.mov"
                        onChange={selectFile}
                    />
                </label>
                <div className="modal-footer">
                    <button type="button" className="secondary-button" onClick={closeDialog} disabled={uploading}>Cancel</button>
                    <button className="primary-button" disabled={!file || !title.trim() || uploading}>
                        <Upload size={17} /> {uploading ? "Uploading..." : "Upload video"}
                    </button>
                </div>
            </form>
        </div>
    );
}
