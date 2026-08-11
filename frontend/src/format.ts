import type { VideoStatus } from "./types";

export function formatDuration(milliseconds: number): string {
    const totalSeconds = milliseconds / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds - minutes * 60;

    return `${minutes}:${seconds.toFixed(3).padStart(6, "0")}`;
}

export function getVisibleVideoStatusLabel(
    status: VideoStatus
): string | null {
    switch (status) {
        case "pending_upload":
            return "Uploading";
        case "upload_failed":
            return "Upload failed";
        case "deleting":
            return "Deleting";
        case "ready":
            return null;
    }
}
