// Defines the database-independent video data used by application services.

import type {
    VideoStatus,
    VideoStorageProviderName,
} from "../domain/video";
import type { AppEnvironment } from "../runtime";
import type { VideoDeletionSourceStatus } from "../domain/userQuota";

export type VideoDataAccessItem = {
    id: string;
    userId: string;
    environment: AppEnvironment;
    title: string;
    storageKey: string;
    storageProvider: VideoStorageProviderName;
    originalFileName: string;
    fileSizeBytes: number | null;
    status: VideoStatus;
    deletionSourceStatus?: VideoDeletionSourceStatus;
    createdAt: Date;
};

type GetVideoByIDInput = {
    userID: string;
    videoID: string;
};

type ListVideosInput = {
    userID: string;
};

type CreateVideoDataAccessInput = {
    videoID: string;
    userID: string;
    title: string;
    storageKey: string;
    storageProvider: VideoStorageProviderName;
    originalFileName: string;
    fileSizeBytes: number;
    status: "pending_upload";
    createdAt: Date;
};

type UpdateVideoStatusDataAccessInput = {
    userID: string;
    videoID: string;
    status: VideoStatus;
};

type MarkVideoUploadFailedDataAccessInput = {
    userID: string;
    videoID: string;
};

type MarkVideoDeletingDataAccessInput = {
    userID: string;
    videoID: string;
};

export type FinalizeVideoUploadDataAccessInput = {
    userID: string;
    videoID: string;
    fileSizeBytes: number;
};

type UpdateVideoTitleDataAccessInput = {
    userID: string;
    videoID: string;
    title: string;
};

type DeleteVideoDataAccessInput = {
    userID: string;
    videoID: string;
};

export type VideoDataAccess = {
    createVideo(
        input: CreateVideoDataAccessInput
    ): Promise<VideoDataAccessItem>;

    updateVideoStatus(
        input: UpdateVideoStatusDataAccessInput
    ): Promise<VideoDataAccessItem>;

    finalizeVideoUpload(
        input: FinalizeVideoUploadDataAccessInput
    ): Promise<VideoDataAccessItem>;

    markVideoUploadFailed(
        input: MarkVideoUploadFailedDataAccessInput
    ): Promise<VideoDataAccessItem>;

    markVideoDeleting(
        input: MarkVideoDeletingDataAccessInput
    ): Promise<VideoDataAccessItem>;

    getVideoByID(
        input: GetVideoByIDInput
    ): Promise<VideoDataAccessItem | null>;

    listVideos(
        input: ListVideosInput
    ): Promise<VideoDataAccessItem[]>;

    // Operational full-table scan; never use this in a request handler.
    listAllVideosForStorageAudit(): Promise<
        VideoDataAccessItem[]
    >;

    updateVideoTitle(
        input: UpdateVideoTitleDataAccessInput
    ): Promise<VideoDataAccessItem>;

    deleteVideo(input: DeleteVideoDataAccessInput): Promise<void>;
};
