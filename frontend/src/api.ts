import type {
    CreateSegmentInput,
    Segment,
    UpdateSegmentInput,
    Video,
} from "./types";
import { addAuthenticationHeaders } from "./auth/authentication";

type ApiErrorBody = {
    error?: {
        message?: string;
    };
};

async function requestJson<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const headers = new Headers(options.headers);
    await addAuthenticationHeaders(headers);

    if (options.body) {
        headers.set("content-type", "application/json");
    }

    const response = await fetch(`/api${path}`, {
        ...options,
        headers,
    });

    if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(body.error?.message ?? `Request failed (${response.status})`);
    }

    if (response.status === 204) {
        return undefined as T;
    }

    return response.json() as Promise<T>;
}

export async function listVideos(): Promise<Video[]> {
    const response = await requestJson<{ videos: Video[] }>("/videos");
    return response.videos;
}

export async function deleteVideo(videoId: string): Promise<void> {
    return requestJson<void>(`/videos/${videoId}`, {
        method: "DELETE",
    });
}

export async function getVideoSegments(videoId: string): Promise<Segment[]> {
    const response = await requestJson<{ segments: Segment[] }>(
        `/videos/${videoId}/segments`
    );
    return response.segments;
}

export async function getPracticeQueue(cursor?: string): Promise<{
    segments: Segment[];
    nextCursor: string | null;
}> {
    const query = new URLSearchParams({ limit: "20" });
    if (cursor) query.set("cursor", cursor);

    return requestJson<{
        segments: Segment[];
        nextCursor: string | null;
    }>(`/practice-queue?${query.toString()}`);
}

export async function getPlaybackUrl(videoId: string): Promise<string> {
    const response = await requestJson<{
        playbackUrl: string;
        expiresInSeconds: number;
    }>(`/videos/${videoId}/playback-url`);
    return response.playbackUrl;
}

export async function createSegment(
    videoId: string,
    input: CreateSegmentInput
): Promise<Segment> {
    return requestJson<Segment>(`/videos/${videoId}/segments`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export async function updateSegment(
    segmentId: string,
    input: UpdateSegmentInput
): Promise<Segment> {
    return requestJson<Segment>(`/segments/${segmentId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
    });
}

export async function uploadVideo(
    title: string,
    file: File
): Promise<Video> {
    const initialized = await requestJson<{
        video: Video;
        uploadUrl: string;
    }>("/video-uploads", {
        method: "POST",
        body: JSON.stringify({
            title,
            fileName: file.name,
            contentType: "video/mp4",
        }),
    });

    const uploadResponse = await fetch(initialized.uploadUrl, {
        method: "PUT",
        headers: {
            "content-type": "video/mp4",
        },
        body: file,
    });

    if (!uploadResponse.ok) {
        throw new Error(`Video upload failed (${uploadResponse.status})`);
    }

    return requestJson<Video>(
        `/video-uploads/${initialized.video.id}/complete`,
        { method: "POST" }
    );
}
