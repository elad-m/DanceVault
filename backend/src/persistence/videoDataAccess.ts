// Defines the database-independent video data used by application services.

import type {
    VideoStatus,
    VideoStorageProviderName,
} from "../domain/video";
import type { AppEnvironment } from "../runtime";

export type VideoDataAccessItem = {
    id: string;
    userId: string;
    environment: AppEnvironment;
    title: string;
    storageKey: string;
    storageProvider: VideoStorageProviderName;
    originalFileName: string;
    status: VideoStatus;
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
    status: "pending_upload";
    createdAt: Date;
};

type UpdateVideoStatusDataAccessInput = {
    userID: string;
    videoID: string;
    status: VideoStatus;
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

    getVideoByID(
        input: GetVideoByIDInput
    ): Promise<VideoDataAccessItem | null>;

    listVideos(
        input: ListVideosInput
    ): Promise<VideoDataAccessItem[]>;

    updateVideoTitle(
        input: UpdateVideoTitleDataAccessInput
    ): Promise<VideoDataAccessItem>;

    deleteVideo(input: DeleteVideoDataAccessInput): Promise<void>;
};
